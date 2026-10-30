# 광장 순위 게시판 (공부 시간 순위) — 설계 (2026-10-30)

관련 Issue: #59 랭킹 (담당을 김현으로 옮김). 앞 단계: #315 광장 월드, #43 프로필 공개 범위(`0013_profile_visibility.sql`).
대상 브랜치: `develop` (`feat/hyun/study-ranking-board`). **DB 변경 있음**(`0037_study_ranking.sql`). 새 라이브러리·외부 서비스 없음.

## 1. 왜

광장에 게시판을 세워 오늘·이번 주 공부 시간 순위를 보여 준다. "함께 공부하는 긴장감"을 광장에서도 느끼게 하려는 것이다.

## 2. 목표 · 하지 않는 것 · 실패로 치는 것

목표 (사용자 결정, 2026-10-30)
- **기간**: 오늘 · 이번 주 두 탭. 오늘은 서울 0시부터, 이번 주는 서울 월요일 0시부터(프로필 요약과 같은 기준).
- **공부 시간**: `study_logs.focused_seconds`(초록불) 합계를 분으로(버림). 기록은 공부 중 5분마다 저장되므로 공부 중인 사람도 5분 안쪽으로 반영된다.
- **공개 범위**: 공개 범위가 "모두"(`public`)인 사람만 순위에 나온다. 순위는 누구에게나 같다.
- **내 줄**: 늘 나에게 보인다. "내 기록 · 1시간 15분 · 4위"(내가 공개 순위에 들어갔다면의 등수). 내가 "친구만"·"나만"이면 "공개 범위가 '나만'이라 다른 사람 순위에는 안 나와요". 0분이면 "아직 없어요 · 공부를 시작하면 순위에 올라요".
- **순위 규칙**: 1분 이상만. 같은 분이면 같은 등수(1, 2, 2, 4), 같은 등수 안에서는 닉네임 순. 창에는 20위까지.
- **이름**: 닉네임만, 같은 목록 안에 같은 닉네임이 있을 때만 `닉네임#태그`(태그는 friendsLogic 의 `tagOf`).
- **게시판**: 광장 분수 남서쪽(시작 위치 옆)에 나무 게시판. 판 앞면에 "오늘의 공부왕"과 1~3위(캔버스 글씨). 가까이 가면 "순위 게시판 · E 보기", E 로 순위 창.
- **순위 창**: 오늘·이번 주 탭, 1~20위, 맨 아래 내 기록. 이름을 누르면 프로필 창(캐릭터를 눌렀을 때와 같음). 창이 떠 있는 동안 캐릭터·시점·단축키를 막고 Esc·닫기·바깥 누르기로 닫는다(운세 창 #321 과 같은 방식).
- **새로 읽기**: 창은 열 때와 탭을 바꿀 때, 판의 1~3위는 광장에 들어올 때와 5분마다.

하지 않는 것
- 실시간 구독, 순위 표 테이블·트리거, 누적·이번 달 탭, "친구만"인 사람을 친구에게만 보여 주기, 순위 참여 설정 따로 두기.
- experiment 브랜치·실험 DB.

실패로 치는 것
- 공개 범위가 "모두"가 아닌 사람의 닉네임·시간이 남에게 보이는 것, 기록 원본(시각·과목)이 나가는 것.
- 화면에 같은 시간으로 보이는 두 사람의 등수가 다른 것.
- 게시판이 길·벤치·건물 입구를 막거나 지나다닐 때 부딪히지 않는 것(통과).
- 광장 30FPS 아래.

## 3. DB 함수 (`supabase/migrations/0037_study_ranking.sql`)

`public.study_ranking(p_period text) returns jsonb` — `security definer`, `stable`, `set search_path = ''`, `authenticated` 에만 실행 권한(`profile_summary` 와 같은 틀).

- 로그인하지 않았으면 오류(`28000`). `p_period` 가 `'today'`·`'week'` 가 아니면 오류(`22023`).
- 기간 시작: 서울 오늘 0시, 또는 서울 이번 주 월요일 0시. `started_at >= 시작`인 `study_logs`.
- 사람별 분 = 조각마다 `least(focused_seconds, ended_at − started_at)`(조각의 실제 길이를 넘지 못함)를 더해 60으로 나눈 정수 몫(bigint). `study_logs` 는 본인이 직접 넣는 표라, 터무니없는 값 하나로 1위가 되거나 합계가 int 범위를 넘어 모두의 순위가 오류 나는 것을 막는다(검토에서 찾음). 겹치는 조각을 여러 개 넣어 부풀리는 것까지는 막지 못한다.
- 공개 순위 = `profiles.visibility = 'public'` 이고 분 ≥ 1 인 사람, `rank() over (order by minutes desc)`, 정렬은 분 내림차순 → 닉네임 → id.
- 돌려주는 값
  ```json
  { "period": "today",
    "top": [ { "rank": 1, "id": "uuid", "nickname": "민수", "minutes": 192 } ],
    "me":  { "minutes": 75, "rank": 4, "visibility": "private" } }
  ```
  - `top` 은 최대 20줄(20위 동점이어도 20줄에서 자름).
  - `me.rank` = (분이 나보다 많은 공개 사람 수) + 1. 내 분이 0이면 null.
- 적용: develop PR 이라 **머지 전에 서비스 DB 에 `0037_study_ranking.sql` 실행**. experiment DB 에는 실행하지 않는다.

## 4. 순수 로직 (`src/ranking/rankingLogic.ts`)

- 타입 `RankRow`, `MyRank`, `Ranking`, `Period = 'today' | 'week'`, 상수 `TOP_N = 20`, `BOARD_TOP = 3`, `REFRESH_MS = 5분`, `PERIOD_LABEL`.
- `parseRanking(json): Ranking | null` — 모양이 틀리면 null, 줄 하나가 틀리면 그 줄만 뺌.
- `labelNames(rows): string[]` — 같은 닉네임이 둘 이상이면 그 사람들만 `닉네임#태그`.
- `minutesText(m)` — "3시간 12분", "45분"(`recordsLogic.formatHM` 을 씀).
- `myLine(me): { text: string; note: string }` — 2절 "내 줄" 문구.
- `boardLines(ranking | null): string[]` — 판에 그릴 1~3줄("1위 민수 3시간 12분"), 없으면 ["아직 오늘 기록이 없어요"].

## 5. 데이터 읽기 (`src/ranking/useRanking.ts`)

`useRanking(period, { refreshMs? })` → `{ ranking, error, loading }`. `supabase.rpc('study_ranking', { p_period })` 를 부르고, `refreshMs` 가 있으면 그 간격으로 다시 부른다. 함수가 없으면(`PGRST202`) "순위 DB가 아직 준비되지 않았어요 (0037 마이그레이션 실행 필요)".

## 6. 광장 게시판 (`src/world/RankingBoard.tsx`, world.json, worldLogic)

- `world.json` 에 `"board": { "x": -5, "z": -1.5, "facing": "south" }`(분수 서쪽 앞, 판이 남쪽을 봄. 시작 위치 (0, 5)에서 북쪽을 보면 왼쪽 앞 약 38° 라 시야(좌우 약 48°) 안에 든다). `PlazaLayout.board?` 타입 추가.
- `worldLogic`: `boardSpot(plaza)` = 판 앞 `DOOR_GAP`(1.1m) 자리(`no = BOARD_NO`, 판을 보는 방향), `plazaObstacles` 에 판 상자(폭 2.4m × 두께 0.3m, 방향대로 돌림) 추가.
- 모양: 나무 기둥 2개 + 판(폭 2.4m, 높이 1.5m, 아래 끝 0.6m) + 위 지붕 띠. 앞면에 캔버스 글씨 판(빛을 받지 않는 재질이라 밤에도 읽힘). 캔버스는 값이 바뀔 때만 다시 그린다.
- 상호작용: Player 의 "앉는 자리"(spots)에 게시판 자리를 더하고, `canSit` 이 게시판에는 false 를 돌려 E 를 누르면 `onSitBlocked(BOARD_NO)` → 순위 창을 연다(캐릭터가 앉거나 숨지 않음). 가까이 가면 안내 "순위 게시판 · E 보기".

## 7. 순위 창 (`src/ranking/RankingPanel.tsx`)

- 제목 "🏆 공부 시간 순위", 탭 오늘·이번 주(처음은 오늘).
- 목록: 등수 · 이름 · 시간. 1~3위는 메달(🥇🥈🥉), 내 줄은 강조. 이름을 누르면 `onOpenProfile(userId)` → 광장이 순위 창을 닫고 프로필 창을 연다.
- 맨 아래 내 기록(4절 `myLine`).
- 불러오는 중·오류·빈 목록("아직 이 기간에 공부한 사람이 없어요") 표시.
- WorldScene: 순위 창이 떠 있으면 `frozen`·`paused`·감정표현·메뉴 단축키·V 를 막는다(운세 창과 같이).

## 8. 파일

| 파일 | 하는 일 |
|---|---|
| `supabase/migrations/0037_study_ranking.sql` (새로) | 3절 |
| `src/ranking/rankingLogic.ts` (새로) | 4절 |
| `src/ranking/useRanking.ts` (새로) | 5절 |
| `src/ranking/RankingPanel.tsx` (새로) | 7절 |
| `src/world/RankingBoard.tsx` (새로) | 6절 그리기 |
| `src/world/world.json`, `src/world/worldLogic.ts` | 게시판 자리·부딪힘 |
| `src/world/WorldScene.tsx` | 게시판·창 연결 |
| `CLAUDE.md` | 폴더 구조에 `ranking/` |

## 9. 확인 방법

Node (스크래치패드 검사 스크립트)
- `parseRanking`: 정상 → 값 일치, 모양 틀림 → null, 틀린 줄만 뺌
- `labelNames`: 다른 닉네임 → 닉네임만, 같은 닉네임 둘 → 둘 다 `#태그`, 셋 중 둘만 같음 → 그 둘만
- `minutesText`: 0 → "0분", 45 → "45분", 60 → "1시간", 192 → "3시간 12분"
- `myLine`: public 4위, private 4위(안내), friends, 0분, rank null
- `boardLines`: null·빈 목록 → 안내 한 줄, 5줄 → 3줄
- `boardSpot`·`plazaObstacles`: 판 앞 1.1m, 판 상자가 방향대로 돌아감, 게시판이 없으면 그대로
- lint·build

DB (사용자, SQL Editor): 실행 뒤 `select proname from pg_proc where proname = 'study_ranking';` 1줄.

화면 (사용자, `npm run dev`, 로그인 후 광장): 시작하자마자 왼쪽 앞에 게시판, 판에 오늘 1~3위 / 가까이 가서 E → 창, 탭 바꾸기, 내 기록 줄 / 이름 누르면 프로필 창 / 프로필에서 공개 범위 "나만"으로 바꾼 뒤 다시 열면 순위에서 빠지고 안내 / 게시판에 부딪힘 / 미니맵·위에서 보기 / FPS.

## 10. 정한 것 (2026-10-30, 사용자)

김현이 #59 전체 / 오늘·이번 주 / "모두"만 순위, 내 줄은 늘 보임 / 같은 닉네임일 때만 태그 / 판에 1~3위 + E 로 창 / 20위 + 내 줄 / 분수 앞 시작 위치 옆 / 창은 열 때, 판은 5분마다 / 1분 이상, 분 단위 같은 등수 / DB 함수가 순위까지 매김. 나머지(4~7절)는 사용자가 "추천대로 진행"으로 맡김.
