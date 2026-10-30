# 월드 날씨: 구름과 비·눈 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 광장 하늘(#316) 위에 실제 서울 날씨(Open-Meteo 시간별 예보)를 따르는 구름·비·눈을 얹고, 비·눈이 오면 하늘·빛을 어둡게 한다. (#317)

**Architecture:** 계산은 순수 함수 `src/world/weatherLogic.ts`(예보 읽기, 시각 → 날씨 숫자 `Weather`, 하늘 값에 날씨 반영, 구름 자리·색). `useWorldWeather` 훅이 1시간마다 예보를 받아 ref 로 넘기고, `WorldSky` 가 매 프레임 `weatherAt` → `applyWeather` 를 계산해 하늘·빛·흐림 덮개에 넣고 `Clouds`·`Precipitation` 에 같은 프레임 값을 넘긴다. React 다시 그리기 없음.

**Tech Stack:** React 19, R3F 9, drei 10, three 0.186, TypeScript, 브라우저 `fetch`. 순수 로직은 Node `--experimental-strip-types` + 스크래치패드 `register.mjs`(확장자 없는 `./skyLogic` import 를 `.ts` 로 풀어 주는 로더, 앞 작업과 같음). 스크립트는 저장소에 넣지 않는다. 화면은 lint·build 와 로그인 없는 임시 미리보기(확인 뒤 지움).

**Spec:** `docs/superpowers/specs/2026-10-30-world-weather-design.md`

## Global Constraints

- 브랜치 `feat/hyun/world-weather`(develop 에서 땀, 설계 문서 커밋 있음). PR base `develop`, 설명에 `Closes #317`. DB 변경 없음. 새 라이브러리·외부 이미지 없음. 외부 서비스는 Open-Meteo 하나.
- **작업 중에는 커밋하지 않는다.** 다 끝나면 멈추고 바뀐 파일을 보고한다. 사용자가 "올려줘"라고 하면 태스크별 커밋 메시지(각 태스크 끝)로 나눠 커밋하고 push·PR. 커밋 전 `npm run lint`·`npm run build` 통과. `git add -A` 금지(파일을 지정). 커밋·PR 에 Claude 표시 없음.
- 위치 서울 37.5665, 126.978. 서울 = UTC+9, 정시 단위 시차라 서울 정각 = UTC 정각.
- 예보 주소(스펙 4절): `https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.978&hourly=weather_code,cloud_cover,precipitation&past_hours=3&forecast_hours=24&timezone=UTC&timeformat=unixtime`
- 기준값(스펙 3·6·7·8절): `BLEND_MS` 5분, 강수 0.1mm→0.2·1mm→0.5·4mm→1(직선), `MIN_PRECIP` 0.2, 비·눈·안개면 구름 ≥ 0.8, dim = max(0.4·cloud, 강수 있으면 0.6+0.4·세기), 다시 받기 정각+1분·실패 5분 뒤·10초 시간 제한. 구름 40개×덩어리 5, 씨앗 317, 정사각형 760m, 높이 80~120m, 크기 1~1.6배, 초속 3m 동쪽(+x), 가로 거리 300→380m 에서 크기 1→0. 비 2,000개 초속 12m 길이 0.6m, 눈 1,500개 초속 1m, 상자 40×25×40m.
- `applyWeather` 식과 색: 스펙 6절 표 그대로. 구름 색: 흰색 → 노을 `0xffb38a`(해 고도 −2°~10°, 4°에서 가장 진함) → 밤 `0x2a3350`, 비·눈 회색 낮 `0x8a9099`·밤 `0x30353f`. 흐림 덮개 `#8a9099`.
- 그리는 순서(스펙 9절): 밤 덮개 −8, 흩뿌린 별 −7, 달 어두운 부분 −6, 달 밝은 부분 −5, 흐림 덮개 −4, 구름 −3, 별자리 선·별 −2, 이름표 −1, 비·눈 0.
- 날씨 부품은 모두 하늘 레이어 2(`SKY_LAYER`). 날씨는 실제 시각(`Date.now()`)으로, 하늘은 월드 시각(`?time`)으로.
- 별자리용 `stars` 는 날씨로 바꾸지 않는다(흩뿌린 별은 `fieldStars`).
- 주석 한국어, 기준값은 파일 위쪽 이름 붙인 상수, React compiler 린트: 렌더 중 `Date.now()`·만든 값 변경 금지(매 프레임 값은 useFrame 안에서 ref 로).

