-- 0052: 쉬는 날(OFF) — 내 기록 월 달력에서 날짜 칸을 눌러 켜고 끔 (docs/superpowers/specs/2026-11-02-records-calendar-design.md)
--
-- 왜: 다른 공부 앱처럼 쉬기로 한 날을 달력에 "OFF"로 표시해 두고, 다른 기기에서도 보이게 계정에 저장한다.
--     표시만 한다. 공부 시간 합계·달력 색·도넛 계산에는 쓰지 않는다. 다음 달까지 미리 찍을 수 있다.
-- 권한(CLAUDE.md 절대 규칙: RLS): 본인 것만 보고·찍고·지운다. 다른 사람에게 보여 주지 않는다(프로필 공개 범위와 무관).
--     게스트(익명 로그인, 0045)도 쓸 수 있다(플래너 planner_pages 와 같은 취급). 계정이 지워지면 같이 지워진다(cascade).
-- 적용: develop 으로 가는 PR 이라 머지 전에 서비스 DB(SQL Editor)에 실행한다. experiment DB 에는 실행하지 않는다.
--     실행 전에 화면이 먼저 배포되면 쉬는 날을 읽지 못해 OFF 없이 달력만 보이고, 찍기만 실패한다.

begin;

create table public.rest_days (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day     date not null,
  primary key (user_id, day)
);

alter table public.rest_days enable row level security;

create policy "내 쉬는 날을 본다" on public.rest_days for select to authenticated using (user_id = (select auth.uid()));
create policy "내 쉬는 날을 찍는다" on public.rest_days for insert to authenticated with check (user_id = (select auth.uid()));
create policy "내 쉬는 날을 지운다" on public.rest_days for delete to authenticated using (user_id = (select auth.uid()));

commit;
