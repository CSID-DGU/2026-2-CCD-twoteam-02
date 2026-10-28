# 오판·버그 신고 버튼과 팀용 신고 목록 — 설계 (2026-10-28)

관련 Issue: #121 (오판·버그 신고하기 버튼). 참고 Issue: #119 #120 (판정 오류), #114 #115 (화면 버그).
대상 브랜치: `develop` (서비스). 마이그레이션: `supabase/migrations/0030_reports.sql`, 서비스 Supabase에 실행.

## 1. 왜 만드는가

테스트 배포 때 사용자에게서 오판·버그·의견을 받는 창구다. 지인은 카톡으로 받을 수 있지만, 지인의 지인처럼 연락처가 없는 사용자는 앱 안에서 알려 줄 방법이 없다. 지금은 판정이 틀려도(예: 숙여서 공부했는데 노란불) 사용자가 알릴 수 없고, 그때 판정이 어떤 수치를 보고 있었는지도 남지 않는다.

- 사용자: 버튼 하나로 종류를 고르고 한 줄 적어 보낸다. 그 순간의 판정 수치가 자동으로 붙는다.
- 팀: 앱 안의 신고 목록에서 종류별·확인 여부별로 걸러 보고, 수치를 펼쳐 원인을 찾는다.

## 2. 목표 · 하지 않는 것 · 실패로 치는 것

목표
- 2D 이동 중에도, 3D 좌석에서 공부 중에도 "신고하기"가 보인다.
- 공부 중 신고에는 최근 30초의 판정 수치가 함께 저장된다.
- 팀 세 명만 `/reports`에서 모든 신고를 본다. 일반 사용자는 자기 신고만 쓰고 볼 수 있다.
- 팀이 "확인함"을 표시하고, 종류·확인 여부로 걸러 볼 수 있다.

하지 않는 것
- 신고에 대한 답장·알림. 팀이 보고 고치는 것으로 끝난다.
- 신고 수정·삭제 화면. 잘못 보냈으면 다시 보낸다.
- GitHub Issue 자동 생성. 팀이 목록을 보고 필요한 것만 손으로 옮긴다.
- 실험(`experiment`) 반영. 실험은 진행자가 옆에 있으니 필요 없다.

실패로 치는 것
- 웹캠 영상·사진·화면 캡처가 어떤 형태로든 저장되는 것. 수치만 저장한다(팀 절대 규칙).
- 일반 사용자가 남의 신고를 읽거나, 자기를 팀으로 만들 수 있는 것.
- 신고 창이 떠 있는 동안 캐릭터가 움직이거나 카메라가 도는 것(다른 창과 같은 규칙).

## 3. 사용자 쪽: 신고 보내기

### 버튼 위치

오른쪽 위 메뉴(`SceneMenu`)의 아래 상자에 "신고하기" 줄을 둔다. 메뉴는 로비·지점의 2D·3D 모두에서 항상 보이므로 따로 버튼을 띄우지 않는다. 단축키는 두지 않는다.

- 신고 창은 기존 메뉴 창 체계(`InfoPanel`의 `PanelView`)에 `{ kind: 'report' }`로 넣는다. 메뉴 줄은 `onOpen({ kind: 'report' })`를 부른다. 이렇게 하면 `BranchScene`·`LobbyScene`이 이미 하는 `panelOpen` 멈춤(카메라·이동·감정표현·단축키)이 그대로 적용돼 두 파일을 고치지 않는다. 단축키 목록(`PANEL_KEYS`)에는 넣지 않으므로 키 배정도 없다. (내 판단 — 검토에서 별도 창으로 가면 두 파일의 멈춤 지점 9곳을 고쳐야 한다고 확인됨)
- 지점·로비 모두에서 보인다. 공부 중 일시정지(`studyPaused`) 상태에서도 보인다(오판은 그때 신고하고 싶을 수 있다).
- 회의 화면(`/meeting/:id`)은 `SceneMenu`를 그리지 않아 이번 범위에 없다. 회의 화면 버그는 지점으로 돌아와 신고한다. (사용자 결정 2026-10-28: 회의 화면은 안 넣는다)

### 신고 창

`InfoPanel` 안에 그려지는 창. 기존 창들과 같은 모양(어두운 배경, Esc·배경 클릭으로 닫기). 창이 열린 동안은 다른 메뉴 창처럼 카메라·이동·감정표현이 멈춘다.

내용
1. 종류(필수, 라디오): **판정 오류** / **화면·기능 버그** / **기타·의견**
   - 판정 오류를 고르면 보조 선택 하나: "공부 중인데 노랑·빨강" / "안 하는데 초록" / "모르겠음"
