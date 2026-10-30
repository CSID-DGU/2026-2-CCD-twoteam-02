// 광장 날씨 계산 (#317). React·three.js 와 무관한 순수 로직입니다. (Node 로 검사)
//
// ── 어디서 받나 ─────────────────────────────────────────────────────
//   실제 서울 날씨: Open-Meteo 시간별 예보(키 없음, 브라우저가 직접 받음). 받는 일은 useWorldWeather.ts 가 하고,
//   여기서는 받은 예보를 읽어 화면이 쓰는 숫자 넷(Weather: 구름 양·비 세기·눈 세기·어두움)으로 바꿉니다.
//   보내는 것은 서울 고정 좌표뿐입니다(사용자 위치 없음).
//
// ── 시간 구간 ───────────────────────────────────────────────────────
//   Open-Meteo 의 시간별 강수량은 "그 시각까지 지난 1시간" 합입니다. 그래서 시각 T 의 값을 T−1시간 ~ T 구간에 씁니다.
//   모두 같은 시간별 값을 쓰므로 서울 정각에 같이 바뀝니다. 정각 앞뒤 5분은 앞뒤 구간을 섞어 뚝 끊기지 않게 합니다.
//   날씨는 하늘(?time)과 달리 실제 시각으로 고릅니다. 예보가 지금 앞뒤 하루치뿐이라서입니다.
//
// ── 확인용 주소 ─────────────────────────────────────────────────────
//   ?weather=clear|cloudy|rain|snow|storm, 비·눈은 세기를 붙일 수 있음(?weather=rain:0.3). 있으면 예보를 받지 않고 그 날씨로 고정.
//   뇌우는 ?weather=storm, 번개를 6~10초마다 치게 하려면 ?weather=storm:fast (#328, lightningLogic.ts)
//   눈 쌓임은 ?weather=snow 면 다 쌓인 모습, ?snowcover=0.5 처럼 쌓인 정도만 따로 줄 수도 있음(실제 날씨와 같이 써도 됨, #329)
//
// ── 눈 쌓임 (#329) ──────────────────────────────────────────────────
//   Open-Meteo 의 시간별 "땅에 쌓인 눈 깊이"(snow_depth, m)를 받아 쌓인 정도(cover 0~1)로 바꿉니다. SNOW_FULL_M 이상이면 1.
//   실제 값이라 눈이 오면 한두 시간 안에 쌓이기 시작하고, 그치면 실제로 녹을 때까지(하루~며칠) 남습니다. 녹는 규칙을 따로 두지 않습니다.
import { SEOUL, mix } from './skyLogic'
import type { SkyState } from './skyLogic'
import type { Lightning } from './lightningLogic'

export type Weather = { cloud: number; rain: number; snow: number; dim: number; storm: number; cover: number } // 모두 0~1 (storm: 뇌우 정도 #328, cover: 눈 쌓인 정도 #329)
// 예보 한 칸. ms = 구간 끝 T (값은 T−1h ~ T), cloud 0~1, precip 시간당 강수량 mm (눈도 물로 바꾼 양), snowDepth 쌓인 눈 깊이 m
export type Hour = { ms: number; code: number; cloud: number; precip: number; snowDepth: number }
// useWorldWeather 가 넘기는 값: 받은 예보, 또는 확인용 주소의 날씨. cover: 확인용 주소 ?snowcover= (없으면 null, #329)
export type WeatherSource = { hours: Hour[] | null; override: Weather | null; cover: number | null }

export const CLEAR: Weather = { cloud: 0, rain: 0, snow: 0, dim: 0, storm: 0, cover: 0 }

const HOUR_MS = 3_600_000
const BLEND_MS = 5 * 60_000 // 정각 앞뒤로 섞는 시간
const REFETCH_AFTER_MS = 60_000 // 정각 + 1분에 다시 받음 (Open-Meteo 가 새 시간 값을 내놓을 틈)
// 강수량(mm) → 세기. 사이는 직선으로 잇고 마지막 값 이상은 1
const PRECIP_STEPS: [number, number][] = [
  [0, 0],
  [0.1, 0.2],
  [1, 0.5],
  [4, 1],
]
const MIN_PRECIP_MM = 0.1 // 날씨 코드는 비·눈인데 강수량이 이보다 적으면
const MIN_PRECIP = 0.2 //    세기를 이만큼으로 둠
const WET_CLOUD = 0.8 // 비·눈·안개면 구름 양을 최소 이만큼
const DIM = { cloud: 0.4, wet: 0.6, wetScale: 0.4 } // 어두움 = max(0.4·구름, 비·눈이면 0.6 + 0.4·세기)
const OVERRIDE = { cloudy: 0.8, wetCloud: 0.9, strength: 0.6 } // 확인용 주소의 구름 양·기본 세기

