# 솔카페 다이너 테마 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 솔카페 JSON에 `theme`를 두고, 지점 화면이 그것을 읽어 흑백 체크 바닥·청록 벽·천장과 팬·벽 액자·타일 카운터와 스툴·빨간 책상·따뜻한 조명으로 그린다. 별다방은 테마가 없어 지금 그대로다. (#57 일부)

**Architecture:** 색·텍스처·소품 배치는 전부 `src/space/branches/sol.json`의 `theme`에 있고, `src/space/theme.ts`(순수)가 기본값 합치기·액자 자세·스툴 장애물을 계산한다. `src/space/patternTexture.ts`가 코드로 그린 캔버스 텍스처(체크·타일·포스터)를 캐시하고, `src/space/Decor.tsx`가 천장·팬·네온·액자·카운터·스툴을 그린다. `BranchScene.tsx`는 하드코딩 색을 `colorsOf(theme)`로 바꾸고 `<Decor>`를 한 줄 넣는다. 외부 모델·이미지 파일 없음.

**Tech Stack:** React 19, React Three Fiber 9, drei, three 0.186, TypeScript(`erasableSyntaxOnly`). 순수 로직은 Node 26으로 `.ts`를 직접 불러 검사(스크래치패드 `tests/register.mjs` 훅). 화면은 `npm run lint`·`npm run build`와 브라우저.

**Spec:** `docs/superpowers/specs/2026-10-29-sol-diner-theme-design.md` (Task 1에서 저장소에 넣는다)

## Global Constraints

- 브랜치 `feat/wonjun/sol-diner`, `origin/develop`에서 딴다. 지금 세션의 worktree는 PR #308용이므로 **새 worktree**로 한다. PR base `develop`. DB 변경 없음.
- 외부 모델·이미지 파일을 추가하지 않는다. 새 라이브러리 없음(후처리 bloom 없음).
- 별다방(theme 없음)은 바닥 `#e8e2d6`, 벽 `#8a8f98`, 책상 `#b98a5a`, 의자 기본 `#6b7280`, 커피 바 `#7c5a3a`, ambient 1.2, directional 0.8, 흰 빛 — 지금과 같아야 한다.
- 천장은 아래를 향한 한 면만 그린다(`TopDownCamera`와 미니맵 카메라는 (0,20,0)에서 내려다봄).
- 주석은 한국어, 기준값은 파일 위쪽에 이름 붙인 상수. 성능 목표 30FPS.
- 커밋 메시지 `feat: 한국어 설명`, 한 커밋 한 가지. 커밋 전 lint·build 통과.

## Review Focus

1. `theme`에 일부 항목만 있을 때(예: `floor`만) 나머지는 기본값으로 그려지고 어떤 것도 던지지 않아야 한다. — Task 1 `colorsOf` 부분 테마 검사, Task 3 `Decor`가 없는 항목을 건너뜀.
2. 2D 위에서 보기와 1인칭 미니맵에서 천장이 안 가려야 한다. — Task 3 Step 6 확인 항목.
3. 텍스처가 렌더마다 새로 만들어지면 메모리가 샌다. — Task 2 캐시 검사(같은 인자면 같은 객체).
4. 의자 색: 가까이·내 자리 강조색(주황·내 자리색)은 테마와 무관하게 유지돼야 한다. — Task 3 Step 6 확인 항목.
5. 스툴 장애물이 좌석·의자 자리와 겹치면 앉을 수 없게 된다. — Task 1 `stoolBoxes` 검사에서 솔카페 좌석(최대 z 1.6)과 겹치지 않음을 단언.

---

### Task 1: 테마 타입·순수 함수·솔카페 JSON

