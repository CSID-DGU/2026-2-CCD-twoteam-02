-- 두뜀 0030: 오판·버그 신고 (#121)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
--
-- 배경:
--   테스트 배포 때 사용자가 오판(공부 중인데 노란불 등)·화면 버그·의견을 앱 안에서 바로 보낼 수 있게 한다.
--   연락처가 없는 사용자(지인의 지인)에게서도 받기 위해서다.
--   - 신고 한 건 = 종류(판정 오류·버그·기타) + 설명 한 줄 + 그때의 화면 정보(context) + 최근 30초 판정 수치(samples).
--   - 웹캠 영상·사진·화면 캡처는 어떤 형태로도 저장하지 않는다. 수치와 글자뿐이다 (CLAUDE.md 절대 규칙).
--   - 팀 세 명만 모든 신고를 보고 "확인함"을 표시한다. 일반 사용자는 자기 신고만 쓰고 볼 수 있다.
--
-- 팀 구분 (team_members):
--   profiles 에 "팀인지" 칸을 두면 안 된다. 0004 의 "본인 프로필만 수정한다" 정책은 칸을 가리지 않아,
--   사용자가 API 로 자기를 팀으로 바꿀 수 있다. 그래서 쓰기 권한이 전혀 없는 표를 따로 두고,
--   팀원 등록은 SQL Editor 에서만 한다. (아래 "팀원 등록" 참고)
--
-- 권한 (CLAUDE.md 절대 규칙: RLS):
--   - team_members: 내 행만 읽는다(메뉴에 "신고 목록"을 보일지 정하는 데 씀). 쓰기는 아무 역할에도 없다.
--   - reports: 내 신고를 쓴다 / 내 신고 또는 팀이면 본다 / 팀만 확인 표시(checked_at·checked_by)를 바꾼다. 삭제는 없다.
--   - Supabase 는 public 표에 authenticated 에게 기본으로 모든 권한을 주므로, revoke all 을 먼저 하고 필요한 것만 다시 준다.
--   - 값의 크기 제한은 DB 에 둔다 (0015 의 원칙: 화면의 maxLength 는 방어선이 아니다).
--
-- 팀원 등록 (이 파일을 실행한 뒤, 팀원마다 한 번):
--   Authentication > Users 에서 그 사람의 UUID 를 찾아 아래를 실행한다. (id 는 git 에 올리지 않는다)
--   insert into public.team_members (user_id) values ('<auth.users.id>');
--
-- 다시 실행하기:
--   맨 앞에서 이 파일이 만드는 표·함수·규칙을 지우고 새로 만들므로 몇 번 실행해도 된다.
--   대신 실행할 때마다 쌓인 신고와 팀원 등록이 모두 지워진다. 처음 실행하는 DB 에서는 지울 것이 없어 그냥 넘어간다.

begin;

-- ---------------------------------------------------------------
-- 0. 이 파일을 한 번 실행한 것 지우기. 없으면 넘어간다.
-- ---------------------------------------------------------------
drop policy if exists "내 신고를 쓴다" on public.reports;
drop policy if exists "내 신고 또는 팀이면 본다" on public.reports;
drop policy if exists "팀만 확인 표시를 바꾼다" on public.reports;
drop policy if exists "내 팀 행만 본다" on public.team_members;
drop table if exists public.reports;
drop function if exists public.is_team();
drop table if exists public.team_members;

-- ---------------------------------------------------------------
-- 1. 팀원 표. 행이 있으면 팀이다.
-- ---------------------------------------------------------------
create table public.team_members (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

alter table public.team_members enable row level security;

revoke all on public.team_members from anon, authenticated;
grant select on public.team_members to authenticated;

create policy "내 팀 행만 본다"
  on public.team_members for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------
-- 2. 팀인지 확인하는 함수. reports 정책 안에서 쓴다.
--    정책 안에서 다른 표를 읽으면 RLS 가 꼬일 수 있어 security definer 로 둔다(0021·0029 와 같은 방식).
-- ---------------------------------------------------------------
create function public.is_team()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members m
    where m.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_team() from public, anon;
grant execute on function public.is_team() to authenticated;

-- ---------------------------------------------------------------
-- 3. 신고 표
--    context: 화면 주소·지점·좌석 이용 기록 id·브라우저·판정 상태·허용 설정 (jsonb, 4KB 까지)
--    samples: 최근 30초 판정 수치 배열 (1초에 한 줄, 16KB 까지). 공부 중이 아니면 빈 배열
-- ---------------------------------------------------------------
create table public.reports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  kind       text not null check (kind in ('judgment', 'bug', 'other')),           -- 판정 오류 / 화면·기능 버그 / 기타·의견
  detail     text check (detail in ('false_alarm', 'missed', 'unsure')),           -- 판정 오류일 때만: 공부 중인데 노랑·빨강 / 안 하는데 초록 / 모르겠음
  message    text not null default '' check (char_length(message) <= 500),
  context    jsonb not null default '{}'::jsonb check (pg_column_size(context) <= 4096),
  samples    jsonb not null default '[]'::jsonb
             check (jsonb_typeof(samples) = 'array' and pg_column_size(samples) <= 16384),
  checked_at timestamptz,                                                          -- 팀이 확인함 (null = 미확인)
  checked_by uuid references auth.users (id) on delete set null
);

create index reports_created_idx on public.reports (created_at desc);

alter table public.reports enable row level security;

revoke all on public.reports from anon, authenticated;
grant select, insert on public.reports to authenticated;
grant update (checked_at, checked_by) on public.reports to authenticated;

create policy "내 신고를 쓴다"
  on public.reports for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "내 신고 또는 팀이면 본다"
  on public.reports for select to authenticated
  using (user_id = (select auth.uid()) or public.is_team());

create policy "팀만 확인 표시를 바꾼다"
  on public.reports for update to authenticated
  using (public.is_team())
  with check (public.is_team());

comment on table public.team_members is '신고 목록을 볼 수 있는 팀원 (#121). SQL Editor 에서만 등록한다';
comment on table public.reports is '오판·버그 신고 (#121). 영상 없이 글자와 판정 수치만. 팀만 전체를 보고 확인 표시를 한다';

commit;

-- 화면 쪽 API(PostgREST)가 새 표·함수를 바로 알도록 스키마 정보를 다시 읽게 한다.
notify pgrst, 'reload schema';
