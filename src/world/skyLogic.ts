// 월드 하늘과 시간 계산 (#316). React·three.js 와 무관한 순수 로직입니다. (Node 로 검사 — 다른 파일을 import 하지 않음)
//
// ── 시각 ────────────────────────────────────────────────────────────
//   컴퓨터 시계의 절대 시각(UTC)과 서울 위치로 계산합니다. 다른 시간대의 컴퓨터로 접속해도 모두 같은 서울 하늘을 봅니다.
//   그래서 로컬 시간대 함수(getHours 등)는 쓰지 않고, 서울 시각이 필요하면 UTC+9 로 직접 바꿉니다.
//   확인용 주소: ?time=21:30 (오늘 그 서울 시각에서 시작, speed 가 없으면 멈춤), ?speed=600 (600배 빠르게).
//   틀린 값은 그 값만 무시합니다.
//
// ── 해 ──────────────────────────────────────────────────────────────
//   NOAA 근사식(태양 평균 경도·근점 이각 → 황경 → 적위·균시차 → 시간각 → 고도·방위). 오차 1° 안쪽.
//   고도는 지평선 0, 방위는 북쪽 0·동쪽 +π/2 (라디안). 대기 굴절은 넣지 않아 일출·일몰이 달력보다 몇 분 늦고 이릅니다.
//
// ── 달 ──────────────────────────────────────────────────────────────
//   위상: 기준 삭(2000-01-06 18:14 UTC)에서 지난 날을 삭망월로 나눈 나머지. 0 그믐, 0.5 보름.
//   위치: 해가 지나는 길을 위상만큼 늦게 따른다고 봅니다(시간각 = 해 시간각 − 2π·위상).
//   적위는 해의 적위 × cos(2π·위상) 으로 둡니다. 삭이면 해와 같고 보름이면 반대라, 겨울 보름달이 높이 뜨는 것도 맞습니다.
//   실제 궤도와 몇 도 다르지만 보이는 모양과 뜨는 때가 맞습니다.
//
// ── 3D 방향 ─────────────────────────────────────────────────────────
//   (고도 a, 방위 z) → x = cos a · sin z, y = sin a, z3 = −cos a · cos z  (3D 는 −Z 가 북쪽)

export const SEOUL = { lat: 37.5665, lon: 126.978 }
export const SKY_LAYER = 2 // 하늘 부품 레이어. 화면 카메라만 켜고 미니맵 카메라는 켜지 않음

const DAY_MS = 86_400_000
const KST_MS = 9 * 3_600_000 // 서울 = UTC+9 (서머타임 없음)
const NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14) // 기준 삭
const SYNODIC_DAYS = 29.530589 // 삭망월

// 밝기·색 기준값 (스펙 4절)
const NIGHT_START_DEG = -2 // 해가 이 고도 아래로 가면 밤이 시작
const NIGHT_FULL_DEG = -12 // 이 고도 아래면 완전한 밤
const SUN_FULL_DEG = 10 // 해 고도가 이만큼 오르면 햇빛이 다 셈
const SUN_WHITE_DEG = 15 // 해 고도가 이만큼이면 햇빛이 흰색 (낮으면 주황)
const SUN_INTENSITY = 0.9
const SUN_LOW = '#ffb070' // 해가 낮을 때 햇빛 색
const SUN_HIGH = '#ffffff'
const MOON_INTENSITY = 0.25 // 보름달 빛 세기 (위상·밤 정도를 곱함)
const MOON_COLOR = '#9fb8ff'
const AMBIENT_DAY = 1.0
const AMBIENT_NIGHT = 0.45 // "분위기만 밤": 밤에도 땅·길·캐릭터가 또렷하게
const AMBIENT_DAY_COLOR = '#ffffff'
const AMBIENT_NIGHT_COLOR = '#8fa3d6'
const STARS_FROM = 0.6 // 밤 정도가 이 값을 넘으면 별이 나타나기 시작

export type SkyPos = { altitude: number; azimuth: number } // 라디안, 방위 북 0·동 +π/2
export type Vec3 = { x: number; y: number; z: number }
export type Clock = { start: number; base: number; speed: number } // ms: 월드 시각 = start + (지금 − base) × speed

export type SkyState = {
  sun: SkyPos
  moon: SkyPos & { phase: number; lit: number }
  night: number // 0 낮 ~ 1 밤
  light: { dir: Vec3; intensity: number; color: string } // 방향광: 빛이 오는 쪽(해 또는 달) 방향
  ambient: { intensity: number; color: string }
  glow: number // 가로등·창문 빛남 0~1
  stars: number // 별 투명도 0~1
  // 달의 어두운 부분(그림자) 투명도 0~1. 밤에만 보입니다. 낮에 그리면 삭 무렵 해 옆에 어두운 원반이 생깁니다.
  // 밤에는 불투명하게 그려 달 뒤의 별이 비치지 않게 합니다.
  moonShade: number
}

