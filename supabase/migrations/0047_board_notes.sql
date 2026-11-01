-- 두뜀 0047: 코르크 게시판 쪽지 (Cam Study Cafe 1층 서쪽 벽)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
--
-- 배경:
--   지점 벽의 코르크 게시판에 쪽지를 붙인다. 그 지점에 들어온 사람은 모두 같은 쪽지를 보고, 쪽지에는 쓴 사람 닉네임이 붙는다
--   (닉네임은 화면이 avatars 뷰에서 읽는다). 쪽지는 7일 동안만 보이고 그 뒤에는 떨어진 것처럼 안 보인다.
--   어느 게시판인지는 지점 slug(branch_slug)로 나눈다. 지금은 byeol(Cam Study Cafe 1층)에만 게시판이 있다.
--
-- 권한 (CLAUDE.md 절대 규칙: RLS):
--   보기   : 로그인한 사람 누구나, 붙인 지 7일 안 된 쪽지만
--   붙이기 : 본인 이름으로만, 게스트는 못 붙임(0045 is_guest), 붙인 시각은 지금(앞날로 적어 오래 남기지 못하게),
--            한 사람이 7일 동안 20장까지 (도배 막기)
--   고치기 : 없음 (다시 쓰려면 떼고 새로 붙임)
--   떼기   : 본인 쪽지만
--
-- 다시 실행하기: 표를 새로 만드는 파일이라 한 번만 실행한다.

begin;

create table public.board_notes (
  id          bigint generated always as identity primary key,
  branch_slug text not null check (char_length(branch_slug) between 1 and 40),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 100),
  color       text not null default 'yellow' check (color in ('yellow', 'pink', 'blue', 'green')),
  created_at  timestamptz not null default now()
);
create index board_notes_branch_idx on public.board_notes (branch_slug, created_at desc);
create index board_notes_user_idx on public.board_notes (user_id, created_at desc);

alter table public.board_notes enable row level security;

create policy "7일 안의 쪽지를 본다" on public.board_notes for select to authenticated
  using (created_at > now() - interval '7 days');

create policy "내 이름으로 쪽지를 붙인다" on public.board_notes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not public.is_guest()
    and created_at between now() - interval '1 minute' and now() + interval '1 minute'
    and (select count(*) from public.board_notes n
         where n.user_id = (select auth.uid()) and n.created_at > now() - interval '7 days') < 20
  );

create policy "내 쪽지를 뗀다" on public.board_notes for delete to authenticated
  using (user_id = (select auth.uid()));

commit;
