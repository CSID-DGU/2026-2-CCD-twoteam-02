# 캠빛 대학교 1단계: 캠퍼스 월드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 광장 남서쪽 길 끝 정문으로 캠퍼스(`/campus`)에 넘어가, 담쟁이 정문·잔디 쿼드·돗자리/빈백(앉아 쉬기)·건물 다섯 채 겉모습(아직 준비 중)이 있는 두 번째 바깥 공간을 걸어 다닌다.

**Architecture:** 광장 화면(`WorldScene`)을 "어느 월드인가"(`WorldConfig`: 배치 JSON·실시간 방·접속 장소·주소)를 받게 일반화해 광장과 캠퍼스가 같이 쓴다. 배치 JSON(`PlazaLayout`)에 월드 사이 문(`gates`)과 쉬는 자리(`rests`)를 더하고, 계산은 `worldLogic.ts` 순수 함수로. 캠퍼스 전용 그림(담쟁이 정문·돗자리·빈백·벽돌 건물 장식·잔디 쿼드)은 새 파일 `CampusDecor.tsx`.

**Tech Stack:** TypeScript, React 19, R3F/drei(Instances), react-router.

**Spec:** `docs/superpowers/specs/2026-10-31-cambit-campus-design.md` (이 계획은 9절의 1단계)

## Global Constraints

- 새 라이브러리 없음. DB 변경 없음(건물 지점·좌석은 2단계). experiment 브랜치 건드리지 않음.
- 배치는 JSON, 화면 코드는 읽기만. 기준값은 이름 붙인 상수. 주석·화면 글자 한국어.
- 광장(`/`)의 지금 동작은 그대로(건물·하늘·날씨·운세·칭호·메뉴). 실시간 방 이름 `lobby`·접속 장소 `lobby` 그대로.
- 캠퍼스: 실시간 방 `campus`, 접속 장소 `campus`(이름 "캠빛 대학교"), 주소 `/campus`.
- 덩굴 잎·나무처럼 여럿인 것은 Instances(성능 30FPS).
- 커밋 전 `npm run lint`, `npm run build`. 검사 스크립트는 scratchpad(`tests/register.mjs`).

## Review Focus

1. 정문을 오갈 때 엉뚱한 자리·방향(광장→캠퍼스는 캠퍼스 정문 안쪽에 캠퍼스를 보고, 캠퍼스→광장은 광장 길 끝에 광장을 보고) → Task 1 검사.
2. Player 자리 번호가 건물 입구·정문·쉬는 자리끼리 겹쳐 E 가 다른 곳으로 가는 것 → Task 1 `spotKindOf` 검사.
3. 돗자리·빈백에서 일어난 뒤 갇힘(의자 자리 갇힘 버그와 같은 꼴) → Task 2 길찾기 검사에 "쉬는 자리에서 걸어 나감" 포함.
4. 광장 쪽 길·정문이 지금 건물·나무·가로등·올리브 입구와 겹치는 것 → Task 2 검사.
5. 일반화하면서 광장의 건물 드나들기·도착 위치가 바뀌는 것 → Task 1·3 에서 기존 plaza 검사 그대로 통과.

---

### Task 1: 월드 사이 문·쉬는 자리 계산 (순수 로직)

**Files:**
- Modify: `src/world/worldLogic.ts`
- Test: `<scratchpad>/tests/campus-logic.test.mjs` (+ 기존 `plaza.test.mjs` 통과 유지)

