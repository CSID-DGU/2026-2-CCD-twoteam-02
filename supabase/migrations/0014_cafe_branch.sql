-- 두뜀 0014: 두 번째 지점 "솔카페" (#44)
-- 실행 위치: Supabase 대시보드 > SQL Editor
--
-- 배경:
--   지점을 두 종류로 나눈다.
--     studycafe (별다방): 키오스크에서 이용 시간을 고르고 자리를 배정받는다. (0008)
--     cafe      (솔카페): 키오스크가 없다. 빈자리에 앉으면 그 자리가 내 자리가 되고, 일어나면 놓는다.
--   의자·회의실 배치는 두 지점이 같다. 솔카페는 키오스크 대신 커피 바가 있다(화면 배치만, 기능 없음).
--   좌표의 원본은 src/space/branches/sol.json 이고, 좌석·회의실은 별다방 값을 그대로 복사한다.
--
-- 동시에 같은 자리에 앉으려 하면:
--   seat_sessions 의 "좌석당 이용 중 1건" 유니크 인덱스(0001)가 먼저 온 한 명만 통과시킨다.
--   나머지는 "방금 다른 사람이 앉았어요"를 받는다. 키오스크 배정과 같은 장치다.
--
-- 이용권이 필요한 이유:
--   seat_sessions.pass_id 는 필수라, 카페에서 앉을 때도 이용권(passes)을 하나 만들어 붙인다.
--   사용자에게는 보이지 않는 "카페 이용" 기록이다. 시간은 넉넉하게 12시간으로 둔다.
--
-- 다른 자리를 이미 쓰고 있으면(사람당 이용 중 1건, 0001):
--   'DT001' 오류와 함께 "별다방 7번 자리를 이용 중이에요…"를 돌려준다.
--   화면은 이 오류를 보면 "반납하고 앉기" 버튼을 띄운다(release_my_place, 0008).

begin;

-- ---------------------------------------------------------------
-- 1. 지점 종류
-- ---------------------------------------------------------------
alter table public.branches
  add column kind text not null default 'studycafe'
  check (kind in ('studycafe', 'cafe'));

comment on column public.branches.kind is
  'studycafe: 키오스크로 자리 배정, cafe: 빈자리에 앉으면 내 자리(일어나면 놓음)';

-- ---------------------------------------------------------------
-- 2. 솔카페: 지점, 좌석 20석, 회의실 3개 (별다방과 같은 배치)
-- ---------------------------------------------------------------
insert into public.branches (name, slug, kind) values ('솔카페', 'sol', 'cafe');

insert into public.seats (branch_id, seat_number, pos_x, pos_z, rot)
select sol.id, s.seat_number, s.pos_x, s.pos_z, s.rot
from public.seats s
join public.branches byeol on byeol.id = s.branch_id and byeol.slug = 'byeol'
cross join public.branches sol
where sol.slug = 'sol';

insert into public.rooms (branch_id, room_number, capacity, pos_x, pos_z, width, depth)
select sol.id, r.room_number, r.capacity, r.pos_x, r.pos_z, r.width, r.depth
from public.rooms r
join public.branches byeol on byeol.id = r.branch_id and byeol.slug = 'byeol'
cross join public.branches sol
where sol.slug = 'sol';

-- ---------------------------------------------------------------
-- 3. 카페에서 앉기: 빈자리에 앉으면 그 자리를 잡는다.
-- ---------------------------------------------------------------
create function public.sit_cafe_seat(p_branch_id bigint, p_seat_number int)
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
  v_place      text;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  select kind into v_kind from public.branches where id = p_branch_id;
  if v_kind is distinct from 'cafe' then
    raise exception '이 지점은 키오스크에서 자리를 받아야 합니다.' using errcode = '22023';
  end if;

  perform public.expire_stale_sessions(); -- 0009: 시간이 지난 기록을 먼저 치운다

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
      raise exception '방금 다른 사람이 앉았어요. 다른 자리를 골라 주세요.' using errcode = '23505';
    elsif v_constraint = 'seat_sessions_one_active_per_user' then
      -- 지금 쓰고 있는 자리를 알려 준다. 화면은 DT001 을 보고 "반납하고 앉기" 버튼을 띄운다.
      select b.name || ' ' || st.seat_number || '번 자리' into v_place
      from public.seat_sessions ss
      join public.seats st on st.id = ss.seat_id
      join public.branches b on b.id = st.branch_id
      where ss.user_id = v_user and ss.ended_at is null
      limit 1;
      raise exception '%를 이용 중이에요. 반납하면 이 자리에 앉을 수 있어요.', coalesce(v_place, '다른 자리')
        using errcode = 'DT001';
    else
      raise; -- 좌석·회의실 동시 이용 차단 트리거(0003) 등은 메시지를 그대로 넘긴다
    end if;
end;
$$;

-- ---------------------------------------------------------------
-- 4. 카페에서 일어나기: 카페 자리만 놓는다. (키오스크로 받은 별다방 자리는 건드리지 않음)
-- ---------------------------------------------------------------
create function public.leave_cafe_seat()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_count int;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  with done as (
    update public.seat_sessions ss
    set ended_at = now(), end_reason = 'returned'
    from public.seats st
    join public.branches b on b.id = st.branch_id
    where ss.seat_id = st.id
      and b.kind = 'cafe'
      and ss.user_id = v_user
      and ss.ended_at is null
    returning 1
  )
  select count(*) into v_count from done;
  return v_count;
end;
$$;

-- 로그인한 사용자만 부를 수 있다. (0006 참고)
revoke execute on function public.sit_cafe_seat(bigint, int) from public, anon;
revoke execute on function public.leave_cafe_seat() from public, anon;
grant execute on function public.sit_cafe_seat(bigint, int) to authenticated;
grant execute on function public.leave_cafe_seat() to authenticated;

commit;

notify pgrst, 'reload schema';
