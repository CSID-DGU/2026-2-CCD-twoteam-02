# 광장 월드 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 첫 화면(`/`)의 로비 방을 84×84m 바깥 광장으로 바꾸고, 지점 4개를 실제 크기 건물로 세워 걸어 들어갔다 나오게 한다. 전체 지도(G)도 같은 배치를 그린다. (#315)

**Architecture:** 배치는 `src/world/world.json`, 계산은 순수 함수 `src/world/worldLogic.ts`(건물 자리·입구·회의실 별관·장애물·방향 바꾸기·설 자리)가 맡는다. 3D 는 `WorldScene.tsx`(지금 `LobbyScene`을 옮겨 고침)와 `WorldDecor.tsx`(도형 부품), 지도는 `mapLogic.ts`가 `worldLogic`의 건물 배치를 그대로 쓴다. 위에서 보기·미니맵은 "나를 따라다니기" 설정을 더하되 지점 화면은 그대로다.

**Tech Stack:** React 19, React Three Fiber 9, drei 10(`Instances`), three 0.186, TypeScript. 순수 로직은 Node 24 `--experimental-strip-types`로 `.ts`를 직접 불러 스크래치패드 검사 스크립트로 검사(저장소에 넣지 않음, 지금까지와 같은 방식). 화면은 `npm run lint`·`npm run build`와 브라우저.

**Spec:** `docs/superpowers/specs/2026-10-30-plaza-world-design.md`

## Global Constraints

- 브랜치 `feat/hyun/plaza-world` (develop 에서 땀, 이미 만들어 둠). PR base `develop`. DB 변경 없음. 새 라이브러리·외부 모델·이미지 없음.
- **작업 중에는 커밋하지 않는다** (CLAUDE.local.md). 모든 태스크가 끝나면 멈추고 사용자가 VS Code 에서 확인한 뒤 "올려줘"라고 하면, 아래 태스크마다 적어 둔 커밋 메시지로 나눠 커밋한다.
- 작업 폴더에 사용자의 다른 작업(`src/avatar/parts.json`, `art/hair/side-swept.bbmodel`, `public/models/Parts/hair/side-swept.gltf`)이 있다. 손대지 않고, 커밋할 때도 담지 않는다.
- 단위 m, 위쪽(-Z)이 북쪽. 방향(heading)은 라디안, 0이 +Z(남쪽), 방향 벡터는 `(sin h, cos h)`(지금 코드와 같음).
- 입구 방향 각도: south 0, west -π/2, north π, east π/2.
- 실내 입구는 지점 JSON 의 `door`(모두 남쪽 벽 z = +8). 광장 방향 = 실내 방향 + 입구 각도.
- 입장 자리 = 입구 바깥 1.1m(`DOOR_GAP`), 나왔을 때 설 자리 = 입구 바깥 2.1m(`ARRIVE_GAP`) — 지금 로비 값 그대로.
- 위에서 보기는 둘레 30m, 미니맵은 둘레 40m 를 보여 준다(광장에서만). 지점·회의실은 지금 그대로.
- 내부 이름 `lobby`(실시간 방 `LOBBY_CHANNEL`, 접속 장소 `LOBBY_PLACE`)는 바꾸지 않는다. 화면 글자 "로비"만 "광장"으로.
- 그림자 끔. 같은 모양이 여럿인 소품(나무·가로등·벤치)은 drei `Instances`. 일반 노트북 1인칭 30FPS 이상.
- 주석은 한국어, 기준값은 파일 위쪽 이름 붙인 상수, 커밋 메시지 `종류: 한국어 설명`.

## Review Focus

1. 지점에서 나올 때 `from`이 광장에 없는 지점(새로 추가했지만 `world.json`에 안 넣은 지점, 실험용 slug)이면 시작 위치에 서야 한다. — Task 1 `arrivalOf` 검사.
2. 방향을 더하고 빼다 보면 -3π/2 처럼 범위를 벗어난 값이 나온다. `(-π, π]`로 맞춰야 비교·전송이 흔들리지 않는다. — Task 1 `normalizeAngle` 검사.
3. 동·서를 보는 벤치는 부딪힘 상자의 가로·세로가 바뀌어야 한다. 안 바꾸면 벤치 옆을 지나다 보이지 않는 벽에 막힌다. — Task 1 `plazaObstacles` 검사.
4. 창 크기를 바꿔도 따라다니는 위에서 보기의 배율이 둘레 30m 를 유지해야 한다. — Task 2 Step 3 확인 항목.
5. DB 에서 안 연 지점(`is_open` 아님)은 회색 문·"준비 중" 안내로 들어가지 못해야 한다. — Task 4 Step 5 확인 항목.