**Interfaces:**
- `PlazaLayout` 에 선택 칸 추가: `gates?: GateSpec[]`, `rests?: RestSpec[]`, `ground?: 'stone' | 'lawn'`(가운데 바닥: 광장 돌, 캠퍼스 잔디. 없으면 stone), `title?: string`
- `export type WorldId = 'plaza' | 'campus'`
- `export type GateSpec = { to: WorldId; x: number; z: number; w: number; facing: Facing; label: string }` — 문 가운데, 폭, 문 앞면(입장 쪽)이 보는 방향
- `export type RestSpec = { x: number; z: number; rot: number; kind: 'mat' | 'beanbag' }`
- `export type PlacedGate = { no: number; spec: GateSpec; entry: { no; x; z; rot }; arrive: Point; box: Box }` — no 는 `GATE_NO_BASE + i`
- `export const GATE_NO_BASE = 50`, `export const REST_NO_BASE = 100`
- `export function placeGates(layout): PlacedGate[]` — 입장 자리 = 문 앞 `DOOR_GAP`, 도착 자리 = 문 앞 `ARRIVE_GAP`, rot 은 문을 바라봄(건물 입구와 같은 규칙)
- `export function restSpots(layout): Spot[]` — no `REST_NO_BASE + i`, `chair: 'mat'|'beanbag'` 는 Spot 에 없으니 `y`·`lie` 로 표현: 돗자리 `y: MAT_SIT.y`(바닥에 앉음, 음수), 빈백 `y: BEANBAG.y`, `lie: BEANBAG.lie`
- `export function spotKindOf(no: number): 'building' | 'gate' | 'rest'`
- `arrivalOf(layout, placed, from, heading)` 확장: `from` 이 `'world:<WorldId>'` 면 그 월드로 가는 정문(`gates` 중 `to === WorldId`)의 도착 자리에 문을 등지고 선다
- 상수: `MAT_SIT = { y: -0.38 }`, `BEANBAG = { y: -0.12, lie: 0.45 }` (worldLogic 위쪽)
- 기존 `plazaObstacles` 에 정문 기둥 상자 추가(문 폭 양옆 기둥 `GATE_POST` 0.9×0.9)

- [ ] **Step 1: 실패하는 검사** — 가짜 배치(크기 40×40, 정문 하나 `{to:'campus', x:-19, z:10, w:3, facing:'east'}`, 쉬는 자리 둘)로:
  - `placeGates` 입장 자리가 문 동쪽 1.1m, rot 이 서쪽(문을 봄, -π/2 ± 1e-9), 도착 자리가 동쪽 2.1m
  - `arrivalOf(layout, [], 'world:campus', 0).spawn` 이 그 도착 자리, heading 이 동쪽(π/2, 문을 등짐)
  - `arrivalOf(layout, [], 'world:nowhere')` 는 시작 위치
  - `restSpots` 번호 100·101, 돗자리 `y<0`, 빈백 `lie>0`
  - `spotKindOf(3)==='building'`, `spotKindOf(50)==='gate'`, `spotKindOf(101)==='rest'`
  - `plazaObstacles` 에 기둥 상자 2개 더해짐
- [ ] **Step 2: 실행해 실패 확인** (함수 없음)
- [ ] **Step 3: 구현** (`pointToWorld` 와 같은 회전 규칙으로 문 기준 좌표를 옮김)
- [ ] **Step 4: 통과 + 기존 `plaza.test.mjs` 통과**
- [ ] **Step 5: 커밋** — `feat: 월드 사이 정문과 쉬는 자리 계산`

### Task 2: 캠퍼스 배치와 광장 쪽 길·정문

**Files:**
- Create: `src/world/campus.json`
- Create: `src/space/branches/cambit-library.json`, `cambit-lecture.json`, `cambit-info.json`, `cambit-cafe.json`, `cambit-lounge.json` (2단계 전 자리표시: 이름·크기·벽·spawn·출입문만, `seats: []`. DB 에 없어 광장처럼 "준비 중")
- Modify: `src/space/branches/index.ts` (다섯 개 등록), `src/world/world.json` (남서쪽 길 + 정문 `{to:'campus'}` + 표지판 자리, 겹치는 나무·가로등 옮김)
- Test: `<scratchpad>/tests/campus-layout.test.mjs`