const FORECAST = { pastHours: 3, forecastHours: 24 }
export const SNOW_FULL_M = 0.03 // 쌓인 눈이 이 깊이(3cm) 이상이면 다 덮인 것으로 (#329)

// 하늘·빛 어둡게 (스펙 6절)
export const OVERCAST_COLOR = 0x8a9099 // 흐림 덮개 색 (번쩍일 때 lightningLogic 이 밝힘)
const SHADE = { light: 0.6, ambient: 0.3, moon: 0.4, glow: 0.5, overcast: 0.6, overcastNight: 0.7 }
const AMBIENT_WET_COLOR = 0x9aa6b8 // 흐리면 주변광을 이 회청색 쪽으로

// 구름 (스펙 7절). 거리·높이 m, 속도 m/s
export const CLOUD_COUNT = 40
export const PUFFS = 5 // 구름 하나를 이루는 덩어리 수
export const PUFF_STRIDE = 6 // 덩어리 하나: x, y, z, sx, sy, sz
const CLOUD = {
  seed: 317,
  half: 380, // 흐르는 정사각형의 반 폭 (= 보이는 원판 반지름)
  fadeFrom: 300, // 가로 거리 이만큼부터 작아지기 시작해 half 에서 0
  y: [80, 120],
  scale: [1, 1.6],
  speed: 3, // 서쪽 → 동쪽(+x)
}
const PUFF = { dx: 12, dy: [-2, 3], dz: 6, width: [10, 16], height: 0.45, depth: 0.7 } // 덩어리 상대 자리·크기
const TINT = { white: 0xffffff, sunset: 0xffb38a, night: 0x2a3350, grayDay: 0x8a9099, grayNight: 0x30353f }
const SUNSET_PEAK_DEG = 4 // 해 고도가 이쯤일 때 구름이 가장 주황빛
const SUNSET_SPAN_DEG = 6 //  여기서 ±6° 벗어나면 노을빛 없음 (−2° ~ 10°)

export function weatherUrl(): string {
  return (
    `https://api.open-meteo.com/v1/forecast?latitude=${SEOUL.lat}&longitude=${SEOUL.lon}` +
    `&hourly=weather_code,cloud_cover,precipitation,snow_depth&past_hours=${FORECAST.pastHours}&forecast_hours=${FORECAST.forecastHours}` +
    '&timezone=UTC&timeformat=unixtime'
  )
}

// Open-Meteo 날씨 코드(WMO) → 화면 날씨. 안개는 구름, 뇌우는 비로 묶습니다(번개는 #328).
export function weatherKind(code: number): 'clear' | 'cloudy' | 'rain' | 'snow' {
  if (code === 2 || code === 3 || code === 45 || code === 48) return 'cloudy'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code === 95 || code === 96 || code === 99) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  return 'clear'
}

// 시간당 강수량(mm) → 비·눈 세기 0~1
export function precipStrength(mm: number): number {
  if (!(mm > 0)) return 0
  for (let i = 1; i < PRECIP_STEPS.length; i++) {
    const [x1, y1] = PRECIP_STEPS[i]
    if (mm <= x1) {
      const [x0, y0] = PRECIP_STEPS[i - 1]
      return y0 + ((y1 - y0) * (mm - x0)) / (x1 - x0)
    }
  }
  return 1
}

// 쌓인 눈 깊이(m) → 쌓인 정도 0~1
export function snowCover(depthM: number): number {
  if (!(depthM > 0)) return 0
  return Math.min(1, depthM / SNOW_FULL_M)
}