## Review Focus

1. 예보 배열 중 일부 칸이 `null`(Open-Meteo 는 값이 없으면 null)이면 그 시간만 빼고 나머지는 써야 한다. 전부 버리면 맑음만 보인다. — Task 1 `parseForecast` 검사.
2. 받은 예보가 오래돼(탭을 하루 열어 둠, 다시 받기 실패) 지금 시각이 범위 밖이면 맑음이어야 한다. 마지막 값을 계속 쓰면 어제 비가 계속 온다. — Task 1 `weatherAt` 검사.
3. 구름이 동쪽 끝에서 서쪽 끝으로 넘어가는 순간 보이면 툭 튄다. 넘어갈 때 크기가 0 이어야 한다. — Task 2 `cloudLayout` 검사.
4. 컴퓨터 시간대가 서울이 아니어도 다시 받는 때가 서울 정각+1분이어야 한다(로컬 시간대 함수 금지). — Task 1 `nextFetchDelay` 검사.
5. 지점에 들어갔다 나오면 같은 시간 안에서는 다시 부르지 않고, 확인용 주소가 있으면 아예 부르지 않는다. — Task 3 Step 4 Network 탭 확인.

---

### Task 1: 예보 → 날씨 숫자 (`weatherLogic.ts` 1부)

**Files:**
- Create: `src/world/weatherLogic.ts`
- Test: 스크래치패드 `tests/weather.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  export type Weather = { cloud: number; rain: number; snow: number; dim: number } // 모두 0~1
  export type Hour = { ms: number; code: number; cloud: number; precip: number } // ms = 구간 끝 T (값은 T−1h ~ T), cloud 0~1, precip mm
  export type WeatherSource = { hours: Hour[] | null; override: Weather | null }
  export const CLEAR: Weather // { 0, 0, 0, 0 }
  export function weatherUrl(): string
  export function weatherKind(code: number): 'clear' | 'cloudy' | 'rain' | 'snow'
  export function precipStrength(mm: number): number
  export function hourWeather(h: Hour): Weather // 3.1·3.2절 (안개 구름 ≥0.8, 뇌우 세기 1, 비·눈 구름 ≥0.8, 코드가 비·눈인데 0.1mm 미만이면 0.2, dim)
  export function parseForecast(json: unknown): Hour[] | null
  export function weatherAt(hours: Hour[] | null, ms: number): Weather
  export function parseWeatherOverride(search: string): Weather | null
  export function nextFetchDelay(nowMs: number): number // 다음 정각 + 60초까지 남은 ms
  ```

