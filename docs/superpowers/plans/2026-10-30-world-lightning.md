# 월드 날씨: 뇌우 번개 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 뇌우(날씨 코드 95·96·99)일 때 40~90초마다 하늘·주변광·구름이 2~3번 번쩍이고 먼 하늘에 번개 줄기가 보이게 한다. (#328)

**Architecture:** `Weather` 에 뇌우 정도 `storm` 을 더하고(`weatherLogic.ts`), 새 순수 파일 `lightningLogic.ts` 가 실제 시각을 65초 칸으로 나눠 언제·어느 방향에 치는지(`lightningAt`), 번쩍인 하늘 값(`applyLightning`), 줄기 모양(`boltShape`)을 계산한다. `WorldSky` 가 매 프레임 `applyWeather` 다음에 `lightningAt` → `applyLightning` 을 계산해 주변광·흐림 덮개에 넣고, 같은 프레임 값(`WeatherFrame.lightning`)을 `Clouds`·새 부품 `LightningBolt` 에 넘긴다. React 다시 그리기 없음.

**Tech Stack:** React 19, R3F 9, drei 10, three 0.186, TypeScript. 순수 로직은 Node `--experimental-strip-types` + 스크래치패드 `register.mjs`. 스크립트는 저장소에 넣지 않는다. 화면은 lint·build 와 로그인 없는 임시 미리보기(확인 뒤 지움).

**Spec:** `docs/superpowers/specs/2026-10-30-world-lightning-design.md`

## Global Constraints

- 브랜치 `feat/hyun/world-lightning`(develop 에서 땀). PR base `develop`, 설명에 `Closes #328`. DB 변경 없음. 새 라이브러리·외부 이미지·소리·외부 서비스 없음.
- **작업 중에는 커밋하지 않는다.** 다 끝나면 멈추고 바뀐 파일을 보고한다. 사용자가 "올려줘"라고 하면 태스크별 커밋 메시지(각 태스크 끝, 설계·계획 문서는 `docs:` 커밋 하나)로 나눠 커밋하고 push·PR. 커밋 전 `npm run lint`·`npm run build` 통과. `git add -A` 금지(파일 지정). 커밋·PR 에 Claude 표시 없음.
- 번개 시각은 **실제 시각**(`now = Date.now()`), 하늘은 월드 시각(`?time`). 같은 `now` 면 모두 같은 결과.
- 기준값(스펙 4절): 칸 65초, 치는 순간 칸 시작 + 0~25초. `fast` 칸 8초, 0~2초. 깜빡임 시작 0초(세기 1.0, 줄기 1.0) / 0.40~0.50초(0.6, 0.5) / 50% 확률로 0.90~0.95초(0.35, 0). 깜빡임 하나: 0.03초에 오르고 0.15초에 걸쳐 내려감, 겹치면 큰 값.
- 번쩍임(스펙 6절): 주변광 세기 × (1 + 1.0·flash), 색 `0xc8d4ff` 쪽으로 flash 만큼; 흐림 덮개 색 `0x8a9099` → `0xb8c4dc` 쪽으로 flash 만큼; 구름 색 흰색 쪽으로 0.6·flash. 방향광·가로등·별·달은 바꾸지 않는다.
- 줄기(스펙 7절): 높이 110m → 0m, 12마디, 폭 약 1.6m, 곁가지 1~2개, 모양 6가지. 광장 가운데에서 340m, 세로축으로만 카메라를 봄(`boltFacing`, drei `Billboard` 는 90도 넘게 돌면 옆으로 서서 안 씀), `#e8eeff`, `depthWrite: false`, `fog: false`, `toneMapped: false`, renderOrder −3.5, `SKY_LAYER`.
- 확인용 주소: `?weather=storm`(구름 0.9, 비 1, 눈 0, storm 1), `?weather=storm:fast`(같은 날씨 + 간격 6~10초), `storm:0.5` 는 거름.
- 주석 한국어, 기준값은 파일 위쪽 이름 붙인 상수. React compiler 린트: 렌더 중 `Date.now()`·만든 값 변경 금지(매 프레임 값은 useFrame 안에서 ref 로). 색 섞기는 `skyLogic` 의 `mix(a, b, t)`(0xrrggbb) 를 쓴다.

## Review Focus

