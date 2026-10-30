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
//   달빛은 달 고도 0~5° 에서 서서히 세지고, 달 그림은 고도 0°~−1° 에서 서서히 사라집니다(지평선 아래로 안 비침).
//   달의 밝은 쪽은 화면에서 해가 있는 쪽을 봅니다(moonLitAngle).
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
// 색은 0xrrggbb 숫자. 매 프레임 색 문자열을 만들고 해석하지 않으려고 숫자로 둡니다.
const SUN_LOW = 0xffb070 // 해가 낮을 때 햇빛 색
const SUN_HIGH = 0xffffff
const MOON_INTENSITY = 0.25 // 보름달 빛 세기 (위상·밤 정도를 곱함)
const MOON_FULL_DEG = 5 // 달 고도가 이만큼 오르면 달빛이 다 셈 (지는 달빛이 뚝 끊기지 않게)
const MOON_HIDE_DEG = -1 // 달 그림이 고도 0° 부터 이 고도까지 서서히 사라짐
const MOON_COLOR = 0x9fb8ff
const AMBIENT_DAY = 1.0
const AMBIENT_NIGHT = 0.45 // "분위기만 밤": 밤에도 땅·길·캐릭터가 또렷하게
const AMBIENT_DAY_COLOR = 0xffffff
const AMBIENT_NIGHT_COLOR = 0x8fa3d6
const LIT_ANGLE_MIN = 0.01 // 화면 위 해 쪽 방향이 이보다 짧으면(그믐·보름 무렵) 달을 돌리지 않음
const STARS_FROM = 0.6 // 밤 정도가 이 값을 넘으면 별이 나타나기 시작

export type SkyPos = { altitude: number; azimuth: number } // 라디안, 방위 북 0·동 +π/2
export type Vec3 = { x: number; y: number; z: number }
export type Clock = { start: number; base: number; speed: number } // ms: 월드 시각 = start + (지금 − base) × speed

export type SkyState = {
  sun: SkyPos
  moon: SkyPos & { phase: number; lit: number }
  night: number // 0 낮 ~ 1 밤
  light: { dir: Vec3; intensity: number; color: number } // 방향광: 빛이 오는 쪽(해 또는 달) 방향. 색은 0xrrggbb
  ambient: { intensity: number; color: number }
  glow: number // 가로등·창문 빛남 0~1
  stars: number // 별 투명도 0~1
  // 달의 어두운 부분(그림자) 투명도 0~1. 밤에만 보입니다. 낮에 그리면 삭 무렵 해 옆에 어두운 원반이 생깁니다.
  // 밤에는 불투명하게 그려 달 뒤의 별이 비치지 않게 합니다.
  moonShade: number
  moonShow: number // 달 그림 투명도 0~1. 달이 지평선 아래로 내려가면 0
}

