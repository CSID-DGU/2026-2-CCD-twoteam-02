-- 두뜀 0016: 시간이 끝나도 자리를 유지하고, 연장할 수 있게 한다 (백엔드·DB 육심호)
-- 실행 위치: Supabase 대시보드 > SQL Editor
-- 관련 이슈: #38
--
-- 배경:
--   0009 는 "이용 시간이 끝나면 자리를 자동으로 반납한다"로 만들었다. 이 설계를 바꾼다.
--   공부하다 시간이 끝났다고 자리를 잃으면 흐름이 끊기고, 무료 서비스에서 굳이
--   쫓아낼 이유도 없다. 이제 끝나는 건 직접 반납하거나 접속이 끊겼을 때뿐이다.
--
--   그래서 0009 가 만든 것 중 "시간으로 끝내는" 부분을 전부 되돌린다.
--   만료 조건이 다섯 군데에 퍼져 있어서 하나만 고치면 어긋난다.
--
--     1) expire_stale_sessions()   시간이 지나면 ended_at 을 채우던 함수
--     2) occupied_seat_numbers()   시간이 지난 자리를 빈자리로 보던 조건
--     3) room_occupancy()          같은 조건
--     4) my_current_place()        시간이 지나면 "자리 없음"으로 보이던 조건
--     5) assign_seat / assign_room / sit_cafe_seat 가 1)을 부르던 것
--
--   특히 2)를 그대로 두면 위험하다. 시간이 지난 자리가 남에게 빈자리로 보이는데
--   실제로는 유니크 인덱스가 잡고 있어서, 배정을 시도하면 엉뚱한 오류가 난다.
--
-- expires_at 의 뜻이 바뀐다:
--   전 → 이 시각이 지나면 자리를 잃는다
--   후 → 이 시각까지가 이용권에 든 시간이다. 지나도 자리는 유지되고 화면에 "시간 초과"로 보인다
--
-- 연장을 어떻게 기록하나:
--   seat_sessions 하나에 passes 하나가 유니크로 묶여 있어 연장마다 이용권을 새로 만들 수 없다.
--   그래서 expires_at 을 늘리면서 그 이용권의 duration_minutes 를 총합으로 갱신한다.
--   issued_at + duration_minutes = expires_at 이 계속 맞아떨어져 기록이 일관된다.
--
-- end_reason 의 'expired':
--   더는 쓰지 않지만 제약에서 빼지 않는다. 이미 그 값으로 끝난 기록이 남아 있을 수 있고,
--   빼면 그 행들이 제약을 어겨 마이그레이션이 실패한다.

begin;

-- ---------------------------------------------------------------
-- 1. 시간으로 끝내는 함수를 없앤다
--
--    이 함수를 부르던 assign_seat / assign_room / sit_cafe_seat 도 아래에서 다시 만든다.
--    (함수 본문에서 부르고 있어 먼저 지우면 그 함수들이 깨진다. 순서가 중요하다)
-- ---------------------------------------------------------------

-- 1-1. 점유 현황: 시간이 지난 자리도 "이용 중"으로 본다.
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
  where ss.ended_at is null                 -- 시간이 아니라 "끝났는지"로만 판단한다
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
         count(rs.id) filter (where rs.ended_at is null),
         r.capacity
  from public.rooms r
  left join public.room_sessions rs on rs.room_id = r.id
  where r.branch_id = p_branch_id
  group by r.room_number, r.capacity
  order by r.room_number;
$$;

-- 1-2. 내 자리: 시간이 지나도 돌려준다. 지났는지는 expired 로 알려 준다.
--      화면이 "시간 초과"를 띄우고 연장을 권하는 데 쓴다.
drop function if exists public.my_current_place();

create function public.my_current_place()
returns table (kind text, number int, expires_at timestamptz, expired boolean)
language sql
security definer
stable
set search_path = ''
as $$
  select 'seat', s.seat_number, ss.expires_at, ss.expires_at <= now()
  from public.seat_sessions ss
  join public.seats s on s.id = ss.seat_id
  where ss.user_id = auth.uid() and ss.ended_at is null
  union all
  select 'room', r.room_number, rs.expires_at, rs.expires_at <= now()
  from public.room_sessions rs
  join public.rooms r on r.id = rs.room_id
  where rs.user_id = auth.uid() and rs.ended_at is null;
$$;

revoke execute on function public.my_current_place() from public, anon;
grant execute on function public.my_current_place() to authenticated;

-- ---------------------------------------------------------------
-- 2. 배정 함수에서 "시간 지난 것 정리" 호출을 뺀다
--
--    본문이 길어 통째로 다시 만든다. 바뀐 곳은 perform 한 줄을 뺀 것뿐이다.
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
  v_user    uuid := auth.uid();
  v_seat_id bigint;
  v_pass_id uuid;
  v_session uuid;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  if p_duration_minutes < 10 or p_duration_minutes % 10 <> 0 then
    raise exception '이용 시간은 10분 이상, 10분 단위로만 고를 수 있습니다.' using errcode = '22023';
  end if;

  -- 0016: 시간이 지났다고 자리를 치우지 않는다. (전에는 여기서 expire_stale_sessions 를 불렀다)

  select id into v_seat_id
  from public.seats
  where branch_id = p_branch_id and seat_number = p_seat_number;

  if v_seat_id is null then
    raise exception '%번 좌석을 찾을 수 없습니다.', p_seat_number using errcode = 'P0002';
  end if;

  insert into public.passes (user_id, branch_id, duration_minutes)
  values (v_user, p_branch_id, p_duration_minutes)
  returning id into v_pass_id;

  begin
    insert into public.seat_sessions (user_id, seat_id, pass_id, expires_at)
    values (v_user, v_seat_id, v_pass_id, now() + make_interval(mins => p_duration_minutes))
    returning id into v_session;
  exception
    when unique_violation then
      if sqlerrm like '%one_active_per_seat%' then
        raise exception '%번 좌석은 이미 이용 중입니다.', p_seat_number using errcode = '23505';
      else
        raise exception '이미 다른 자리를 이용 중입니다. 먼저 반납해 주세요.' using errcode = '23505';
      end if;
  end;

  return v_session;