**Interfaces:**
- 캠퍼스: 크기 약 48×48, `ground: 'lawn'`, `plaza` = 쿼드(약 22×18), `title: '캠빛 대학교'`. 건물(스펙 4절): 북 도서관(facing south), 동 강의동(west), 서 정보관(east), 남서 학생회관 카페(north), 남동 학생 라운지(north). 남쪽 가장자리 가운데 정문 `{to:'plaza', facing:'north', label:'캠빛 대학교'}`. 쿼드에 돗자리 4~6·빈백 6~8, 나무·벤치·가로등.
- 이름: 도서관 "캠빛 중앙도서관", 강의동 "캠빛 강의동", 정보관 "캠빛 정보관", 학생회관 카페 "학생회관 카페", 학생 라운지 "학생 라운지". slug 는 파일 이름.
- 광장: 남서 모서리에서 서쪽 가장자리로 가는 돌길, 가장자리 정문 `{to:'campus', facing:'east', label:'캠빛 대학교 →'}`.

- [ ] **Step 1: 실패하는 검사** (캠퍼스·광장 각각):
  - `placeBuildings` 경고 없음, 건물끼리·울타리 밖 안 겹침
  - 모든 입구·정문 입장/도착 자리·쉬는 자리가 장애물 밖(반경 0.3)
  - 0.1m 격자 길찾기: 시작 위치에서 모든 건물 입구·정문 입장 자리·쉬는 자리(0.85 안)에 닿음
  - 쉬는 자리에서 출발해 네 방향 중 하나로 0.5m 넘게 걸어 나감(`stepWithObstacles`)
  - 광장: 기존 `plaza.test.mjs` 그대로 통과(건물 6채·올리브 4층 등), 정문이 올리브·흑요 입구 앞 통로를 막지 않음
- [ ] **Step 2: 실행해 실패 확인** (campus.json 없음)
- [ ] **Step 3: 배치 작성** (생성 스크립트는 scratchpad, 결과 JSON 만 저장소에)
- [ ] **Step 4: 통과**
- [ ] **Step 5: 커밋** — `feat: 캠빛 대학교 캠퍼스 배치와 광장에서 가는 길`

### Task 3: WorldScene 을 월드 설정으로 일반화 + /campus

**Files:**
- Create: `src/world/worldConfig.ts`
- Modify: `src/world/WorldScene.tsx`, `src/App.tsx`, `src/realtime/participants.ts`(`CAMPUS_CHANNEL = 'campus'`), `src/realtime/online.ts`(`CAMPUS_PLACE = 'campus'`, `placeLabel` → "캠빛 대학교")

**Interfaces:**
- `export type WorldConfig = { id: WorldId; layout: PlazaLayout; channel: string; place: string; path: string }`
- `export const PLAZA_WORLD: WorldConfig`, `CAMPUS_WORLD: WorldConfig`, `export const worldOf = (id: WorldId) => ...`
- `WorldScene({ onEnter, world = PLAZA_WORLD })` — 지금 모듈 상수(PLAZA·PLACED·OBSTACLES·ENTRIES·LIT_LAMPS)를 월드별로 한 번만 계산(모듈 캐시 `Map<WorldId, …>` 또는 `useMemo`). 실시간 방·접속 장소·안내 문구("광장"/"캠빛 대학교")를 월드 설정에서.
- 정문: Player `spots` 에 정문 입장 자리를 더하고 `onSeat` 에서 `spotKindOf` 로 나눔. 정문 → `navigate(worldOf(to).path, { state: { from: 'world:' + 지금 월드 id, heading } })`. 안내 "캠빛 대학교 → · E 들어가기".
- App: `/campus` 라우트 = `<WorldScene world={CAMPUS_WORLD} onEnter=… />` (건물 입장은 광장과 같음 — 2단계에서 지점 출입문이 캠퍼스로 돌아오게 함)
- 운세 창·별자리·날씨·하늘은 두 월드 모두 그대로.

- [ ] **Step 1:** worldConfig + WorldScene 일반화 (광장 동작 그대로)
- [ ] **Step 2:** 정문 이동 + /campus 라우트 + 실시간 방·접속 장소
- [ ] **Step 3:** `plaza.test.mjs`·`campus-logic`·`campus-layout` 통과, `npm run lint && npm run build`
- [ ] **Step 4: 커밋** — `feat: 광장 화면을 월드 설정으로 나눠 캠퍼스(/campus)에도 씀`

### Task 4: 캠퍼스 그림 — 담쟁이 정문·잔디 쿼드·돗자리·빈백·벽돌 건물 장식