---

### Task 1: 배치 JSON 과 순수 계산 (`world.json`, `worldLogic.ts`)

**Files:**
- Create: `src/world/world.json`
- Create: `src/world/worldLogic.ts`
- Test: 스크래치패드 `tests/world.test.mjs` (저장소에 넣지 않음)

**Interfaces:**
- Consumes: `import type { Box, BranchLayout } from '../space/layout'` (타입만. Node 로 불러야 하므로 값 import 금지)
- Produces:
  ```ts
  export type Facing = 'south' | 'north' | 'east' | 'west'
  export type Point = { x: number; z: number }
  export type BuildingSpec = { slug: string; x: number; z: number; facing: Facing; wall: string; roof: string }
  export type PlazaLayout = {
    size: { w: number; d: number }; plaza: { w: number; d: number }
    spawn: { x: number; z: number; heading: number }; fountain: { x: number; z: number; r: number }
    buildings: BuildingSpec[]; paths: Box[]; trees: Point[]
    benches: (Point & { facing: Facing })[]; lamps: Point[]
  }
  export type BranchShape = Pick<BranchLayout, 'name' | 'size' | 'door' | 'meetingDoor'>
  export type PlacedBuilding = {
    no: number                // 1부터. Player 의 "앉는 자리" 번호로 씀
    slug: string; name: string; spec: BuildingSpec
    angle: number             // facingAngle(spec.facing)
    rect: Box                 // 광장 좌표, 돌린 뒤의 바닥 사각형
    door: Box                 // 광장 좌표, 입구 문 상자(벽 두께 0.3)
    entry: { no: number; x: number; z: number; rot: number } // Player 앉는 자리. rot = 입구를 바라보는 방향 = angle + π (정규화)
    arrive: Point             // 나왔을 때 설 자리
    annex: (Box & { angle: number }) | null // 회의실 별관(광장 좌표 바닥 사각형), angle = 별관 문이 보는 방향
  }
  export const DOOR_GAP = 1.1, ARRIVE_GAP = 2.1
  export const FENCE_T = 0.3, TRUNK = 0.5, LAMP_POST = 0.3, BENCH = { w: 1.6, d: 0.6 }
  export function normalizeAngle(h: number): number                 // (-π, π]
  export function facingAngle(f: Facing): number
  export function rotate(x: number, z: number, angle: number): Point // (x cos a + z sin a, z cos a − x sin a)
  export function toBranchHeading(worldHeading: number, f: Facing): number // normalize(h − angle)
  export function toWorldHeading(branchHeading: number, f: Facing): number // normalize(h + angle)
  export function placeBuildings(plaza: PlazaLayout, layouts: Record<string, BranchShape>, meetingSize: { w: number; d: number }, warn?: (msg: string) => void): PlacedBuilding[]
  export function plazaObstacles(plaza: PlazaLayout, placed: PlacedBuilding[]): Box[]
  export function arrivalOf(plaza: PlazaLayout, placed: PlacedBuilding[], from?: string, heading?: number): { spawn: Point; heading: number }
  ```

- [ ] **Step 1: `world.json` 작성.** 스펙 3·4절 값 그대로:
  - `size` 84×84, `plaza` 28×28, `spawn` `{ x: 0, z: 6, heading: 3.1416 }`, `fountain` `{ x: 0, z: 0, r: 2.5 }`
  - `buildings`: byeol `(0, -26, south, #e8d9c4, #a0463c)`, sol `(26, 0, west, #cfe8e6, #3f6e9e)`, olive `(0, 26, north, #efe6d2, #6b8e3a)`, obsidian `(-26, 0, east, #3a3a40, #1f1f24)`
  - `paths`: `(0,-16)`, `(16,0)`, `(0,16)`, `(-16,0)` 모두 4×4
  - 나무 30개 안팎, 벤치 8개 안팎(광장 가장자리 안쪽 1m, 광장을 봄), 가로등 12개 안팎(광장 네 모서리·길가). 자리는 자유롭게 고르되 Step 2 의 "막히지 않음·겹치지 않음" 검사를 통과해야 한다.