// 구름 양·비·눈 세기(·뇌우 정도·쌓인 정도)로 어두움까지 채운 Weather
function makeWeather(cloud: number, rain: number, snow: number, storm = 0, cover = 0): Weather {
  const wet = Math.max(rain, snow)
  const dim = Math.max(DIM.cloud * cloud, wet > 0 ? DIM.wet + DIM.wetScale * wet : 0)
  return { cloud, rain, snow, dim, storm, cover }
}

// 예보 한 칸 → Weather
export function hourWeather(h: Hour): Weather {
  const kind = weatherKind(h.code)
  const fog = h.code === 45 || h.code === 48
  const cover = snowCover(h.snowDepth) // 맑은 날에도 남은 눈은 보임 (그친 뒤 녹을 때까지)
  if (kind === 'rain' || kind === 'snow') {
    const storm = h.code >= 95
    const s = storm ? 1 : h.precip < MIN_PRECIP_MM ? MIN_PRECIP : precipStrength(h.precip)
    const cloud = Math.max(h.cloud, WET_CLOUD)
    return kind === 'rain' ? makeWeather(cloud, s, 0, storm ? 1 : 0, cover) : makeWeather(cloud, 0, s, 0, cover)
  }
  return makeWeather(fog ? Math.max(h.cloud, WET_CLOUD) : h.cloud, 0, 0, 0, cover)
}

// Open-Meteo 응답 → 예보 칸 목록. 모양이 틀리면 null. 값이 빈(null) 칸은 그 시간만 뺍니다.
// 쌓인 눈 깊이(snow_depth)는 없거나 빈 칸이면 0 으로 봅니다(그 때문에 날씨 칸을 버리지 않음).
export function parseForecast(json: unknown): Hour[] | null {
  const hourly = (json as { hourly?: Record<string, unknown> } | null)?.hourly
  if (!hourly || typeof hourly !== 'object') return null
  const cols = [hourly.time, hourly.weather_code, hourly.cloud_cover, hourly.precipitation]
  if (!cols.every(Array.isArray)) return null
  const [time, code, cloud, precip] = cols as unknown[][]
  if (!cols.every((c) => (c as unknown[]).length === time.length)) return null
  const depthCol = hourly.snow_depth
  if (depthCol !== undefined && (!Array.isArray(depthCol) || depthCol.length !== time.length)) return null
  const depth = (depthCol ?? []) as unknown[]
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  const out: Hour[] = []
  for (let i = 0; i < time.length; i++) {
    const t = time[i], c = code[i], cl = cloud[i], p = precip[i], d = depth[i]
    if (num(t) && num(c) && num(cl) && num(p)) out.push({ ms: t * 1000, code: c, cloud: cl / 100, precip: p, snowDepth: num(d) ? d : 0 })
  }
  return out.sort((a, b) => a.ms - b.ms)
}

const mixWeather = (a: Weather, b: Weather, t: number): Weather => ({
  cloud: a.cloud + (b.cloud - a.cloud) * t,
  rain: a.rain + (b.rain - a.rain) * t,
  snow: a.snow + (b.snow - a.snow) * t,
  dim: a.dim + (b.dim - a.dim) * t,
  storm: a.storm + (b.storm - a.storm) * t, // 뇌우가 끝날 무렵 번쩍임이 서서히 약해짐
  cover: a.cover + (b.cover - a.cover) * t,
})

// 지금(ms) 날씨. 받은 범위 밖이거나 목록이 없으면 맑음 (오래된 예보로 어제 비가 계속 오지 않게)
export function weatherAt(hours: Hour[] | null, ms: number): Weather {
  if (!hours?.length) return CLEAR
  const cur = hours.find((h) => ms >= h.ms - HOUR_MS && ms < h.ms)
  if (!cur) return CLEAR
  const w = hourWeather(cur)
  const end = cur.ms
  const start = cur.ms - HOUR_MS
  if (end - ms <= BLEND_MS) {
    const next = hours.find((h) => h.ms === end + HOUR_MS)
    if (next) return mixWeather(w, hourWeather(next), (ms - (end - BLEND_MS)) / (2 * BLEND_MS))
  } else if (ms - start < BLEND_MS) {
    const prev = hours.find((h) => h.ms === start)
    if (prev) return mixWeather(hourWeather(prev), w, (ms - (start - BLEND_MS)) / (2 * BLEND_MS))
  }
  return w
}