- [ ] **Step 1: 검사 스크립트** `tests/weather.test.mjs`
  ```js
  // weatherKind
  eq(weatherKind(0), 'clear'); eq(weatherKind(1), 'clear'); eq(weatherKind(3), 'cloudy'); eq(weatherKind(45), 'cloudy')
  eq(weatherKind(61), 'rain'); eq(weatherKind(81), 'rain'); eq(weatherKind(95), 'rain'); eq(weatherKind(73), 'snow'); eq(weatherKind(85), 'snow'); eq(weatherKind(4), 'clear')
  // precipStrength
  near(precipStrength(0.1), 0.2); near(precipStrength(1), 0.5); near(precipStrength(4), 1); near(precipStrength(10), 1); near(precipStrength(2.5), 0.75)
  // hourWeather
  const H = (code, cloud, precip) => ({ ms: 0, code, cloud, precip })
  deep(hourWeather(H(0, 0, 0)), CLEAR)
  near(hourWeather(H(3, 0.5, 0)).dim, 0.2)
  near(hourWeather(H(45, 0.3, 0)).cloud, 0.8)
  near(hourWeather(H(61, 0.5, 0)).rain, 0.2); near(hourWeather(H(61, 0.5, 0)).cloud, 0.8)
  near(hourWeather(H(95, 1, 0.3)).rain, 1)
  near(hourWeather(H(73, 0.9, 1)).snow, 0.5); eq(hourWeather(H(73, 0.9, 1)).rain, 0); near(hourWeather(H(73, 0.9, 1)).dim, 0.8)
  // parseForecast
  const ok = { hourly: { time: [3600, 7200, 10800], weather_code: [0, 61, 71], cloud_cover: [10, 90, 100], precipitation: [0, 1.2, 0.4] } }
  deep(parseForecast(ok)[1], { ms: 7_200_000, code: 61, cloud: 0.9, precip: 1.2 })
  eq(parseForecast({ hourly: { ...ok.hourly, precipitation: [0, 1] } }), null)       // 길이 다름
  eq(parseForecast({ hourly: { time: [3600] } }), null); eq(parseForecast('x'), null); eq(parseForecast(null), null)
  eq(parseForecast({ hourly: { ...ok.hourly, weather_code: [0, null, 71] } }).length, 2) // null 칸은 그 시간만 뺌 (Review Focus 1)
  // weatherAt (T = 구간 끝)
  const T = Date.UTC(2026, 9, 30, 5); const hrs = [{ ms: T, code: 0, cloud: 0, precip: 0 }, { ms: T + 3_600_000, code: 61, cloud: 1, precip: 4 }]
  deep(weatherAt(hrs, T - 1_800_000), CLEAR)                 // 첫 구간 한가운데
  near(weatherAt(hrs, T + 1_800_000).rain, 1)                // 둘째 구간 한가운데
  near(weatherAt(hrs, T).rain, 0.5)                          // 정각 반반
  near(weatherAt(hrs, T - 150_000).rain, 0.25)               // 정각 2분 30초 전
  eq(weatherAt(hrs, T - 6 * 60_000).rain, 0)                 // 섞기 밖
  deep(weatherAt(hrs, T + 5 * 3_600_000), CLEAR)             // 범위 밖 (Review Focus 2)
  deep(weatherAt([], T), CLEAR); deep(weatherAt(null, T), CLEAR)
  // parseWeatherOverride
  near(parseWeatherOverride('?weather=rain').rain, 0.6); near(parseWeatherOverride('?weather=rain').cloud, 0.9)
  near(parseWeatherOverride('?weather=snow:0.3').snow, 0.3); near(parseWeatherOverride('?weather=snow:0.3').dim, 0.72)
  near(parseWeatherOverride('?weather=cloudy').cloud, 0.8); deep(parseWeatherOverride('?weather=clear'), CLEAR)
  for (const bad of ['?weather=rain:7', '?weather=rain:0', '?weather=fog', '?weather=', '', '?time=22:00']) eq(parseWeatherOverride(bad), null)
  // nextFetchDelay (Review Focus 4)
  eq(nextFetchDelay(Date.UTC(2026, 9, 30, 5, 0, 0)), 60_000)
  eq(nextFetchDelay(Date.UTC(2026, 9, 30, 5, 30, 0)), 31 * 60_000)
  eq(nextFetchDelay(Date.UTC(2026, 9, 30, 5, 1, 0)), 60 * 60_000)  // 정각+1분이면 다음 시간
  // weatherUrl 은 Global Constraints 의 주소와 같음
  ```

- [ ] **Step 2: 실행해 실패 확인.** `node --experimental-strip-types --import ./register.mjs tests/weather.test.mjs` → 모듈 없음.

