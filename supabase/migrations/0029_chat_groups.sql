-- 두뜀 0029: 그룹 채팅 — 오버워치식 파티 (#298)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
-- 0012(친구)를 먼저 실행해 두어야 한다.
--
-- 배경:
--   친구를 그룹(파티)에 초대해 그룹끼리 채팅한다. 귓속말(0019)의 그룹판이다.
--   - 한 사람은 그룹 하나에만 들어간다. 그룹 이름은 없다.
--   - 친구에게 초대를 보내고, 받은 사람이 수락하면 들어간다. 초대는 5분 뒤에 사라진다.
--     · 보낸 사람이 그룹이 없으면, 수락할 때 두 사람의 그룹이 새로 생긴다(혼자 있는 그룹은 만들지 않음).
--     · 받은 사람이 다른 그룹에 있었으면 그 그룹에서 나와 옮겨 간다.
--   - 멤버 누구나 자기 친구를 초대할 수 있다. 멤버끼리는 친구가 아니어도 된다. 10명까지.
--   - 나가서 한 명만 남으면 그룹이 없어진다.
--   (회의실 안의 채팅은 회의 방(0021)으로 따로 하므로 이 파일과 상관없다)
--
-- 메시지는 저장하지 않는다 (0019 와 같음):
--   그룹 채팅은 브라우저끼리 비공개 실시간 방(group:{그룹 번호})으로 주고받기만 한다.
--   보낸 사람은 메시지에 적어 보내고, 받는 쪽이 그 사람이 멤버인지 확인한다.
--   (방에 들어올 수 있는 건 멤버뿐이라 바깥 사람은 보낼 수 없다. 멤버끼리 이름을 속이는 것까지는 막지 못한다)
--
-- 권한 (CLAUDE.md 절대 규칙: RLS):
--   - 조회: 내 그룹과 그 멤버, 내가 보냈거나 받은 초대만
--   - 표에 직접 쓰지 못한다. 초대·수락·거절·나가기는 아래 DB 함수로만 한다(친구·인원 확인을 DB 가 한다).
--
-- 다시 실행하기:
--   이 파일의 첫 버전(그룹 이름이 있고 여러 그룹에 들어가던 것)을 이미 실행한 DB 도 이 파일만 실행하면 된다.
--   맨 앞에서 이 파일이 만드는 표·함수·규칙(첫 버전 것 포함)을 지우고 새로 만들어서, 몇 번 실행해도 된다.
--   대신 실행할 때마다 있던 그룹·초대는 모두 지워진다. 처음 실행하는 DB 에서는 지울 것이 없어 그냥 넘어간다.

begin;

-- ---------------------------------------------------------------
-- 0. 첫 버전(과 이 파일을 한 번 실행한 것) 지우기. 없으면 넘어간다.
-- ---------------------------------------------------------------
drop policy if exists "그룹 멤버만 그룹 방을 듣는다" on realtime.messages;
drop policy if exists "그룹 멤버만 그룹 방에 보낸다" on realtime.messages;
drop function if exists public.can_use_group_channel(text);
drop function if exists public.create_chat_group(text, uuid[]); -- 첫 버전
drop function if exists public.add_chat_group_member(bigint, uuid); -- 첫 버전
drop function if exists public.leave_chat_group(bigint); -- 첫 버전
drop function if exists public.leave_chat_group();
drop function if exists public.invite_to_chat_group(uuid);
drop function if exists public.accept_chat_group_invite(uuid);
drop function if exists public.decline_chat_group_invite(uuid);
drop function if exists public.chat_group_remove(uuid);
drop table if exists public.chat_group_invites;
drop table if exists public.chat_group_members;
drop table if exists public.chat_groups;
drop function if exists public.is_chat_group_member(bigint);
drop function if exists public.chat_are_friends(uuid, uuid);

-- ---------------------------------------------------------------
-- 1. 표
-- ---------------------------------------------------------------
create table public.chat_groups (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

-- 한 사람은 그룹 하나에만 있으므로 사람(user_id)이 기본 키다.
create table public.chat_group_members (
  user_id   uuid primary key references public.profiles (id) on delete cascade,
  group_id  bigint not null references public.chat_groups (id) on delete cascade,
  joined_at timestamptz not null default now()
);
create index chat_group_members_group_idx on public.chat_group_members (group_id);

-- 초대: "보낸 사람이 지금 있는 그룹으로 오라"는 뜻. 같은 두 사람 사이에는 하나만 두고, 다시 보내면 시각만 새로 한다.
create table public.chat_group_invites (
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (inviter_id, invitee_id),
  check (inviter_id <> invitee_id)
);
create index chat_group_invites_invitee_idx on public.chat_group_invites (invitee_id);

-- ---------------------------------------------------------------
-- 2. 확인용 함수
--    정책 안에서 같은 표를 다시 읽으면 RLS 가 꼬일 수 있어 security definer 로 둔다(0021 과 같은 방식).
-- ---------------------------------------------------------------
create function public.is_chat_group_member(p_group_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_group_members m
    where m.group_id = p_group_id and m.user_id = (select auth.uid())
  );
$$;

-- 두 사람이 친구(accepted)인지. 아래 함수들 안에서만 쓴다.
create function public.chat_are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and least(f.requester_id, f.addressee_id) = least(p_a, p_b)
      and greatest(f.requester_id, f.addressee_id) = greatest(p_a, p_b)
  );
$$;

-- 그 사람을 그룹에서 뺀다. 한 명만 남으면 그룹을 없앤다(남은 사람도 같이 빠짐). 아래 함수들 안에서만 쓴다.
create function public.chat_group_remove(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group bigint;
begin
  delete from public.chat_group_members where user_id = p_user returning group_id into v_group;
  if v_group is null then
    return;
  end if;
  delete from public.chat_groups g
  where g.id = v_group
    and (select count(*) from public.chat_group_members m where m.group_id = g.id) < 2;
end;
$$;

revoke execute on function public.is_chat_group_member(bigint) from public, anon;
revoke execute on function public.chat_are_friends(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.chat_group_remove(uuid) from public, anon, authenticated;
grant execute on function public.is_chat_group_member(bigint) to authenticated;

-- ---------------------------------------------------------------
-- 3. 권한 (RLS)
-- ---------------------------------------------------------------
alter table public.chat_groups enable row level security;
alter table public.chat_group_members enable row level security;
alter table public.chat_group_invites enable row level security;

revoke all on public.chat_groups, public.chat_group_members, public.chat_group_invites from anon, authenticated;
grant select on public.chat_groups, public.chat_group_members, public.chat_group_invites to authenticated;

create policy "내 그룹만 본다"
  on public.chat_groups for select to authenticated
  using (public.is_chat_group_member(id));

create policy "내 그룹의 멤버만 본다"
  on public.chat_group_members for select to authenticated
  using (public.is_chat_group_member(group_id));

create policy "내가 보냈거나 받은 그룹 초대만 본다"
  on public.chat_group_invites for select to authenticated
  using ((select auth.uid()) in (inviter_id, invitee_id));

-- ---------------------------------------------------------------
-- 4. DB 함수 (초대·수락·거절·나가기)
--    그룹이 생기고 사람이 옮겨 다니는 일이 동시에 겹치지 않도록, 바꾸는 함수는 모두 같은 잠금(번호 298)을 잡고 한 번에 하나씩 한다.
--    (사람이 적고 자주 일어나는 일이 아니라 하나씩 해도 느리지 않다)
-- ---------------------------------------------------------------

-- 친구를 내 그룹으로 초대한다. 내가 그룹이 없으면 친구가 수락할 때 둘의 그룹이 생긴다.
create function public.invite_to_chat_group(p_friend uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_group bigint;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;
  perform pg_advisory_xact_lock(298);
  if p_friend is null or p_friend = v_user or not public.chat_are_friends(v_user, p_friend) then
    raise exception '친구만 그룹에 초대할 수 있어요.' using errcode = '42501';
  end if;
  select group_id into v_group from public.chat_group_members where user_id = v_user;
  if v_group is not null then
    if exists (select 1 from public.chat_group_members where user_id = p_friend and group_id = v_group) then
      raise exception '이미 같은 그룹이에요.' using errcode = 'P0001';
    end if;
    if (select count(*) from public.chat_group_members where group_id = v_group) >= 10 then
      raise exception '그룹은 10명까지예요.' using errcode = 'P0001';
    end if;
  end if;
  -- 5분 지난 초대는 치운다.
  delete from public.chat_group_invites where created_at < now() - interval '5 minutes';
  insert into public.chat_group_invites (inviter_id, invitee_id) values (v_user, p_friend)
  on conflict (inviter_id, invitee_id) do update set created_at = now();
end;
$$;

-- 받은 초대를 수락한다. 지금 그룹이 있으면 나와서 보낸 사람의 그룹으로 옮긴다. 들어간 그룹 번호를 돌려준다.
create function public.accept_chat_group_invite(p_inviter uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_group bigint;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;
  perform pg_advisory_xact_lock(298);
  delete from public.chat_group_invites
  where inviter_id = p_inviter and invitee_id = v_user and created_at >= now() - interval '5 minutes';
  if not found then
    raise exception '초대가 없거나 5분이 지나 사라졌어요.' using errcode = 'P0002';
  end if;
  if not public.chat_are_friends(v_user, p_inviter) then
    raise exception '친구의 초대만 받을 수 있어요.' using errcode = '42501';
  end if;

  select group_id into v_group from public.chat_group_members where user_id = p_inviter;
  -- 이미 같은 그룹이면 그대로
  if v_group is not null and exists (select 1 from public.chat_group_members where user_id = v_user and group_id = v_group) then
    return v_group;
  end if;
  if v_group is not null and (select count(*) from public.chat_group_members where group_id = v_group) >= 10 then
    raise exception '그룹이 가득 찼어요. (10명)' using errcode = 'P0001';
  end if;

  -- 지금 그룹에서 나온다. (그 그룹에 한 명만 남으면 없어짐)
  perform public.chat_group_remove(v_user);

  if v_group is null then
    -- 보낸 사람이 그룹이 없으면 둘의 그룹을 새로 만든다.
    insert into public.chat_groups default values returning id into v_group;
    insert into public.chat_group_members (user_id, group_id) values (p_inviter, v_group);
  end if;
  insert into public.chat_group_members (user_id, group_id) values (v_user, v_group);
  return v_group;
end;
$$;

-- 받은 초대를 거절한다(지운다).
create function public.decline_chat_group_invite(p_inviter uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;
  delete from public.chat_group_invites where inviter_id = p_inviter and invitee_id = auth.uid();
end;
$$;

-- 그룹에서 나간다. 한 명만 남으면 그룹이 없어진다.
create function public.leave_chat_group()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;
  perform pg_advisory_xact_lock(298);
  perform public.chat_group_remove(auth.uid());
end;
$$;

revoke execute on function public.invite_to_chat_group(uuid) from public, anon;
revoke execute on function public.accept_chat_group_invite(uuid) from public, anon;
revoke execute on function public.decline_chat_group_invite(uuid) from public, anon;
revoke execute on function public.leave_chat_group() from public, anon;
grant execute on function public.invite_to_chat_group(uuid) to authenticated;
grant execute on function public.accept_chat_group_invite(uuid) to authenticated;
grant execute on function public.decline_chat_group_invite(uuid) to authenticated;
grant execute on function public.leave_chat_group() to authenticated;

comment on table public.chat_groups is '그룹 채팅의 그룹(파티) (#298). 이름 없음, 메시지는 저장하지 않는다';
comment on table public.chat_group_members is '그룹 멤버. 한 사람은 그룹 하나에만, 그룹은 10명까지 (#298)';
comment on table public.chat_group_invites is '그룹 초대. 보낸 사람의 그룹으로 오라는 뜻이고 5분 뒤 사라진다 (#298)';

-- ---------------------------------------------------------------
-- 5. 그룹 실시간 방 권한 (비공개 방 group:그룹번호, 브로드캐스트만)
--    그 그룹 멤버만 듣고(select) 보낸다(insert). 0019 의 귓속말 방 규칙과 나란히 붙는다.
-- ---------------------------------------------------------------
create function public.can_use_group_channel(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if split_part(p_topic, ':', 1) <> 'group' or split_part(p_topic, ':', 3) <> '' then
    return false;
  end if;
  begin
    v_id := split_part(p_topic, ':', 2)::bigint;
  exception when others then
    return false;
  end;
  return public.is_chat_group_member(v_id);
end;
$$;

revoke execute on function public.can_use_group_channel(text) from public, anon;
grant execute on function public.can_use_group_channel(text) to authenticated;

create policy "그룹 멤버만 그룹 방을 듣는다"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and public.can_use_group_channel((select realtime.topic()))
  );

create policy "그룹 멤버만 그룹 방에 보낸다"
  on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and public.can_use_group_channel((select realtime.topic()))
  );

commit;

-- 화면 쪽 API(PostgREST)가 새 표·함수를 바로 알도록 스키마 정보를 다시 읽게 한다.
notify pgrst, 'reload schema';