**Files:**
- Create: `src/space/theme.ts`
- Modify: `src/space/layout.ts:6-21` (`BranchLayout.theme?: BranchTheme`), `:22` (`Branch` Pick에 `'theme'`), `obstaclesOf` 끝에 `...stoolBoxes(b.theme)`
- Modify: `src/space/branches/sol.json` (`theme` 추가 — 설계 4절 값 그대로, 팬 6개)
- Create: `docs/superpowers/specs/2026-10-29-sol-diner-theme-design.md`, `docs/superpowers/plans/2026-10-29-sol-diner-theme.md` (스크래치패드에서 복사)
- Test: 스크래치패드 `tests/theme.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  export type FanSpot = { x: number; z: number }
  export type Frame = { x: number; z: number; face: 'n' | 's' | 'e' | 'w'; text: string; bg: string }
  export type BranchTheme = {
    floor?: { pattern: 'checker'; colors: [string, string]; cell: number }
    wall?: { color: string; neon?: string }
    ceiling?: { color: string; fans?: FanSpot[] }
    frames?: Frame[]
    counter?: { style: 'tile'; top: string; stools?: { x: number; z: number }[] }
    desk?: string
    chair?: string
    light?: { ambient: number; sun: number; color: string }
  }
  export const DEFAULT_COLORS = { floor: '#e8e2d6', wall: '#8a8f98', desk: '#b98a5a', chair: '#6b7280', bar: '#7c5a3a', light: { ambient: 1.2, sun: 0.8, color: '#ffffff' } }
  export type SceneColors = { floor: string; wall: string; desk: string; chair: string; light: { ambient: number; sun: number; color: string } }
  export function colorsOf(theme?: BranchTheme): SceneColors      // 테마 값이 있으면 그것, 없으면 DEFAULT_COLORS
  export const WALL_HEIGHT = 2.5, WALL_THICKNESS = 0.2
  export const FRAME = { w: 0.9, h: 0.7, depth: 0.04, inner: { w: 0.78, h: 0.58 }, y: 1.6, gap: 0.11 }  // gap = 벽 두께/2 + 0.01
  export function framePose(f: Frame): { x: number; y: number; z: number; rotY: number }
    // face 's' → rotY 0, z + gap / 'n' → rotY π, z - gap / 'e' → rotY π/2, x + gap / 'w' → rotY -π/2, x - gap. y = FRAME.y
  export const STOOL = { legR: 0.04, legH: 0.55, seatR: 0.18, seatH: 0.1, box: { w: 0.4, d: 0.4 } }
  export function stoolBoxes(theme?: BranchTheme): Box[]           // counter.stools → { x, z, ...STOOL.box }
  export const FAN = { hubR: 0.06, hubH: 0.3, bladeL: 0.7, bladeW: 0.14, bladeT: 0.03, turnsPerSec: 1.5 }
  ```
- `Box`는 `layout.ts`의 것을 import type 한다(순환 import 없음: layout.ts → theme.ts 한 방향이 되도록 `Box`를 theme.ts에서 다시 정의하지 말고, `stoolBoxes` 반환 타입은 `{ x: number; z: number; w: number; d: number }[]`로 적는다).