1. 정각 앞뒤 5분 뇌우가 섞이는 동안(`storm` 0~1 사이) 번쩍임이 `storm` 만큼 약해져야 하고, 뇌우가 끝난 뒤(`storm` 0) 한 번도 번쩍이면 안 된다. — Task 2 "storm 비례" 검사.
2. 칸 경계 바로 앞뒤(`now % 65s` 가 0 또는 64.99초)에서 번개가 끊기거나 두 번 치지 않아야 한다. — Task 2 하루 훑기 검사가 경계를 포함.
3. `?weather=rain` 처럼 뇌우가 아닌 확인용 주소에서는 번쩍이지 않아야 한다(`storm` 0). — Task 1 `parseWeatherOverride` 검사.
4. 번쩍임 1초 동안 구름 색이 매 프레임 바뀌어도, 번쩍임이 끝나면 원래 `cloudTint` 색으로 정확히 돌아와야 한다(flash 0 → 색 그대로). — Task 2 `flashCloudTint` 검사.
5. 위에서 보기(V)·미니맵에서 줄기가 보이거나 깨지지 않아야 한다. — Task 4 Step 3 화면 확인.

---

### Task 1: 날씨에 뇌우 정도 추가 (`weatherLogic.ts`)

**Files:**
- Modify: `src/world/weatherLogic.ts` (`Weather`, `CLEAR`, `makeWeather`, `hourWeather`, `mixWeather`, `parseWeatherOverride`, `WeatherSky`, `applyWeather`, 머리 주석의 확인용 주소)
- Test: 스크래치패드(저장소 밖) `tests/lightning-weather.test.mjs`, `register.mjs`

**Interfaces:**
- Produces:
  ```ts
  export type Weather = { cloud: number; rain: number; snow: number; dim: number; storm: number } // 모두 0~1
  export type WeatherSky = SkyState & { fieldStars: number; overcast: number; overcastColor: number } // overcastColor 0xrrggbb, applyWeather 는 0x8a9099
  // parseWeatherOverride: 'storm' | 'storm:fast' 도 받음 (둘 다 같은 Weather)
  ```
  `makeWeather(cloud, rain, snow, storm = 0)`. `mixWeather` 는 `storm` 도 섞는다.

- [ ] **Step 1: 스크래치패드 준비.** 저장소 밖 임시 폴더에 `register.mjs`(확장자 없는 상대 import 를 `.ts` 로 풀어 주는 로더)를 만든다.
  ```js
  // register.mjs
  import { register } from 'node:module'
  register('data:text/javascript,' + encodeURIComponent(`
    export async function resolve(s, c, next) {
      if (s.startsWith('.') && !/\\.[a-z]+$/.test(s)) s += '.ts'
      return next(s, c)
    }`))
  ```

- [ ] **Step 2: 검사 스크립트** `tests/lightning-weather.test.mjs` (저장소의 `src/world/weatherLogic.ts` 를 절대 경로로 import, `node:assert/strict`)
  - `hourWeather({ ms, code: 95|96|99, cloud: 0.5, precip: 3 }).storm === 1`, 같은 칸의 `rain === 1`.
  - `hourWeather` 코드 61·0·3·71 → `storm === 0`.
  - `weatherAt`: 뇌우 칸(끝 T) 다음 칸이 비(코드 61)일 때 `T` 에서 `storm ≈ 0.5`, `T − 10분` 에서 1, `T + 10분` 에서 0.
  - `CLEAR.storm === 0`.
  - `parseWeatherOverride('?weather=storm')` → `{ cloud: 0.9, rain: 1, snow: 0, storm: 1 }`(dim 은 1).
  - `parseWeatherOverride('?weather=storm:fast')` 도 같은 값. `'?weather=storm:0.5'`, `'?weather=storm:'` → `null`.
  - `parseWeatherOverride('?weather=rain').storm === 0`.
  - `applyWeather(skyState(아무 ms), CLEAR).overcastColor === 0x8a9099`.

- [ ] **Step 3: 실행해 실패 확인.** `node --experimental-strip-types --import ./register.mjs tests/lightning-weather.test.mjs` → `storm` 이 `undefined` 라 실패.

- [ ] **Step 4: 구현.** 위 Interfaces 대로 고친다. 뇌우 판정은 지금 `hourWeather` 의 `storm` 변수(`h.code >= 95`)를 그대로 쓴다. 주소 정규식에 `storm` 을 넣되 `storm` 뒤에는 `:fast` 만 허락한다. 확인용 구름 0.9 는 기존 `OVERRIDE.wetCloud`. `OVERCAST_COLOR` 는 `weatherLogic.ts` 위쪽 상수로 옮긴다(Task 3 에서 `WorldSky` 의 상수를 지움).