end;
$$;

revoke execute on function public.assign_seat(bigint, int, int) from public, anon;
grant execute on function public.assign_seat(bigint, int, int) to authenticated;

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

  -- 0016: 시간이 지났다고 자리를 치우지 않는다.

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

revoke execute on function public.assign_room(bigint, int, int) from public, anon;
grant execute on function public.assign_room(bigint, int, int) to authenticated;

create or replace function public.sit_cafe_seat(p_branch_id bigint, p_seat_number int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user       uuid := auth.uid();
  v_minutes    int  := 720; -- 카페 이용 기록의 시간(12시간). 일어나면 바로 끝난다.
  v_kind       text;
  v_seat_id    bigint;
  v_pass_id    uuid;
  v_session_id uuid;
  v_constraint text;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  select kind into v_kind from public.branches where id = p_branch_id;
  if v_kind is distinct from 'cafe' then
    raise exception '이 지점은 키오스크에서 자리를 받아야 합니다.' using errcode = '22023';
  end if;

  -- 0016: 시간이 지났다고 자리를 치우지 않는다.

  select id into v_seat_id
  from public.seats
  where branch_id = p_branch_id and seat_number = p_seat_number;
  if v_seat_id is null then
    raise exception '%번 좌석을 찾을 수 없습니다.', p_seat_number using errcode = 'P0002';
  end if;

  insert into public.passes (user_id, branch_id, duration_minutes)
  values (v_user, p_branch_id, v_minutes)
  returning id into v_pass_id;

  insert into public.seat_sessions (user_id, seat_id, pass_id, expires_at)
  values (v_user, v_seat_id, v_pass_id, now() + make_interval(mins => v_minutes))
  returning id into v_session_id;

  return v_session_id;

exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'seat_sessions_one_active_per_seat' then
      raise exception '%번 자리에 이미 다른 사람이 앉아 있습니다.', p_seat_number using errcode = '23505';
    else
      raise exception '이미 다른 자리를 이용 중입니다.' using errcode = '23505';
    end if;
end;
$$;

revoke execute on function public.sit_cafe_seat(bigint, int) from public, anon;
grant execute on function public.sit_cafe_seat(bigint, int) to authenticated;

-- 이제 아무도 부르지 않으므로 지운다.
drop function if exists public.expire_stale_sessions();

-- ---------------------------------------------------------------
-- 3. 연장
--
--    지금 쓰고 있는 자리(좌석이든 회의실이든)의 시간을 늘린다.
--    expires_at 을 늘리고, 그 이용권의 duration_minutes 를 총합으로 맞춘다.
--
--    기준 시각은 "지금"이 아니라 원래 끝나는 시각이다. 시간이 남았는데 연장하면
--    남은 시간이 사라지지 않고 그 뒤로 붙는다. 이미 지났으면 지금부터 센다.
--      남음:  끝나는 시각 + 연장
--      지남:  지금 + 연장
-- ---------------------------------------------------------------
create or replace function public.extend_my_place(p_minutes int)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_pass    uuid;
  v_from    timestamptz;
  v_until   timestamptz;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  if p_minutes < 10 or p_minutes % 10 <> 0 then
    raise exception '연장은 10분 이상, 10분 단위로만 할 수 있습니다.' using errcode = '22023';
  end if;

  -- 좌석을 먼저 본다. 좌석과 회의실을 동시에 쓸 수 없으므로(0003 트리거) 하나만 나온다.
  select pass_id, greatest(expires_at, now()) into v_pass, v_from
  from public.seat_sessions
  where user_id = v_user and ended_at is null
  for update;

  if v_pass is not null then
    v_until := v_from + make_interval(mins => p_minutes);
    update public.seat_sessions set expires_at = v_until
    where user_id = v_user and ended_at is null;
  else
    select pass_id, greatest(expires_at, now()) into v_pass, v_from
    from public.room_sessions
    where user_id = v_user and ended_at is null
    for update;

    if v_pass is null then
      raise exception '이용 중인 자리가 없습니다.' using errcode = 'P0002';
    end if;

    v_until := v_from + make_interval(mins => p_minutes);
    update public.room_sessions set expires_at = v_until
    where user_id = v_user and ended_at is null;
  end if;

  -- 이용권에도 총 시간을 반영한다. issued_at + duration_minutes = expires_at 이 유지된다.
  update public.passes
  set duration_minutes = duration_minutes + p_minutes
  where id = v_pass;

  return v_until;
end;
$$;

revoke execute on function public.extend_my_place(int) from public, anon;
grant execute on function public.extend_my_place(int) to authenticated;

comment on function public.extend_my_place(int) is
  '지금 쓰고 있는 자리의 이용 시간을 늘린다. 남은 시간이 있으면 그 뒤에 붙이고, 지났으면 지금부터 센다.';

commit;
