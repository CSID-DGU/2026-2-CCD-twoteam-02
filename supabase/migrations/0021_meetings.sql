-- 두뜀 0021: 회의실 — 회의, 참가자, 초대 (#45)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
--
-- 배경:
--   지점마다 회의실 공간은 하나(원형 테이블, 의자 8개)지만, 그 안에서 회의는 여러 개가 따로 열린다.
--   같은 방 모양 안에 회의마다 따로 들어가고, 다른 회의의 캐릭터·목소리는 섞이지 않는다(게임의 인스턴스와 같은 방식).
--   그래서 공간(지점 배치 JSON)과 회의(이 표들)를 나눈다. 0003 의 rooms(키오스크로 예약하는 스터디룸)와는 다르다.
--
-- 회의 종류:
--   공개   : 빈자리가 있으면 누구나 참가. 그 지점의 열린 회의 목록에 보인다.
--   비공개 : 초대받은 친구만 참가. 초대는 회의 참가자가 친구 탭에서 한다(친구만 초대 가능).
--
-- 규칙:
--   - 정원 8명. 자리 번호 1~8 은 원형 테이블의 의자다.
--   - 한 사람은 한 번에 한 회의에만 있다. 다른 회의에 들어가면 앞 회의에서는 자동으로 나간다.
--   - 마지막 사람이 나가면 회의가 끝난다(ended_at). 끝난 회의에는 다시 들어갈 수 없다.
--   - 회의 화면이 1분마다 meeting_heartbeat() 를 부르고, 5분 넘게 소식이 없으면 pg_cron 이 그 참가자를 내보낸다(0017 과 같은 방식).
--
-- 권한 (CLAUDE.md 절대 규칙: RLS):
--   - 표에 직접 쓰지 못한다. 만들기·참가·나가기·초대는 모두 아래 DB 함수로만 한다(정원·초대·친구 확인을 DB 가 한다).
--   - 조회: 회의는 공개 회의 / 내가 들어 있거나 초대받은 회의만. 참가자는 내가 들어 있는 회의의 참가자만.
--     초대는 내가 받았거나 보낸 것만.
--   - 회의 실시간 방(meeting:회의번호)은 비공개 방으로, 그 회의 참가자만 듣고 보낼 수 있다(아래 4절).
--     음성 연결 신호(#46)와 위치·고개 각도도 이 방으로 주고받으므로, 다른 사람이 엿듣지 못하게 한다.

begin;

-- ---------------------------------------------------------------
-- 1. 표
-- ---------------------------------------------------------------
create table public.meetings (
  id         bigint generated always as identity primary key,
  branch_id  bigint not null references public.branches (id) on delete cascade,
  host_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 30),
  is_private boolean not null default false,
  capacity   int not null default 8 check (capacity between 2 and 8),
  created_at timestamptz not null default now(),
  ended_at   timestamptz
);
create index meetings_open_idx on public.meetings (branch_id) where ended_at is null;

create table public.meeting_members (
  id           bigint generated always as identity primary key,
  meeting_id   bigint not null references public.meetings (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  seat_no      int not null check (seat_no between 1 and 8),
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  left_at      timestamptz
);
-- 한 사람은 한 회의에만, 한 의자에는 한 사람만 (지금 들어 있는 참가자 기준)
create unique index meeting_members_one_active_per_user on public.meeting_members (user_id) where left_at is null;
create unique index meeting_members_one_active_per_seat on public.meeting_members (meeting_id, seat_no) where left_at is null;
create index meeting_members_meeting_idx on public.meeting_members (meeting_id) where left_at is null;

create table public.meeting_invites (
  meeting_id bigint not null references public.meetings (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meeting_id, invitee_id),
  check (invitee_id <> invited_by)
);
create index meeting_invites_invitee_idx on public.meeting_invites (invitee_id);

-- ---------------------------------------------------------------
-- 2. 권한 (RLS)
--    정책 안에서 다른 표를 읽으면 서로의 RLS 를 다시 타서 꼬일 수 있어, 확인용 함수를 security definer 로 둔다.
-- ---------------------------------------------------------------
create function public.is_meeting_member(p_meeting_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.meeting_members m
    where m.meeting_id = p_meeting_id and m.user_id = (select auth.uid()) and m.left_at is null
  );
$$;

create function public.is_meeting_invitee(p_meeting_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.meeting_invites i
    where i.meeting_id = p_meeting_id and i.invitee_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_meeting_member(bigint) from public, anon;
revoke execute on function public.is_meeting_invitee(bigint) from public, anon;
grant execute on function public.is_meeting_member(bigint) to authenticated;
grant execute on function public.is_meeting_invitee(bigint) to authenticated;

alter table public.meetings enable row level security;
alter table public.meeting_members enable row level security;
alter table public.meeting_invites enable row level security;

revoke all on public.meetings, public.meeting_members, public.meeting_invites from anon, authenticated;
grant select on public.meetings, public.meeting_members, public.meeting_invites to authenticated;

create policy "공개 회의, 내가 들어 있거나 초대받은 회의만 본다"
  on public.meetings for select to authenticated
  using (
    (not is_private and ended_at is null)
    or host_id = (select auth.uid())
    or public.is_meeting_member(id)
    or public.is_meeting_invitee(id)
  );

create policy "내가 들어 있는 회의의 참가자만 본다"
  on public.meeting_members for select to authenticated
  using (public.is_meeting_member(meeting_id));

create policy "내가 받았거나 보낸 초대만 본다"
  on public.meeting_invites for select to authenticated
  using ((select auth.uid()) in (invitee_id, invited_by));

-- ---------------------------------------------------------------
-- 3. DB 함수 (만들기·참가·나가기·초대·목록·접속 신호)
-- ---------------------------------------------------------------

-- 내가 들어 있는 회의에서 나간다. 내가 마지막이면 회의를 끝낸다. (다른 함수가 안에서도 부름)
create function public.leave_meeting()
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
  update public.meetings set ended_at = now()
  where id = v_meeting and ended_at is null
    and not exists (select 1 from public.meeting_members where meeting_id = v_meeting and left_at is null);
end;
$$;

-- 빈 의자 중 가장 작은 번호. 가득 찼으면 null
create function public.free_meeting_seat(p_meeting_id bigint, p_capacity int)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select n from generate_series(1, p_capacity) as n
  where not exists (
    select 1 from public.meeting_members m
    where m.meeting_id = p_meeting_id and m.seat_no = n and m.left_at is null
  )
  order by n limit 1;
$$;

-- 회의 만들기. 만든 사람은 바로 1번 의자에 앉는다. 이름을 비우면 "닉네임의 회의"
create function public.create_meeting(p_branch_id bigint, p_title text, p_private boolean)
returns table (meeting_id bigint, seat_no int)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
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
  if v_title = '' then
    select p.nickname || '의 회의' into v_title from public.profiles p where p.id = v_user;
  end if;
  if char_length(v_title) > 30 then
    raise exception '회의 이름은 30자까지예요.' using errcode = '22001';
  end if;

  perform public.leave_meeting(); -- 다른 회의에 있으면 먼저 나간다
  insert into public.meetings (branch_id, host_id, title, is_private)
  values (p_branch_id, v_user, v_title, coalesce(p_private, false))
  returning id into v_id;
  insert into public.meeting_members (meeting_id, user_id, seat_no) values (v_id, v_user, 1);
  return query select v_id, 1;
end;
$$;

-- 회의 참가. 비공개면 만든 사람이거나 초대받아야 한다. 정원이 차면 들어갈 수 없다.
-- 같은 회의에 두 사람이 동시에 들어와도 회의 줄을 잠가(for update) 한 명씩 자리를 정한다.
create function public.join_meeting(p_meeting_id bigint)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_meeting public.meetings%rowtype;
  v_seat int;
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

  -- 이미 이 회의에 있으면 그 자리를 그대로 돌려준다(새로고침 등)
  select m.seat_no into v_seat from public.meeting_members m
  where m.meeting_id = p_meeting_id and m.user_id = v_user and m.left_at is null;
  if v_seat is not null then
    return v_seat;
  end if;

  perform public.leave_meeting(); -- 다른 회의에 있으면 먼저 나간다
  v_seat := public.free_meeting_seat(p_meeting_id, v_meeting.capacity);
  if v_seat is null then
    raise exception '회의실이 가득 찼어요.' using errcode = 'P0001';
  end if;
  insert into public.meeting_members (meeting_id, user_id, seat_no) values (p_meeting_id, v_user, v_seat);
  return v_seat;
end;
$$;

-- 친구 초대. 초대하는 사람은 그 비공개 회의에 들어 있어야 하고, 초대받는 사람과 친구(accepted)여야 한다.
create function public.invite_to_meeting(p_meeting_id bigint, p_friend uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.meeting_members m join public.meetings g on g.id = m.meeting_id
    where m.meeting_id = p_meeting_id and m.user_id = v_user and m.left_at is null and g.ended_at is null
  ) then
    raise exception '들어 있는 회의에만 초대할 수 있어요.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and least(f.requester_id, f.addressee_id) = least(v_user, p_friend)
      and greatest(f.requester_id, f.addressee_id) = greatest(v_user, p_friend)
  ) then
    raise exception '친구만 초대할 수 있어요.' using errcode = '42501';
  end if;
  insert into public.meeting_invites (meeting_id, invitee_id, invited_by)
  values (p_meeting_id, p_friend, v_user)
  on conflict (meeting_id, invitee_id) do nothing;
end;
$$;

-- 이 지점의 회의 목록: 열린 공개 회의 + 내가 초대받았거나 들어 있는 비공개 회의 (끝난 회의는 빼고)
create function public.list_meetings(p_branch_id bigint)
returns table (id bigint, title text, is_private boolean, host_nickname text, members int, capacity int, invited boolean, joined boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.title, g.is_private, p.nickname,
         (select count(*)::int from public.meeting_members m where m.meeting_id = g.id and m.left_at is null),
         g.capacity,
         exists (select 1 from public.meeting_invites i where i.meeting_id = g.id and i.invitee_id = (select auth.uid())),
         exists (select 1 from public.meeting_members m where m.meeting_id = g.id and m.user_id = (select auth.uid()) and m.left_at is null)
  from public.meetings g
  join public.profiles p on p.id = g.host_id
  where g.branch_id = p_branch_id and g.ended_at is null
    and (not g.is_private
         or g.host_id = (select auth.uid())
         or exists (select 1 from public.meeting_invites i where i.meeting_id = g.id and i.invitee_id = (select auth.uid()))
         or exists (select 1 from public.meeting_members m where m.meeting_id = g.id and m.user_id = (select auth.uid()) and m.left_at is null))
  order by g.created_at desc;
$$;

-- 회의 화면이 1분마다 부른다. 내가 아직 회의에 있다고 알린다.
create function public.meeting_heartbeat()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;
  update public.meeting_members set last_seen_at = now()
  where user_id = auth.uid() and left_at is null;
end;
$$;

-- 5분 넘게 소식이 없는 참가자를 내보내고, 사람이 없는 회의를 끝낸다. pg_cron 이 1분마다 부른다(사람이 부르지 않음).
create function public.release_disconnected_meetings()
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
  update public.meetings g set ended_at = now()
  where g.ended_at is null
    and not exists (select 1 from public.meeting_members m where m.meeting_id = g.id and m.left_at is null);
  return v_count;
end;
$$;

revoke execute on function public.leave_meeting() from public, anon;
revoke execute on function public.free_meeting_seat(bigint, int) from public, anon, authenticated;
revoke execute on function public.create_meeting(bigint, text, boolean) from public, anon;
revoke execute on function public.join_meeting(bigint) from public, anon;
revoke execute on function public.invite_to_meeting(bigint, uuid) from public, anon;
revoke execute on function public.list_meetings(bigint) from public, anon;
revoke execute on function public.meeting_heartbeat() from public, anon;
revoke execute on function public.release_disconnected_meetings() from public, anon, authenticated;
grant execute on function public.leave_meeting() to authenticated;
grant execute on function public.create_meeting(bigint, text, boolean) to authenticated;
grant execute on function public.join_meeting(bigint) to authenticated;
grant execute on function public.invite_to_meeting(bigint, uuid) to authenticated;
grant execute on function public.list_meetings(bigint) to authenticated;
grant execute on function public.meeting_heartbeat() to authenticated;

comment on table public.meetings is '회의실 안에서 따로 열리는 회의 (지점마다 공간은 하나, 회의는 여러 개). 공개/비공개, 정원 8 (#45)';
comment on table public.meeting_members is '회의 참가자와 원형 테이블 자리(1~8). left_at 이 비어 있으면 지금 들어 있음 (#45)';
comment on table public.meeting_invites is '비공개 회의 초대. 친구만 (#45)';

-- ---------------------------------------------------------------
-- 4. 회의 실시간 방 권한 (비공개 방 meeting:회의번호)
--    그 회의 참가자만 듣고(select) 보낸다(insert). 위치·고개 각도(broadcast), 접속(presence),
--    음성 연결 신호(#46, broadcast)가 모두 이 방으로 오간다.
-- ---------------------------------------------------------------
create function public.can_use_meeting_channel(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if split_part(p_topic, ':', 1) <> 'meeting' or split_part(p_topic, ':', 3) <> '' then
    return false;
  end if;
  begin
    v_id := split_part(p_topic, ':', 2)::bigint;
  exception when others then
    return false;
  end;
  return public.is_meeting_member(v_id);
end;
$$;

revoke execute on function public.can_use_meeting_channel(text) from public, anon;
grant execute on function public.can_use_meeting_channel(text) to authenticated;

create policy "회의 참가자만 회의 방을 듣는다"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and public.can_use_meeting_channel((select realtime.topic()))
  );

create policy "회의 참가자만 회의 방에 보낸다"
  on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and public.can_use_meeting_channel((select realtime.topic()))
  );

commit;

-- ---------------------------------------------------------------
-- 5. 예약 작업 등록 (0017 과 같은 방식. 트랜잭션 밖에서, 다시 돌려도 중복되지 않게)
-- ---------------------------------------------------------------
create extension if not exists pg_cron;
select cron.unschedule('release-disconnected-meetings')
where exists (select 1 from cron.job where jobname = 'release-disconnected-meetings');
select cron.schedule('release-disconnected-meetings', '* * * * *', 'select public.release_disconnected_meetings()');

-- 화면 쪽 API(PostgREST)가 새 표·함수를 바로 알도록 스키마 정보를 다시 읽게 한다.
notify pgrst, 'reload schema';