2. 설명(선택, 최대 500자)
3. "같이 보내는 정보" 접힌 상자. 펼치면 아래 값이 글자로 보인다. 사용자가 보고 보낼지 정할 수 있어야 하므로 숨기지 않는다.
   - 시각, 화면 주소(`location.pathname`), 지점 slug(`?branch=`), 좌석 이용 기록 id(공부 중일 때), 브라우저(`navigator.userAgent`)
   - 공부 중이면: 판정 상태(`focus/away/drowsy/offscreen/outframe/phone`), 보류 이유, 다른 탭·앱 사용함, 휴대폰·기기 사용함
   - 공부 중이면: 최근 30초 수치 표(아래 4절)
   - 공부 중이 아니면 "판정 수치 없음(공부 중이 아님)"
4. 버튼: 보내기. 보내는 동안 비활성. 닫기는 창의 ✕·Esc(다른 메뉴 창과 같음).
5. 보낸 뒤 창 내용이 "접수됐어요. 고맙습니다."로 바뀐다. 실패하면 한국어 오류 문구와 다시 시도.

영상·캡처는 어디에도 없다. 설명 칸에 사용자가 뭘 적든 글자일 뿐이다.

## 4. 최근 30초 수치 — 어디서 들고 있다가 꺼내는가

판정 상태는 `StudyRunner`가 `useFocusState`로 계산하고, 얼굴·몸·휴대폰 수치는 `SeatedStudy`가 `useTracking`의 ref로 들고 있다. `BranchScene`은 둘 다 모른다. 신고 창은 `BranchScene`에 있다.

prop을 세 단계로 끌어올리지 않고, 모듈 하나가 "최근 수치"를 들고 있게 한다.

- `src/report/recentSamples.ts` (순수 로직, React 무관): 고정 길이 30칸 고리 버퍼. `pushSample(sample)`, `recentSamples(): Sample[]`, `clearSamples()`. 시간순으로 돌려준다.
- `Sample` 한 줄 = 1초마다 하나:
  `{ at, status, hold, face, pitch, ear, body, framed, phone, awaySeconds, closedSeconds, phoneSeconds }`
  - `face`: 얼굴 찾음(boolean), `pitch`: **라디안(ref 원값)을 도로 바꿔** 반올림 1자리, `ear`: 소수 2자리, `body`: 몸 찾음(boolean|null), `framed`: 가이드라인 안(boolean|null), `phone`: 휴대폰 보임(boolean|null)
  - `StudyRunner`가 받는 얼굴 ref의 타입(`FocusInput`)에는 좌우 각도·눈 깜빡임 점수가 없어 넣지 않는다. 판정이 보는 값만 남긴다.
  - 수치는 ref의 현재값이다. 소수 자릿수를 줄이는 이유는 저장 크기(30줄 × 12칸)를 작게 두기 위해서다.
- 모듈은 샘플과 함께 **공부 맥락** `{ allowOtherScreen, allowDevices, sessionId }`도 들고 있는다(`setStudyContext`, `currentStudyContext`). 신고 창(`InfoPanel`)은 이 값에 닿을 길이 없기 때문이다. 좌석 번호 대신 `seat_sessions.id`를 남긴다. `StudyRunner`가 이미 갖고 있고, 팀은 그 id로 지점·좌석을 찾을 수 있다.
- `StudyRunner`에 작은 훅 `useSampleRecorder(face, pose, phone, focus, allowed, paused)`를 한 줄 붙인다. `workerInterval` 1초마다 ref와 최신 `focus`를 읽어 `pushSample`. 일시정지 중에는 밀지 않는다. 이 훅은 `src/report/useSampleRecorder.ts`에 둔다. `/tracking`의 `FocusLogRecorder`와 같은 표본 방식이지만 그 파일은 건드리지 않는다(무한 배열·localStorage라 용도가 다름).
- **비우기는 시각으로 한다.** `recentSamples(nowMs)`는 `at`이 지금부터 30초 안인 줄만 돌려준다. 그래서 언마운트 때 `clearSamples()`를 부르지 않는다. `StudyRunner`는 과목·허용 설정을 바꿀 때마다 다시 마운트되는데(`key`), 그때 버퍼를 지우면 신고 직전 수치가 사라진다. 자리를 떠나 30초가 지나면 저절로 빈다. `clearSamples()`는 시험용으로만 둔다. (내 판단)
- 신고 창은 보낼 때 `recentSamples(Date.now())`를 읽는다. 비어 있으면 "판정 수치 없음".