- [ ] **Step 5: 통과 확인.** 같은 명령 → 모두 통과. `npm run build` 로 타입 확인(이 단계에서는 `WorldSky` 가 아직 자체 `OVERCAST_COLOR` 상수를 써도 빌드됨).

커밋 메시지(올려줘 이후): `feat: 날씨에 뇌우 정도와 ?weather=storm 추가`

---

### Task 2: 번개 규칙과 번쩍임 계산 (`lightningLogic.ts` 1부)

**Files:**
- Create: `src/world/lightningLogic.ts`
- Test: 스크래치패드 `tests/lightning.test.mjs`

**Interfaces:**
- Consumes: `WeatherSky` (Task 1), `mix` (`skyLogic`)
- Produces:
  ```ts
  export type Lightning = { flash: number; bolt: number; azimuth: number; shape: number }
  export const NO_LIGHTNING: Lightning // { flash: 0, bolt: 0, azimuth: 0, shape: 0 }
  export function lightningAt(now: number, storm: number, fast?: boolean): Lightning
  export function parseLightningFast(search: string): boolean // ?weather=storm:fast 일 때만 true
  export function applyLightning(sky: WeatherSky, flash: number): WeatherSky
  export function flashCloudTint(tint: number, flash: number): number // 흰색 쪽으로 0.6·flash
  ```

- [ ] **Step 1: 검사 스크립트** `tests/lightning.test.mjs`
  - 같은 `now` 두 번 → 같은 객체 값(`deepEqual`).
  - `lightningAt(now, 0)` 은 하루 동안 아무 `now` 에서나 `flash === 0 && bolt === 0`.
  - **하루 훑기** (`now` = 임의 날 0시부터 24시간, 10ms 간격, `storm = 1`):
    - "치는 순간" = `flash` 가 0 에서 0 초과로 바뀐 시각 중, 앞 시작에서 1.5초 넘게 떨어진 것. 연속한 치는 순간 사이가 모두 40초 이상 90초 이하.
    - 모든 "깜빡임 시작"(0 → 0 초과)에 대해: 바로 앞 시작과 0.35초 초과 떨어짐, 아무 1초 창에도 3개 이하.
    - 한 번 치는 동안 깜빡임 시작은 2개 또는 3개. 하루 동안 3개짜리와 2개짜리가 모두 나옴.
    - `flash`, `bolt` 가 늘 0~1. 각 치는 순간의 최대 `flash` ≈ 1(±0.05), 3번째 깜빡임 동안 `bolt === 0`.
    - 한 번 치는 동안 `azimuth`·`shape` 가 바뀌지 않음, 하루 동안 `azimuth` 가 0~2π 여러 값.
  - `fast = true` 로 1시간 훑기: 치는 순간 간격 6~10초.
  - **storm 비례:** 아무 `now` 에서 `lightningAt(now, 0.5).flash === lightningAt(now, 1).flash * 0.5`, `bolt` 도 같음.
  - `parseLightningFast('?weather=storm:fast') === true`, `'?weather=storm'`·`'?weather=rain'`·`''` → false.
  - `applyLightning(sky, 0)` 이 `sky` 와 같은 값(`deepEqual`). `applyLightning(sky, 1).ambient.intensity === sky.ambient.intensity * 2`, `.ambient.color === 0xc8d4ff`, `.overcastColor === 0xb8c4dc`. 방향광 `light` 는 그대로.
  - `flashCloudTint(0x30353f, 0) === 0x30353f`, `flashCloudTint(0x000000, 1) === mix(0x000000, 0xffffff, 0.6)`.

- [ ] **Step 2: 실행해 실패 확인.** → 모듈 없음.