// 확인용 주소 ?weather=... → 고정 날씨. 없거나 틀리면 null (실제 날씨를 씀)
export function parseWeatherOverride(search: string): Weather | null {
  const v = new URLSearchParams(search).get('weather') ?? ''
  // 뇌우: 세기 없이 storm, 또는 번개를 빨리 치게 하는 storm:fast 만 받음
  if (v === 'storm' || v === 'storm:fast') return makeWeather(OVERRIDE.wetCloud, 1, 0, 1)
  const m = v.match(/^(clear|cloudy|rain|snow)(?::(.+))?$/)
  if (!m) return null
  const [, kind, raw] = m
  if (raw !== undefined && (kind === 'clear' || kind === 'cloudy')) return null
  const s = raw === undefined ? OVERRIDE.strength : Number(raw)
  if (!Number.isFinite(s) || s <= 0 || s > 1) return null
  if (kind === 'clear') return CLEAR
  if (kind === 'cloudy') return makeWeather(OVERRIDE.cloudy, 0, 0)
  return kind === 'rain' ? makeWeather(OVERRIDE.wetCloud, s, 0) : makeWeather(OVERRIDE.wetCloud, 0, s, 0, 1) // 눈이면 다 쌓인 모습
}

// 확인용 주소 ?snowcover=0~1 → 쌓인 정도만 따로 정함 (#329). 없거나 틀리면 null
export function parseCoverOverride(search: string): number | null {
  const raw = new URLSearchParams(search).get('snowcover')
  if (raw === null || raw.trim() === '') return null
  const v = Number(raw)
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : null
}

// 다음에 예보를 받을 때까지 남은 ms: 다음 정각 + 1분. 서울은 UTC 와 정시 단위로 차이 나서 UTC 정각 = 서울 정각
// (로컬 시간대 함수를 쓰지 않아 어느 시간대 컴퓨터든 같은 순간에 받습니다)
export function nextFetchDelay(nowMs: number): number {
  const wait = REFETCH_AFTER_MS - (((nowMs % HOUR_MS) + HOUR_MS) % HOUR_MS)
  return wait > 0 ? wait : wait + HOUR_MS
}

// ── 하늘에 날씨 반영 ───────────────────────────────────────────────────
// fieldStars: 흩뿌린 별 투명도 (구름·비에 가려짐). 별자리는 날씨와 상관없이 보이도록 stars 는 그대로 둡니다(#321).
// overcast: 흐림 덮개(회색 반구) 투명도, overcastColor: 그 색(0xrrggbb, 번개가 칠 때 밝아짐)
export type WeatherSky = SkyState & { fieldStars: number; overcast: number; overcastColor: number }
// WorldSky 가 매 프레임 채워 구름·비·눈에 넘기는 값. ms 는 하늘 시각(?time 을 따름), now 는 실제 시각
// (구름 자리는 날씨처럼 실제 시각으로 정해, ?time 으로 하늘만 바꿔도 구름은 모두 같은 자리에서 흐름)
// lightning: 이번 프레임 번개 (#328, 번쩍임은 이미 하늘 값에 들어 있음. 구름·번개 줄기가 씀)
export type WeatherFrame = WeatherSky & { ms: number; now: number; weather: Weather; lightning: Lightning }

export function applyWeather(sky: SkyState, w: Weather): WeatherSky {
  const moon = 1 - SHADE.moon * w.dim
  return {
    ...sky,
    light: { ...sky.light, intensity: sky.light.intensity * (1 - SHADE.light * w.dim) },
    ambient: { intensity: sky.ambient.intensity * (1 - SHADE.ambient * w.dim), color: mix(sky.ambient.color, AMBIENT_WET_COLOR, w.dim) },
    moonShow: sky.moonShow * moon,
    moonShade: sky.moonShade * moon,
    glow: Math.max(sky.glow, SHADE.glow * w.dim), // 비 오는 낮에도 가로등·창문이 살짝 켜짐
    fieldStars: sky.stars * (1 - w.cloud) * (1 - Math.max(w.rain, w.snow)),
    overcast: SHADE.overcast * w.dim * (1 - SHADE.overcastNight * sky.night), // 밤에는 남색 덮개가 있어 덜 씌움
    overcastColor: OVERCAST_COLOR,
  }
}

