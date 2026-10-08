-- 두뜀 0008: 좌석·회의실 배정 함수 (백엔드·DB 육심호)
-- 실행 위치: Supabase 대시보드 > SQL Editor
--
-- 배경:
--   지금 키오스크는 서버를 세 번 왕복한다. 이용권 발급 → 좌석 조회 → 좌석 배정.
--   중간에 끊기면 이용권만 발급되고 자리는 못 받는 상태가 남는다.
--   함수 하나로 묶으면 한 번에 끝나고, 전부 되거나 전부 안 되거나 둘 중 하나가 된다.
--
--   더 중요한 이유는 회의실이다. 좌석은 "1석에 1명"이라 부분 유니크 인덱스가 동시 요청을
--   DB 차원에서 막아 주지만(0001), 회의실은 정원이 6명이라 인덱스로 막을 수 없다.
--   현재 인원을 세어 정원과 비교해야 하는데, 세는 사이에 다른 사람이 들어오면 정원을 넘긴다.
--   그래서 rooms 행을 select ... for update 로 잠그고 센다. 잠긴 동안 다른 요청은 줄을 선다.
--
-- security definer 로 두는 이유:
--   한 번의 호출 안에서 이용권 발급과 배정을 같이 해야 하는데, 중간 단계마다 RLS를 거치면
--   조건이 흩어진다. 대신 함수 안에서 auth.uid() 로 "요청한 사람 본인"임을 직접 확인하고,
--   그 사람 것으로만 기록한다. 호출자가 남의 id를 넣을 방법이 없다.

begin;

-- ---------------------------------------------------------------
-- 1. 좌석 배정
--    실패하면 예외를 올려 함수 전체가 되돌아간다. 이용권만 남는 일이 없다.
-- ---------------------------------------------------------------
create function public.assign_seat(
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

  -- passes 의 check 제약과 같은 규칙이다. 제약에 걸리기 전에 알아듣기 쉬운 말로 알린다.
  if p_duration_minutes < 10 or p_duration_minutes % 10 <> 0 then
    raise exception '이용 시간은 10분 이상, 10분 단위로만 고를 수 있습니다.' using errcode = '22023';
  end if;

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
    -- 어느 제약에 걸렸는지에 따라 안내가 달라야 한다.
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'seat_sessions_one_active_per_seat' then
      raise exception '이미 이용 중인 자리입니다. 다른 자리를 골라 주세요.' using errcode = '23505';
    elsif v_constraint = 'seat_sessions_one_active_per_user' then
      raise exception '이미 다른 자리를 이용 중입니다. 먼저 반납해 주세요.' using errcode = '23505';
    else
      raise; -- 좌석·회의실 동시 이용 차단 트리거(0003) 등은 메시지를 그대로 넘긴다
    end if;
end;
$$;

-- ---------------------------------------------------------------
-- 2. 회의실 배정
--    정원은 인덱스로 못 막으므로 rooms 행을 잠그고 현재 인원을 센다.
-- ---------------------------------------------------------------
create function public.assign_room(
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

  -- passes 의 check 제약과 같은 규칙이다. 제약에 걸리기 전에 알아듣기 쉬운 말로 알린다.
  if p_duration_minutes < 10 or p_duration_minutes % 10 <> 0 then
    raise exception '이용 시간은 10분 이상, 10분 단위로만 고를 수 있습니다.' using errcode = '22023';
  end if;

  -- 이 행을 잠근다. 같은 회의실에 동시에 들어오는 요청은 여기서 줄을 선다.
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
-- 3. 반납
--    본인의 이용 중인 자리를 끝낸다. 좌석이든 회의실이든 하나로 처리한다.
-- ---------------------------------------------------------------
create function public.release_my_place()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_seat int;
  v_room int;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  with done as (
    update public.seat_sessions
    set ended_at = now(), end_reason = 'returned'
    where user_id = v_user and ended_at is null
    returning 1
  )
  select count(*) into v_seat from done;

  with done as (
    update public.room_sessions
    set ended_at = now(), end_reason = 'returned'
    where user_id = v_user and ended_at is null
    returning 1
  )
  select count(*) into v_room from done;

  return v_seat + v_room;
end;
$$;

-- ---------------------------------------------------------------
-- 4. 실행 권한: 로그인한 사용자에게만 준다.
--    Supabase 는 public 스키마 함수를 anon 에게도 기본으로 열어 주므로 명시해 거둔다. (0006 참고)
-- ---------------------------------------------------------------
revoke execute on function public.assign_seat(bigint, int, int) from public, anon;
revoke execute on function public.assign_room(bigint, int, int) from public, anon;
revoke execute on function public.release_my_place() from public, anon;

grant execute on function public.assign_seat(bigint, int, int) to authenticated;
grant execute on function public.assign_room(bigint, int, int) to authenticated;
grant execute on function public.release_my_place() to authenticated;

commit;