- [ ] **Step 3: 구현** `src/world/lightningLogic.ts`. 기준값은 위쪽 상수(Global Constraints 값). 머리 주석에 칸 규칙·간격이 40~90초가 되는 이유·WCAG 기준을 한국어로 적는다. 칸 규칙:
  ```ts
  // slot = floor(now / 칸), r = seeded(LIGHTNING_SEED ^ slot) 로 순서대로 뽑음:
  //   치는 순간 = slot·칸 + r()·치는범위, azimuth = r()·2π, 3번째 여부 = r() < 0.5,
  //   2번째 시작 = 0.40 + 0.10·r(), 3번째 시작 = 0.85 + 0.10·r(), shape = floor(r()·BOLT_SHAPES)
  // t = now − 치는 순간 (초). t < 0 이거나 t > 1.2 면 NO_LIGHTNING.
  // flash = storm × max(깜빡임마다 세기·모양(t − 시작)), bolt 도 줄기 세기로 같은 식
  ```
  `seeded` 는 `weatherLogic.ts` 와 같은 mulberry32 를 이 파일에 둔다(`weatherLogic` 의 것은 내보내지 않으므로). `BOLT_SHAPES = 6` 은 이 파일에서 내보낸다(Task 4 가 씀).

- [ ] **Step 4: 통과 확인.** 같은 명령 → 모두 통과.

커밋 메시지: `feat: 뇌우 번개 시각·번쩍임 계산 추가`

---

### Task 3: 하늘·빛·구름 번쩍임 그리기

**Files:**
- Modify: `src/world/weatherLogic.ts` (`WeatherFrame` 에 `lightning: Lightning`, type import)
- Modify: `src/world/WorldSky.tsx` (머리 주석, `OVERCAST_COLOR` 상수 삭제, `fast` 읽기, 프레임 흐름, 덮개 색)
- Modify: `src/world/Clouds.tsx` (번쩍일 때 색)

**Interfaces:**
- Consumes: `lightningAt`, `applyLightning`, `parseLightningFast`, `flashCloudTint` (Task 2), `WeatherSky.overcastColor` (Task 1)
- Produces: `WeatherFrame = WeatherSky & { ms: number; now: number; weather: Weather; lightning: Lightning }` (Task 4 가 `lightning.bolt`·`azimuth`·`shape` 를 씀)

- [ ] **Step 1: `WorldSky` 고치기.**
  - `fast` 는 `clock` 처럼 ref 에 처음 한 번 `parseLightningFast(window.location.search)` 로 읽는다.
  - 프레임: `const sky = applyWeather(skyState(ms), weather); const lightning = lightningAt(now, weather.storm, fast); const s = applyLightning(sky, lightning.flash); frame.current = { ...s, ms, now, weather, lightning }`.
  - 흐림 덮개: 투명도에 더해 `material.color.setHex(s.overcastColor)` (값이 바뀔 때만 바꾸도록 지난 값을 ref 에 둔다). 덮개 재질의 처음 색은 `weatherLogic` 의 `OVERCAST_COLOR` 를 가져다 쓴다(내보내기).
  - 머리 주석 "날씨" 줄 아래에 "번개 (#328)" 한 줄: 뇌우일 때 lightningLogic 으로 주변광·덮개를 잠깐 밝히고 줄기(LightningBolt)를 그림.
- [ ] **Step 2: `Clouds` 고치기.** `const tint = flashCloudTint(cloudTint(f, f.weather), f.lightning.flash)`. 기존 "바뀔 때만 setHex" 그대로.
- [ ] **Step 3: 확인.** `npm run lint`, `npm run build` 통과. 임시 미리보기(광장 부품 + WorldSky + Minimap, 로그인 없음, 확인 뒤 지움)에서:
  - `?weather=storm:fast&time=22:00`: 6~10초마다 하늘(덮개)·땅(주변광)·구름이 2~3번 밝아졌다 돌아옴. 그림자 방향은 그대로.
  - `?weather=storm:fast`(낮): 번쩍임이 보이되 눈부시지 않음.
  - `?weather=rain`: 번쩍이지 않음. 성능 표시 30FPS 이상.

커밋 메시지: `feat: 뇌우일 때 하늘·빛·구름 번쩍임`

---

### Task 4: 번개 줄기 (`boltShape` + `LightningBolt.tsx`)

**Files:**
- Modify: `src/world/lightningLogic.ts` (`boltShape`)
- Create: `src/world/LightningBolt.tsx`
- Modify: `src/world/WorldSky.tsx` (`<LightningBolt stateRef={frame} />` 를 `<Clouds>` 옆에 넣기, `ORDER` 주석에 −3.5 줄기 추가)
- Test: 스크래치패드 `tests/lightning.test.mjs` 에 이어 쓰기