- [ ] **Step 2: 검사 스크립트 작성** `tests/world.test.mjs` — `world.json`·지점 JSON 4개를 `with { type: 'json' }`로 불러 `placeBuildings(plaza, { byeol, sol, olive, obsidian }, { w: 8, d: 8 })`로 놓고 단언:
  ```js
  // 방향
  for (const f of ['south','north','east','west'])
    for (const h of [0, 1, -2, 3])
      near(toWorldHeading(toBranchHeading(h, f), f), normalizeAngle(h))
  near(toBranchHeading(Math.PI / 2, 'west'), Math.PI)       // 동쪽 건물에 동쪽을 보며 들어가면 실내에서 북쪽
  near(normalizeAngle(-3 * Math.PI / 2), Math.PI / 2)
  nearPt(rotate(1, 2, -Math.PI / 2), { x: -2, z: 1 })       // 지금 지도 회의실(turned)과 같은 변환
  assert(normalizeAngle(-Math.PI) === Math.PI)
  // 건물
  assert(placed.length === 4 && placed.map(b => b.no).join() === '1,2,3,4')
  // 입구 앞 자리는 건물 바깥, 광장 쪽 (광장 중심까지 거리가 건물 중심까지보다 짧다)
  for (const b of placed) assert(!inside(b.entry, b.rect) && dist(b.entry, {x:0,z:0}) < dist(b.spec, {x:0,z:0}))
  near(placed[0].entry.rot, normalizeAngle(facingAngle('south') + Math.PI))
  // 겹치지 않음: 건물·별관끼리, 건물·별관과 분수·광장
  // 막히지 않음: spawn, 모든 entry, 모든 arrive 가 plazaObstacles 의 어떤 상자 안에도 없다
  // 벤치: facing east/west 인 벤치의 장애물 상자는 w 0.6, d 1.6
  // 없는 지점: layouts 에서 sol 을 빼면 placed 3개, warn 이 한 번 불림
  // arrivalOf: from 'sol', heading 0 → spawn = sol.arrive, heading = facingAngle('west'); from 'nope' → plaza.spawn·heading
  ```
  `near(a, b)`는 `Math.abs(a - b) < 1e-6`, `nearPt`는 x·z 각각 `near`, `inside(p, box)`는 가운데·크기 상자 안.

- [ ] **Step 3: 실행해 실패 확인.** Run: `node --experimental-strip-types tests/world.test.mjs` Expected: `ERR_MODULE_NOT_FOUND` (worldLogic.ts 없음)

- [ ] **Step 4: `worldLogic.ts` 구현.** 파일 머리 주석에 스펙 3·5절 요약(배치·방향 규칙). 계산 규칙:
  - 건물 바닥 `rect`: 가운데 `(spec.x, spec.z)`, 크기는 `layout.size`(east/west 면 w·d 바꿈).
  - 실내 좌표 `(x, z)` → 광장 좌표 = `spec + rotate(x, z, angle)`. 문 `door`, 입장 자리(실내 `(door.x, size.d/2 + DOOR_GAP)`), 설 자리(실내 `(door.x, size.d/2 + ARRIVE_GAP)`) 모두 이 규칙.
  - 별관: 실내 가운데 `(md.x + md.w/2 + meeting.d/2, md.z)`, 실내 크기 `(meeting.d, meeting.w)`를 같은 규칙으로 옮기고, `angle = normalize(angle − π/2)`(지금 지도처럼 별관 문이 지점 쪽을 봄).
  - `plazaObstacles`: 울타리 4개(월드 가장자리 안쪽, 두께 `FENCE_T`), 건물 `rect`, 별관, 분수(한 변 2r 정사각형), 나무 줄기 `TRUNK`, 가로등 기둥 `LAMP_POST`, 벤치 `BENCH`(east/west 면 w·d 바꿈).
  - `layouts`에 없는 slug 는 건너뛰고 `warn?.(...)`, 번호(no)는 놓인 것만 1부터.

- [ ] **Step 5: 통과 확인.** Run: `node --experimental-strip-types tests/world.test.mjs` Expected: `world ok`. 그리고 `npm run lint && npm run build` Expected: 오류 0.