다른 팀원 파일 수정 범위(허락 필요): `src/menu/panelTypes.ts`에 kind 둘(`report`, `reports`), `src/menu/InfoPanel.tsx`에 제목 둘·그리기 분기 둘, `src/menu/SceneMenu.tsx`에 아래 상자 줄 둘(신고하기는 항상, 신고 목록은 `useIsTeam()`이 참일 때). `src/study/StudyRunner.tsx`(최원준 담당)에 훅 호출 한 줄. `BranchScene`·`LobbyScene`·`App.tsx`는 고치지 않는다.

## 5. 저장: `reports` 테이블과 권한

### 팀 구분 — `team_members` 테이블

`profiles`에 `is_team` 칸을 두면 안 된다. 0004의 "본인 프로필만 수정한다" 정책이 칸을 가리지 않아 사용자가 API로 자기를 팀으로 바꿀 수 있다. 대신 표를 따로 둔다.

- `public.team_members (user_id uuid primary key references auth.users on delete cascade, added_at timestamptz default now())`
- RLS 켬. `authenticated`에 `select`만, 정책 "내 행만 본다"(`user_id = auth.uid()`). insert/update/delete는 아무 역할에도 주지 않는다. 행은 SQL Editor에서만 넣는다.
- `public.is_team() returns boolean` — `security definer`, `set search_path = ''`, `exists(select 1 from public.team_members where user_id = (select auth.uid()))`. `authenticated`에만 execute.
- 팀 세 명의 `auth.users.id`를 넣는 insert 문은 마이그레이션에 **주석으로 예시만** 두고 실행은 각자 한다(id는 커밋하지 않는다).

### `reports` 테이블

```
id          uuid primary key default gen_random_uuid()
user_id     uuid not null references auth.users on delete cascade
created_at  timestamptz not null default now()
kind        text not null check (kind in ('judgment','bug','other'))
detail      text check (detail in ('false_alarm','missed','unsure'))   -- 판정 오류일 때만
message     text not null default '' check (char_length(message) <= 500)
context     jsonb not null default '{}' check (pg_column_size(context) <= 4096)
samples     jsonb not null default '[]' check (jsonb_typeof(samples) = 'array' and pg_column_size(samples) <= 16384)
checked_at  timestamptz            -- 팀이 확인함
checked_by  uuid references auth.users
```

- `context` 키: `page, branch, sessionId, userAgent, status, hold, allowOtherScreen, allowDevices`. 공부 중이 아니면 `sessionId`·`status`·`hold`·allow 둘은 null.
- 0015의 원칙대로 크기 제한을 DB에 둔다. 화면 `maxLength`는 방어선이 아니다.
- 한 사람이 쏟아붓는 것을 막는 제한(분당 n건)은 두지 않는다. 0015와 같은 이유로 캡스톤 범위에서는 비용이 더 크다. 필요해지면 그때 트리거를 붙인다.

권한
- RLS 켬. `anon`은 아무것도 못 한다.
- `authenticated`: `insert` (정책: `user_id = auth.uid()`), `select` (정책: `user_id = auth.uid() or public.is_team()`), `update (checked_at, checked_by)` 칸 단위 grant + 정책 `public.is_team()`.
- Supabase는 public 테이블에 `authenticated`에게 기본으로 모든 권한을 주므로, 칸 단위 grant 앞에 `revoke all on public.reports from anon, authenticated`를 먼저 한다(0029의 138~143행과 같은 순서). 그 뒤 `grant select, insert on public.reports to authenticated`, `grant update (checked_at, checked_by) on public.reports to authenticated`.
- 일반 사용자는 자기 신고도 고치거나 지우지 못한다(delete 없음).
- `comment on table`, `notify pgrst, 'reload schema'`까지 0029 양식을 따른다. 파일 위에는 실행 위치(서비스 프로젝트, develop만)와 다시 실행하는 방법(drop if exists)을 적는다.

마이그레이션은 코드보다 먼저 실행한다(CLAUDE.md "배포"). 원준이 대시보드 권한이 생겼으므로 직접 실행하고, PR 설명에 "적용할 DB: 서비스, 0030_reports.sql"을 적는다.

## 6. 팀 쪽: 신고 목록 창

