-- 두뜀 0075: 같이 공부하는 봇 (#50)
--
-- 문제
--   접속한 사람이 적으면 광장·카페가 텅 비어, 함께 공부하는 긴장감이 없다.
--
-- 방법
--   봇을 DB 의 진짜 계정으로 두고, 1분마다 도는 예약 작업(bot_tick)이 사람처럼 움직인다. 화면은 bot_presence() 로 현황을 읽어 그리기만 한다.
--   진짜 계정이라 닉네임#태그·차림·프로필·공부 기록·순위·칭호가 사람과 똑같이 나온다.
--   1) 봇 계정 6개: 로그인할 수 없는 계정(이메일·비밀번호 없음). 가입 트리거(handle_new_user)가 프로필을 만든다
--   2) 실제 접속자(user_presence, 최근 2분) + 봇이 BOT_TARGET(6명)이 되도록 봇을 내보내거나 들여보낸다
--   3) 공부 45~55분, 휴식 2~10분. 봇마다·매번 새로 뽑아 서로 다르게 돈다
--   4) 공부를 시작할 때 빈자리를 골라 진짜로 자리를 잡는다(seat_sessions, 1채널). 그 자리에는 아무도 못 앉는다.
--      광장(벤치·캠프파이어)에 먼저 한 명씩, 나머지는 봇이 가장 적은 장소로 흩어진다. 같은 장소면 번호가 2 넘게 떨어진 자리
--   5) 공부하는 동안 5분마다 공부 기록(study_logs)을 남긴다 → 순위·프로필·칭호
--      사람처럼 보이도록 공부를 시작하는 시간은 서울 8시~24시, 하루 공부량은 봇마다 4~8시간까지(넘으면 그날은 나감)
--   6) 켜고 끄기: bot_settings.enabled. 팀(is_team, 0030)만 set_bots_enabled() 로 바꾼다. 처음에는 꺼져 있다
--
--   화면이 걸어 들어오는 모습을 그릴 수 있게, 자리를 잡은 뒤 ARRIVE_LEAD(45초) 뒤를 도착 시각으로 둔다(15초마다 읽으므로 미리 안다).
--   떠나는 시각(until_at)도 미리 알려, 화면이 그때 걸어 나가게 한다.
--
-- 적용할 DB: 서비스 Supabase (develop 머지 전). 실험 DB 에는 적용하지 않는다.
-- 봇 켜기는 화면이 배포된 뒤 설정 → 관리자 탭에서 한다 (옛 화면은 봇을 그리지 못해, 빈 자리처럼 보이는데 앉을 수 없게 된다).
-- 지우려면: delete from auth.users where id in (select user_id from public.bot_accounts); (프로필·기록이 같이 지워진다)
begin;