- [ ] **Step 6: 커밋 메시지 기록 (올릴 때 사용):** `feat: 광장 월드 배치 JSON 과 건물 자리·방향 계산 추가` (설계 문서 `docs/superpowers/specs/2026-10-30-plaza-world-design.md`·이 계획은 `docs: 광장 월드 설계 문서와 구현 계획` 으로 따로)

### Task 2: 위에서 보기·미니맵 "나를 따라다니기"

**Files:**
- Modify: `src/space/TopDownCamera.tsx`
- Modify: `src/space/Minimap.tsx`

**Interfaces:**
- Produces:
  ```ts
  TopDownCamera({ area, followRef?, span? }: { area: { w: number; d: number }; followRef?: RefObject<{ x: number; z: number }>; span?: number })
  Minimap({ area, posRef, headingRef, follow? }: Props & { follow?: number })
  ```
  `followRef`·`follow`를 넘기지 않으면 지금과 똑같이 동작한다(지점·회의실은 넘기지 않음).

- [ ] **Step 1: `TopDownCamera`** — `followRef`가 있으면 배율 = `min(width, height) / span`(기본 `FOLLOW_SPAN = 30`), `useFrame`에서 카메라 x·z 를 `followRef.current`로 옮긴다(높이 20, 회전 그대로). 없으면 지금 코드 그대로.
- [ ] **Step 2: `Minimap`** — `follow`가 있으면 `W = D = follow + 1`, `useFrame`에서 미니맵 그림을 그리기 전에 `mapCamera.position.x/z`를 내 위치로 옮기고 `updateMatrixWorld()`. 없으면 지금 그대로. 주석에 "광장처럼 넓은 곳은 둘레만"을 적는다.
- [ ] **Step 3: 검사.** Run: `npm run lint && npm run build` Expected: 오류 0. 화면 확인은 Task 4 에서(지점 화면은 바뀌지 않아야 함: 별다방에서 V·미니맵이 지금처럼 방 전체).
- [ ] **Step 4: 커밋 메시지 기록:** `feat: 위에서 보기와 미니맵에 나를 따라다니는 설정 추가`

### Task 3: 광장 그리기 부품 (`WorldDecor.tsx`)

**Files:**
- Create: `src/world/WorldDecor.tsx`

**Interfaces:**
- Consumes: Task 1 `PlazaLayout`, `PlacedBuilding`, `facingAngle`, `FENCE_T`, `TRUNK`, `LAMP_POST`, `BENCH`; `labelTexture`, `LABEL_PX` (`src/space/labelTexture`)
- Produces:
  ```tsx
  export function Ground({ plaza }: { plaza: PlazaLayout })        // 잔디(월드 전체) + 광장 돌바닥 + 길. 겹침은 y 0 / 0.01 / 0.02
  export function Fountain({ fountain }: { fountain: PlazaLayout['fountain'] }) // 둥근 수반 + 물 + 가운데 기둥, 물 색은 useFrame 으로 살짝
  export function Building({ b, open, near }: { b: PlacedBuilding; open: boolean; near: boolean }) // 벽 상자(높이 3.6, spec.wall) + 지붕 판(spec.roof, 사방 0.3 넓게) + 창문(어두운 판, 입구 면·옆면) + 입구 문(가까우면 주황, 안 열었으면 회색, 아니면 초록 — 지금 로비 COLOR 그대로) + 간판(지점 이름) + 별관(높이 3)
  export function Trees({ trees }: { trees: Point[] })              // Instances: 줄기 원기둥 + 잎 원뿔 2단
  export function Benches({ benches }: { benches: PlazaLayout['benches'] }) // Instances: 앉는 판·등받이·다리
  export function Lamps({ lamps }: { lamps: Point[] })              // Instances: 기둥 + 등(밝은 재질, 빛은 #316 에서)
  export function Fence({ size }: { size: PlazaLayout['size'] })   // 가장자리 낮은 울타리(높이 0.8)
  ```

- [ ] **Step 1: 부품 구현.** 색·크기는 파일 위쪽 상수(`COLOR`, `BUILDING_H = 3.6`, `ANNEX_H = 3`, `FENCE_H = 0.8` 등). 재질은 모듈에서 한 번 만들어 같이 쓴다. 간판은 입구 바깥면 위(지금 로비 `SIGN` 크기·높이).
- [ ] **Step 2: 검사.** Run: `npm run lint && npm run build` Expected: 오류 0. (화면은 Task 4)
- [ ] **Step 3: 커밋 메시지 기록:** `feat: 광장 땅·건물·분수·나무·벤치·가로등 그리기 부품 추가`