- [ ] **Step 3: 구현.** 파일 위쪽에 스펙 기준값 상수와 머리 주석(무엇을 어디서 받는지, T 구간 규칙, 실제 시각을 쓰는 이유). `weatherAt`: ms 를 담는 구간(T−1h ≤ ms < T)을 찾고, 가장 가까운 정각 B 와의 거리가 `BLEND_MS` 이하이면 B 를 끝으로 하는 구간과 B+1h 구간의 `hourWeather` 를 t = (ms − (B − BLEND_MS)) / (2·BLEND_MS) 로 섞는다. 이웃 구간이 없으면 있는 쪽만 쓴다. `nextFetchDelay` 는 `nowMs % 3_600_000` 으로만 계산(로컬 시간대 함수 금지), 남은 값이 0 이하이면 한 시간 더.

- [ ] **Step 4: 실행해 통과 확인.** 같은 명령 → 모두 통과.

커밋 메시지(올려줘 이후): `feat: 월드 날씨 예보 읽기와 날씨 숫자 계산`

---

### Task 2: 하늘 반영·구름 자리·구름 색 (`weatherLogic.ts` 2부)

**Files:**
- Modify: `src/world/weatherLogic.ts`
- Test: 스크래치패드 `tests/weather-sky.test.mjs`

**Interfaces:**
- Consumes: `SkyState`, `mix` (skyLogic), Task 1 `Weather`, `CLEAR`
- Produces:
  ```ts
  export type WeatherSky = SkyState & { fieldStars: number; overcast: number }
  export type WeatherFrame = WeatherSky & { ms: number; weather: Weather } // WorldSky 가 매 프레임 채우는 값
  export const CLOUD_COUNT = 40
  export const PUFFS = 5
  export const PUFF_STRIDE = 6 // 덩어리 하나: x, y, z, sx, sy, sz
  export function applyWeather(sky: SkyState, w: Weather): WeatherSky
  export function cloudLayout(ms: number, cloud: number, out?: Float32Array): Float32Array // 길이 CLOUD_COUNT·PUFFS·PUFF_STRIDE
  export function cloudTint(sky: SkyState, w: Weather): number // 0xrrggbb
  ```

- [ ] **Step 1: 검사 스크립트** `tests/weather-sky.test.mjs` (`skyState` 로 실제 하늘 값을 만들어 씀)
  ```js
  const noon = skyState(Date.UTC(2026, 9, 30, 3)), midnight = skyState(Date.UTC(2026, 9, 30, 15))
  const rain = { cloud: 0.9, rain: 1, snow: 0, dim: 1 }
  // applyWeather
  const c = applyWeather(noon, CLEAR); near(c.light.intensity, noon.light.intensity); eq(c.fieldStars, noon.stars); eq(c.overcast, 0)
  const r = applyWeather(noon, rain); near(r.light.intensity, noon.light.intensity * 0.4); near(r.ambient.intensity, noon.ambient.intensity * 0.7)
  near(r.overcast, 0.6); near(r.glow, 0.5)
  const n = applyWeather(midnight, rain); eq(n.stars, midnight.stars); eq(n.fieldStars, 0); ok(n.glow >= midnight.night)
  near(n.moonShow, midnight.moonShow * 0.6); near(n.overcast, 0.6 * (1 - 0.7 * midnight.night))
  // cloudLayout
  const a = cloudLayout(1e12, 1), b = cloudLayout(1e12, 1); deep([...a], [...b])          // 같은 시각 같은 자리
  const later = cloudLayout(1e12 + 1000, 1); /* 크기가 있는 덩어리는 x 가 +3 (±0.01) 움직임 (감쌀 때 빼고) */
  // 모든 덩어리: 크기 > 0 이면 구름 가운데 가로 거리 ≤ 380, y 는 70~130 (덩어리 상대 높이 포함)
  // 구름 가운데 가로 거리 ≥ 380 이면 그 구름 덩어리 크기 모두 0 → 동쪽 끝에서 넘어가는 순간 안 보임 (Review Focus 3)
  // cloud 0 → 모든 크기 0, cloud 1 → 보이는 구름(크기 > 0 덩어리를 가진 구름) 수 = 원판 안 구름 수, cloud 0.5 → 20번째 이후 구름 크기 0
  // 하루 1초 간격 표본에서 감쌈을 뺀 x 변화가 늘 3 ± 0.01 (정각에 튀지 않음)
  // cloudTint
  eq(cloudTint(noon, CLEAR), 0xffffff); eq(cloudTint(midnight, CLEAR), 0x2a3350); eq(cloudTint(noon, rain), 0x8a9099)
  // 해 고도 4° 무렵 맑음 → 0xffb38a 에 가까움 (2026-10-30 일몰 직전 시각을 찾아 확인)
  ```