-- ---------------------------------------------------------------
-- 1. 표
-- ---------------------------------------------------------------
create table public.bot_settings (
  id         boolean primary key default true check (id), -- 한 줄만
  enabled    boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into public.bot_settings (id) values (true);
alter table public.bot_settings enable row level security;
create policy "로그인하면 봇 켜짐 여부를 읽는다" on public.bot_settings for select to authenticated using (true);
comment on table public.bot_settings is '같이 공부하는 봇 켜짐 여부 (#50). 바꾸기는 set_bots_enabled() (팀만).';

-- 봇이 앉을 수 있는 곳. 화면의 바로 앉기 장소(src/quickseat/places.ts)와 같은 자리 번호. priority 가 작은 곳부터 한 명씩 채운다
create table public.bot_places (
  key      text primary key,
  slug     text not null, -- branches.slug
  seats    int[] not null,
  priority int not null default 1
);
alter table public.bot_places enable row level security; -- 정책 없음: 함수만 읽는다
insert into public.bot_places (key, slug, seats, priority) values
  ('plaza-bench', 'plaza', '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16}', 0),
  ('plaza-campfire', 'plaza', '{17,18,19,20,21,22,23,24}', 0),
  ('campus', 'campus', '{1,2,3,4,5,6,7,8,9,10}', 1),
  ('beach', 'beach', '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24}', 1),
  ('olive', 'olive', '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24}', 1),
  ('moss', 'moss', '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26}', 1),
  ('moss-rooftop', 'moss-rooftop', '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20}', 1),
  ('stream', 'stream', '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,24,25,30,31,32}', 1),
  ('cambit-library', 'cambit-library', '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24}', 1),
  ('cambit-lecture', 'cambit-lecture', '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24}', 1),
  ('cambit-info', 'cambit-info', '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24}', 1),
  ('cambit-cafe', 'cambit-cafe', '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20}', 1);

create table public.bot_accounts (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  subject_id  bigint,
  state       text not null default 'off' check (state in ('off', 'studying', 'break')),
  place_key   text references public.bot_places (key) on delete set null,
  slug        text,          -- 지금(쉬는 중이면 마지막) 장소
  seat_number int,           -- 지금(쉬는 중이면 마지막) 자리
  session_id  uuid references public.seat_sessions (id) on delete set null,
  arrive_at   timestamptz,   -- 자리에 도착하는 시각 (공부 중일 때)
  until_at    timestamptz,   -- 지금 상태가 끝나는 시각 (공부 → 휴식, 휴식 → 공부)
  left_at     timestamptz,   -- 마지막으로 자리를 떠난 시각 (화면이 걸어 나가는 모습을 그림)
  logged_at   timestamptz    -- 공부 기록을 마지막으로 남긴 끝 시각
);
alter table public.bot_accounts enable row level security; -- 정책 없음: 함수만 읽는다
comment on table public.bot_accounts is '같이 공부하는 봇 계정과 지금 상태 (#50). bot_tick() 이 1분마다 움직인다.';

-- ---------------------------------------------------------------
-- 2. 봇 계정 (로그인 불가: 이메일·비밀번호 없음). 프로필은 가입 트리거가 만든다
-- ---------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change, is_anonymous)
values
  ('00000000-0000-0000-0000-000000000000', '7d89837f-ca0f-436f-8791-1fe3e95f494e', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "새벽공부"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '6389e534-8263-4a50-86f6-4f57da7e68a1', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "도토리"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'c0ff64c9-8e7b-4b17-ad90-77b7fed5c903', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "모카라떼"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'ec71ac05-6175-422d-bea0-ee5ecd244ad3', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "보리차"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '912a8f1b-c3d2-4dbb-bd4d-154b0058ab16', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "연필깎이"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '3246a53e-f2dd-4afd-9265-04a9e66fbbfa', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "구름빵"}', now(), now(), '', '', '', '', false)
on conflict (id) do nothing;

