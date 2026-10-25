-- 두뜀 0020: 공부 상태 구간 (#235 하루 띠, #236 중지, #121 오판 신고)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
--
-- 배경:
--   study_logs 는 5분 조각마다 "타이머가 오른 초"만 남긴다. 자리 이탈·졸음 등이
--   언제 몇 분이었는지는 남지 않아 "내 기록"에서 하루를 돌아볼 수 없다.
--   상태가 바뀔 때마다 구간을 남겨, 하루를 초록·빨강 띠로 그리고 빨강의 사유를 보여 준다.
--
-- 한 줄 = 띠의 한 칸
--   kind = 'focus'                     : 초록. 타이머에 들어간 시간 (study_logs.focused_seconds 합과 같다)
--   kind = 'away' | 'drowsy' | 'offscreen' | 'phone' | 'outframe'
--                                      : 빨강. 타이머에 안 들어간 시간과 그 사유 (focusLogic.ts 의 FocusStatus)
--   kind = 'paused'                    : 빨강. 사용자가 누른 중지 (#236)
--   공부를 켜지 않은 시간은 줄이 없다(띠의 빈칸).
--   노란불(보류)은 줄을 만들지 않는다. 결과가 정해진 뒤 초록 또는 빨강으로 남긴다.
--   색 칸은 따로 두지 않는다. kind 로 정해지므로 두 칸이 어긋날 일을 만들지 않는다.
--
-- 권한 (CLAUDE.md 절대 규칙: 본인 데이터만 조회·수정):
--   - 조회: 본인 것만. 다른 사람에게 공개하지 않는다(#235 결정).
--   - 추가: 본인 이름으로, 본인의 좌석 이용(seat_sessions)에만
--   - 수정·삭제: 정책 없음. study_logs 와 같이 남기면 끝이다.
--
-- 중간에 실패하면 아무것도 남지 않도록 전체를 한 덩어리로 실행한다.

begin;

create table public.study_segments (
  id          bigint generated always as identity primary key, -- 오판 신고(#121)에 붙이는 구간 번호
  user_id     uuid   not null references public.profiles (id) on delete cascade,
  session_id  uuid   not null references public.seat_sessions (id) on delete cascade,
  subject_id  bigint not null references public.subjects (id),
  kind        text   not null
              check (kind in ('focus', 'away', 'drowsy', 'offscreen', 'phone', 'outframe', 'paused')),
  started_at  timestamptz not null,
  ended_at    timestamptz not null,
  check (ended_at > started_at),
  check (ended_at - started_at <= interval '24 hours') -- 잘못된 시각으로 거대한 구간이 들어오지 않게
);

-- "내 기록"은 내 구간 중 고른 날짜 범위를 시각 순서로 읽는다.
create index study_segments_user_idx on public.study_segments (user_id, started_at);

-- ---------------------------------------------------------------
-- 권한
-- ---------------------------------------------------------------
alter table public.study_segments enable row level security;

-- 로그인하지 않은 사용자는 아무것도 못 한다.
revoke all on public.study_segments from public, anon;
-- 로그인 사용자는 조회·추가만. 수정·삭제 권한은 주지 않는다.
revoke all on public.study_segments from authenticated;
grant select, insert on public.study_segments to authenticated;

create policy "본인 상태 구간만 조회한다"
  on public.study_segments for select to authenticated
  using ((select auth.uid()) = user_id);

-- 남의 좌석 이용 번호를 붙여 남기지 못하게 한다. (seat_sessions 의 조회 정책이 본인 것만 보여 주므로 exists 가 곧 소유 확인이다)
create policy "본인 좌석 이용에 본인 상태 구간만 남긴다"
  on public.study_segments for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.seat_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

comment on table public.study_segments is
  '공부 상태 구간. 내 기록의 하루 띠(초록 focus / 빨강 그 외). 본인만 조회, 수정·삭제 없음 (#235)';
comment on column public.study_segments.kind is
  'focus: 타이머에 들어간 시간. away·drowsy·offscreen·phone·outframe: 판정으로 멈춘 시간. paused: 사용자가 누른 중지(#236)';

commit;

-- 화면 쪽 API(PostgREST)가 새 테이블을 바로 알도록 스키마 정보를 다시 읽게 한다.
notify pgrst, 'reload schema';