- [ ] **Step 2: 실행해 실패 확인.** 새 함수 없음.

- [ ] **Step 3: 구현.** `applyWeather` 는 스펙 6절 표 그대로(주변광 색은 `mix(ambient.color, 0x9aa6b8, dim)`). `cloudLayout` 은 파일 안 mulberry32(씨앗 317, WorldSky 의 `seeded` 와 같은 식)로 모듈에서 한 번 구름별 시작 x·z(−380~380), 높이 80~120, 크기 1~1.6, 덩어리 상대 자리(x ±12, y −2~3, z ±6)와 기본 크기(가로 10~16m, 높이 0.45배, 깊이 0.7배)를 만들어 두고, 매번 x = 감싸기(시작 x + 3 · ms/1000) 와 크기 × 가장자리(smooth((380 − r)/80)) × clamp(cloud·40 − i, 0, 1) 만 계산해 `out` 에 쓴다. `cloudTint` 는 해 고도로 노을 정도 max(0, 1 − |고도° − 4| / 6) → 흰색과 섞고, night 로 밤색과, max(rain, snow) 로 회색(night 로 낮·밤 회색을 섞은 색)과 섞는다.

- [ ] **Step 4: 실행해 통과 확인.** Task 1 검사도 다시 통과.

커밋 메시지: `feat: 날씨로 하늘·빛 어둡게와 구름 자리·색 계산`

---

### Task 3: 예보 받기와 하늘 어둡게 (훅, WorldSky, 그리는 순서)

**Files:**
- Create: `src/world/useWorldWeather.ts`
- Modify: `src/world/WorldSky.tsx`, `src/world/Constellations.tsx`(ORDER 값만), `src/world/WorldScene.tsx`

**Interfaces:**
- Consumes: Task 1 `weatherUrl`, `parseForecast`, `parseWeatherOverride`, `nextFetchDelay`, `weatherAt`, `WeatherSource`; Task 2 `applyWeather`, `WeatherFrame`
- Produces:
  ```ts
  export function useWorldWeather(): RefObject<WeatherSource> // useWorldWeather.ts
  // WorldSky 새 props
  weatherRef: RefObject<WeatherSource>
  followRef: RefObject<{ x: number; z: number }> // 비·눈 상자 가운데 (Task 5)
  // WorldSky 의 frame ref 는 WeatherFrame (Constellations 의 SkyFrame 자리에 그대로 넘김)
  ```

- [ ] **Step 1: `useWorldWeather`.** 모듈 변수 `cache: { hours: Hour[] | null; fetchedHour: number }`(fetchedHour = floor(ms / 1h)). effect 안에서: 주소에 확인용 날씨가 있으면 `override` 만 넣고 끝. 아니면 cache 가 이번 시간 것이면 그대로 쓰고 다음 받기만 예약, 아니면 바로 받기. 받기 = `fetch(weatherUrl(), { signal })` + 10초 `AbortController`, 성공하면 `parseForecast` 결과가 null 이 아닐 때 cache·ref 갱신 후 `nextFetchDelay` 뒤 예약, 실패하면 `console.warn` 한 번 + 5분 뒤 다시. 언마운트 때 타이머·요청 정리. 렌더 중 `Date.now()` 금지(effect 안에서만).

