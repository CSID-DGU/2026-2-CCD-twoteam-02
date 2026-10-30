# 월드 날씨: 뇌우 번개 — 설계 (2026-10-30)

관련 Issue: #328. 앞 단계: #317 월드 날씨(`docs/superpowers/specs/2026-10-30-world-weather-design.md`, PR #330).
대상 브랜치: `develop`. DB 변경 없음. 새 라이브러리 없음. 외부 이미지·소리 없음. 외부 서비스 추가 없음.

## 1. 왜

#317 에서 뇌우(날씨 코드 95·96·99)는 "강한 비"로만 보였다. 서울 여름에 가끔 나오는 뇌우 때 하늘이 번쩍이고 먼 하늘에 번개 줄기가 보이게 해 실제 날씨를 따르는 느낌을 더한다.

## 2. 목표 · 하지 않는 것 · 실패로 치는 것

목표 (사용자 결정, 2026-10-30)
- **번쩍임 + 번개 줄기**: 하늘·주변광·구름이 잠깐 밝아지고, 먼 하늘에 지그재그 줄기가 보인다.
- **40~90초마다 한 번**: 간격은 매번 다르다.
- **두세 번 깜빡, 중간 밝기**: 한 번 칠 때 약 1초 안에 2~3번 깜빡인다. 하늘이 하얗게 뒤덮이지 않는다.
- **모두 같은 때·같은 방향**: 실제 시각만으로 정해, 같은 순간이면 모두 같은 때 같은 방향에서 친다.
- **확인용 주소**: `?weather=storm`, 빨리 확인하는 `?weather=storm:fast`.

하지 않는 것
- 천둥소리, 번개가 땅·건물을 비추는 그림자 효과, 방향광(해·달) 바꾸기.
- 서버로 번개 신호 보내기(Supabase Realtime).
- 지점 실내의 번개, 미니맵 표시.

실패로 치는 것
- 같은 시각에 두 사람이 다른 때 번쩍이거나 다른 방향에 줄기를 보는 것.
- 1초 안에 3번 넘게 깜빡이거나, 깜빡임 사이가 0.35초 이하인 것(WCAG 광과민 기준).
- 번개 사이 간격이 40초보다 짧거나 90초보다 긴 것(`fast` 제외).
- 뇌우일 때 일반 노트북에서 30FPS 아래.
- 뇌우가 아닌데 번쩍이는 것, 미니맵에 줄기가 보이는 것.

## 3. 날씨 값에 뇌우 정도 추가 (`weatherLogic.ts`)

```
Weather = { cloud, rain, snow, dim, storm }   // storm: 0~1 뇌우 정도 (새로 추가)
```

- `hourWeather`: 코드 95·96·99 이면 `storm = 1`, 아니면 0. 비 세기 1·구름·어두움은 지금 그대로.
- `mixWeather`: 정각 앞뒤 5분은 `storm` 도 섞는다. 뇌우가 끝날 무렵 번쩍임이 서서히 약해진다.
- `CLEAR`·`makeWeather` 에 `storm` 을 넣는다(기본 0).
- `weatherKind` 는 그대로(뇌우는 계속 'rain').

## 4. 번개 규칙 (`src/world/lightningLogic.ts`, 순수 함수)

`weatherLogic.ts` 가 300줄이 넘어 새 파일로 둔다. React·three.js 와 무관하고 Node 로 검사한다.

### 4.1 언제 치나 — 시간 칸

- 실제 시각 `now` 를 **65초** 칸으로 나누고(`slot = floor(now / 65s)`), 칸마다 한 번 친다.
- 칸 번호를 씨앗으로 한 고정 씨앗 난수(mulberry32, `seeded` 와 같은 식)로 정한다.
  - 치는 순간: 칸 시작 + **0~25초**
  - 방향 `azimuth`: 0~2π
  - 3번째 깜빡임 여부: 50%
  - 2·3번째 깜빡임 시작: 아래 표 범위 안에서
  - 줄기 모양 번호 `shape`
- 앞뒤 번개 간격 = 65s + (뒤 칸 치는 순간 − 앞 칸 치는 순간) → 늘 **40~90초**.
- 한 번 치는 데 약 1초라 칸 끝(최소 40초 남음)을 넘지 않는다. 지금 칸 하나만 보면 된다.
- 하늘 시각(`?time`)이 아니라 **실제 시각**을 쓴다(날씨·구름과 같은 이유).

### 4.2 깜빡임 모양

| 순서 | 시작 (치는 순간부터) | 세기 | 줄기 |
|---|---|---|---|
| 1번째 | 0초 | 1.0 | 진하게 (1.0) |
| 2번째 | 0.40~0.50초 | 0.6 | 옅게 (0.5) |
| 3번째 (50%) | 0.90~0.95초 | 0.35 | 안 보임 |

