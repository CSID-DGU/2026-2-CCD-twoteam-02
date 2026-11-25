-- 두뜀 0076: 같이 공부하는 봇 늘리기 (#50)
--
-- 0075 의 봇은 6명이고 "실제 접속자 + 봇 = 6명"이 bot_tick 안에 박혀 있었다.
--   1) 봇 계정 18개를 더해 24개로 늘린다 (닉네임·차림은 0075 와 같은 방식, 차림은 무난한 부품 안에서 무작위)
--   2) 목표 인원을 bot_settings.target 으로 빼서 설정 → 관리자 탭(팀만)에서 바꾼다. 기본 15명
--      장소가 12곳이라 장소마다 1~2명씩 흩어진다. 봇은 중계 서버 채널 정원에 들어가지 않는다(채널 배정은 실제 연결만 셈)
--   3) set_bots_target(): 팀만 바꿀 수 있고, 바꾸면 바로 한 번 움직인다
--
-- 적용할 DB: 서비스 Supabase (0075 다음, develop 머지 전). 실험 DB 에는 적용하지 않는다.
begin;

-- ---------------------------------------------------------------
-- 1. 목표 인원
-- ---------------------------------------------------------------
alter table public.bot_settings
  add column target int not null default 15 check (target between 0 and 100);
comment on column public.bot_settings.target is '실제 접속자 + 봇이 이 인원이 되도록 봇을 내보낸다 (봇 계정 수까지). 설정 → 관리자 탭에서 바꾼다. (0076)';

create or replace function public.bot_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target int; -- 실제 접속자 + 봇이 이 인원이 되게 (봇 계정 수까지). bot_settings.target (0076)
  v_enabled boolean;
  v_real    int;
  v_want    int;
  v_active  int;
  r         record;
begin
  perform pg_advisory_xact_lock(hashtext('bot_tick')); -- 예약 작업과 켜기·끄기가 겹치지 않게

  select coalesce(s.enabled, false), coalesce(s.target, 0) into v_enabled, v_target from public.bot_settings s;
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

create function public.set_bots_target(p_target int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_team() then
    raise exception '팀원만 바꿀 수 있습니다.' using errcode = '42501';
  end if;
  if p_target is null or p_target not between 0 and 100 then
    raise exception '인원은 0~100명입니다.' using errcode = '22023';
  end if;
  update public.bot_settings set target = p_target, updated_at = now(), updated_by = auth.uid() where id;
  perform public.bot_tick();
  return p_target;
end;
$$;

revoke execute on function public.bot_tick() from public, anon, authenticated;
revoke execute on function public.set_bots_target(int) from public, anon;
grant execute on function public.set_bots_target(int) to authenticated;

-- ---------------------------------------------------------------
-- 2. 봇 계정 18개 더 (로그인 불가: 이메일·비밀번호 없음). 프로필은 가입 트리거가 만든다
-- ---------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change, is_anonymous)
values
  ('00000000-0000-0000-0000-000000000000', 'cae439b0-98a8-43df-9e4f-729de9fc7058', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "오늘도화이팅"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '41f99ad7-1ad6-4865-9f04-d2464f0021ea', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "감자칩"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'e1f98154-d9e6-4e87-8ac6-fea8a97c5e1c', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "밤샘금지"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'd095b035-37fa-48be-8cd6-3cbf129d69bb', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "민트초코"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'f748e8ea-8ffe-4b51-aa20-8874e404bce0', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "고양이집사"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'f8ed28d2-cbfd-4926-90b4-e34c160547a2', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "토익900"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'b513efc6-8cd5-467d-8d2a-9532eaebbc60', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "코딩하는곰"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'd2cc910d-0c9e-4bda-ae26-75c0d5060a57', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "합격기원"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'ec700576-185c-4c19-b875-fb1e5fd0b241', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "아메리카노"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '1b5979ae-f728-4000-8b88-a11c2bf4bb0a', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "햇살한줌"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '44b4ed29-52cc-4b5a-904c-7091aa24745e', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "몽글몽글"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '589e633e-46ae-426e-ac14-96b9dab653cc', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "공시생"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'ca1e6648-c9dc-4a3a-8e46-b692e7639cda', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "달빛산책"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '6bba3081-24f9-477a-85ad-360e4c9326b1', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "책벌레"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '33866c5b-a988-4202-b3d9-6a058d87a5fd', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "초코칩쿠키"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'dc947902-9630-48df-b85a-562db876ec7f', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "열공모드"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'ed48e3cf-bdd5-40be-88e5-77947ba88651', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "느긋한판다"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '781353ec-0ea8-4f11-9d77-4586e7c3bd93', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "한걸음씩"}', now(), now(), '', '', '', '', false)
