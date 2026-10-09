-- 두뜀 0009: 이용 시간이 끝난 자리를 자동으로 비움 (백엔드·DB 육심호)
-- 실행 위치: Supabase 대시보드 > SQL Editor
--
-- 배경:
--   이용권 시간이 지나도 seat_sessions 의 ended_at 이 비어 있어 계속 "이용 중"으로 남았다.
--   그 결과
--     - 좌석당 1건 유니크 인덱스가 새 배정을 막아 다른 자리도 고를 수 없다
--     - occupied_seat_numbers() 가 이미 끝난 자리를 찬 것으로 알려 준다
--     - 화면(useMySeat)은 expires_at 으로 걸러서 "내 자리 없음"으로 보이니, 둘이 어긋난다
--   실제로 이용 시간이 끝난 뒤 아무 자리도 못 고르는 상태가 됐다.
--
-- 처리 방식:
--   정리할 사람이 따로 없으므로, 배정을 시도할 때마다 먼저 만료된 것을 치운다.
--   읽기 함수는 값을 바꾸면 안 되므로(stable) 조회 조건으로 걸러내기만 한다.
--   접속이 끊긴 경우의 자동 반납(last_seen_at 기준)은 별도 작업이다. 여기서는 시간 만료만 다룬다.

begin;

-- ---------------------------------------------------------------
-- 1. 만료된 이용을 끝으로 표시한다.
--    끝난 시각은 "지금"이 아니라 원래 끝났어야 할 시각(expires_at)으로 적는다.
--    나중에 공부 시간을 집계할 때 실제 이용 시간이 부풀지 않게 하려는 것이다.
-- ---------------------------------------------------------------
create function public.expire_stale_sessions()
returns void
language sql
security definer
set search_path = ''
as $$
  with s as (
    update public.seat_sessions
    set ended_at = expires_at, end_reason = 'expired'
    where ended_at is null and expires_at <= now()
    returning 1
  ), r as (
    update public.room_sessions
    set ended_at = expires_at, end_reason = 'expired'
    where ended_at is null and expires_at <= now()
    returning 1
  )
  select;
$$;

revoke execute on function public.expire_stale_sessions() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 2. 점유 현황: 시간이 끝난 자리는 빈자리로 본다.
--    읽기 전용이라 정리는 하지 않고 조회 조건으로만 걸러낸다.
-- ---------------------------------------------------------------
create or replace function public.occupied_seat_numbers(p_branch_id bigint)
returns setof int
language sql
security definer
stable
set search_path = ''
as $$
  select s.seat_number
  from public.seat_sessions ss
  join public.seats s on s.id = ss.seat_id
  where ss.ended_at is null
    and ss.expires_at > now()
    and s.branch_id = p_branch_id;
$$;

create or replace function public.room_occupancy(p_branch_id bigint)
returns table (room_number int, occupied bigint, capacity int)
language sql
security definer
stable
set search_path = ''
as $$
  select r.room_number,
         count(rs.id) filter (where rs.ended_at is null and rs.expires_at > now()),
         r.capacity
  from public.rooms r
  left join public.room_sessions rs on rs.room_id = r.id
  where r.branch_id = p_branch_id
  group by r.room_number, r.capacity
  order by r.room_number;
$$;