**Interfaces:**
- Consumes: `WeatherFrame.lightning` (Task 3), `BOLT_SHAPES` (Task 2)
- Produces:
  ```ts
  export function boltShape(n: number): Float32Array // 삼각형 꼭짓점 (x, y, z=0) 반복, 길이는 9의 배수
  export function LightningBolt({ stateRef }: { stateRef: RefObject<WeatherFrame | null> }): JSX.Element
  ```

- [ ] **Step 1: 검사 이어 쓰기.**
  - `n = 0..5` 마다: 길이 > 0 이고 9의 배수, 모든 값 유한, 모든 y 가 0~110(±0.01), 모든 z === 0, 꼭대기(y ≈ 110)와 바닥(y ≈ 0) 꼭짓점이 모두 있음.
  - 같은 `n` 두 번 → 같은 배열. 6가지가 서로 다름.
  - 삼각형 수가 6가지 모두 200개 이하.
- [ ] **Step 2: 실행해 실패 확인.** → `boltShape` 없음.
- [ ] **Step 3: `boltShape` 구현.** 씨앗 `LIGHTNING_SEED + n` 의 `seeded`. 줄기: 110m → 0m 를 12마디로 나누고 마디 끝 x 를 앞 x ± (마디 높이 × 0.5) 안에서 흔든다. 마디마다 그 마디 방향에 수직으로 폭 1.6m 사각형(삼각형 2개). 곁가지 1~2개: 3~8번째 마디 끝에서 시작, 4~6마디, 폭 0.8m, 길이 마디당 6m, 한쪽(좌·우 난수)으로 기울어 내려감. 기준값은 파일 위쪽 상수 `BOLT`.
- [ ] **Step 4: 통과 확인.** 검사 스크립트 전체 통과.
- [ ] **Step 5: `LightningBolt.tsx`.** 머리 주석(무엇·왜 띠로 그리나·레이어·순서). 6가지 `BufferGeometry` 를 `useMemo` 로 한 번 만들고, 재질 하나(Global Constraints 값), 언마운트 때 dispose. `useLayoutEffect` 에서 mesh `layers.set(SKY_LAYER)`, `frustumCulled = false`. `useFrame`: `bolt = 0` 이면 group `visible = false` 하고 끝; 아니면 group 위치 `(sin(azimuth)·340, 0, −cos(azimuth)·340)`, mesh geometry = 모양[`shape % BOLT_SHAPES`], 재질 opacity = `bolt`. group `rotation.y = boltFacing(group x, z, 카메라 x, z)`. 구조는 `<group ref><mesh ref renderOrder={-3.5} /></group>`.
- [ ] **Step 6: 확인.** lint·build. 미리보기 `?weather=storm:fast&time=22:00`: 줄기가 구름 높이에서 땅까지 똑바로 서서 1·2번째 깜빡임에 보이고 3번째엔 안 보임, 칠 때마다 방향·모양이 바뀜, 반대편을 보면 번쩍임만 보임. 두 탭을 같은 주소로 열어 같은 순간 같은 방향인지. 위에서 보기(V)에서 깨지지 않음, 미니맵에 없음. 30FPS 이상.

커밋 메시지: `feat: 뇌우일 때 먼 하늘에 번개 줄기 추가`

---

### Task 5: 마무리 확인과 보고

**Files:**
- Modify: `CLAUDE.md` (폴더 구조의 `world/` 줄 괄호에 "lightningLogic.ts 는 번개 순수 로직" 추가)

- [ ] **Step 1: `CLAUDE.md` 한 줄 고치기.**
- [ ] **Step 2: 전체 확인.** 두 검사 스크립트 통과, `npm run lint`, `npm run build`. 임시 미리보기 파일이 지워졌는지 `git status` 로 확인(남는 것: 위 파일들과 설계·계획 문서).
- [ ] **Step 3: 멈추고 보고.** 바뀐 파일·내용과 사용자 화면 확인 방법(`npm run dev` → `http://localhost:5173/?weather=storm:fast&time=22:00`, 낮 `?weather=storm:fast`, 두 탭 비교)을 알린다. "올려줘" 이후: `docs:` 설계·계획 커밋 → 태스크별 커밋 → push → PR(base `develop`, `Closes #328`, "DB 변경 없음", 고친 파일 목록, 확인용 주소).

커밋 메시지: `docs: CLAUDE.md 에 번개 로직 추가`