### Task 4: 광장 화면 (`WorldScene.tsx`) 과 첫 화면 바꾸기

**Files:**
- Move+Modify: `src/lobby/LobbyScene.tsx` → `src/world/WorldScene.tsx` (`git mv`로 옮겨 기록 유지)
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 1 전부, Task 2 `TopDownCamera({ followRef, span })`·`Minimap({ follow })`, Task 3 부품. `BRANCH_LAYOUTS`(`src/space/branches`), `MEETING_ROOM`(`src/meeting/meetingLogic`), `PerfReadout`.
- Produces: `export default function WorldScene({ onEnter }: { onEnter: (branch: { id: number; slug: string; name: string }, heading: number) => void })` — 지금 `LobbyScene`과 같은 모양. `heading`은 **실내 방향**(`toBranchHeading`)으로 넘긴다.

- [ ] **Step 1: 옮기기.** `git mv src/lobby/LobbyScene.tsx src/world/WorldScene.tsx`, 함수 이름 `WorldScene`, 머리 주석을 광장 설명으로.
- [ ] **Step 2: 배치 바꾸기.** 모듈에서 한 번: `const PLACED = placeBuildings(plaza, BRANCH_LAYOUTS, MEETING_ROOM.size, console.warn)`, `const OBSTACLES = plazaObstacles(plaza, PLACED)`, `const ENTRIES = PLACED.map(b => b.entry)`. `lobby.json`·`doorSpots`·`DOOR_GAP`·`ARRIVE_GAP`·`FitCamera`·바닥/벽/문 그리기를 지운다. `arrival`은 `arrivalOf(plaza, PLACED, from, heading)`.
- [ ] **Step 3: 입장.** `tryEnter(no)`는 `PLACED`에서 건물을 찾고, 지금처럼 DB 목록으로 열렸는지 본 뒤 `onEnter(found, toBranchHeading(bodyHeading.current, b.spec.facing))`. 안내 문구 `${b.name} · ${E} 입장`, 기본 안내 "WASD로 움직여 건물 입구로 가세요 · …".
- [ ] **Step 4: 그리기.** `<color attach="background" args={['#9fd3f5']} />`, ambient 1.0·directional 0.9(고정 낮, #316 에서 바뀜), `Ground`·`Fountain`·`Fence`·`Trees`·`Benches`·`Lamps`·건물마다 `Building`(`open` = DB 목록이 없거나 slug 가 있음, `near` = `near === b.no`). 1인칭이면 `WalkCamera` + `<Minimap area={plaza.size} follow={40} …/>`, 위에서 보기면 `<TopDownCamera area={plaza.size} followRef={pos} span={30} />`. `<PerfReadout>`을 지점 화면과 같은 방식으로 붙인다. 다른 참여자·채팅·감정표현·메뉴·패널·숨김 모드는 그대로 둔다.
- [ ] **Step 5: `App.tsx`.** `/`가 `WorldScene`을 그리게 바꾸고 주석 "첫 화면은 광장입니다". Run: `npm run lint && npm run build` Expected: 오류 0. 브라우저(`npm run dev`) 확인:
  - 로그인하면 분수 남쪽에서 북쪽(별다방 쪽)을 보고 선다.
  - 네 건물 각각: 입구 앞에서 안내, E 로 들어가면 실내에서 안쪽을 보고 섬, 출입문 E 로 나오면 그 건물 입구 앞에 건물을 등지고 섬.
  - DB 에서 안 연 지점이 있으면 회색 문·"준비 중" 안내(없으면 확인 항목에서 빼고 기록).
  - V: 나를 따라다니며 둘레 30m, 창 크기를 바꿔도 30m 유지. 1인칭 미니맵: 내 둘레.
  - 별다방 안에서 V·미니맵이 지금처럼 방 전체.
  - 두 계정이 광장에서 서로 보이고, 채팅·캐릭터 누르면 프로필 창·R·F·P 메뉴가 된다.
  - FPS 표시 30 이상(1인칭으로 광장 한 바퀴).
- [ ] **Step 6: 커밋 메시지 기록:** `feat: 첫 화면을 로비 방에서 광장 월드로 바꾸기`

### Task 5: 전체 지도와 "로비" 글자 정리, `lobby/` 지우기

**Files:**
- Modify: `src/map/mapLogic.ts`, `src/map/WorldMap.tsx`
- Modify: `src/realtime/online.ts`, `src/space/BranchScene.tsx`, `src/menu/keymap.ts`, `src/menu/SceneMenu.tsx`
- Delete: `src/lobby/lobby.json` (폴더가 비면 `src/lobby/` 도)
- Modify: `CLAUDE.md` 폴더 구조의 `lobby/` 줄 → `world/      광장 월드 (지점 건물·분수·나무, world.json 에 배치. worldLogic.ts 는 순수 로직)`

**Interfaces:**
- Consumes: Task 1 `PlazaLayout`, `placeBuildings`, `rotate`, `normalizeAngle`, `PlacedBuilding`
- Produces (mapLogic):
  ```ts
  export type MapPlace = { place: string; name: string; rect: Rect; rot: number } // turned 대신 rot (90도 단위 라디안)
  export type WorldLayout = { lobby: MapPlace; branches: MapBranch[]; paths: Rect[]; fountain: { x: number; z: number; r: number }; trees: Point[]; bounds: Rect }
  export function buildWorld(plaza: PlazaLayout, layouts: Record<string, BranchLayout>, meetingSize: { w: number; d: number }): WorldLayout
  export function toMap(p: MapPlace, x: number, z: number, heading: number) // rect 가운데 + rotate(x, z, p.rot), heading + p.rot
  export function boxToMap(p: MapPlace, b: Box): Rect // rot 가 ±π/2 면 w·d 바꿈
  ```
  `findPlace`·`countByPlace`는 그대로.

- [ ] **Step 1: `mapLogic.ts`.** `buildWorld`가 `placeBuildings`로 건물(`rect`, `rot = angle`)과 회의실(`annex`, `rot = annex.angle`)을 만들고, `lobby` = 광장 사각형(`name: '광장'`), `paths`·`fountain`·`trees`는 `world.json` 그대로, `bounds` = 월드 크기. 지금의 자동 배치·길·나무 심기(`ROAD_LENGTH`, `plantTrees` 등)를 지운다. `mapLogic`은 다른 모듈 값을 불러 Node 로 직접 못 부르므로, 회의실 변환이 지금과 같은지는 Task 1 의 `rotate` 검사(`rotate(1, 2, -π/2)` = `(-2, 1)`, 지금 `turned` 결과와 같음)로 확인한다.
- [ ] **Step 2: `WorldMap.tsx`.** `buildWorld(plaza, …)`, `Lobby` 대신 광장(돌바닥·분수 원·길 사각형, 이름표 "광장"), 길은 꺾인 선 대신 사각형. `lobby.json` import 제거.
- [ ] **Step 3: 글자.** `placeLabel('lobby')` → `'광장'`, 지점 출입문 간판·`ThemedDoor label`·안내 "로비로 나가기" → "광장", 메뉴 `'로비로'` → `'광장으로'`. 주석 속 "로비"는 뜻이 바뀌는 곳만 고친다.
- [ ] **Step 4: 지우기.** `git rm src/lobby/lobby.json`. Run: `grep -rn "lobby/" src` Expected: 결과 없음. `npm run lint && npm run build` Expected: 오류 0. 브라우저: G 지도가 광장과 같은 배치(네 건물·별관·분수·길·나무), 지점 안에서 G 를 열면 내 화살표가 그 건물 안 올바른 방향에 있음.
- [ ] **Step 5: 커밋 메시지 기록:** `feat: 전체 지도를 광장 배치로 그리고 로비 글자를 광장으로` (CLAUDE.md 는 `docs: 폴더 구조에 world 추가`로 따로)

### Task 6: 마무리 확인과 멈춤

- [ ] **Step 1:** Run: `node --experimental-strip-types tests/world.test.mjs && npm run lint && npm run build` Expected: `world ok`, 오류 0.
- [ ] **Step 2:** `git status`로 사용자의 다른 작업 파일(Global Constraints)이 그대로 남아 있고 담기지 않았는지 확인.
- [ ] **Step 3:** 바뀐 파일·확인한 것·못 한 것을 사용자에게 알리고 **멈춘다**. "올려줘"를 들으면 태스크별 커밋 메시지로 나눠 커밋 → push → `develop`으로 PR(`Closes #315`, 관련 #58).
