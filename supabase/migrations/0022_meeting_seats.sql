-- 두뜀 0022: 회의실 — 인원을 정해 만들고, 들어와서 원하는 의자에 앉기 (#45)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
-- 0021 을 먼저 실행해 두어야 한다.
--
-- 바뀌는 점:
--   0021 : 회의에 들어오면 빈 의자 중 가장 작은 번호에 자동으로 앉았다. 정원은 늘 8.
--   0022 : 회의를 만들 때 인원(2~8)을 꼭 정한다. 의자는 그 수만큼 놓인다.
--          들어오면 의자 없이 "서 있음"(seat_no 비움)으로 들어오고, 걸어가서 빈 의자에서 앉는다(sit_meeting_seat).
--          일어나면 다시 서 있음(stand_meeting_seat). 솔카페에서 빈자리에 앉는 것과 같은 방식이다(0014).
--
-- 같은 의자에 두 사람이 동시에 앉으려 해도 0021 의 유니크 인덱스(meeting_members_one_active_per_seat)가
-- 한 명만 통과시킨다. 서 있는 사람(seat_no 가 null)은 여럿이어도 된다(유니크 인덱스는 null 끼리 겹쳐도 막지 않음).
--
-- 주의: 이 파일을 실행한 뒤 PR 을 머지하기 전까지는 develop 배포본의 회의 만들기가 동작하지 않는다
-- (예전 create_meeting 을 지우므로). 회의 기능은 아직 쓰는 사람이 없어 짧은 공백은 괜찮다고 보았다.

begin;

-- 1. 서 있는 참가자: 자리 번호를 비울 수 있게 한다. 범위 확인(1~8)은 그대로 남는다(null 은 통과).
alter table public.meeting_members alter column seat_no drop not null;
comment on column public.meeting_members.seat_no is '앉은 의자 번호(1~정원). 비어 있으면 회의실에 서 있음 (#45)';

-- 2. 예전 함수 정리: 자동 자리 배정은 더 쓰지 않는다.
drop function public.create_meeting(bigint, text, boolean);
drop function public.join_meeting(bigint);
drop function public.free_meeting_seat(bigint, int);

-- 3. 회의 만들기. 인원(2~8)을 꼭 받는다. 만든 사람은 서 있는 상태로 들어간다. 이름을 비우면 "닉네임의 회의"
create function public.create_meeting(p_branch_id bigint, p_title text, p_private boolean, p_capacity int)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
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
  if v_title = '' then
    select p.nickname || '의 회의' into v_title from public.profiles p where p.id = v_user;
  end if;
  if char_length(v_title) > 30 then
    raise exception '회의 이름은 30자까지예요.' using errcode = '22001';
  end if;

  perform public.leave_meeting(); -- 다른 회의에 있으면 먼저 나간다
  insert into public.meetings (branch_id, host_id, title, is_private, capacity)
  values (p_branch_id, v_user, v_title, coalesce(p_private, false), p_capacity)
  returning id into v_id;
  insert into public.meeting_members (meeting_id, user_id) values (v_id, v_user);
  return v_id;
end;
$$;

-- 4. 회의 참가. 비공개면 만든 사람이거나 초대받아야 한다. 정원(앉은 사람 + 서 있는 사람)이 차면 들어갈 수 없다.
-- 같은 회의에 두 사람이 동시에 들어와도 회의 줄을 잠가(for update) 한 명씩 센다.
create function public.join_meeting(p_meeting_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_meeting public.meetings%rowtype;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;
  select * into v_meeting from public.meetings where id = p_meeting_id for update;
  if v_meeting.id is null or v_meeting.ended_at is not null then
    raise exception '끝난 회의예요.' using errcode = 'P0002';
  end if;
  if v_meeting.is_private and v_meeting.host_id <> v_user and not exists (
    select 1 from public.meeting_invites where meeting_id = p_meeting_id and invitee_id = v_user
  ) then
    raise exception '초대받은 사람만 들어갈 수 있는 회의예요.' using errcode = '42501';
  end if;

  -- 이미 이 회의에 있으면 그대로 둔다(새로고침 등)
  if exists (
    select 1 from public.meeting_members m
    where m.meeting_id = p_meeting_id and m.user_id = v_user and m.left_at is null
  ) then
    return;
  end if;

  perform public.leave_meeting(); -- 다른 회의에 있으면 먼저 나간다
  if (select count(*) from public.meeting_members m where m.meeting_id = p_meeting_id and m.left_at is null) >= v_meeting.capacity then
    raise exception '회의실이 가득 찼어요.' using errcode = 'P0001';
  end if;
  insert into public.meeting_members (meeting_id, user_id) values (p_meeting_id, v_user);
end;
$$;

-- 5. 의자에 앉기. 지금 들어 있는 회의의 빈 의자(1~정원)에만 앉는다. 다른 의자에 앉아 있었으면 옮긴다.
create function public.sit_meeting_seat(p_seat int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_member bigint;
  v_meeting bigint;
  v_capacity int;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;
  select m.id, m.meeting_id into v_member, v_meeting
  from public.meeting_members m
  where m.user_id = v_user and m.left_at is null;
  if v_member is null then
    raise exception '회의에 들어 있지 않아요.' using errcode = 'P0002';
  end if;
  select g.capacity into v_capacity from public.meetings g where g.id = v_meeting;
  if p_seat is null or p_seat not between 1 and v_capacity then
    raise exception '없는 자리예요.' using errcode = '22023';
  end if;

  begin
    update public.meeting_members set seat_no = p_seat where id = v_member;
  exception when unique_violation then
    raise exception '다른 사람이 먼저 앉았어요.' using errcode = 'DT002';
  end;
end;
$$;

-- 6. 일어나기. 회의에는 남아 있고 서 있는 상태가 된다.
create function public.stand_meeting_seat()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;
  update public.meeting_members set seat_no = null
  where user_id = auth.uid() and left_at is null;
end;
$$;

revoke execute on function public.create_meeting(bigint, text, boolean, int) from public, anon;
revoke execute on function public.join_meeting(bigint) from public, anon;
revoke execute on function public.sit_meeting_seat(int) from public, anon;
revoke execute on function public.stand_meeting_seat() from public, anon;
grant execute on function public.create_meeting(bigint, text, boolean, int) to authenticated;
grant execute on function public.join_meeting(bigint) to authenticated;
grant execute on function public.sit_meeting_seat(int) to authenticated;
grant execute on function public.stand_meeting_seat() to authenticated;

commit;

-- 화면 쪽 API(PostgREST)가 바뀐 함수를 바로 알도록 스키마 정보를 다시 읽게 한다.
notify pgrst, 'reload schema';