- 깜빡임 하나: **0.03초**에 세기까지 오르고 **0.15초**에 걸쳐 0으로 내려간다. 겹치는 구간은 큰 값을 쓴다.
- 줄기도 같은 오르내림 모양에 "줄기" 열의 세기를 곱한다.
- 깜빡임 시작 사이가 늘 0.35초를 넘어 1초 안에 3번까지만 깜빡인다.

### 4.3 함수

```ts
export type Lightning = { flash: number; bolt: number; azimuth: number; shape: number }
//   flash  : 하늘·빛 번쩍임 0~1 (깜빡임 세기 × storm)
//   bolt   : 번개 줄기 투명도 0~1 (줄기 세기 × storm)
//   azimuth: 줄기 방향(라디안, 광장 가운데 기준), shape: 줄기 모양 번호
export const NO_LIGHTNING: Lightning   // flash 0, bolt 0
export function lightningAt(now: number, storm: number, fast = false): Lightning
export function parseLightningFast(search: string): boolean   // ?weather=storm:fast 인지
```

- `storm <= 0` 이면 계산 없이 `NO_LIGHTNING`.
- `fast` 이면 칸 **8초**, 치는 순간 **0~2초**(간격 6~10초). 깜빡임 모양·밝기는 같다. 확인용 주소에서만 쓴다.
- 기준값(65초, 25초, 8초, 2초, 깜빡임 시각·세기·오르내림 시간)은 파일 위쪽에 이름 붙인 상수로 모은다.

## 5. 매 프레임 흐름 (`WorldSky.tsx`)

```
weatherAt → applyWeather → lightningAt(now, weather.storm, fast) → applyLightning
```

- `fast` 는 `?time` 처럼 처음 한 번 주소에서 읽는다.
- `WeatherFrame` 에 `lightning: Lightning` 을 더해 구름·줄기 부품이 같은 값을 쓴다.

## 6. 번쩍임 그리기 (`applyLightning`, 순수 함수 + `WorldSky.tsx`·`Clouds.tsx`)

`applyLightning(sky: WeatherSky, flash: number): WeatherSky` 가 하늘·빛 값을 번쩍인 값으로 바꾼다. `WeatherSky` 에 흐림 덮개 색 `overcastColor` 를 더한다(지금은 `WorldSky` 의 상수 `OVERCAST_COLOR`).

| 대상 | 바꾸는 것 (`flash` 에 비례) | 최대 |
|---|---|---|
| 주변광 | 세기 × (1 + 1.0·flash), 색은 `0xc8d4ff` 쪽으로 섞음 | 평소의 2배 |
| 흐림 덮개 | 색을 `0xb8c4dc` 쪽으로 섞음 | 하늘 전체가 밝아 보임 |
| 구름 | `cloudTint` 결과를 흰색 쪽으로 섞음 (Clouds.tsx) | 60% |

- 바꾸지 않는 것: 방향광(그림자가 튀지 않게), 가로등·창문 빛, 별, 달.
- `flash = 0` 이면 지금 화면과 똑같다.
- 낮 뇌우는 이미 어두움 1 이라 주변광이 평소의 0.7배쯤이고, 번쩍여도 1.4배쯤이라 눈부시지 않다.

## 7. 번개 줄기 (`boltShape` 순수 함수 + `src/world/LightningBolt.tsx`)

### 7.1 모양 `boltShape(n): Float32Array`

- 번호 `n` 을 씨앗으로 만든 지그재그 줄기. 평면(x·y, z = 0) 위 삼각형 꼭짓점(x, y, z 반복) 목록.
  - 굵은 줄기: 높이 **110m** 에서 **0m** 까지 **12마디**, 마디마다 좌우로 조금씩 꺾임. 폭 약 **1.6m**.
  - 곁가지 **1~2개**: 줄기 중간에서 비스듬히 아래로, 폭·길이는 줄기보다 작게.
- 선(`Line`) 대신 얇은 띠(사각형 = 삼각형 2개)로 만든다. WebGL 은 선 굵기가 늘 1픽셀이라 340m 밖에서 거의 안 보이기 때문이다.
- 모양은 **6가지**(`BOLT_SHAPES`)를 처음에 한 번 만들고, 칠 때 `shape % 6` 으로 고른다.

### 7.2 그리기 `LightningBolt.tsx`

- 자리: 광장 가운데에서 `azimuth` 방향으로 **340m**(하늘 반구 400m 안쪽), 바닥 높이 0.
- 매 프레임 세로축으로만 돌려(`boltFacing(줄기 x, z, 카메라 x, z)` = `atan2(카메라 x − 줄기 x, 카메라 z − 줄기 z)`) 늘 나를 향하고, 줄기는 똑바로 선다. drei `Billboard`(`lockX`·`lockZ`)는 카메라가 90도 넘게 돌면 판이 옆으로 서서 쓰지 않는다.
- 재질 `MeshBasicMaterial`: 색 `#e8eeff`, `transparent`, 투명도 = `bolt`, `depthWrite: false`, `fog: false`, `toneMapped: false`.
- `SKY_LAYER`(2)에 둔다(미니맵에 안 보임).
- 6가지 모양의 BufferGeometry 는 `useMemo` 로 한 번 만들고, 매 프레임 `useFrame` 안에서 mesh 의 geometry·자리·투명도를 ref 로 바꾼다. 사라질 때 dispose.
- `bolt = 0` 이면 `visible = false`.

