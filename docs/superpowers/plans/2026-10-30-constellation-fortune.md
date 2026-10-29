# 월드 별자리와 오늘의 별자리 운세 — 구현 계획 (다시 설계 반영)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 머리 위 12달 원에 황도 12궁을 그리고 내 별자리(생일)를 금색으로, 잠근 조준점 클릭으로 운세 창(맨 위 내 별자리, 목록 줄 펼치기)을 띄운다. 가입·계정 탭에서 생일(월·일)을 받는다. (#321)

**Architecture:** 순수 함수 `starLogic.ts`(원 배치·조준점 고르기·생일 → 별자리)와 `fortuneLogic.ts`(그대로). 그리기 `Constellations.tsx`, 창 `FortunePanel.tsx`, 생일 훅 `useMyBirthday.ts`. DB 는 `profiles`에 생일 두 칸과 가입 트리거 다시 만들기.

**Tech Stack:** React 19, R3F 9, drei 10, three 0.186, Supabase. 순수 로직은 Node `--experimental-strip-types` + 스크래치패드 `register.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-30-constellation-fortune-design.md`

## Global Constraints

- worktree `.claude/worktrees/feat+hyun+constellation`(브랜치 `feat/hyun/constellation`, develop 최신 2374549 위). `node_modules`·`.env.local`은 원래 폴더로 링크(커밋 안 함).
- **작업 중 커밋하지 않는다.** "올려줘"에 태스크별 커밋 → PR(`Closes #321`), PR 설명에 "머지 전에 서비스 DB 에 `0035_birthday.sql` 실행".
- 원: 고도 40°, 방위 (달−1)×30°(북 0·동 90°), 별자리 크기 12°, 반지름 330, 이름표는 가운데에서 8° 아래. 조준점 고르기 3°. 금색 `#ffd27a`, 보통 선 투명도 0.45 × stars. 클릭은 stars > 0.5·마우스 잠김일 때만.
- 생일은 월·일만, 본인만(profiles RLS). 가입 생일은 선택 항목, 틀린 값은 비워 둠.
- 처음 설계에서 만든 실제 위치·이번 달 금색·클릭 판·`chooseSign`·`siderealTime`·`starPosition`·`monthSign`·`placeOnSky`는 지운다(쓰는 곳 없음). `skyLogic`의 `altAz` export 는 되돌린다.
- 주석 한국어, 기준값은 파일 위쪽 상수, 서울 날짜는 UTC+9 필드로.

## Review Focus

1. 마우스를 잠그려는 첫 클릭에는 운세 창이 뜨면 안 된다. — Task 3: 잠기지 않은 상태 클릭 무시, 확인 항목.
2. 생일이 다른 계정에 보이면 안 된다. — Task 4: `avatars` 뷰 그대로, RLS 확인 SQL(다른 계정으로 select 시 0행)을 PR 설명에.
3. 가입 때 생일을 비우거나 이상한 값을 보내도 가입이 실패하면 안 된다. — Task 4: 트리거가 틀린 값은 비워 둠(SQL 확인 쿼리).
4. 생일을 바꾸면 하늘 금색·운세 창 맨 위가 바로 바뀌어야 한다. — Task 5: 훅이 저장 후 상태 갱신, 확인 항목.
5. 2월 29일생도 물고기자리로 나와야 한다. — Task 1 검사.

---

### Task 1: 원 배치와 고르기 (`starLogic.ts`)

**Files:** Modify `src/world/starLogic.ts`, `src/world/constellations.json`(각 별자리에 `month` 추가), `src/world/skyLogic.ts`(`altAz` export 되돌림). Test: 스크래치패드 `tests/star.test.mjs`(새 검사로 바꿈).

**Produces:**
```ts
export type Sign = { id: string; name: string; month: number; from: string; to: string; stars: Star[]; lines: [number, number][] }
export type RingSign = { id: string; name: string; month: number; center: Vec3; stars: Vec3[]; label: Vec3 } // 단위 방향
export function ringLayout(): RingSign[]            // 12개, 1월부터
export function pickRingSign(ray: Vec3, ring: RingSign[]): string | null // 별·선과의 최소 각 ≤ 3°
export function signOfBirthday(month: number, day: number): string
```
- [ ] Step 1: 검사(스펙 15절 Node 항목) 쓰기 → 실패 확인(`ringLayout is not a function`).
- [ ] Step 2: 구현. 모양 펼치기는 처음 설계의 접평면 방식(벡터)을 재사용해 `size/2`로 정규화. 고르기는 각 별 방향과의 각, 각 선분(대원 호)과의 각 중 최소.
- [ ] Step 3: 통과(`star ok`), fortune·sky 검사도 ok, lint·build.
- [ ] 커밋 메시지: `feat: 황도 12궁 별자리 자료와 머리 위 12달 원 배치·조준점 고르기 계산 추가`