const RAD = Math.PI / 180
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (t: number) => t * t * (3 - 2 * t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// 두 색(0xrrggbb)을 t 만큼 섞습니다.
export function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(lerp((a >> shift) & 0xff, (b >> shift) & 0xff, t)) << shift
  return ch(16) | ch(8) | ch(0)
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

// 해의 적위·시간각과 달 위상으로 달 위치를 정합니다. (skyState 가 해 계산을 한 번만 하도록 나눔)
function moonFrom(sol: { decl: number; hourAngle: number }, phase: number): SkyPos {
  const turn = 2 * Math.PI * phase
  return altAz(sol.hourAngle - turn, sol.decl * Math.cos(turn))
}

export function moonPosition(ms: number): SkyPos {
  return moonFrom(solar(ms), moonPhase(ms).phase)
}

// out 을 주면 새 객체를 만들지 않고 거기에 담습니다(매 프레임 부르는 곳용).
export function toDirection(p: SkyPos, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  const c = Math.cos(p.altitude)
  out.x = c * Math.sin(p.azimuth)
  out.y = Math.sin(p.altitude)
  out.z = -c * Math.cos(p.azimuth)
  return out
}

// 달 판을 돌릴 각도(라디안, 화면 오른쪽 0·반시계 +). 달 그림은 오른쪽이 밝게 그리므로, 이 각도만큼 돌리면 밝은 쪽이 해를 봅니다.
// sun·moon 은 카메라 기준 좌표(x 오른쪽, y 위)의 단위 방향. 해 방향에서 달 방향 성분을 빼면 화면에서 달 → 해 쪽이 남습니다.
// 해와 달이 거의 같은 쪽이거나 정반대면(그믐·보름 무렵) 방향이 정해지지 않아 prev 를 그대로 씁니다.
export function moonLitAngle(sun: Vec3, moon: Vec3, prev: number): number {
  const dot = sun.x * moon.x + sun.y * moon.y + sun.z * moon.z
  const tx = sun.x - moon.x * dot
  const ty = sun.y - moon.y * dot
  const tz = sun.z - moon.z * dot
  if (Math.hypot(tx, ty, tz) < LIT_ANGLE_MIN) return prev
  return Math.atan2(ty, tx)
}

export function skyState(ms: number): SkyState {
  const sol = solar(ms)
  const sun = altAz(sol.hourAngle, sol.decl)
  const ph = moonPhase(ms)
  const moon = { ...moonFrom(sol, ph.phase), ...ph }
  const sunDeg = sun.altitude / RAD
  const moonDeg = moon.altitude / RAD
  const night = smooth(clamp01((NIGHT_START_DEG - sunDeg) / (NIGHT_START_DEG - NIGHT_FULL_DEG)))
  // 해가 떠 있으면 해 쪽에서, 지면 달 쪽에서 비춤. 해가 지평선을 지나는 순간 둘 다 0 이라 바뀌어도 튀지 않음
  const moonShow = smooth(clamp01((moonDeg - MOON_HIDE_DEG) / -MOON_HIDE_DEG))
  const light =
    sunDeg > 0
      ? {
          dir: toDirection(sun),
          intensity: SUN_INTENSITY * smooth(clamp01(sunDeg / SUN_FULL_DEG)),
          color: mix(SUN_LOW, SUN_HIGH, clamp01(sunDeg / SUN_WHITE_DEG)),
        }
      : {
          dir: toDirection(moon),
          intensity: MOON_INTENSITY * moon.lit * night * smooth(clamp01(moonDeg / MOON_FULL_DEG)),
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
    moonShade: night * moonShow,
    moonShow,
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

// ── 달과 별자리 겹침 (#344) ─────────────────────────────────────────
// 구름은 달을 가리고 별자리는 구름에 가리지 않게 그리는 순서를 정해서(#317), 달이 별자리를 가리게 할 수는 없습니다(순서가 돌고 돔).
// 대신 달이 지나가는 별자리를 흐리게 합니다. 별자리 반지름 6°(starLogic 의 RING.size / 2), 달 반지름 약 1.6°.
// 달 가운데가 별자리 가운데에서 outer 안으로 들어오면 흐려지기 시작해, inner 안이면 min 만 남습니다.
export const MOON_FADE = { inner: 6.5 * RAD, outer: 9.5 * RAD, min: 0.12 }

// 별자리 하나의 투명도 배율 (1 그대로 ~ min). moon·center 는 단위 방향, moonShow 는 달이 보이는 정도(0~1)
export function moonOverlapFade(moon: Vec3, center: Vec3, moonShow: number): number {
  const cos = Math.min(1, Math.max(-1, moon.x * center.x + moon.y * center.y + moon.z * center.z))
  const t = clamp01((MOON_FADE.outer - Math.acos(cos)) / (MOON_FADE.outer - MOON_FADE.inner)) // 0 멀리 ~ 1 겹침
  return 1 - (1 - MOON_FADE.min) * smooth(t) * clamp01(moonShow)
}