const RAD = Math.PI / 180
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (t: number) => t * t * (3 - 2 * t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// 두 색(#rrggbb)을 t 만큼 섞습니다.
function mix(a: string, b: string, t: number): string {
  const p = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16)
  const ch = (i: number) => Math.round(lerp(p(a, i), p(b, i), t)).toString(16).padStart(2, '0')
  return `#${ch(0)}${ch(1)}${ch(2)}`
}

// 해의 적위와 시간각 (라디안). NOAA 근사식
function solar(ms: number): { decl: number; hourAngle: number } {
  const jd = ms / DAY_MS + 2440587.5
  const T = (jd - 2451545) / 36525
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T)
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)
  const C =
    Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * M * RAD) * 0.000289
  const omega = 125.04 - 1934.136 * T
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD)
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD)
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD))
  const y = Math.tan((eps * RAD) / 2) ** 2
  const eqTimeMin =
    (4 / RAD) *
    (y * Math.sin(2 * L0 * RAD) -
      2 * e * Math.sin(M * RAD) +
      4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) -
      0.5 * y * y * Math.sin(4 * L0 * RAD) -
      1.25 * e * e * Math.sin(2 * M * RAD))
  const utcMin = (((ms % DAY_MS) + DAY_MS) % DAY_MS) / 60_000
  const solarMin = utcMin + eqTimeMin + 4 * SEOUL.lon // 진태양시(분)
  return { decl, hourAngle: (solarMin / 4 - 180) * RAD }
}

// 시간각·적위 → 서울에서 본 고도·방위
function altAz(hourAngle: number, decl: number): SkyPos {
  const lat = SEOUL.lat * RAD
  const altitude = Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle))
  // 남쪽 기준 서쪽으로 잰 방위에 π 를 더해 북쪽 기준·동쪽 +π/2 로 바꿈
  const azimuth = Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) + Math.PI
  return { altitude, azimuth }
}

export function sunPosition(ms: number): SkyPos {
  const { decl, hourAngle } = solar(ms)
  return altAz(hourAngle, decl)
}

export function moonPhase(ms: number): { phase: number; lit: number } {
  const days = (ms - NEW_MOON_MS) / DAY_MS
  const phase = (((days / SYNODIC_DAYS) % 1) + 1) % 1
  return { phase, lit: (1 - Math.cos(2 * Math.PI * phase)) / 2 }
}

export function moonPosition(ms: number): SkyPos {
  const { decl, hourAngle } = solar(ms)
  const { phase } = moonPhase(ms)
  const turn = 2 * Math.PI * phase
  return altAz(hourAngle - turn, decl * Math.cos(turn))
}

export function toDirection(p: SkyPos): Vec3 {
  const c = Math.cos(p.altitude)
  return { x: c * Math.sin(p.azimuth), y: Math.sin(p.altitude), z: -c * Math.cos(p.azimuth) }
}

export function skyState(ms: number): SkyState {
  const sun = sunPosition(ms)
  const moon = { ...moonPosition(ms), ...moonPhase(ms) }
  const sunDeg = sun.altitude / RAD
  const night = smooth(clamp01((NIGHT_START_DEG - sunDeg) / (NIGHT_START_DEG - NIGHT_FULL_DEG)))
  // 해가 떠 있으면 해 쪽에서, 지면 달 쪽에서 비춤. 해가 지평선을 지나는 순간 둘 다 0 이라 바뀌어도 튀지 않음
  const light =
    sunDeg > 0
      ? {
          dir: toDirection(sun),
          intensity: SUN_INTENSITY * smooth(clamp01(sunDeg / SUN_FULL_DEG)),
          color: mix(SUN_LOW, SUN_HIGH, clamp01(sunDeg / SUN_WHITE_DEG)),
        }
      : {
          dir: toDirection(moon),
          intensity: moon.altitude > 0 ? MOON_INTENSITY * moon.lit * night : 0,
          color: MOON_COLOR,
        }
  return {
    sun,
    moon,
    night,
    light,
    ambient: { intensity: lerp(AMBIENT_DAY, AMBIENT_NIGHT, night), color: mix(AMBIENT_DAY_COLOR, AMBIENT_NIGHT_COLOR, night) },
    glow: night,
    stars: clamp01((night - STARS_FROM) / (1 - STARS_FROM)),
    moonShade: night,
  }
}

// 주소(?time, ?speed)로 시계를 정합니다. 틀린 값은 그 값만 무시합니다.
export function parseClock(search: string, nowMs: number): Clock {
  const q = new URLSearchParams(search)
  let start = nowMs
  let speed = 1
  const m = (q.get('time') ?? '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (m) {
    const [h, min, sec] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)]
    if (h <= 23 && min <= 59 && sec <= 59) {
      const k = new Date(nowMs + KST_MS) // 서울 날짜를 UTC 필드로 읽기 위해 9시간 민 값
      start = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate(), h, min, sec) - KST_MS
      speed = 0 // 시각만 주면 그 시각에 멈춤
    }
  }
  const s = Number(q.get('speed'))
  if (q.get('speed') !== null && Number.isFinite(s) && s > 0) speed = s
  return { start, base: nowMs, speed }
}

export const worldTime = (clock: Clock, nowMs: number) => clock.start + (nowMs - clock.base) * clock.speed