### Task 2: 운세 계산 — 처음 설계에서 끝남 (`fortuneLogic.ts`, 바뀜 없음)

- [ ] 검사 `fortune ok` 확인만. 커밋 메시지: `feat: 날짜로 정하는 오늘의 12별자리 순위와 운세 문구 추가`

### Task 3: 그리기와 누르기 (`Constellations.tsx`)

**Props:** `{ stateRef: RefObject<SkyFrame | null>; mySign: string | null; onPick?: (id: string) => void }`. `WorldSky`에 `mySign` prop 추가해 넘김.
- [ ] Step 1: 원 자리에 점·선·이름표("물고기자리"(달은 안 적음: 별자리 날짜가 달과 딱 맞지 않음)), 내 별자리 금색 반짝임, 레이어 2·음수 순서, 위치 고정이라 경계 구는 처음 한 번(`computeBoundingSphere`).
- [ ] Step 2: window `click` — 마우스 잠김 + stars > 0.5 일 때만, 카메라 방향으로 `pickRingSign`. 고르면 장면(레이어 0) 광선의 첫 보이는 물체(1m 너머)가 400m 안에 있으면 무시. 잠기지 않은 클릭은 아무 것도 안 함. 클릭 판·R3F onClick·커서 바꾸기는 지움.
- [ ] Step 3: 검사·lint·build. 커밋 메시지: `feat: 광장 밤하늘 머리 위에 12달 별자리 그리기, 조준점으로 고르기`

### Task 4: 생일 DB (`0035_birthday.sql`)

- [ ] `alter table public.profiles add column birth_month smallint, add column birth_day smallint` + check(둘 다 null 이거나 둘 다 있음, 1~12, 1~31, 달별 최대 일수: 2월 29, 4·6·9·11월 30).
- [ ] `create or replace function public.handle_new_user()`: 닉네임은 그대로, `raw_user_meta_data ->> 'birth_month'/'birth_day'`가 숫자이고 올바르면 넣고 아니면 null. `security definer`, `set search_path = ''`(0001 과 같게).
- [ ] 파일 끝 주석에 확인 쿼리: 다른 계정으로 `select birth_month from profiles where id <> auth.uid()` → 0행.
- [ ] 커밋 메시지: `feat: 프로필에 생일(월·일) 칸과 가입 때 생일 받기 DB`

### Task 5: 생일 입력과 운세 창

**Files:** Create `src/profile/useMyBirthday.ts`; Modify `src/auth/SignupPage.tsx`, `src/profile/AccountTab.tsx`, `src/world/FortunePanel.tsx`, `src/world/WorldScene.tsx`.
- `useMyBirthday(myId) → { birthday: { month: number; day: number } | null; loading: boolean; save: (b | null) => Promise<string | null> }` (오류 문구 또는 null). 저장 후 같은 훅을 쓰는 화면이 바로 따라오게 작은 구독(이벤트)으로 알림.
- [ ] 가입 화면: "생일(선택)" 월·일 고르기 → `options.data.birth_month/day`.
- [ ] 계정 탭: 생일 보기·바꾸기·지우기.
- [ ] 운세 창: 맨 위 내 별자리 카드(없으면 안내 + 월·일 고르기 + 저장), 목록 줄 펼치기/접기(누른 별자리 줄 처음부터 펼침), 내 별자리·누른 별자리 강조.
- [ ] WorldScene: `useMyBirthday`로 `mySign = signOfBirthday(...)`를 `WorldSky`에, 창에 `mySign`·`picked` 전달.
- [ ] 검사·lint·build. 커밋 메시지: `feat: 가입·계정 탭에서 생일을 받고 운세 창 맨 위에 내 별자리 운세`

### Task 6: 마무리

- [ ] 세 검사 + lint·build, 임시 파일 정리, 새 리뷰어 검토 → Critical·Important 고침 → 멈춤. 화면 확인(스펙 15절)은 사용자(로그인 필요, 이 worktree 에서 `npm run dev -- --port 5175`). DB SQL 은 머지 전에 김현이 서비스 DB 에 실행.
