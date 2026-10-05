-- 두뜀 0003: 회의실(스터디룸) 테이블 추가 (백엔드·DB 육심호)
-- 실행 위치: Supabase 대시보드 > SQL Editor
--
-- 배경:
--   src/space/branches/byeol.json 에 스터디룸 3개가 정원 6명으로 정의되어 있고,
--   src/space/layout.ts 의 roomWalls() 가 문이 달린 벽까지 그리고 있다.
--   화면에는 이미 있으나 이용 기록이 없어, 좌석과 같은 수준으로 DB에 추가한다.
--
-- 좌석과의 차이:
--   좌석은 "1석에 1명"이라 부분 유니크 인덱스로 DB가 직접 막아 준다(0001).
--   회의실은 "정원 6명"이라 인덱스로 막을 수 없다. 현재 인원을 세고 정원과 비교해야 하므로
--   3주차 배정 함수에서 rooms 행을 select ... for update 로 잠근 뒤 처리한다.
--   이 파일은 테이블과 "한 사람은 한 자리" 규칙까지만 책임진다.

-- 중간에 실패하면 아무것도 남지 않도록 전체를 한 덩어리로 실행한다.
begin;

-- ---------------------------------------------------------------
-- 1. rooms: 회의실 (byeol.json 의 rooms)
-- ---------------------------------------------------------------
create table public.rooms (
  id          bigint generated always as identity primary key,
  branch_id   bigint  not null references public.branches (id) on delete cascade,
  room_number int     not null check (room_number > 0),
  capacity    int     not null check (capacity > 0),
  pos_x       numeric not null,
  pos_z       numeric not null,
  width       numeric not null check (width > 0),
  depth       numeric not null check (depth > 0),
  unique (branch_id, room_number)
);

comment on table  public.rooms          is '회의실. 좌표·크기의 원본은 byeol.json 이고 여기는 사본이다.';
comment on column public.rooms.capacity is '동시에 들어갈 수 있는 인원. 3주차 배정 함수가 이 값과 현재 인원을 비교한다.';

-- ---------------------------------------------------------------
-- 2. room_sessions: 회의실 이용 (입실 ~ 퇴실)
--    구조는 seat_sessions 와 같게 맞춘다. ended_at 이 null 이면 이용 중이다.
-- ---------------------------------------------------------------
create table public.room_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid   not null references public.profiles (id) on delete cascade,
  room_id      bigint not null references public.rooms (id),
  pass_id      uuid   not null unique references public.passes (id),
  started_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now(),
  ended_at     timestamptz,
  end_reason   text check (end_reason in ('returned', 'expired', 'disconnected')),
  check (expires_at > started_at),
  check ((ended_at is null) = (end_reason is null))
);

-- 한 사용자는 동시에 한 회의실만 이용할 수 있다.
create unique index room_sessions_one_active_per_user
  on public.room_sessions (user_id) where ended_at is null;

-- 정원 확인 질의(현재 인원 세기)가 자주 돌므로 이용 중인 행만 모아 둔다.
create index room_sessions_active_by_room
  on public.room_sessions (room_id) where ended_at is null;

-- ---------------------------------------------------------------
-- 3. 좌석과 회의실에 동시에 들어가지 못하게 막는다.
--    테이블이 둘로 나뉘어 있어 각 테이블의 유니크 인덱스만으로는 막히지 않는다.
--    (좌석에 앉은 채 회의실에 입실하는 경우를 DB에서 차단한다.)
-- ---------------------------------------------------------------
create function public.check_one_active_place()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  busy boolean;
begin
  if tg_table_name = 'room_sessions' then
    select exists (
      select 1 from public.seat_sessions
      where user_id = new.user_id and ended_at is null
    ) into busy;
  else
    select exists (
      select 1 from public.room_sessions
      where user_id = new.user_id and ended_at is null
    ) into busy;
  end if;

  if busy then
    raise exception '이미 이용 중인 자리가 있습니다. 먼저 반납해 주세요.'
      using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

create trigger room_sessions_one_active_place
  before insert on public.room_sessions
  for each row execute function public.check_one_active_place();

create trigger seat_sessions_one_active_place
  before insert on public.seat_sessions
  for each row execute function public.check_one_active_place();

-- ---------------------------------------------------------------
-- 4. 초기 데이터: 별다방 회의실 3개 (byeol.json 의 rooms)
-- ---------------------------------------------------------------
insert into public.rooms (branch_id, room_number, capacity, pos_x, pos_z, width, depth)
select b.id, v.no, v.capacity, v.x, v.z, v.w, v.d
from public.branches b,
  (values
    (1, 6, 9.0, -5.2, 5.0, 4.6),
    (2, 6, 9.0,  0.0, 5.0, 4.6),
    (3, 6, 9.0,  5.2, 5.0, 4.6)
  ) as v(no, capacity, x, z, w, d)
where b.slug = 'byeol';

commit;