-- ---------------------------------------------------------------
-- 3. 배정 함수: 시작할 때 만료된 것을 먼저 치운다.
--    이렇게 해야 "시간이 끝났는데 자리가 안 비는" 상태가 쌓이지 않는다.
-- ---------------------------------------------------------------
create or replace function public.assign_seat(
  p_branch_id bigint,
  p_seat_number int,
  p_duration_minutes int
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user       uuid := auth.uid();
  v_seat_id    bigint;
  v_pass_id    uuid;
  v_session_id uuid;
  v_constraint text;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  if p_duration_minutes < 10 or p_duration_minutes % 10 <> 0 then
    raise exception '이용 시간은 10분 이상, 10분 단위로만 고를 수 있습니다.' using errcode = '22023';
  end if;

  perform public.expire_stale_sessions();

  select id into v_seat_id
  from public.seats
  where branch_id = p_branch_id and seat_number = p_seat_number;

  if v_seat_id is null then
    raise exception '%번 좌석을 찾을 수 없습니다.', p_seat_number using errcode = 'P0002';
  end if;

  insert into public.passes (user_id, branch_id, duration_minutes)
  values (v_user, p_branch_id, p_duration_minutes)
  returning id into v_pass_id;

  insert into public.seat_sessions (user_id, seat_id, pass_id, expires_at)
  values (v_user, v_seat_id, v_pass_id,
          now() + make_interval(mins => p_duration_minutes))
  returning id into v_session_id;

  return v_session_id;

exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'seat_sessions_one_active_per_seat' then
      raise exception '이미 이용 중인 자리입니다. 다른 자리를 골라 주세요.' using errcode = '23505';
    elsif v_constraint = 'seat_sessions_one_active_per_user' then
      raise exception '이미 다른 자리를 이용 중입니다. 먼저 반납해 주세요.' using errcode = '23505';
    else
      raise;
    end if;
end;
$$;

create or replace function public.assign_room(
  p_branch_id bigint,
  p_room_number int,
  p_duration_minutes int
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user       uuid := auth.uid();
  v_room_id    bigint;
  v_capacity   int;
  v_occupied   int;
  v_pass_id    uuid;
  v_session_id uuid;
  v_constraint text;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  if p_duration_minutes < 10 or p_duration_minutes % 10 <> 0 then
    raise exception '이용 시간은 10분 이상, 10분 단위로만 고를 수 있습니다.' using errcode = '22023';
  end if;

  perform public.expire_stale_sessions();

  select id, capacity into v_room_id, v_capacity
  from public.rooms
  where branch_id = p_branch_id and room_number = p_room_number
  for update;

  if v_room_id is null then
    raise exception '회의실 %번을 찾을 수 없습니다.', p_room_number using errcode = 'P0002';
  end if;

  select count(*) into v_occupied
  from public.room_sessions
  where room_id = v_room_id and ended_at is null;

  if v_occupied >= v_capacity then
    raise exception '회의실 %번은 정원 %명이 모두 찼습니다.', p_room_number, v_capacity
      using errcode = '23505';
  end if;

  insert into public.passes (user_id, branch_id, duration_minutes)
  values (v_user, p_branch_id, p_duration_minutes)
  returning id into v_pass_id;

  insert into public.room_sessions (user_id, room_id, pass_id, expires_at)
  values (v_user, v_room_id, v_pass_id,
          now() + make_interval(mins => p_duration_minutes))
  returning id into v_session_id;

  return v_session_id;

exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'room_sessions_one_active_per_user' then
      raise exception '이미 다른 회의실을 이용 중입니다. 먼저 나와 주세요.' using errcode = '23505';
    else
      raise;
    end if;
end;
$$;

-- ---------------------------------------------------------------
-- 4. 지금 내가 쓰고 있는 자리를 알려 준다.
--    키오스크가 열릴 때 "이용 중입니다 · 반납하기"를 보여주는 데 쓴다.
--    아무것도 안 쓰고 있으면 행이 없다.
-- ---------------------------------------------------------------
create function public.my_current_place()
returns table (kind text, number int, expires_at timestamptz)
language sql
security definer
stable
set search_path = ''
as $$
  select 'seat', s.seat_number, ss.expires_at
  from public.seat_sessions ss
  join public.seats s on s.id = ss.seat_id
  where ss.user_id = auth.uid() and ss.ended_at is null and ss.expires_at > now()
  union all
  select 'room', r.room_number, rs.expires_at
  from public.room_sessions rs
  join public.rooms r on r.id = rs.room_id
  where rs.user_id = auth.uid() and rs.ended_at is null and rs.expires_at > now();
$$;

revoke execute on function public.my_current_place() from public, anon;
grant execute on function public.my_current_place() to authenticated;

commit;