- 메뉴 창 `{ kind: 'reports' }`로 `InfoPanel` 안에 띄운다. 페이지(`/reports`)로 만들지 않는 이유: 주소를 옮기면 자리·타이머·실시간 연결이 끊긴다(`InfoPanel.tsx` 주석). 창이면 공부 중에도 열어 볼 수 있다. (내 판단)
- 들어가는 길: `SceneMenu` 아래 상자에 "신고 목록" 줄. 내 행이 `team_members`에 있을 때만 보인다. 훅 `useIsTeam()`은 `useMyNickname`과 같은 모양(한 칸 select, alive 플래그)으로 `src/report/useIsTeam.ts`에 둔다. 창 안에서도 같은 훅으로 확인해 팀이 아니면 "팀만 볼 수 있습니다" 한 줄만 보인다. 실제 차단은 RLS가 한다(팀이 아닌 사람은 자기 신고만 돌려받는다).
- 목록(내 기록 창과 같은 톤의 단순한 목록):
  - 위: 걸러 보기 — 종류(전체/판정 오류/버그/기타), 확인(전체/미확인/확인함). 기본값 전체 · 미확인.
  - 줄마다: 시각, 닉네임(`avatars` 뷰 `(id, nickname, avatar)`에서 이름 붙임 — 다른 화면도 이 뷰를 쓴다, 못 찾으면 id 앞 8자), 종류(+판정 오류 보조 선택), 설명 첫 줄, 지점, 상태, 확인 여부.
  - 줄을 누르면 펼쳐짐: 설명 전체, context 값 표, samples 30줄 표(시각은 신고 시각 기준 -29초…0초). 샘플이 없으면 "수치 없음".
  - "확인함" 버튼: `update reports set checked_at = now(), checked_by = auth.uid()`. 누르면 줄이 접히고 미확인 필터에서 빠진다. 되돌리기 버튼도 둔다(`null`로).
- 최근 200건까지 불러온다. 더 필요하면 그때 페이지 넘김을 붙인다(내 기록의 `range()` 방식).

## 7. 폴더와 파일

```
src/report/
  recentSamples.ts     순수: 고리 버퍼 (Sample 타입, pushSample, recentSamples(nowMs), setAllowed, currentAllowed, clearSamples)
  useSampleRecorder.ts StudyRunner에서 1초마다 ref·focus를 읽어 pushSample
  reportLogic.ts       순수: 신고 종류·라벨, context 만들기(buildContext), 필터 함수(applyFilter), 라디안→도
  useIsTeam.ts         team_members에 내 행이 있는지
  ReportPanel.tsx      신고 창 (InfoPanel kind 'report', 보내기 insert 포함)
  ReportsPanel.tsx     신고 목록 창 (InfoPanel kind 'reports', select·확인함 update)
supabase/migrations/0030_reports.sql
docs/superpowers/specs/2026-10-28-report-button-design.md  (이 문서)
```

`focusLogic.ts`처럼 판정·계산은 순수 함수로 두고, 화면은 그것을 부르기만 한다. 주석은 한국어.

## 8. 확인 방법 (완료 기준)

1. 로컬 `npm run dev`(서비스 DB)에서 로비와 지점 각각 2D로 걷는 중 메뉴 "신고하기" → 버그 → 보내기 → "접수됐어요". DB에 행이 생기고 `samples`가 `[]`. 창이 떠 있는 동안 캐릭터가 안 움직인다.
2. 자리에 앉아 공부 시작 후 30초 넘게 지나 신고 → `samples`에 30줄, `context.status`가 그때 상태. 영상·이미지 칸은 어디에도 없다.
3. 팀이 아닌 계정에는 메뉴에 "신고 목록"이 없고, API로 reports를 select해도 자기 것만 온다.
4. 팀 계정으로 메뉴 "신고 목록" → 미확인만 보임 → 펼쳐서 30줄 표 확인 → 확인함 → 목록에서 빠짐 → 필터 "확인함"에서 보임.
5. 일반 계정으로 API를 직접 불러 `team_members` insert, `reports` update·delete, 남의 `reports` select가 모두 거부된다(SQL Editor 또는 브라우저 콘솔에서 supabase-js로 시험).
6. `npm run lint`, `npm run build` 통과.

## 9. 빌더에게 맡기는 것

- 창·목록의 세부 배치와 글자. 기존 메뉴 창(`InfoPanel` 안의 내 기록·친구)의 스타일을 따른다.
- 과목·허용 설정을 바꾸면 `StudyRunner`가 다시 마운트돼 샘플이 1초 정도 빌 수 있다. 그대로 둔다.
- samples 표의 열 순서와 소수 자릿수 표시.
- 목록 불러오기 실패·빈 목록의 문구.