update public.profiles p
set avatar = v.avatar, visibility = 'public'
from (values
    ('7d89837f-ca0f-436f-8791-1fe3e95f494e'::uuid, '{"skin": "#f6d1a5", "eyes": "almond", "closedEyes": "new-2", "eyeColor": "#2a2420", "brows": "feather", "mouth": "soft-smile", "mouthOpen": "big-smile", "hair": "low-bun-textured", "hairColor": "#6b4a2f", "top": "stripe-sweater", "topColor": "#3f5f4f", "bottom": "light-jeans", "bottomColor": "#3f5f4f", "shoes": "sneakers", "shoesColor": "#f4f4f4", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('6389e534-8263-4a50-86f6-4f57da7e68a1'::uuid, '{"skin": "#e8b98a", "eyes": "lidded", "closedEyes": "new-1", "eyeColor": "#2a2420", "brows": "thin-arch", "mouth": "smile", "mouthOpen": "laugh", "hair": "side-swept-textured", "hairColor": "#5a3a24", "top": "longsleeve", "topColor": "#8b3a3a", "bottom": "dark-jeans", "bottomColor": "#b88a5a", "shoes": "sneakers", "shoesColor": "#f4f4f4", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('c0ff64c9-8e7b-4b17-ad90-77b7fed5c903'::uuid, '{"skin": "#e8b98a", "eyes": "new-3", "closedEyes": "new-3", "eyeColor": "#2a2420", "brows": "arched", "mouth": "soft-smile", "mouthOpen": "round-o", "hair": "ponytail-textured", "hairColor": "#5a3a24", "top": "me-crop-cardigan", "topColor": "#f1efe8", "bottom": "pants", "bottomColor": "#c9c2b4", "shoes": "boots", "shoesColor": "#2a2a2a", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('ec71ac05-6175-422d-bea0-ee5ecd244ad3'::uuid, '{"skin": "#f6d1a5", "eyes": "half", "closedEyes": "new-4", "eyeColor": "#2a2420", "brows": "flat", "mouth": "soft-smile", "mouthOpen": "teeth-grin", "hair": "undercut-textured", "hairColor": "#2b2220", "top": "two-tone-top", "topColor": "#d8d4cc", "bottom": "pants", "bottomColor": "#3f5f4f", "shoes": "sneakers", "shoesColor": "#f4f4f4", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('912a8f1b-c3d2-4dbb-bd4d-154b0058ab16'::uuid, '{"skin": "#f6d1a5", "eyes": "tall", "closedEyes": "new-1", "eyeColor": "#2a2420", "brows": "bold", "mouth": "smile", "mouthOpen": "big-smile", "hair": "spiky-up-textured", "hairColor": "#4a3426", "top": "tshirt", "topColor": "#7a8c6e", "bottom": "light-jeans", "bottomColor": "#b88a5a", "shoes": "sneakers", "shoesColor": "#f4f4f4", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('3246a53e-f2dd-4afd-9265-04a9e66fbbfa'::uuid, '{"skin": "#e8b98a", "eyes": "side-glance", "closedEyes": "new-5", "eyeColor": "#2a2420", "brows": "wave", "mouth": "soft-smile", "mouthOpen": "laugh", "hair": "twin-braids-textured", "hairColor": "#3b2a20", "top": "stripe-sweater", "topColor": "#8b3a3a", "bottom": "dark-jeans", "bottomColor": "#4a5a6a", "shoes": "ribbon-boots", "shoesColor": "#6a4a35", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb)
) as v(id, avatar)
where p.id = v.id;

insert into public.bot_accounts (user_id)
select v.id from (values ('7d89837f-ca0f-436f-8791-1fe3e95f494e'::uuid), ('6389e534-8263-4a50-86f6-4f57da7e68a1'::uuid), ('c0ff64c9-8e7b-4b17-ad90-77b7fed5c903'::uuid), ('ec71ac05-6175-422d-bea0-ee5ecd244ad3'::uuid), ('912a8f1b-c3d2-4dbb-bd4d-154b0058ab16'::uuid), ('3246a53e-f2dd-4afd-9265-04a9e66fbbfa'::uuid)) as v(id)
on conflict do nothing;

insert into public.subjects (user_id, name)
select user_id, '공부' from public.bot_accounts
on conflict (user_id, name) do nothing;
update public.bot_accounts b set subject_id = s.id
from public.subjects s where s.user_id = b.user_id and s.name = '공부';

-- ---------------------------------------------------------------
-- 3. 공부 기록 한 조각: logged_at 부터 p_until 까지 (30초가 안 되면 넘김). 검사(check_study_log)에 걸리면 그 조각만 버린다
-- ---------------------------------------------------------------
create function public.bot_log(p_bot uuid, p_until timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bot_accounts;
begin
  select * into b from public.bot_accounts where user_id = p_bot;
  if b.state <> 'studying' or b.session_id is null or b.logged_at is null or p_until < b.logged_at + interval '30 seconds' then
    return;
  end if;
  begin
    insert into public.study_logs (user_id, session_id, subject_id, started_at, ended_at, focused_seconds)
    values (p_bot, b.session_id, b.subject_id, b.logged_at, p_until, floor(extract(epoch from (p_until - b.logged_at)))::int);
  exception when others then
    null; -- 겹침 등: 이 조각만 버리고 다음 조각으로
  end;
  update public.bot_accounts set logged_at = p_until where user_id = p_bot;
end;
$$;

-- ---------------------------------------------------------------
-- 3-1. 지금 공부를 시작해도 되는지: 서울 8시~24시이고, 오늘 공부량이 그 봇의 하루 상한(4~8시간, 봇마다 고정) 아래
-- ---------------------------------------------------------------
create function public.bot_can_study(p_bot uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select extract(hour from (now() at time zone 'Asia/Seoul')) between 8 and 23
     and coalesce((
           select sum(l.focused_seconds) from public.study_logs l
           where l.user_id = p_bot
             and l.started_at >= ((now() at time zone 'Asia/Seoul')::date)::timestamp at time zone 'Asia/Seoul'
         ), 0) < (4 + ((hashtext(p_bot::text) % 5) + 5) % 5) * 3600; -- 봇마다 4~8시간
$$;

-- ---------------------------------------------------------------
-- 4. 공부 시작: 장소·빈자리를 골라 자리를 잡는다. 못 잡으면 false
-- ---------------------------------------------------------------
create function public.bot_start(p_bot uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_arrive_lead constant interval := interval '45 seconds'; -- 자리를 잡고 화면에서 도착하기까지 (걸어 들어오는 모습)
  v_minutes     constant int := 720;
  pl            record;
  v_seat        int;
  v_seat_id     bigint;
  v_pass        uuid;
  v_session     uuid;
  v_arrive      timestamptz;
begin
  if not public.bot_can_study(p_bot) then
    return false;
  end if;

  -- 남아 있는 내 자리 기록이 있으면 정리 (한 사람은 자리 하나만)
  update public.seat_sessions set ended_at = now(), end_reason = 'returned' where user_id = p_bot and ended_at is null;

  -- 장소: 봇이 적은 곳 → 같으면 우선순위(광장 먼저) → 무작위. 그래서 광장 두 곳에 한 명씩 앉은 뒤 다른 장소로 흩어진다
  for pl in
    select p.key, p.slug, p.seats, br.id as branch_id
    from public.bot_places p
    join public.branches br on br.slug = p.slug
    order by (select count(*) from public.bot_accounts a where a.place_key = p.key and a.state = 'studying'),
             p.priority,
             random()
  loop
    -- 자리: 무작위 순서. 사람이든 봇이든 앉은 자리, 같은 장소의 다른 봇과 번호가 2 이하로 가까운 자리는 건너뜀
    for v_seat in
      select n from unnest(pl.seats) as n
      where not exists (
          select 1 from public.seat_sessions ss join public.seats st on st.id = ss.seat_id
          where st.branch_id = pl.branch_id and st.seat_number = n and ss.ended_at is null and ss.channel = 1)
        and not exists (
          select 1 from public.bot_accounts a
          where a.state = 'studying' and a.slug = pl.slug and abs(a.seat_number - n) <= 2)
      order by random()
    loop
      select id into v_seat_id from public.seats where branch_id = pl.branch_id and seat_number = v_seat;
      continue when v_seat_id is null;
      begin
        insert into public.passes (user_id, branch_id, duration_minutes) values (p_bot, pl.branch_id, v_minutes) returning id into v_pass;
        insert into public.seat_sessions (user_id, seat_id, pass_id, expires_at, channel)
        values (p_bot, v_seat_id, v_pass, now() + make_interval(mins => v_minutes), 1)
        returning id into v_session;
      exception when unique_violation then
        continue; -- 그사이 누가 앉음
      end;
      v_arrive := now() + v_arrive_lead;
      update public.bot_accounts
      set state = 'studying', place_key = pl.key, slug = pl.slug, seat_number = v_seat, session_id = v_session,
          arrive_at = v_arrive, logged_at = v_arrive,
          until_at = v_arrive + make_interval(mins => 45 + floor(random() * 11)::int) -- 공부 45~55분
      where user_id = p_bot;
      return true;
    end loop;
  end loop;
  return false;
end;
$$;

-- ---------------------------------------------------------------
-- 5. 자리 떠나기: 마지막 공부 기록을 남기고 자리를 놓는다. p_state: 'break'(쉬러) 또는 'off'(나감)
-- ---------------------------------------------------------------
create function public.bot_leave(p_bot uuid, p_state text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b      public.bot_accounts;
  v_left timestamptz;
begin
  select * into b from public.bot_accounts where user_id = p_bot;
  if b.state = 'studying' then
    -- 화면은 until_at 에 걸어 나감. 아직 도착 전이면 화면에 나타난 적이 없으므로 걸어 나가는 모습도 없음(null)
    v_left := case when now() < b.arrive_at then null else least(b.until_at, now()) end;
    perform public.bot_log(p_bot, coalesce(v_left, now()));
    update public.seat_sessions set ended_at = now(), end_reason = 'returned' where id = b.session_id and ended_at is null;
  else
    v_left := b.left_at; -- 이미 쉬는 중: 걸어 나간 시각 그대로
  end if;
  update public.bot_accounts
  set state = p_state, session_id = null, left_at = v_left, arrive_at = null, logged_at = null,
      until_at = case when p_state = 'break' then now() + make_interval(mins => 2 + floor(random() * 9)::int) else null end -- 휴식 2~10분
  where user_id = p_bot;
end;
$$;

-- ---------------------------------------------------------------
-- 6. 1분마다: 접속 신호, 공부 기록, 공부↔휴식, 인원 맞추기
-- ---------------------------------------------------------------
create function public.bot_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target constant int := 6; -- 실제 접속자 + 봇이 이 인원이 되게 (봇 계정 수까지)
  v_enabled boolean;
  v_real    int;
  v_want    int;
  v_active  int;
  r         record;
begin
  perform pg_advisory_xact_lock(hashtext('bot_tick')); -- 예약 작업과 켜기·끄기가 겹치지 않게

  v_enabled := coalesce((select enabled from public.bot_settings), false);
  select count(*) into v_real
  from public.user_presence p
  where p.last_seen_at > now() - interval '2 minutes'
    and not exists (select 1 from public.bot_accounts a where a.user_id = p.user_id);
  v_want := case when v_enabled then greatest(0, least((select count(*) from public.bot_accounts)::int, v_target - v_real)) else 0 end;

  -- 공부가 끝난 봇은 쉬러, 휴식이 끝난 봇은 다시 빈자리로
  for r in select user_id from public.bot_accounts where state = 'studying' and until_at <= now() loop
    perform public.bot_leave(r.user_id, 'break');
  end loop;
  for r in select user_id from public.bot_accounts where state = 'break' and until_at <= now() loop
    if not public.bot_start(r.user_id) then
      perform public.bot_leave(r.user_id, 'off'); -- 밤이거나 오늘 공부량을 채웠거나 빈자리가 없음: 나감 (아래에서 다른 봇이 채움)
    end if;
  end loop;

  -- 인원 맞추기: 많으면 쉬는 봇부터 내보내고, 적으면 들여보냄
  select count(*) into v_active from public.bot_accounts where state <> 'off';
  if v_active > v_want then
    for r in select user_id from public.bot_accounts where state <> 'off'
             order by (state = 'break') desc, random() limit v_active - v_want loop
      perform public.bot_leave(r.user_id, 'off');
    end loop;
  elsif v_active < v_want then
    -- 공부할 수 있는 봇(시간·하루 공부량)을 찾을 때까지 차례로 해 봄
    for r in select user_id from public.bot_accounts where state = 'off' order by random() loop
      exit when v_active >= v_want;
      if public.bot_start(r.user_id) then
        v_active := v_active + 1;
      end if;
    end loop;
  end if;

  -- 공부 기록: 5분마다 한 조각
  for r in select user_id from public.bot_accounts where state = 'studying' and logged_at <= now() - interval '5 minutes' loop
    perform public.bot_log(r.user_id, now());
  end loop;

  -- 접속 신호: 자리 자동 반납(0017)에 걸리지 않게, 친구 목록 마지막 접속(0073)도 사람처럼
  update public.seat_sessions ss set last_seen_at = now()
  from public.bot_accounts a where a.session_id = ss.id and ss.ended_at is null;
  insert into public.user_presence (user_id, last_seen_at)
  select user_id, now() from public.bot_accounts where state <> 'off'
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at;
end;
$$;

-- ---------------------------------------------------------------
-- 7. 화면이 읽는 현황 (15초마다). 공부·휴식 중인 봇과 방금 나간 봇(걸어 나가는 모습)
-- ---------------------------------------------------------------
create function public.bot_presence()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'now', now(),
    'bots', coalesce(jsonb_agg(jsonb_build_object(
      'id', a.user_id, 'nickname', p.nickname, 'avatar', p.avatar, 'state', a.state,
      'slug', a.slug, 'seat', a.seat_number, 'arrive_at', a.arrive_at, 'until_at', a.until_at, 'left_at', a.left_at
    )), '[]'::jsonb))
  from public.bot_accounts a
  join public.profiles p on p.id = a.user_id
  where (select enabled from public.bot_settings) and (a.state <> 'off' or a.left_at > now() - interval '1 minute');
$$;

-- 켜고 끄기 (팀만). 바로 한 번 움직여, 끄면 곧바로 자리를 놓는다
create function public.set_bots_enabled(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_team() then
    raise exception '팀원만 바꿀 수 있습니다.' using errcode = '42501';
  end if;
  update public.bot_settings set enabled = p_enabled, updated_at = now(), updated_by = auth.uid() where id; -- 한 줄뿐 (where 없는 update 를 막는 설정 대비)
  perform public.bot_tick();
  return p_enabled;
end;
$$;

revoke execute on function public.bot_log(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.bot_can_study(uuid) from public, anon, authenticated;
revoke execute on function public.bot_start(uuid) from public, anon, authenticated;
revoke execute on function public.bot_leave(uuid, text) from public, anon, authenticated;
revoke execute on function public.bot_tick() from public, anon, authenticated;
revoke execute on function public.bot_presence() from public, anon;
grant execute on function public.bot_presence() to authenticated;
revoke execute on function public.set_bots_enabled(boolean) from public, anon;
grant execute on function public.set_bots_enabled(boolean) to authenticated;

commit;

-- 예약 작업 (트랜잭션 밖, 0071 과 같은 방식. 다시 실행해도 중복되지 않음). 1분마다
create extension if not exists pg_cron;

select cron.unschedule('study-bots-tick')
where exists (select 1 from cron.job where jobname = 'study-bots-tick');

select cron.schedule('study-bots-tick', '* * * * *', $$ select public.bot_tick(); $$);

notify pgrst, 'reload schema';