on conflict (id) do nothing;

update public.profiles p
set avatar = v.avatar, visibility = 'public'
from (values
    ('cae439b0-98a8-43df-9e4f-729de9fc7058'::uuid, '{"skin": "#e8b98a", "eyes": "half", "closedEyes": "new-3", "eyeColor": "#2a2420", "brows": "bold", "mouth": "smile", "mouthOpen": "laugh", "hair": "ponytail-textured", "hairColor": "#4a3426", "top": "two-tone-top", "topColor": "#8b3a3a", "bottom": "light-jeans", "bottomColor": "#7a8c6e", "shoes": "sneakers", "shoesColor": "#6a4a35", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('41f99ad7-1ad6-4865-9f04-d2464f0021ea'::uuid, '{"skin": "#a8694a", "eyes": "new-10", "closedEyes": "new-3", "eyeColor": "#2a2420", "brows": "feather", "mouth": "soft-smile", "mouthOpen": "big-smile", "hair": "space-buns-textured", "hairColor": "#7a5a3a", "top": "check-overalls", "topColor": "#2e2e33", "bottom": "dark-jeans", "bottomColor": "#6a4c7a", "shoes": "ribbon-boots", "shoesColor": "#2a2a2a", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('e1f98154-d9e6-4e87-8ac6-fea8a97c5e1c'::uuid, '{"skin": "#f6d1a5", "eyes": "almond", "closedEyes": "new-1", "eyeColor": "#2a2420", "brows": "angled", "mouth": "soft-smile", "mouthOpen": "round-o", "hair": "undercut-textured", "hairColor": "#2b2220", "top": "check-overalls", "topColor": "#7a8c6e", "bottom": "pants", "bottomColor": "#4a5a6a", "shoes": "boots", "shoesColor": "#c8c3ba", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('d095b035-37fa-48be-8cd6-3cbf129d69bb'::uuid, '{"skin": "#f6d1a5", "eyes": "new-4", "closedEyes": "new-3", "eyeColor": "#2a2420", "brows": "feather", "mouth": "soft-smile", "mouthOpen": "laugh", "hair": "ponytail-textured", "hairColor": "#2b2220", "top": "red-check-shirt", "topColor": "#c9c2b4", "bottom": "shorts", "bottomColor": "#2f3e56", "shoes": "sneakers", "shoesColor": "#2a2a2a", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('f748e8ea-8ffe-4b51-aa20-8874e404bce0'::uuid, '{"skin": "#a8694a", "eyes": "new-4", "closedEyes": "new-4", "eyeColor": "#2a2420", "brows": "angled", "mouth": "smile", "mouthOpen": "laugh", "hair": "spiky-up-textured", "hairColor": "#1f1a17", "top": "me-crop-cardigan", "topColor": "#b88a5a", "bottom": "light-jeans", "bottomColor": "#8b3a3a", "shoes": "sneakers", "shoesColor": "#f4f4f4", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('f8ed28d2-cbfd-4926-90b4-e34c160547a2'::uuid, '{"skin": "#a8694a", "eyes": "side-glance", "closedEyes": "new-5", "eyeColor": "#2a2420", "brows": "slant", "mouth": "smile", "mouthOpen": "round-o", "hair": "low-bun-textured", "hairColor": "#7a5a3a", "top": "check-overalls", "topColor": "#7a8c6e", "bottom": "dark-jeans", "bottomColor": "#6a4c7a", "shoes": "ribbon-boots", "shoesColor": "#c8c3ba", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('b513efc6-8cd5-467d-8d2a-9532eaebbc60'::uuid, '{"skin": "#a8694a", "eyes": "new-10", "closedEyes": "new-4", "eyeColor": "#2a2420", "brows": "slant", "mouth": "smile", "mouthOpen": "teeth-grin", "hair": "slicked-back-textured", "hairColor": "#6b4a2f", "top": "red-check-shirt", "topColor": "#2f3e56", "bottom": "light-jeans", "bottomColor": "#c7a46a", "shoes": "sneakers", "shoesColor": "#2a2a2a", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('d2cc910d-0c9e-4bda-ae26-75c0d5060a57'::uuid, '{"skin": "#cc8860", "eyes": "new-8", "closedEyes": "new-2", "eyeColor": "#2a2420", "brows": "slant", "mouth": "smile", "mouthOpen": "big-smile", "hair": "twin-braids-textured", "hairColor": "#4a3426", "top": "check-overalls", "topColor": "#c9c2b4", "bottom": "shorts", "bottomColor": "#5b6f9a", "shoes": "ribbon-boots", "shoesColor": "#6a4a35", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('ec700576-185c-4c19-b875-fb1e5fd0b241'::uuid, '{"skin": "#f6d1a5", "eyes": "new-10", "closedEyes": "new-5", "eyeColor": "#2a2420", "brows": "curl", "mouth": "smile", "mouthOpen": "big-smile", "hair": "slicked-back-textured", "hairColor": "#3b2a20", "top": "two-tone-top", "topColor": "#f1efe8", "bottom": "pants", "bottomColor": "#2e2e33", "shoes": "ribbon-boots", "shoesColor": "#c8c3ba", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('1b5979ae-f728-4000-8b88-a11c2bf4bb0a'::uuid, '{"skin": "#f6d1a5", "eyes": "new-5", "closedEyes": "new-1", "eyeColor": "#2a2420", "brows": "curl", "mouth": "smile", "mouthOpen": "big-smile", "hair": "spiky-up-textured", "hairColor": "#6b4a2f", "top": "me-crop-cardigan", "topColor": "#7a8c6e", "bottom": "light-jeans", "bottomColor": "#d8d4cc", "shoes": "boots", "shoesColor": "#2a2a2a", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('44b4ed29-52cc-4b5a-904c-7091aa24745e'::uuid, '{"skin": "#a8694a", "eyes": "new-9", "closedEyes": "new-2", "eyeColor": "#2a2420", "brows": "arched", "mouth": "smile", "mouthOpen": "teeth-grin", "hair": "side-swept-textured", "hairColor": "#4a3426", "top": "tshirt", "topColor": "#2e2e33", "bottom": "dark-jeans", "bottomColor": "#3f5f4f", "shoes": "boots", "shoesColor": "#c8c3ba", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('589e633e-46ae-426e-ac14-96b9dab653cc'::uuid, '{"skin": "#f6d1a5", "eyes": "new-10", "closedEyes": "new-1", "eyeColor": "#2a2420", "brows": "curl", "mouth": "smile", "mouthOpen": "teeth-grin", "hair": "space-buns-textured", "hairColor": "#3b2a20", "top": "stripe-sweater", "topColor": "#6a4c7a", "bottom": "pants", "bottomColor": "#6a4c7a", "shoes": "sneakers", "shoesColor": "#2a2a2a", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('ca1e6648-c9dc-4a3a-8e46-b692e7639cda'::uuid, '{"skin": "#cc8860", "eyes": "new-1", "closedEyes": "new-1", "eyeColor": "#2a2420", "brows": "thin-arch", "mouth": "soft-smile", "mouthOpen": "teeth-grin", "hair": "twin-braids-textured", "hairColor": "#3b2a20", "top": "tshirt", "topColor": "#6a4c7a", "bottom": "light-jeans", "bottomColor": "#c9c2b4", "shoes": "sneakers", "shoesColor": "#2a2a2a", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('6bba3081-24f9-477a-85ad-360e4c9326b1'::uuid, '{"skin": "#e8b98a", "eyes": "tall", "closedEyes": "new-3", "eyeColor": "#2a2420", "brows": "slant", "mouth": "soft-smile", "mouthOpen": "big-smile", "hair": "spiky-up-textured", "hairColor": "#4a3426", "top": "tshirt", "topColor": "#2f3e56", "bottom": "light-jeans", "bottomColor": "#c7a46a", "shoes": "boots", "shoesColor": "#f4f4f4", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('33866c5b-a988-4202-b3d9-6a058d87a5fd'::uuid, '{"skin": "#a8694a", "eyes": "half", "closedEyes": "new-1", "eyeColor": "#2a2420", "brows": "flat", "mouth": "soft-smile", "mouthOpen": "laugh", "hair": "slicked-back-textured", "hairColor": "#7a5a3a", "top": "longsleeve", "topColor": "#d8d4cc", "bottom": "shorts", "bottomColor": "#3f5f4f", "shoes": "ribbon-boots", "shoesColor": "#2a2a2a", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('dc947902-9630-48df-b85a-562db876ec7f'::uuid, '{"skin": "#a8694a", "eyes": "new-6", "closedEyes": "new-3", "eyeColor": "#2a2420", "brows": "curl", "mouth": "smile", "mouthOpen": "round-o", "hair": "low-bun-textured", "hairColor": "#6b4a2f", "top": "stripe-sweater", "topColor": "#b88a5a", "bottom": "pants", "bottomColor": "#c9c2b4", "shoes": "ribbon-boots", "shoesColor": "#f4f4f4", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('ed48e3cf-bdd5-40be-88e5-77947ba88651'::uuid, '{"skin": "#f6d1a5", "eyes": "new-8", "closedEyes": "new-5", "eyeColor": "#2a2420", "brows": "angled", "mouth": "soft-smile", "mouthOpen": "laugh", "hair": "twin-braids-textured", "hairColor": "#7a5a3a", "top": "me-crop-cardigan", "topColor": "#c9c2b4", "bottom": "light-jeans", "bottomColor": "#2f3e56", "shoes": "sneakers", "shoesColor": "#6a4a35", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('781353ec-0ea8-4f11-9d77-4586e7c3bd93'::uuid, '{"skin": "#f6d1a5", "eyes": "new-7", "closedEyes": "new-5", "eyeColor": "#2a2420", "brows": "thin-slant", "mouth": "smile", "mouthOpen": "round-o", "hair": "spiky-up-textured", "hairColor": "#5a3a24", "top": "stripe-sweater", "topColor": "#3f5f4f", "bottom": "light-jeans", "bottomColor": "#8b3a3a", "shoes": "sneakers", "shoesColor": "#6a4a35", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb)
) as v(id, avatar)
where p.id = v.id;

insert into public.bot_accounts (user_id)
select v.id from (values
  ('cae439b0-98a8-43df-9e4f-729de9fc7058'::uuid),
  ('41f99ad7-1ad6-4865-9f04-d2464f0021ea'::uuid),
  ('e1f98154-d9e6-4e87-8ac6-fea8a97c5e1c'::uuid),
  ('d095b035-37fa-48be-8cd6-3cbf129d69bb'::uuid),
  ('f748e8ea-8ffe-4b51-aa20-8874e404bce0'::uuid),
  ('f8ed28d2-cbfd-4926-90b4-e34c160547a2'::uuid),
  ('b513efc6-8cd5-467d-8d2a-9532eaebbc60'::uuid),
  ('d2cc910d-0c9e-4bda-ae26-75c0d5060a57'::uuid),
  ('ec700576-185c-4c19-b875-fb1e5fd0b241'::uuid),
  ('1b5979ae-f728-4000-8b88-a11c2bf4bb0a'::uuid),
  ('44b4ed29-52cc-4b5a-904c-7091aa24745e'::uuid),
  ('589e633e-46ae-426e-ac14-96b9dab653cc'::uuid),
  ('ca1e6648-c9dc-4a3a-8e46-b692e7639cda'::uuid),
  ('6bba3081-24f9-477a-85ad-360e4c9326b1'::uuid),
  ('33866c5b-a988-4202-b3d9-6a058d87a5fd'::uuid),
  ('dc947902-9630-48df-b85a-562db876ec7f'::uuid),
  ('ed48e3cf-bdd5-40be-88e5-77947ba88651'::uuid),
  ('781353ec-0ea8-4f11-9d77-4586e7c3bd93'::uuid)
) as v(id)
on conflict do nothing;

insert into public.subjects (user_id, name)
select user_id, '공부' from public.bot_accounts
on conflict (user_id, name) do nothing;
update public.bot_accounts b set subject_id = s.id
from public.subjects s where s.user_id = b.user_id and s.name = '공부' and b.subject_id is null;

commit;

notify pgrst, 'reload schema';
