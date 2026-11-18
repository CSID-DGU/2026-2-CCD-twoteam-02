-- 두뜀 0073: 친구 목록에 마지막 접속 시각 보여 주기
--
-- 문제
--   친구 목록은 실시간 접속 목록만 봐서, 접속하지 않은 친구는 "접속 안 함"으로만 보인다.
--   언제 마지막으로 들어왔는지는 어디에도 저장하지 않았다.
--   (seat_sessions.last_seen_at 은 자리에 앉아 있는 동안만 갱신되고, 자리를 반납하면 그 자리 기록에 묶인다)
--
-- 방법
--   1) user_presence: 사람마다 한 줄, 마지막 접속 신호 시각.
--      profiles 에 칸을 넣지 않은 이유: 1분마다 프로필 줄을 고치게 되고, 프로필을 읽는 정책(공개 범위)과 섞인다.
--   2) heartbeat(): 화면이 이미 1분마다 부르는 접속 신호(0017, 앱 전체에서 돎)가 이 줄도 같이 갱신한다.
--      화면에서 새 요청을 보내지 않는다. 돌려주는 값과 나머지 동작은 0017 그대로다.
--   3) friends_last_seen(): 수락된 친구의 시각만 돌려준다. 표는 RLS 를 켜고 정책을 두지 않아 직접 읽을 수 없다.
--      요청 중인 사람이나 친구가 아닌 사람의 접속 시각은 볼 수 없다.
--
-- 적용할 DB: 서비스 Supabase (develop 머지 전). 운영 Supabase 는 main 에 올리기 전.
--   이 파일을 적용하기 전에 마지막으로 접속한 사람은 줄이 없어, 다시 접속할 때까지 화면에 "접속 안 함"으로 보인다.
begin;

-- ---------------------------------------------------------------
-- 1. 표
-- ---------------------------------------------------------------
create table public.user_presence (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

comment on table public.user_presence is
  '사람마다 마지막 접속 신호 시각. heartbeat() 가 1분마다 갱신하고 friends_last_seen() 으로 친구만 읽는다. (0073)';

alter table public.user_presence enable row level security;
revoke all on public.user_presence from anon, authenticated;
-- 정책을 두지 않는다: 화면은 아래 함수로만 넣고 읽는다.

-- ---------------------------------------------------------------
-- 2. 접속 신호 (0017 과 같고, 마지막 접속 시각 갱신만 더했다)
-- ---------------------------------------------------------------
create or replace function public.heartbeat()
returns table (kind text, number int, expires_at timestamptz, expired boolean)
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

  -- 마지막 접속 시각 (자리가 없어도 남긴다)
  insert into public.user_presence (user_id, last_seen_at)
  values (v_user, now())
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at;

  update public.seat_sessions set last_seen_at = now()
  where user_id = v_user and ended_at is null;

  update public.room_sessions set last_seen_at = now()
  where user_id = v_user and ended_at is null;

  return query
    select 'seat', s.seat_number, ss.expires_at, ss.expires_at <= now()
    from public.seat_sessions ss
    join public.seats s on s.id = ss.seat_id
    where ss.user_id = v_user and ss.ended_at is null
    union all
    select 'room', r.room_number, rs.expires_at, rs.expires_at <= now()
    from public.room_sessions rs
    join public.rooms r on r.id = rs.room_id
    where rs.user_id = v_user and rs.ended_at is null;
end;
$$;
-- create or replace 는 실행 권한(0017: authenticated 만)을 유지한다.

-- ---------------------------------------------------------------
-- 3. 친구의 마지막 접속 시각 (수락된 친구만)
-- ---------------------------------------------------------------
create function public.friends_last_seen()
returns table (user_id uuid, last_seen_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.last_seen_at
  from public.friendships f
  join public.user_presence p
    on p.user_id = case when f.requester_id = (select auth.uid()) then f.addressee_id else f.requester_id end
  where f.status = 'accepted'
    and (select auth.uid()) in (f.requester_id, f.addressee_id);
$$;

revoke execute on function public.friends_last_seen() from public, anon;
grant execute on function public.friends_last_seen() to authenticated;

comment on function public.friends_last_seen() is
  '수락된 친구들의 마지막 접속 시각. 친구 목록의 "마지막 접속 N분 전"에 쓴다. (0073)';

commit;

-- 화면 쪽 API(PostgREST)가 새 함수를 바로 알도록 스키마 정보를 다시 읽게 한다.
notify pgrst, 'reload schema';
