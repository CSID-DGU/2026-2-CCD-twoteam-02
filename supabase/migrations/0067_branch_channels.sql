-- 0067_branch_channels.sql (#480)
-- 채널을 "멀티버스"로 바꾼다. 채널마다 광장·캠퍼스·해변·카페·회의실이 통째로 따로 있다.
-- 0066 은 광장·캠퍼스·해변 벤치만 채널을 따랐다. 이제 지점(스터디카페·카페) 좌석과 회의도 채널을 따른다.
--
--   스터디카페 좌석 (키오스크)  assign_seat · occupied_seat_numbers 가 p_channel 을 받는다
--   카페 자리 (앉으면 내 자리)  sit_cafe_seat 가 모든 지점에서 p_channel 을 따른다
--   회의                        meetings.channel. 회의 만들기·목록이 채널별이다 (회의 정원은 회의마다라 그대로)
--   내 자리 조회                my_current_place 가 채널 번호도 돌려준다 (새로고침하면 그 채널로 들어가게)
--
-- 그대로 두는 것:
--   - "한 사람은 이용 중인 자리 1개"(seat_sessions_one_active_per_user)와 좌석·회의실 동시 이용 차단(0003). 채널과 상관없이 한 사람 1건이다.
--   - 0003 의 rooms·room_sessions(키오스크 스터디룸)는 지금 화면에서 쓰지 않아 건드리지 않는다.
--   - p_channel 은 모두 기본값 1 이다. 채널 번호를 넘기지 않는 지금 화면은 1채널로 그대로 동작한다.

begin;

-- ---------------------------------------------------------------
-- 1. 카페 자리: 모든 지점에서 채널을 따른다
--    0066 은 plaza·campus·beach 만 채널을 따랐다. 바뀐 곳은 그 조건을 뺀 것과,
--    이미 다른 자리를 쓰고 있을 때 알려 주는 문구에 2채널 이상이면 채널 번호를 붙인 것이다(#481 반납 창).
-- ---------------------------------------------------------------
create or replace function public.sit_cafe_seat(p_branch_id bigint, p_seat_number int, p_channel int default 1)
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

  if p_channel is null or p_channel not between 1 and 999 then
    raise exception '채널 번호가 올바르지 않습니다.' using errcode = '22023';
  end if;

  select kind into v_kind from public.branches where id = p_branch_id;
  if v_kind is distinct from 'cafe' then
    raise exception '이 지점은 키오스크에서 자리를 받아야 합니다.' using errcode = '22023';
  end if;

  select id into v_seat_id
  from public.seats
  where branch_id = p_branch_id and seat_number = p_seat_number;
  if v_seat_id is null then
    raise exception '%번 좌석을 찾을 수 없습니다.', p_seat_number using errcode = 'P0002';
  end if;

  insert into public.passes (user_id, branch_id, duration_minutes)
  values (v_user, p_branch_id, v_minutes)
  returning id into v_pass_id;

  insert into public.seat_sessions (user_id, seat_id, pass_id, expires_at, channel)
  values (v_user, v_seat_id, v_pass_id, now() + make_interval(mins => v_minutes), p_channel)
  returning id into v_session_id;

  return v_session_id;

exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'seat_sessions_one_active_per_seat' then
      raise exception '%번 자리에 이미 다른 사람이 앉아 있습니다.', p_seat_number using errcode = '23505';
    elsif v_constraint = 'seat_sessions_one_active_per_user' then
      -- 지금 쓰고 있는 자리를 알려 준다. 화면은 DT001 을 보고 "반납하고 앉기" 창을 띄운다. (0014)
      select case when ss.channel > 1 then ss.channel || '채널 ' else '' end || b.name || ' ' || st.seat_number || '번 자리'
        into v_place
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
-- 2. 스터디카페 좌석 (키오스크): 채널별로 배정하고, 점유도 채널별로 본다
--    본문은 0016 과 같고 channel 을 넣는 것만 다르다.
-- ---------------------------------------------------------------
drop function public.assign_seat(bigint, int, int);

create function public.assign_seat(
  p_branch_id bigint,
  p_seat_number int,
  p_duration_minutes int,
  p_channel int default 1
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

  if p_channel is null or p_channel not between 1 and 999 then
    raise exception '채널 번호가 올바르지 않습니다.' using errcode = '22023';
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

  begin
    insert into public.seat_sessions (user_id, seat_id, pass_id, expires_at, channel)
    values (v_user, v_seat_id, v_pass_id, now() + make_interval(mins => p_duration_minutes), p_channel)
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

drop function public.occupied_seat_numbers(bigint);

create function public.occupied_seat_numbers(p_branch_id bigint, p_channel int default 1)
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
    and s.branch_id = p_branch_id
    and ss.channel = p_channel;
$$;

-- ---------------------------------------------------------------
-- 3. 내 자리 조회: 그 자리가 몇 채널인지도 돌려준다
--    칸을 끝에 하나 더한다. 지금 화면은 kind·number·expires_at·expired 만 읽어 그대로 동작한다.
-- ---------------------------------------------------------------
drop function public.my_current_place();

create function public.my_current_place()
returns table (kind text, number int, expires_at timestamptz, expired boolean, channel int)
language sql
security definer
stable
set search_path = ''
as $$
  select 'seat', s.seat_number, ss.expires_at, ss.expires_at <= now(), ss.channel::int
  from public.seat_sessions ss
  join public.seats s on s.id = ss.seat_id
  where ss.user_id = auth.uid() and ss.ended_at is null
  union all
  select 'room', r.room_number, rs.expires_at, rs.expires_at <= now(), 1
  from public.room_sessions rs
  join public.rooms r on r.id = rs.room_id
  where rs.user_id = auth.uid() and rs.ended_at is null;
$$;

-- ---------------------------------------------------------------
-- 4. 회의: 채널마다 따로 열린다
--    회의 정원은 회의마다라(0022·0023) 그대로다. 같은 채널의 회의만 목록에 보이고, 만들 때 채널을 적는다.
--    참가(join_meeting)는 회의 번호로 하므로 바꾸지 않는다. 다른 채널 회의로 가는 것은 화면이 채널을 옮긴 뒤 한다(#481).
-- ---------------------------------------------------------------
alter table public.meetings
  add column channel smallint not null default 1 check (channel between 1 and 999);

drop index public.meetings_open_idx;
create index meetings_open_idx on public.meetings (branch_id, channel) where ended_at is null;

drop function public.create_meeting(bigint, text, boolean, int, text);

create function public.create_meeting(p_branch_id bigint, p_title text, p_private boolean, p_capacity int, p_password text, p_channel int default 1)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_private boolean := coalesce(p_private, false);
  v_id bigint;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;
  if not exists (select 1 from public.branches where id = p_branch_id) then
    raise exception '없는 지점입니다.' using errcode = 'P0002';
  end if;
  if p_capacity is null or p_capacity not between 2 and 8 then
    raise exception '인원은 2~8명 중에서 골라 주세요.' using errcode = '22023';
  end if;
  if p_channel is null or p_channel not between 1 and 999 then
    raise exception '채널 번호가 올바르지 않습니다.' using errcode = '22023';
  end if;
  if v_private and (p_password is null or p_password !~ '^[0-9]{4}$') then
    raise exception '비공개 회의는 숫자 4자리 비밀번호를 정해 주세요.' using errcode = '22023';
  end if;
  if v_title = '' then
    select p.nickname || '의 회의' into v_title from public.profiles p where p.id = v_user;
  end if;
  if char_length(v_title) > 30 then
    raise exception '회의 이름은 30자까지예요.' using errcode = '22001';
  end if;

  perform public.leave_meeting(); -- 다른 회의에 있으면 먼저 나간다
  insert into public.meetings (branch_id, host_id, title, is_private, capacity, password_hash, channel)
  values (p_branch_id, v_user, v_title, v_private, p_capacity,
          case when v_private then extensions.crypt(p_password, extensions.gen_salt('bf')) end, p_channel)
  returning id into v_id;
  insert into public.meeting_members (meeting_id, user_id) values (v_id, v_user);
  return v_id;
end;
$$;

drop function public.list_meetings(bigint);

create function public.list_meetings(p_branch_id bigint, p_channel int default 1)
returns table (id bigint, title text, is_private boolean, host_nickname text, members int, capacity int, invited boolean, joined boolean, is_host boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.title, g.is_private, p.nickname,
         (select count(*)::int from public.meeting_members m where m.meeting_id = g.id and m.left_at is null),
         g.capacity,
         exists (select 1 from public.meeting_invites i where i.meeting_id = g.id and i.invitee_id = (select auth.uid())),
         exists (select 1 from public.meeting_members m where m.meeting_id = g.id and m.user_id = (select auth.uid()) and m.left_at is null),
         g.host_id = (select auth.uid())
  from public.meetings g
  join public.profiles p on p.id = g.host_id
  where g.branch_id = p_branch_id and g.channel = p_channel and g.ended_at is null
  order by g.created_at desc;
$$;

-- ---------------------------------------------------------------
-- 5. 권한: 로그인한 사용자만 (0006 참고)
-- ---------------------------------------------------------------
revoke all on function public.sit_cafe_seat(bigint, int, int) from public, anon;
grant execute on function public.sit_cafe_seat(bigint, int, int) to authenticated;
revoke all on function public.assign_seat(bigint, int, int, int) from public, anon;
grant execute on function public.assign_seat(bigint, int, int, int) to authenticated;
revoke all on function public.occupied_seat_numbers(bigint, int) from public, anon;
grant execute on function public.occupied_seat_numbers(bigint, int) to authenticated;
revoke all on function public.my_current_place() from public, anon;
grant execute on function public.my_current_place() to authenticated;
revoke all on function public.create_meeting(bigint, text, boolean, int, text, int) from public, anon;
grant execute on function public.create_meeting(bigint, text, boolean, int, text, int) to authenticated;
revoke all on function public.list_meetings(bigint, int) from public, anon;
grant execute on function public.list_meetings(bigint, int) to authenticated;

commit;

notify pgrst, 'reload schema';