- [ ] **Step 1: worktree 만들기.** 지금 worktree(PR #308)에서 `ExitWorktree(keep)` 뒤 `EnterWorktree`로 새로 만들고 브랜치 이름을 `feat/wonjun/sol-diner`로 바꾼다. `origin/develop` 기준인지 `git log -1`로 확인(아니면 `git reset --hard origin/develop`). `npm install`, `.env.local` 복사, 두 문서 복사.

- [ ] **Step 2: 검사 스크립트** `tests/theme.test.mjs`:
  - `colorsOf(undefined)` → `DEFAULT_COLORS`의 floor·wall·desk·chair·light와 같다(deepEqual)
  - `colorsOf({ desk: '#d9353a' })` → desk만 바뀌고 wall·light는 기본값
  - `colorsOf({ wall: { color: '#1fb6b3' }, light: { ambient: 1, sun: 0.9, color: '#fff1dc' } })` → wall `'#1fb6b3'`, light.ambient 1
  - `framePose({ x: -4, z: -8, face: 's', text: '', bg: '' })` → `{ x: -4, y: 1.6, z: -7.89, rotY: 0 }` (소수 오차는 `Math.abs < 1e-9`)
  - `face: 'n'` z 8 → z 7.89, rotY π / `'e'` x -8 → x -7.89, rotY π/2 / `'w'` x 8 → x 7.89, rotY -π/2
  - `stoolBoxes(undefined)` → `[]`; `stoolBoxes({ counter: { style: 'tile', top: '#000', stools: [{ x: 2, z: 5.8 }] } })` → `[{ x: 2, z: 5.8, w: 0.4, d: 0.4 }]`
  - 솔카페 JSON을 읽어(`fs.readFileSync` + `JSON.parse`) `stoolBoxes(sol.theme)` 3개 모두 `z - 0.2 > 1.6 + 0.3`(가장 남쪽 좌석 1.6 + 책상 반 폭 0.3)이라 좌석과 안 겹친다. `sol.theme.ceiling.fans.length === 6`, `sol.theme.frames.length === 5`.

- [ ] **Step 3: 실행해 실패 확인.** Run: `node --import tests/register.mjs tests/theme.test.mjs` Expected: `ERR_MODULE_NOT_FOUND`

- [ ] **Step 4: `theme.ts` 구현, `layout.ts` 수정, `sol.json`에 `theme` 추가.** JSON import 타입: `sol.json`의 `theme.floor.colors`가 `string[]`로 추론돼 `[string, string]`에 안 맞을 수 있다 → `index.ts`의 `BRANCH_LAYOUTS: Record<string, BranchLayout>` 대입에서 오류가 나면 `sol as BranchLayout`으로 단언하고 한국어 주석 한 줄.

- [ ] **Step 5: 통과 확인.** Run: `node --import tests/register.mjs tests/theme.test.mjs` Expected: `theme ok`. 그리고 `npm run lint && npm run build` Expected: 오류 0.

- [ ] **Step 6: Commit**
```bash
git add src/space/theme.ts src/space/layout.ts src/space/branches/sol.json docs/superpowers/specs/2026-10-29-sol-diner-theme-design.md docs/superpowers/plans/2026-10-29-sol-diner-theme.md
git commit -m "feat: 지점 테마 데이터와 솔카페 다이너 테마 값 추가"
```

---

### Task 2: 코드로 그린 텍스처 `patternTexture.ts`

**Files:**
- Create: `src/space/patternTexture.ts`
- Test: 없음(캔버스·three는 브라우저 전용). lint·build + Task 3 브라우저 확인.

**Interfaces:**
- Produces:
  ```ts
  export const PATTERN_PX = 512                      // 체크·타일 텍스처 한 변
  export const POSTER_PX = { w: 404, h: 300 }        // 액자 안판 0.78:0.58 과 같은 비율
  export function checkerTexture(colors: [string, string], cells: number, repeat: { x: number; y: number }): CanvasTexture
    // cells×cells 칸을 그리고 RepeatWrapping, repeat.set(x, y). 캐시 키 `checker|c0|c1|cells|x|y`
  export function tileTexture(tile: string, grout: string, cells: number, repeat: { x: number; y: number }): CanvasTexture
    // 칸마다 줄눈(grout) 2px 두고 tile 색 채움. 캐시 키 `tile|…`
  export function posterTexture(text: string, bg: string, color = '#fff'): CanvasTexture
    // bg 로 채우고 가운데 굵은 글자(최대 너비 POSTER_PX.w - 40). 캐시 키 `poster|text|bg|color`
  ```
- 모두 `colorSpace = SRGBColorSpace`, `labelTexture.ts`와 같은 `Map` 캐시. 같은 인자로 두 번 부르면 같은 객체(Review Focus 3).

- [ ] **Step 1: 구현.** 파일 머리 주석: "이미지 파일 없이 캔버스로 그리는 무늬 텍스처. 같은 인자는 한 번만 그려 같이 쓴다(labelTexture 와 같은 방식)."

- [ ] **Step 2: 검사.** Run: `npm run lint && npm run build` Expected: 오류 0.

- [ ] **Step 3: Commit**
```bash
git add src/space/patternTexture.ts
git commit -m "feat: 체크·타일·포스터 캔버스 텍스처 추가"
```

---

### Task 3: 소품 `Decor.tsx`와 `BranchScene` 연결

**Files:**
- Create: `src/space/Decor.tsx`
- Modify: `src/space/BranchScene.tsx:324-345` (조명·바닥·벽·책상 색), `:347-357` (의자 기본색), `:402-414` (커피 바), Canvas 안 적당한 곳에 `<Decor>` 한 줄, import 셋.

**Interfaces:**
- Consumes: `BranchTheme`, `colorsOf`, `framePose`, `FRAME`, `STOOL`, `FAN`, `WALL_HEIGHT`, `DEFAULT_COLORS` (Task 1); `checkerTexture`, `tileTexture`, `posterTexture` (Task 2); `BAR_HEIGHT`(BranchScene 상수 1.0 — Decor로 옮기지 말고 prop으로 받는다)
- Produces:
  ```tsx
  // Decor.tsx — 테마가 없으면 아무것도 그리지 않는다. 항목마다 선택.
  export function Decor({ theme, size }: { theme?: BranchTheme; size: { w: number; d: number } }): JSX.Element | null
    // 안에서: theme.ceiling → <Ceiling> + fans.map(<CeilingFan>) ; theme.wall?.neon → <NeonStrip> 4변 ; theme.frames → <WallFrame>
  export function Counter({ bar, counter, height }: { bar: Box; counter: NonNullable<BranchTheme['counter']>; height: number }): JSX.Element
    // 몸체 boxGeometry(bar.w, height, bar.d) 에 tileTexture('#f6f6f6', '#b8b8b8', 8, {x: bar.w*2, y: height*2}) ;
    // 아래 체크 띠 boxGeometry(bar.w+0.02, 0.3, bar.d+0.02) y 0.15 에 checkerTexture(['#1a1a1a','#f4f4f4'], 8, {x: bar.w*2, y: 1}) ;
    // 상판 boxGeometry(bar.w+0.1, 0.08, bar.d+0.1) y height+0.04 색 counter.top ; 상판 가장자리 네온은 theme.wall.neon 과 같은 색의 얇은 상자(0.03) 앞면 한 줄 ;
    // counter.stools.map(<Stool>)
  function Stool({ x, z }): 다리 cylinderGeometry(STOOL.legR, STOOL.legR, STOOL.legH) 색 '#c0c4cc' + 방석 cylinderGeometry(STOOL.seatR, STOOL.seatR, STOOL.seatH) 색 '#d9353a'
  function Ceiling({ color, size }): <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, WALL_HEIGHT, 0]}> planeGeometry(size.w, size.d) meshStandardMaterial color (side 기본 FrontSide → 아래에서만 보임)
  function CeilingFan({ x, z }): group at y WALL_HEIGHT - FAN.hubH / 2 ; useFrame((_, dt) => group.rotation.y += dt * FAN.turnsPerSec * 2π) ; 허브 cylinder + 날개 4개(boxGeometry(FAN.bladeL, FAN.bladeT, FAN.bladeW), 90° 간격, 허브에서 bladeL/2 떨어짐) 색 '#3b3b3b'
  function NeonStrip({ color, size }): 4변 각각 boxGeometry(변 길이, 0.04, 0.04) y WALL_HEIGHT - 0.08, 벽 안쪽으로 WALL_THICKNESS/2 + 0.02 ; meshStandardMaterial color + emissive=color emissiveIntensity 1.5
  function WallFrame({ frame }): framePose 로 group 위치·rotY ; 테두리 boxGeometry(FRAME.w, FRAME.h, FRAME.depth) 흰색 ; 안판 planeGeometry(FRAME.inner.w, FRAME.inner.h) z FRAME.depth/2 + 0.005 에 meshBasicMaterial map=posterTexture(frame.text, frame.bg)
  ```

- [ ] **Step 1: `Decor.tsx` 작성** 위 명세대로. 파일 머리 주석: "지점 테마 소품(천장·팬·네온·액자·카운터·스툴). 전부 상자·원통과 캔버스 텍스처로, 외부 모델 없음. 천장은 아래 한 면만 그려 위에서 보기에는 안 보인다."

- [ ] **Step 2: `BranchScene.tsx` 수정.**
  - `const colors = colorsOf(branch.theme)` (branch 계산 직후).
  - `<ambientLight intensity={colors.light.ambient} color={colors.light.color} />`, directionalLight도 `intensity={colors.light.sun} color={colors.light.color}`.
  - 바닥: `branch.theme?.floor` 있으면 `map={checkerTexture(floor.colors, 8, { x: size.w / (floor.cell * 8), y: size.d / (floor.cell * 8) })}` 없으면 `color={colors.floor}`.
  - 벽 `color={colors.wall}`, 책상 `color={colors.desk}`, 의자 기본 `colors.chair`(강조색 두 가지는 그대로).
  - 커피 바: `branch.theme?.counter ? <Counter bar={branch.bar} counter={branch.theme.counter} height={BAR_HEIGHT} /> : (기존 상자)`. "커피 바" 빌보드는 둘 다 유지.
  - `<Decor theme={branch.theme} size={branch.size} />` — 바닥·벽 다음.
  - 바뀐 줄마다 한국어 주석 한 줄("지점 테마(#57). 없으면 기본색").

- [ ] **Step 3: 검사.** Run: `npm run lint && npm run build` Expected: 오류 0.

- [ ] **Step 4: Commit**
```bash
git add src/space/Decor.tsx src/space/BranchScene.tsx
git commit -m "feat: 솔카페를 다이너 테마로 그리기 (체크 바닥·천장 팬·액자·타일 카운터)"
```

- [ ] **Step 5: 브라우저 확인(원준).** `npm run dev`(포트 확인):
  - 별다방: 바닥 베이지, 벽 회색, 책상 갈색, 천장 없음. 전과 같다.
  - 솔카페 2D 위에서 보기: 체크 바닥·빨간 책상·흰 의자·카운터·스툴 3·팬 6이 보이고 천장에 안 가려진다.
  - 1인칭: 청록 벽, 크림 천장, 팬이 돈다, 네온 띠, 액자 5개(북 3·남 2). 스툴에 부딪힌다. 미니맵이 읽힌다.
  - 좌석(북쪽을 보는 자리·남쪽을 보는 자리 하나씩): 고개 들면 액자 3개 / 카운터·스툴·액자 2개. 가까운 의자 주황·내 자리색 유지.
  - PerfReadout FPS 30 이상.

- [ ] **Step 6: 조정 커밋(필요하면).** 확인에서 색·크기를 바꾼 것은 `fix: 다이너 테마 색·크기 조정` 한 커밋.

---

### Task 4: 문서 한 줄과 PR

**Files:**
- Modify: `CLAUDE.md` 폴더 구조 `branches/*.json` 줄에 "테마(theme: 바닥·벽·천장·액자·카운터 색과 배치, 없으면 기본 모습)" 추가.

- [ ] **Step 1: CLAUDE.md 한 줄 수정.** Run: `npm run lint && npm run build` Expected: 오류 0.
- [ ] **Step 2: Commit** `docs: 지점 JSON 테마 항목을 폴더 구조에 적기`
- [ ] **Step 3: 푸시·PR(원준 요청 시).** `gh pr create --base develop --title "feat: 솔카페 다이너 테마 (체크 바닥·천장 팬·액자·타일 카운터)"`. 본문: 관련 #57, DB 변경 없음, 별다방 영향 없음, 김현 파일(BranchScene·layout) 수정 범위, 전체 지도 색은 다음에, 확인 방법.
