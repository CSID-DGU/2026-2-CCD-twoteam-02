-- 두뜀 DB 스키마 초안 (1주차, 백엔드·DB 육심호)
-- 실행 위치: Supabase 대시보드 > SQL Editor (또는 supabase/migrations/0001_init.sql)
-- 범위: 제안서 필수 기능만. RLS 정책은 2주차에 별도 파일로 추가한다.
-- 실시간 값(2D 위치, 고개 각도, 집중 상태)은 테이블에 저장하지 않고
-- Supabase Realtime(Presence/Broadcast)으로만 주고받는다. (4~5주차)

-- ---------------------------------------------------------------
-- 1. profiles: 회원 정보 (auth.users와 1:1)
-- ---------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nickname   text not null check (char_length(nickname) between 2 and 12),
  created_at timestamptz not null default now()
);

-- 회원가입 시 profiles 행을 자동 생성한다.
-- 닉네임은 signUp 호출의 options.data.nickname 으로 전달한다.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nickname', '사용자'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- 2. branches: 지점 (이번 일정에서는 1개만 운영)
-- ---------------------------------------------------------------
create table public.branches (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  is_open    boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- 3. seats: 좌석 (라운지 20석)
--    pos_x, pos_y: 키오스크 배치도와 2D 공간에서 함께 쓰는 좌표.
--    단위와 원점은 아바타·화면 파트(김현)와 3주차 전에 합의한다.
-- ---------------------------------------------------------------
create table public.seats (
  id          bigint generated always as identity primary key,
  branch_id   bigint not null references public.branches (id) on delete cascade,
  seat_number int    not null check (seat_number > 0),
  pos_x       numeric not null,
  pos_y       numeric not null,
  unique (branch_id, seat_number)
);

-- ---------------------------------------------------------------
-- 4. passes: 이용권 (키오스크에서 이용 시간을 골라 발급)
-- ---------------------------------------------------------------
create table public.passes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid   not null references public.profiles (id) on delete cascade,
  branch_id        bigint not null references public.branches (id),
  duration_minutes int    not null check (duration_minutes > 0),
  issued_at        timestamptz not null default now()
);

create index passes_user_idx on public.passes (user_id, issued_at desc);

-- ---------------------------------------------------------------
-- 5. seat_sessions: 좌석 이용 (배정 ~ 반납)
--    ended_at 이 null 이면 이용 중이다.
-- ---------------------------------------------------------------
create table public.seat_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid   not null references public.profiles (id) on delete cascade,
  seat_id      bigint not null references public.seats (id),
  pass_id      uuid   not null unique references public.passes (id),
  started_at   timestamptz not null default now(),
  expires_at   timestamptz not null,               -- 시간 연장 시 이 값을 늘린다 (6주차)
  last_seen_at timestamptz not null default now(), -- 접속 끊김 자동 반납 판단용 (5주차)
  ended_at     timestamptz,
  end_reason   text check (end_reason in ('returned', 'expired', 'disconnected')),
  check (expires_at > started_at),
  check ((ended_at is null) = (end_reason is null))
);

-- 동시성 처리의 핵심 (3주차):
-- 한 좌석에 이용 중인 세션은 1개만 존재할 수 있다.
-- 여러 명이 동시에 insert 해도 DB가 1건만 통과시키고 나머지는 unique 위반으로 실패한다.
create unique index seat_sessions_one_active_per_seat
  on public.seat_sessions (seat_id) where ended_at is null;

-- 한 사용자는 동시에 한 좌석만 이용할 수 있다.
create unique index seat_sessions_one_active_per_user
  on public.seat_sessions (user_id) where ended_at is null;

-- ---------------------------------------------------------------
-- 6. subjects: 사용자가 등록한 과목
-- ---------------------------------------------------------------
create table public.subjects (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 20),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------------------------------------------------------------
-- 7. study_logs: 과목별 공부 기록 (5주차에 저장 연결)
--    focused_seconds: 초록불 상태로 누적된 시간(초).
--    devices: 과목·기기 선택 화면에서 고른 사용 기기.
--    값의 종류는 트래킹 파트(최원준)와 합의한다. 예: '{tablet,laptop}'
-- ---------------------------------------------------------------
create table public.study_logs (
  id              bigint generated always as identity primary key,
  user_id         uuid   not null references public.profiles (id) on delete cascade,
  session_id      uuid   not null references public.seat_sessions (id) on delete cascade,
  subject_id      bigint not null references public.subjects (id),
  devices         text[] not null default '{}',
  started_at      timestamptz not null,
  ended_at        timestamptz not null,
  focused_seconds int    not null check (focused_seconds >= 0),
  check (ended_at >= started_at)
);

create index study_logs_user_idx on public.study_logs (user_id, started_at desc);
create index study_logs_session_idx on public.study_logs (session_id);

-- ---------------------------------------------------------------
-- 초기 데이터: 지점 1개, 좌석 20석 (5열 x 4행 임시 좌표)
-- ---------------------------------------------------------------
insert into public.branches (name) values ('두뜀 1호점');

insert into public.seats (branch_id, seat_number, pos_x, pos_y)
select b.id, n, (n - 1) % 5, (n - 1) / 5
from public.branches b, generate_series(1, 20) as n
where b.name = '두뜀 1호점';