**Files:**
- Create: `src/world/CampusDecor.tsx` (`IvyGate`, `Mats`, `Beanbags`, `CampusBuildingTrim`(흰 창틀·코니스·담쟁이 조각·도서관 시계탑))
- Modify: `src/world/WorldDecor.tsx` (`Ground` 가 `ground: 'lawn'` 이면 가운데를 잔디 줄무늬로), `src/world/WorldScene.tsx` (gates·rests 그리기, 캠퍼스면 건물 장식)

**Interfaces:**
- `IvyGate({ gate: PlacedGate })` — 벽돌 기둥 두 개(흰 갓돌) + 철제 아치 + 현판(labelTexture, 진초록 바탕·크림 글씨) + **뾰족한 담쟁이 잎**(세 갈래 잎 Shape 를 평면 하나로 만들어 Instances 로 기둥·아치에 수십~백여 장, 진초록/연초록 두 색) + 아치에서 늘어지는 줄기 몇 가닥 + 기둥 아래 풀숲. 광장·캠퍼스 정문 같은 부품.
- `Mats({ rests })` — 체크무늬 천(캔버스 텍스처, 빨강·파랑·노랑) 얇은 판, `Beanbags({ rests })` — 눌린 구(scale) 알록달록, roughness 1
- 시안(스펙 3절, 브레인스토밍 gate-v2 A)과 같은 느낌

- [ ] **Step 1:** 구현, `npm run lint && npm run build`
- [ ] **Step 2: 커밋** — `feat: 캠퍼스 담쟁이 정문·잔디 쿼드·돗자리·빈백`

### Task 5: 돗자리·빈백에 앉아 쉬기

**Files:**
- Modify: `src/world/WorldScene.tsx`

**Interfaces:**
- 쉬는 자리에서 E → Player 가 앉음(`canSit` true) → `seat` 상태. 앉아 있는 동안 `SeatCamera`(spot 의 y·lie 로 낮고 누운 시점), 위치 메시지 `seat: no`, 상태 `idle`.
- `OtherParticipants spots={REST_SPOTS}` — 남이 앉은 모습(SeatedCharacter 가 y·lie 를 반영, 숨 라운지와 같음).
- 안내 "돗자리 · E 앉기" / "빈백 · E 눕기", 앉아 있으면 "쉬는 중 · E 일어나기". 기록·타이머 없음.
- DB 자리 잡기 없음(스펙 7절).

- [ ] **Step 1:** 구현, 모든 검사 + `npm run lint && npm run build`
- [ ] **Step 2: 커밋** — `feat: 캠퍼스 돗자리·빈백에 앉아 쉬기`

### Task 6: 전체 지도(G)에 캠퍼스

**Files:**
- Modify: `src/map/mapLogic.ts` (`buildWorld(layout, layouts, place = LOBBY_PLACE, name = '광장')`, 정문 표시), `src/map/WorldMap.tsx` (지금 있는 곳이 캠퍼스(또는 캠퍼스 건물)면 캠퍼스 배치, 아니면 광장)
- Test: `<scratchpad>/tests/campus-map.test.mjs` — 캠퍼스 `buildWorld` 가 건물 5채, `findPlace(world,'campus')` 가 쿼드, 광장 쪽은 기존 `plaza.test.mjs` 의 지도 검사 통과

- [ ] **Step 1: 실패하는 검사 → 실패 확인**
- [ ] **Step 2: 구현 → 통과 + lint·build**
- [ ] **Step 3: 커밋** — `feat: 전체 지도에 캠빛 대학교`

### Task 7: 화면 확인 안내
- [ ] 개발 서버에서 확인할 것 안내: 광장 남서쪽 길 → 정문 E → 캠퍼스(정문 안쪽에 캠퍼스를 보고 섬), 캠퍼스 정문 E → 광장 길 끝, 쿼드 돗자리·빈백 앉기(두 계정이면 남이 앉은 모습), 건물 입구 "준비 중", G 지도, FPS. 확인 못 한 것은 못 했다고 말한다.
