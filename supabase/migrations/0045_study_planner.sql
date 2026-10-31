-- 두뜀 0045: 가방 — 스터디 플래너(하루 한 장)와 뜯어 쓰는 메모
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
--
-- 배경:
--   가방(B)에서 스터디 플래너를 꺼내 쓰고, 메모장에서 메모를 한 장씩 뜯어 화면에 붙여 둔다.
--   어느 기기에서 로그인해도 그대로 보이도록 서버에 둔다.
--
-- 표:
--   planner_pages : 한 사람의 하루 한 장. 칸 내용(날짜 옆 D-day, 기상, 목표, 과목·할 일·체크, 기분, 메모, 손으로 칠한 시간 칸)은
--                   화면이 정한 모양 그대로 data(jsonb)에 둔다. 칸이 늘어나도 표를 바꾸지 않게.
--                   10분 시간표의 "집중 기록으로 칠한 칸"은 저장하지 않고 study_segments 에서 그때그때 계산한다.
--   memo_notes    : 뜯은 메모 한 장. 글, 종이 색, 화면에 붙여 뒀는지(shown)와 자리(x·y: 화면 비율 0~1).
--
-- 권한 (CLAUDE.md 절대 규칙: RLS): 둘 다 본인 것만 보고·쓰고·고치고·지운다.

begin;

create table public.planner_pages (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day        date not null,
  data       jsonb not null default '{}'::jsonb check (octet_length(data::text) <= 20000),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table public.memo_notes (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null default '' check (char_length(body) <= 1000),
  color      text not null default 'yellow' check (color in ('yellow', 'pink', 'blue', 'green')),
  shown      boolean not null default true,
  x          real not null default 0.7 check (x between 0 and 1),
  y          real not null default 0.2 check (y between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index memo_notes_user_idx on public.memo_notes (user_id, created_at);

alter table public.planner_pages enable row level security;
alter table public.memo_notes enable row level security;

create policy "내 플래너를 본다" on public.planner_pages for select to authenticated using (user_id = (select auth.uid()));
create policy "내 플래너를 쓴다" on public.planner_pages for insert to authenticated with check (user_id = (select auth.uid()));
create policy "내 플래너를 고친다" on public.planner_pages for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "내 플래너를 지운다" on public.planner_pages for delete to authenticated using (user_id = (select auth.uid()));

create policy "내 메모를 본다" on public.memo_notes for select to authenticated using (user_id = (select auth.uid()));
create policy "내 메모를 쓴다" on public.memo_notes for insert to authenticated with check (user_id = (select auth.uid()));
create policy "내 메모를 고친다" on public.memo_notes for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "내 메모를 지운다" on public.memo_notes for delete to authenticated using (user_id = (select auth.uid()));

commit;