## 8. 그리는 순서 (하늘 부품)

| 순서 | 부품 |
|---|---|
| −8 … −5 | 밤 덮개, 별, 달 (그대로) |
| −4 | 흐림 덮개 (그대로) |
| **−3.5** | **번개 줄기 (새로)** — 덮개에 가려지지 않고, 위쪽은 구름에 살짝 묻힘 |
| −3 | 구름 (그대로) |
| −2, −1 | 별자리 (그대로) |

## 9. 확인용 주소 (`parseWeatherOverride`)

- `?weather=storm` → 구름 0.9, 비 1, 눈 0, `storm` 1 (어두움은 `makeWeather` 로 계산).
- `?weather=storm:fast` → 같은 날씨 + 번개 간격 6~10초(`parseLightningFast`).
- `?weather=storm:0.5` 처럼 세기를 붙이면 틀린 값으로 보고 실제 날씨를 쓴다.
- 밤 확인: `?weather=storm:fast&time=22:00`.

## 10. 파일

| 파일 | 할 일 |
|---|---|
| `src/world/lightningLogic.ts` (새) | 시간 칸·깜빡임 규칙 `lightningAt`, `applyLightning`, `boltShape`, `parseLightningFast` |
| `src/world/LightningBolt.tsx` (새) | 번개 줄기 그리기 |
| `src/world/weatherLogic.ts` | `Weather.storm`, `hourWeather`·`mixWeather`·`makeWeather`·`CLEAR`, `?weather=storm`, `WeatherSky.overcastColor`, `WeatherFrame.lightning` |
| `src/world/WorldSky.tsx` | 번쩍임 반영(주변광·덮개 색), `fast` 읽기, `LightningBolt` 넣기, 머리 주석 |
| `src/world/Clouds.tsx` | 번쩍일 때 구름 색 밝게 |

## 11. 성능

- 번쩍임은 이미 있는 물체의 색·세기 숫자만 바꾼다. 새로 그리는 것 없음.
- 줄기는 삼각형 100개 안팎, 치는 1초 동안만 그린다. 평소엔 `visible = false`.
- `lightningAt` 은 칸 하나만 보고 난수 몇 번만 뽑는다(매 프레임 일정한 계산량). 뇌우가 아니면 바로 돌아간다.

## 12. 확인 방법

순수 로직 (Node `--experimental-strip-types` + 스크래치패드 `register.mjs`, 스크립트는 저장소에 넣지 않음)
- 같은 `now` → 같은 결과.
- 하루치를 10ms 간격으로 훑어: 번개 사이 간격 40~90초, 1초 안 깜빡임 시작 3번 이하이고 서로 0.35초 초과. `fast` 는 간격 6~10초.
- `flash`·`bolt` 가 0~1 안, `storm = 0` 이면 둘 다 0, `storm = 0.5` 면 절반.
- `hourWeather` 가 95·96·99 에서 `storm` 1, 다른 코드 0. 정각 앞뒤에서 섞임.
- `parseWeatherOverride` 가 `storm`·`storm:fast` 를 받고 `storm:0.5` 는 거름. `parseLightningFast` 가 `storm:fast` 에서만 true.
- `applyLightning(sky, 0)` 이 값을 바꾸지 않음, `flash = 1` 이면 주변광 세기 2배.
- `boltShape` 꼭짓점이 모두 유한하고 y 가 0~110 안, 6가지 모양이 서로 다름.

화면
- `npm run lint`, `npm run build`.
- 로그인 없는 임시 미리보기(확인 뒤 지움)에서 `?weather=storm:fast`(낮)·`?weather=storm:fast&time=22:00`(밤): 번쩍임·줄기 보임, 성능 표시 30FPS 이상, 미니맵에 줄기 없음.
- 사용자 확인: `npm run dev` 후 `http://localhost:5173/?weather=storm:fast&time=22:00` 에서 광장을 둘러보기.

## 13. 정한 것 (2026-10-30, 사용자)

- 번쩍임 + 번개 줄기 (소리 없음).
- 40~90초마다 한 번, 간격은 매번 다르게.
- 두세 번 짧게 깜빡 + 중간 밝기. 깜빡임 사이 0.35초 초과(한 번 치는 데 약 1초로 고침).
- 줄기 방향은 칠 때마다 바뀌고 모두에게 같은 방향.
- 시간 칸 순수 함수(65초 칸 + 0~25초)로 정한다.
- 확인용 `?weather=storm`, `?weather=storm:fast`.
