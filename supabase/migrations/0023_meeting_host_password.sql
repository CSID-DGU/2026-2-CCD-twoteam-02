-- 두뜀 0023: 회의실 — 방장과 비공개 회의 비밀번호 (#45)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
-- 0021, 0022 를 먼저 실행해 두어야 한다.
--
-- 방장:
--   회의를 만든 사람이 방장이다(meetings.host_id, 0021 부터 있던 칸).
--   방장이 나가면(leave_meeting) 회의가 모두에게 끝난다. 끝내지 않으려면 먼저 다른 참석자에게 넘긴다(transfer_meeting_host).
--   방장의 창이 닫히거나 접속이 끊겨 5분 넘게 소식이 없으면, 회의를 끝내지 않고 가장 오래 있던 참석자에게 방장을 넘긴다
--   (release_disconnected_meetings). 실수로 창을 닫았을 때 모두가 쫓겨나지 않게 하려는 것이다.
--
-- 비공개 회의 비밀번호:
--   비공개 회의는 만들 때 숫자 4자리 비밀번호를 꼭 정한다. 비밀번호는 해시(pgcrypto 의 crypt, bcrypt)로만 저장하고
--   화면으로는 절대 돌려주지 않는다(password_hash 칸은 읽기 권한에서 뺀다).
--   들어올 수 있는 사람: 방장, 초대받은 친구(비밀번호 없이), 비밀번호를 아는 사람.
--   그래서 비공개 회의도 그 지점의 회의 목록에 🔒 로 보인다(list_meetings).
--
-- 주의: 이 파일을 실행한 뒤 PR 을 머지하기 전까지는 develop 배포본의 회의 만들기가 동작하지 않는다
-- (create_meeting 의 인자가 바뀜). 참가는 예전 화면에서도 된다(비밀번호 인자는 비워 둘 수 있음).

begin;

create extension if not exists pgcrypto with schema extensions;

-- 1. 비밀번호 칸. 비공개 회의에만 있다.
alter table public.meetings add column password_hash text;
alter table public.meetings add constraint meetings_password_only_private check (is_private or password_hash is null);
comment on column public.meetings.password_hash is '비공개 회의 비밀번호(숫자 4자리)의 bcrypt 해시. 화면에서는 읽을 수 없음 (#45)';

-- 화면이 password_hash 를 읽지 못하게, 나머지 칸만 읽기를 허락한다(RLS 는 줄, 이것은 칸 단위 권한).
revoke select on public.meetings from authenticated;
grant select (id, branch_id, host_id, title, is_private, capacity, created_at, ended_at) on public.meetings to authenticated;

-- 2. 회의 만들기: 비공개면 숫자 4자리 비밀번호를 꼭 받는다.
drop function public.create_meeting(bigint, text, boolean, int);
create function public.create_meeting(p_branch_id bigint, p_title text, p_private boolean, p_capacity int, p_password text)
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
  insert into public.meetings (branch_id, host_id, title, is_private, capacity, password_hash)
  values (p_branch_id, v_user, v_title, v_private, p_capacity,
          case when v_private then extensions.crypt(p_password, extensions.gen_salt('bf')) end)
  returning id into v_id;
  insert into public.meeting_members (meeting_id, user_id) values (v_id, v_user);
  return v_id;
end;
$$;

-- 3. 회의 참가: 비공개면 방장·초대받은 사람은 그대로, 그 밖에는 비밀번호가 맞아야 한다.
--    비밀번호를 안 보냈으면 DT003(화면이 비밀번호 칸을 띄움), 틀렸으면 28P01.
drop function public.join_meeting(bigint);
create function public.join_meeting(p_meeting_id bigint, p_password text default null)
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

  -- 이미 이 회의에 있으면 그대로 둔다(새로고침 등)
  if exists (
    select 1 from public.meeting_members m
    where m.meeting_id = p_meeting_id and m.user_id = v_user and m.left_at is null
  ) then
    return;
  end if;

  if v_meeting.is_private and v_meeting.host_id <> v_user and not exists (
    select 1 from public.meeting_invites where meeting_id = p_meeting_id and invitee_id = v_user
  ) then
    if p_password is null or p_password = '' then
      raise exception '비밀번호를 입력해 주세요.' using errcode = 'DT003';
    end if;
    if v_meeting.password_hash is null or extensions.crypt(p_password, v_meeting.password_hash) <> v_meeting.password_hash then
      raise exception '비밀번호가 맞지 않아요.' using errcode = '28P01';
    end if;
  end if;

  perform public.leave_meeting(); -- 다른 회의에 있으면 먼저 나간다
  if (select count(*) from public.meeting_members m where m.meeting_id = p_meeting_id and m.left_at is null) >= v_meeting.capacity then
    raise exception '회의실이 가득 찼어요.' using errcode = 'P0001';
  end if;
  insert into public.meeting_members (meeting_id, user_id) values (p_meeting_id, v_user);
end;
$$;

-- 4. 나가기: 방장이 나가면 회의를 끝내고 모두 내보낸다. 아니면 나만 나가고, 마지막 사람이면 회의를 끝낸다.
create or replace function public.leave_meeting()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_meeting bigint;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;
  update public.meeting_members set left_at = now()
  where user_id = v_user and left_at is null
  returning meeting_id into v_meeting;
  if v_meeting is null then
    return;
  end if;

  if exists (select 1 from public.meetings where id = v_meeting and host_id = v_user and ended_at is null) then
    update public.meeting_members set left_at = now() where meeting_id = v_meeting and left_at is null;
    update public.meetings set ended_at = now() where id = v_meeting;
    return;
  end if;

  update public.meetings set ended_at = now()
  where id = v_meeting and ended_at is null
    and not exists (select 1 from public.meeting_members where meeting_id = v_meeting and left_at is null);
end;
$$;

-- 5. 방장 넘기기: 방장만, 같은 회의에 지금 들어 있는 사람에게
create function public.transfer_meeting_host(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_meeting bigint;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;
  select g.id into v_meeting
  from public.meetings g
  join public.meeting_members m on m.meeting_id = g.id and m.user_id = v_user and m.left_at is null
  where g.host_id = v_user and g.ended_at is null
  for update of g;
  if v_meeting is null then
    raise exception '방장만 넘길 수 있어요.' using errcode = '42501';
  end if;
  if p_user is null or p_user = v_user or not exists (
    select 1 from public.meeting_members m where m.meeting_id = v_meeting and m.user_id = p_user and m.left_at is null
  ) then
    raise exception '이 회의에 있는 사람에게만 넘길 수 있어요.' using errcode = '22023';
  end if;
  update public.meetings set host_id = p_user where id = v_meeting;
end;
$$;

-- 6. 접속이 끊긴 참가자 정리(pg_cron 이 1분마다): 5분 넘게 소식이 없으면 내보낸다.
--    방장이 빠졌는데 남은 사람이 있으면 가장 오래 있던 사람에게 방장을 넘기고, 아무도 없으면 회의를 끝낸다.
create or replace function public.release_disconnected_meetings()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  with done as (
    update public.meeting_members set left_at = last_seen_at
    where left_at is null and last_seen_at < now() - interval '5 minutes'
    returning 1
  )
  select count(*) into v_count from done;

  update public.meetings g set host_id = (
    select m.user_id from public.meeting_members m
    where m.meeting_id = g.id and m.left_at is null
    order by m.joined_at, m.id limit 1
  )
  where g.ended_at is null
    and not exists (select 1 from public.meeting_members m where m.meeting_id = g.id and m.user_id = g.host_id and m.left_at is null)
    and exists (select 1 from public.meeting_members m where m.meeting_id = g.id and m.left_at is null);

  update public.meetings g set ended_at = now()
  where g.ended_at is null
    and not exists (select 1 from public.meeting_members m where m.meeting_id = g.id and m.left_at is null);
  return v_count;
end;
$$;

-- 7. 회의 목록: 이 지점의 열린 회의 모두(비공개도 🔒 로 보임). 비밀번호 없이 들어갈 수 있는지(invited·joined·방장)를 같이 준다.
drop function public.list_meetings(bigint);
create function public.list_meetings(p_branch_id bigint)
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
  where g.branch_id = p_branch_id and g.ended_at is null
  order by g.created_at desc;
$$;

revoke execute on function public.create_meeting(bigint, text, boolean, int, text) from public, anon;
revoke execute on function public.join_meeting(bigint, text) from public, anon;
revoke execute on function public.transfer_meeting_host(uuid) from public, anon;
revoke execute on function public.list_meetings(bigint) from public, anon;
grant execute on function public.create_meeting(bigint, text, boolean, int, text) to authenticated;
grant execute on function public.join_meeting(bigint, text) to authenticated;
grant execute on function public.transfer_meeting_host(uuid) to authenticated;
grant execute on function public.list_meetings(bigint) to authenticated;

commit;

-- 화면 쪽 API(PostgREST)가 바뀐 함수를 바로 알도록 스키마 정보를 다시 읽게 한다.
notify pgrst, 'reload schema';