// ── 구름 자리 ──────────────────────────────────────────────────────────
// 고정 씨앗 의사난수 (mulberry32, WorldSky 의 seeded 와 같은 식). 모두 같은 구름 모양·처음 자리
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const between = (r: () => number, [a, b]: number[]) => a + (b - a) * r()

// 구름마다 처음 자리(x0, z), 높이, 크기와 덩어리 상대 자리·크기 (한 번만 만듦)
const CLOUDS = (() => {
  const r = seeded(CLOUD.seed)
  return Array.from({ length: CLOUD_COUNT }, () => {
    const x0 = between(r, [-CLOUD.half, CLOUD.half])
    const z = between(r, [-CLOUD.half, CLOUD.half])
    const y = between(r, CLOUD.y)
    const scale = between(r, CLOUD.scale)
    const puffs = Array.from({ length: PUFFS }, () => {
      const w = between(r, PUFF.width)
      return { dx: between(r, [-PUFF.dx, PUFF.dx]), dy: between(r, PUFF.dy), dz: between(r, [-PUFF.dz, PUFF.dz]), sx: w, sy: w * PUFF.height, sz: w * PUFF.depth }
    })
    return { x0, z, y, scale, puffs }
  })
})()

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (t: number) => t * t * (3 - 2 * t)

// 구름 덩어리 자리·크기 (월드 좌표, 광장 가운데 기준). 크기 0 이면 숨김.
// 구름은 늘 서쪽에서 동쪽으로 같은 속도로 흐르고 동쪽 끝을 지나면 서쪽 끝으로 돌아옵니다. 시각만으로 정해져 모두 같은 자리이고,
// 실제 바람을 쓰지 않아 정각에 튀지 않습니다. 끝을 넘어가는 순간은 원판 밖이라 크기 0 입니다.
// cloud(구름 양)가 늘면 앞 번호 구름부터 하나씩 자라 나타납니다.
export function cloudLayout(ms: number, cloud: number, out: Float32Array = new Float32Array(CLOUD_COUNT * PUFFS * PUFF_STRIDE)): Float32Array {
  const span = CLOUD.half * 2
  const drift = (CLOUD.speed * ms) / 1000
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const c = CLOUDS[i]
    const x = ((((c.x0 + CLOUD.half + drift) % span) + span) % span) - CLOUD.half
    const edge = smooth(clamp01((CLOUD.half - Math.hypot(x, c.z)) / (CLOUD.half - CLOUD.fadeFrom)))
    const k = c.scale * edge * clamp01(cloud * CLOUD_COUNT - i)
    for (let j = 0; j < PUFFS; j++) {
      const p = c.puffs[j]
      const o = (i * PUFFS + j) * PUFF_STRIDE
      out[o] = x + p.dx * c.scale
      out[o + 1] = c.y + p.dy * c.scale
      out[o + 2] = c.z + p.dz * c.scale
      out[o + 3] = p.sx * k
      out[o + 4] = p.sy * k
      out[o + 5] = p.sz * k
    }
  }
  return out
}

// 구름 색(0xrrggbb): 낮 흰색 → 노을 주황빛 → 밤 남회색, 비·눈이 올수록 회색
export function cloudTint(sky: SkyState, w: Weather): number {
  const sunDeg = (sky.sun.altitude * 180) / Math.PI
  const sunset = Math.max(0, 1 - Math.abs(sunDeg - SUNSET_PEAK_DEG) / SUNSET_SPAN_DEG)
  const base = mix(mix(TINT.white, TINT.sunset, sunset), TINT.night, sky.night)
  const gray = mix(TINT.grayDay, TINT.grayNight, sky.night)
  return mix(base, gray, Math.max(w.rain, w.snow))
}

// ── 비·눈 입자 자리 ────────────────────────────────────────────────────
// 월드 좌표 v 를 center 둘레 폭 width 상자 안으로 감쌉니다(결과는 center − 폭/2 이상 center + 폭/2 미만).
// 입자는 월드에 머물고(내가 걸으면 빗속을 지나감), 상자 밖으로 벗어난 입자만 반대쪽 끝으로 돌아옵니다.
export function wrapAround(v: number, center: number, width: number): number {
  const half = width / 2
  return center - half + ((((v - (center - half)) % width) + width) % width)
}