- [ ] **Step 2: WorldSky 날씨 적용.** useFrame 에서 `weather = override ?? weatherAt(hours, Date.now())`, `s = applyWeather(skyState(ms), weather)`, `frame.current = { ...s, ms, weather }`. 흩뿌린 별 투명도는 `s.fieldStars`, 빛·주변광·달·`setNightGlow(s.glow)` 는 `s` 값. 흐림 덮개: 밤 덮개와 같은 반구 지오메트리(반지름 400, 정점 색 없이 `#8a9099`), 투명도 `s.overcast`, 0 이면 숨김, 하늘 레이어 2. `ORDER` 를 Global Constraints 값으로 다시 매기고, `Constellations.tsx` 의 `ORDER` 도 lines·stars −2, label −1. 머리 주석에 날씨(#317) 한 줄.

- [ ] **Step 3: WorldScene 연결.** `const weather = useWorldWeather()`, `<WorldSky ... weatherRef={weather} followRef={pos} />`. 머리 주석 "날씨는 #317" → "날씨는 실제 서울 날씨(Open-Meteo, 확인용 ?weather=rain)".

- [ ] **Step 4: 확인.** `npm run lint`, `npm run build` 통과. 임시 미리보기(광장 부품 + WorldSky + Minimap, 로그인 없음, 확인 뒤 지움)에서
  - `?weather=rain`: 낮 하늘이 회색으로 덮이고 땅·건물이 어두워지고 가로등이 살짝 켜짐
  - `?time=22:00&weather=rain`: 흩뿌린 별 없음, 별자리·이름표 그대로
  - 주소 값 없이: Network 탭에 Open-Meteo 요청 1번(이 작업 환경은 외부 접속이 막혀 실패할 수 있음 → 콘솔 경고 1번·맑음이면 통과, 실제 응답은 사용자 확인으로 넘김). 확인용 주소가 있으면 요청 0번 (Review Focus 5)

커밋 메시지: `feat: 실제 서울 날씨 받기와 비·눈 올 때 하늘 어둡게`

---

### Task 4: 구름 (`Clouds.tsx`)

**Files:**
- Create: `src/world/Clouds.tsx`
- Modify: `src/world/WorldSky.tsx`(`<Clouds stateRef={frame} />` 넣기)

**Interfaces:**
- Consumes: Task 2 `cloudLayout`, `cloudTint`, `CLOUD_COUNT`, `PUFFS`, `PUFF_STRIDE`, `WeatherFrame`; `SKY_LAYER`
- Produces: `export function Clouds({ stateRef }: { stateRef: RefObject<WeatherFrame | null> })`

- [ ] **Step 1: 구현.** 덩어리 지오메트리 `IcosahedronGeometry(1, 1)` 에 위 밝음(1) → 아래 어두움(0.78) 정점 색. `MeshBasicMaterial({ vertexColors, transparent: true, depthWrite: false, toneMapped: false })`, `InstancedMesh` 200개, `renderOrder` −3, 레이어 2, `frustumCulled = false`. useFrame 에서 `cloudLayout(frame.ms, frame.weather.cloud, buf)` → 크기 0 인 덩어리는 크기 0 행렬로, 나머지는 위치·크기 행렬, `instanceMatrix.needsUpdate`. 재질 색은 `cloudTint` 값이 바뀔 때만 `setHex`. 구름 양 0 이면 mesh 숨김. 만든 지오메트리·재질은 언마운트 때 dispose. 머리 주석(무엇을, 왜 InstancedMesh, 왜 MeshBasic).

- [ ] **Step 2: 확인.** lint·build. 미리보기 `?weather=cloudy`: 구름이 서쪽 → 동쪽으로 흐름, 해(낮 하늘의 밝은 점)를 가림, 건물·나무 뒤로 숨음, 위에서 보기(V)·미니맵에 안 보임. `?time=22:00&weather=cloudy`: 구름이 남회색, 달을 가리고 별자리는 구름 앞에 보임. `?time=17:20&weather=cloudy` 무렵: 주황빛. FPS 표시 30 이상.

커밋 메시지: `feat: 광장 하늘에 흐르는 구름 추가`

---

### Task 5: 비·눈 (`Precipitation.tsx`)

**Files:**
- Create: `src/world/Precipitation.tsx`
- Modify: `src/world/WorldSky.tsx`(`<Precipitation stateRef={frame} followRef={followRef} />` 넣기)

**Interfaces:**
- Consumes: Task 2 `WeatherFrame`; Task 3 `followRef`; `SKY_LAYER`
- Produces: `export function Precipitation({ stateRef, followRef }: { stateRef: RefObject<WeatherFrame | null>; followRef: RefObject<{ x: number; z: number }> })`

- [ ] **Step 1: 구현.** 파일 위쪽 상수(스펙 8절 값, 기울기: 떨어지는 1m 마다 동쪽 0.15m). 처음 자리는 고정 씨앗으로 상자 안 고르게(상대 좌표 배열). 매 프레임 `delta`(최대 0.1초로 자름)만큼 상대 y 를 내리고, 0 아래면 25 를 더해 위로. 월드 좌표 = 내 위치 + 상대 x·z(상자 폭으로 감싸기) — 그래서 걸어도 내 둘레에 계속 내림.
  - 비: `LineSegments`, 정점 2개(위 끝·아래 끝)/줄, `LineBasicMaterial({ color: '#b8c4d4', transparent: true, opacity: 0.5, depthWrite: false })`, `setDrawRange(0, round(2000 · rain) · 2)`.
  - 눈: `Points`, 작은 캔버스(32px)에 흰 원 그라데이션 → `PointsMaterial({ map, size: 0.12, transparent: true, depthWrite: false })`, x·z 에 점마다 위상이 다른 사인 흔들림(폭 0.3m, 주기 3초), `setDrawRange(0, round(1500 · snow))`.
  - 세기 0 이면 그 물체 숨김(계산도 건너뜀). 레이어 2, `frustumCulled = false`, `renderOrder` 0. 언마운트 때 dispose.

- [ ] **Step 2: 확인.** lint·build. 미리보기 `?weather=rain`, `?weather=rain:0.3`(줄 수 차이), `?weather=snow`(흔들리며 내림), 걸어 다녀도 둘레에 계속 내림, 위에서 보기(V)에서 깨지지 않음, 미니맵에 없음, FPS 30 이상(`?weather=rain:1`).

커밋 메시지: `feat: 광장에 비·눈 입자 추가`

---

### Task 6: 문서 정리와 마무리 확인

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: CLAUDE.md.** 기술 스택 "현재 쓰는 것"에 `- 날씨: Open-Meteo 시간별 예보(키 없음, 브라우저에서 직접 받음, \`src/world/useWorldWeather.ts\`). 서울 고정 좌표만 보낸다.` 폴더 구조 `world/` 줄에 `weatherLogic.ts는 날씨` 추가.

- [ ] **Step 2: 전체 확인.** 두 검사 스크립트 통과, `npm run lint`, `npm run build`. 임시 미리보기 파일이 지워졌는지 `git status` 로 확인.

- [ ] **Step 3: 멈추고 보고.** 바뀐 파일·내용과 사용자 화면 확인 목록(스펙 12절 "화면", 특히 실제 Open-Meteo 응답과 두 브라우저 비교)을 알린다. "올려줘" 이후: 태스크별 커밋 → push → PR(base `develop`, `Closes #317`, "DB 변경 없음", 이슈 본문의 "서버·외부 날씨 API 없음"을 Open-Meteo 로 바꿨다는 설명) → 이슈 #317 본문 수정.

커밋 메시지: `docs: CLAUDE.md 에 날씨(Open-Meteo) 추가`
