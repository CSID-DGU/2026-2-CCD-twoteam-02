-- 두뜀 0077: 봇 공부 시간 규칙을 사람답게, 봇 60명으로 늘리기 (#50)
--
-- 문제
--   1) 0075 의 bot_can_study 는 "서울 8시~24시"에만 공부를 시작하게 했다. 사람마다 공부 시간이 다른데
--      모든 봇이 같은 시간에 사라졌다 나타나면 오히려 봇인 티가 난다.
--   2) 하루 공부량 상한(봇마다 4~8시간)을 서울 자정 기준으로 셌다. 상한을 채운 봇들이 0시에 한꺼번에 돌아온다.
--   3) 봇 24명 × 하루 평균 6시간 = 144시간이라, 목표 15명(하루 360시간)을 채우지 못하고 평균 6명 정도만 앉아 있었다.
--
-- 방법
--   1) 시간 제한을 없앤다
--   2) 공부량 상한을 "최근 24시간" 기준으로 센다. 봇마다 쉬기 시작하는 때가 달라져 한꺼번에 돌아오지 않는다
--   3) 봇 계정 36개를 더해 60개로 늘린다. 하루 4~8시간씩이면 평균 15명 정도가 앉아 있다
--
-- 다시 실행해도 된다 (함수는 바꿔 쓰고, 계정·과목은 이미 있으면 넘어감).
-- 적용할 DB: 서비스 Supabase (0076 다음, develop 머지 전). 실험 DB 에는 적용하지 않는다.
begin;

-- ---------------------------------------------------------------
-- 1. 공부를 시작해도 되는지: 최근 24시간 공부량이 그 봇의 상한(4~8시간, 봇마다 고정) 아래
-- ---------------------------------------------------------------
create or replace function public.bot_can_study(p_bot uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
           select sum(l.focused_seconds) from public.study_logs l
           where l.user_id = p_bot and l.started_at >= now() - interval '24 hours'
         ), 0) < (4 + ((hashtext(p_bot::text) % 5) + 5) % 5) * 3600; -- 봇마다 4~8시간
$$;

revoke execute on function public.bot_can_study(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 2. 봇 계정 36개 더 (로그인 불가: 이메일·비밀번호 없음). 프로필은 가입 트리거가 만든다
-- ---------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change, is_anonymous)
values
  ('00000000-0000-0000-0000-000000000000', 'dc1caeb0-c7b0-4386-9da0-a995bee55e99', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "새벽세시"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '0c33b01f-8088-450e-b1eb-2d9b6a85c8ea', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "라면한그릇"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'fe255470-cf6d-4a4f-a1d0-2ea86847277f', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "딸기우유"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '3ff05c4d-bf9e-4213-84e8-097644e0f6a8', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "파이썬초보"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '14d08def-0635-439f-8d58-b42e10728db2', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "수학싫어"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '0f6a5fa0-0e80-44dd-b6ac-03a6d0c6a0b1', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "국시준비중"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'c36b166a-9123-4757-a0b0-d8ae51d16cb4', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "김밥한줄"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'b2dd3e7c-3af5-4ac7-a612-13928d758599', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "졸린곰"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'f01f5f55-6484-457c-a35a-4f778a6214ad', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "커피수혈"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'f78c6a1a-ca71-492d-8f89-ea644824f075', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "작심삼일"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'b32f7128-79b5-4558-9cc9-b7baf233c3dd', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "다시시작"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '5702885a-fc40-4ed3-ad84-d3e6ad2ce8bf', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "노트정리"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'cc7d5f37-6175-4153-b93c-9af9cf4983eb', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "형광펜"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '8ba4ad5b-661c-494e-a89f-ab2d6d5d52d0', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "밀크티"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'e2b5d342-d8cb-4a21-9331-d2f30cd2c892', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "귤까는중"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'ab50b29c-58ce-4e3e-9234-606f58432fac', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "공부하자"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '96fa906a-d687-4a6a-954f-f9372901192b', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "월요병"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '6867323b-86b5-47a1-ad57-a8d1a1aa9501', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "도서관죽돌이"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '3cefe826-ac9a-4c61-a661-e9a462870d4f', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "자소서쓰는중"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '2a74005b-82a9-4fc2-a4bc-4fabdd5cbcc7', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "편입준비"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '43ac7ed9-04d9-4ee1-b5f4-f8579314bbeb', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "기말폭격"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'a168a24f-0e21-4dd9-baaa-82ae3e6647a0', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "과제마감"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '25a6be7c-2490-4a5a-ab13-e7f15bb6b638', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "캠퍼스낭만"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'b670abf2-25b5-4279-ab18-34f3be5f77a4', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "붕어빵"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '35e88f9b-bb68-4a73-8b62-b01e80f21cab', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "호떡"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'dbc98953-2f41-44d0-a43b-06286aa55cbd', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "눈사람"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'd8a93c35-4c62-47aa-bec2-ba1f53957e4f', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "펭귄"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '28f7696b-704a-487f-b4af-01fd7e4d4b74', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "레몬에이드"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'e3b4d88c-f58f-4772-8f27-b1fc06cc5a5e', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "초록불유지"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '4c8c88d6-86f2-431e-b155-8ad7a61546e4', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "집중력부족"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '1b58de03-445e-43ee-be42-23747c0b1e5e', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "미적분"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '90a5fee5-dd08-4b5f-974f-fe8cb7511486', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "영단어암기"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'bd027e09-d127-4dd1-8b5e-0bd6b70c7415', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "독서실탈출"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '59632fd1-fdd7-41f6-9aff-24d300c8c6bf', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "오늘의목표"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', '26b93b62-7820-4b74-afc9-d13294018276', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "꿈꾸는중"}', now(), now(), '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000', 'fc88955a-2acc-4136-9b7a-8db940aedf24', 'authenticated', 'authenticated', '', '{"provider":"bot","providers":[]}', '{"nickname": "토끼"}', now(), now(), '', '', '', '', false)
on conflict (id) do nothing;

update public.profiles p
set avatar = v.avatar, visibility = 'public'
from (values
    ('dc1caeb0-c7b0-4386-9da0-a995bee55e99'::uuid, '{"skin": "#e8b98a", "eyes": "almond", "closedEyes": "new-1", "eyeColor": "#2a2420", "brows": "thin-arch", "mouth": "soft-smile", "mouthOpen": "round-o", "hair": "side-swept-textured", "hairColor": "#5a3a24", "top": "me-crop-cardigan", "topColor": "#8b3a3a", "bottom": "dark-jeans", "bottomColor": "#2f3e56", "shoes": "ribbon-boots", "shoesColor": "#c8c3ba", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('0c33b01f-8088-450e-b1eb-2d9b6a85c8ea'::uuid, '{"skin": "#f6d1a5", "eyes": "new-9", "closedEyes": "new-1", "eyeColor": "#2a2420", "brows": "wave", "mouth": "soft-smile", "mouthOpen": "round-o", "hair": "space-buns-textured", "hairColor": "#4a3426", "top": "tshirt", "topColor": "#b88a5a", "bottom": "shorts", "bottomColor": "#d8d4cc", "shoes": "ribbon-boots", "shoesColor": "#c8c3ba", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('fe255470-cf6d-4a4f-a1d0-2ea86847277f'::uuid, '{"skin": "#f6d1a5", "eyes": "new-5", "closedEyes": "new-3", "eyeColor": "#2a2420", "brows": "arched", "mouth": "smile", "mouthOpen": "big-smile", "hair": "low-bun-textured", "hairColor": "#5a3a24", "top": "tshirt", "topColor": "#f1efe8", "bottom": "shorts", "bottomColor": "#3f5f4f", "shoes": "sneakers", "shoesColor": "#2a2a2a", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('3ff05c4d-bf9e-4213-84e8-097644e0f6a8'::uuid, '{"skin": "#a8694a", "eyes": "tall", "closedEyes": "new-3", "eyeColor": "#2a2420", "brows": "feather", "mouth": "soft-smile", "mouthOpen": "teeth-grin", "hair": "twin-braids-textured", "hairColor": "#4a3426", "top": "check-overalls", "topColor": "#3f5f4f", "bottom": "light-jeans", "bottomColor": "#c7a46a", "shoes": "boots", "shoesColor": "#6a4a35", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('14d08def-0635-439f-8d58-b42e10728db2'::uuid, '{"skin": "#a8694a", "eyes": "new-4", "closedEyes": "new-3", "eyeColor": "#2a2420", "brows": "flat", "mouth": "smile", "mouthOpen": "teeth-grin", "hair": "slicked-back-textured", "hairColor": "#7a5a3a", "top": "me-crop-cardigan", "topColor": "#5b6f9a", "bottom": "shorts", "bottomColor": "#f1efe8", "shoes": "sneakers", "shoesColor": "#2a2a2a", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('0f6a5fa0-0e80-44dd-b6ac-03a6d0c6a0b1'::uuid, '{"skin": "#a8694a", "eyes": "almond", "closedEyes": "new-5", "eyeColor": "#2a2420", "brows": "thin-slant", "mouth": "soft-smile", "mouthOpen": "teeth-grin", "hair": "side-swept-textured", "hairColor": "#7a5a3a", "top": "tshirt", "topColor": "#7a8c6e", "bottom": "dark-jeans", "bottomColor": "#6a4c7a", "shoes": "boots", "shoesColor": "#c8c3ba", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('c36b166a-9123-4757-a0b0-d8ae51d16cb4'::uuid, '{"skin": "#f6d1a5", "eyes": "new-10", "closedEyes": "new-1", "eyeColor": "#2a2420", "brows": "feather", "mouth": "soft-smile", "mouthOpen": "big-smile", "hair": "undercut-textured", "hairColor": "#7a5a3a", "top": "me-crop-cardigan", "topColor": "#d8d4cc", "bottom": "dark-jeans", "bottomColor": "#8b3a3a", "shoes": "sneakers", "shoesColor": "#f4f4f4", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('b2dd3e7c-3af5-4ac7-a612-13928d758599'::uuid, '{"skin": "#cc8860", "eyes": "new-1", "closedEyes": "new-2", "eyeColor": "#2a2420", "brows": "curl", "mouth": "smile", "mouthOpen": "laugh", "hair": "undercut-textured", "hairColor": "#7a5a3a", "top": "longsleeve", "topColor": "#f1efe8", "bottom": "dark-jeans", "bottomColor": "#2e2e33", "shoes": "sneakers", "shoesColor": "#f4f4f4", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('f01f5f55-6484-457c-a35a-4f778a6214ad'::uuid, '{"skin": "#e8b98a", "eyes": "new-5", "closedEyes": "new-4", "eyeColor": "#2a2420", "brows": "wave", "mouth": "soft-smile", "mouthOpen": "laugh", "hair": "twin-braids-textured", "hairColor": "#4a3426", "top": "tshirt", "topColor": "#8b3a3a", "bottom": "dark-jeans", "bottomColor": "#8b3a3a", "shoes": "sneakers", "shoesColor": "#f4f4f4", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('f78c6a1a-ca71-492d-8f89-ea644824f075'::uuid, '{"skin": "#a8694a", "eyes": "new-8", "closedEyes": "new-4", "eyeColor": "#2a2420", "brows": "curl", "mouth": "smile", "mouthOpen": "laugh", "hair": "twin-braids-textured", "hairColor": "#3b2a20", "top": "red-check-shirt", "topColor": "#5b6f9a", "bottom": "light-jeans", "bottomColor": "#f1efe8", "shoes": "ribbon-boots", "shoesColor": "#6a4a35", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('b32f7128-79b5-4558-9cc9-b7baf233c3dd'::uuid, '{"skin": "#f6d1a5", "eyes": "almond", "closedEyes": "new-1", "eyeColor": "#2a2420", "brows": "wave", "mouth": "soft-smile", "mouthOpen": "teeth-grin", "hair": "ponytail-textured", "hairColor": "#4a3426", "top": "tshirt", "topColor": "#5b6f9a", "bottom": "pants", "bottomColor": "#f1efe8", "shoes": "sneakers", "shoesColor": "#c8c3ba", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('5702885a-fc40-4ed3-ad84-d3e6ad2ce8bf'::uuid, '{"skin": "#cc8860", "eyes": "side-glance", "closedEyes": "new-4", "eyeColor": "#2a2420", "brows": "curl", "mouth": "smile", "mouthOpen": "teeth-grin", "hair": "slicked-back-textured", "hairColor": "#5a3a24", "top": "stripe-sweater", "topColor": "#4a5a6a", "bottom": "pants", "bottomColor": "#4a5a6a", "shoes": "ribbon-boots", "shoesColor": "#6a4a35", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('cc7d5f37-6175-4153-b93c-9af9cf4983eb'::uuid, '{"skin": "#f6d1a5", "eyes": "new-8", "closedEyes": "new-5", "eyeColor": "#2a2420", "brows": "angled", "mouth": "smile", "mouthOpen": "teeth-grin", "hair": "ponytail-textured", "hairColor": "#1f1a17", "top": "stripe-sweater", "topColor": "#f1efe8", "bottom": "pants", "bottomColor": "#8b3a3a", "shoes": "sneakers", "shoesColor": "#2a2a2a", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('8ba4ad5b-661c-494e-a89f-ab2d6d5d52d0'::uuid, '{"skin": "#a8694a", "eyes": "lidded", "closedEyes": "new-5", "eyeColor": "#2a2420", "brows": "thin-arch", "mouth": "smile", "mouthOpen": "teeth-grin", "hair": "space-buns-textured", "hairColor": "#7a5a3a", "top": "longsleeve", "topColor": "#b88a5a", "bottom": "pants", "bottomColor": "#b88a5a", "shoes": "boots", "shoesColor": "#6a4a35", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('e2b5d342-d8cb-4a21-9331-d2f30cd2c892'::uuid, '{"skin": "#cc8860", "eyes": "lidded", "closedEyes": "new-4", "eyeColor": "#2a2420", "brows": "arched", "mouth": "smile", "mouthOpen": "round-o", "hair": "slicked-back-textured", "hairColor": "#2b2220", "top": "two-tone-top", "topColor": "#f1efe8", "bottom": "pants", "bottomColor": "#b88a5a", "shoes": "sneakers", "shoesColor": "#c8c3ba", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('ab50b29c-58ce-4e3e-9234-606f58432fac'::uuid, '{"skin": "#e8b98a", "eyes": "side-glance", "closedEyes": "new-5", "eyeColor": "#2a2420", "brows": "angled", "mouth": "smile", "mouthOpen": "big-smile", "hair": "slicked-back-textured", "hairColor": "#1f1a17", "top": "check-overalls", "topColor": "#6a4c7a", "bottom": "pants", "bottomColor": "#c9c2b4", "shoes": "ribbon-boots", "shoesColor": "#6a4a35", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('96fa906a-d687-4a6a-954f-f9372901192b'::uuid, '{"skin": "#cc8860", "eyes": "almond", "closedEyes": "new-4", "eyeColor": "#2a2420", "brows": "arched", "mouth": "smile", "mouthOpen": "round-o", "hair": "low-bun-textured", "hairColor": "#3b2a20", "top": "me-crop-cardigan", "topColor": "#5b6f9a", "bottom": "light-jeans", "bottomColor": "#f1efe8", "shoes": "ribbon-boots", "shoesColor": "#c8c3ba", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('6867323b-86b5-47a1-ad57-a8d1a1aa9501'::uuid, '{"skin": "#cc8860", "eyes": "new-6", "closedEyes": "new-4", "eyeColor": "#2a2420", "brows": "bold", "mouth": "smile", "mouthOpen": "round-o", "hair": "undercut-textured", "hairColor": "#6b4a2f", "top": "stripe-sweater", "topColor": "#2f3e56", "bottom": "pants", "bottomColor": "#f1efe8", "shoes": "sneakers", "shoesColor": "#6a4a35", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('3cefe826-ac9a-4c61-a661-e9a462870d4f'::uuid, '{"skin": "#f6d1a5", "eyes": "new-5", "closedEyes": "new-5", "eyeColor": "#2a2420", "brows": "curl", "mouth": "smile", "mouthOpen": "big-smile", "hair": "slicked-back-textured", "hairColor": "#6b4a2f", "top": "me-crop-cardigan", "topColor": "#d8d4cc", "bottom": "light-jeans", "bottomColor": "#7a8c6e", "shoes": "ribbon-boots", "shoesColor": "#f4f4f4", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('2a74005b-82a9-4fc2-a4bc-4fabdd5cbcc7'::uuid, '{"skin": "#cc8860", "eyes": "new-8", "closedEyes": "new-1", "eyeColor": "#2a2420", "brows": "slant", "mouth": "soft-smile", "mouthOpen": "teeth-grin", "hair": "space-buns-textured", "hairColor": "#1f1a17", "top": "two-tone-top", "topColor": "#c7a46a", "bottom": "dark-jeans", "bottomColor": "#2e2e33", "shoes": "boots", "shoesColor": "#6a4a35", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('43ac7ed9-04d9-4ee1-b5f4-f8579314bbeb'::uuid, '{"skin": "#a8694a", "eyes": "new-6", "closedEyes": "new-5", "eyeColor": "#2a2420", "brows": "thin-slant", "mouth": "soft-smile", "mouthOpen": "round-o", "hair": "undercut-textured", "hairColor": "#6b4a2f", "top": "red-check-shirt", "topColor": "#b88a5a", "bottom": "light-jeans", "bottomColor": "#2e2e33", "shoes": "sneakers", "shoesColor": "#c8c3ba", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('a168a24f-0e21-4dd9-baaa-82ae3e6647a0'::uuid, '{"skin": "#e8b98a", "eyes": "side-glance", "closedEyes": "new-5", "eyeColor": "#2a2420", "brows": "bold", "mouth": "soft-smile", "mouthOpen": "teeth-grin", "hair": "spiky-up-textured", "hairColor": "#7a5a3a", "top": "longsleeve", "topColor": "#7a8c6e", "bottom": "pants", "bottomColor": "#6a4c7a", "shoes": "sneakers", "shoesColor": "#f4f4f4", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('25a6be7c-2490-4a5a-ab13-e7f15bb6b638'::uuid, '{"skin": "#f6d1a5", "eyes": "new-10", "closedEyes": "new-3", "eyeColor": "#2a2420", "brows": "slant", "mouth": "smile", "mouthOpen": "round-o", "hair": "twin-braids-textured", "hairColor": "#4a3426", "top": "tshirt", "topColor": "#4a5a6a", "bottom": "light-jeans", "bottomColor": "#c9c2b4", "shoes": "ribbon-boots", "shoesColor": "#2a2a2a", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('b670abf2-25b5-4279-ab18-34f3be5f77a4'::uuid, '{"skin": "#f6d1a5", "eyes": "new-3", "closedEyes": "new-1", "eyeColor": "#2a2420", "brows": "slant", "mouth": "smile", "mouthOpen": "teeth-grin", "hair": "twin-braids-textured", "hairColor": "#6b4a2f", "top": "me-crop-cardigan", "topColor": "#3f5f4f", "bottom": "dark-jeans", "bottomColor": "#2e2e33", "shoes": "ribbon-boots", "shoesColor": "#6a4a35", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('35e88f9b-bb68-4a73-8b62-b01e80f21cab'::uuid, '{"skin": "#e8b98a", "eyes": "new-6", "closedEyes": "new-1", "eyeColor": "#2a2420", "brows": "wave", "mouth": "smile", "mouthOpen": "laugh", "hair": "spiky-up-textured", "hairColor": "#6b4a2f", "top": "red-check-shirt", "topColor": "#c9c2b4", "bottom": "pants", "bottomColor": "#c9c2b4", "shoes": "ribbon-boots", "shoesColor": "#2a2a2a", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('dbc98953-2f41-44d0-a43b-06286aa55cbd'::uuid, '{"skin": "#a8694a", "eyes": "half", "closedEyes": "new-1", "eyeColor": "#2a2420", "brows": "curl", "mouth": "smile", "mouthOpen": "big-smile", "hair": "twin-braids-textured", "hairColor": "#4a3426", "top": "stripe-sweater", "topColor": "#2f3e56", "bottom": "light-jeans", "bottomColor": "#4a5a6a", "shoes": "sneakers", "shoesColor": "#6a4a35", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('d8a93c35-4c62-47aa-bec2-ba1f53957e4f'::uuid, '{"skin": "#cc8860", "eyes": "new-11", "closedEyes": "new-3", "eyeColor": "#2a2420", "brows": "arched", "mouth": "smile", "mouthOpen": "big-smile", "hair": "side-swept-textured", "hairColor": "#7a5a3a", "top": "two-tone-top", "topColor": "#6a4c7a", "bottom": "light-jeans", "bottomColor": "#2e2e33", "shoes": "sneakers", "shoesColor": "#f4f4f4", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('28f7696b-704a-487f-b4af-01fd7e4d4b74'::uuid, '{"skin": "#a8694a", "eyes": "half", "closedEyes": "new-1", "eyeColor": "#2a2420", "brows": "feather", "mouth": "soft-smile", "mouthOpen": "teeth-grin", "hair": "ponytail-textured", "hairColor": "#4a3426", "top": "red-check-shirt", "topColor": "#d8d4cc", "bottom": "pants", "bottomColor": "#5b6f9a", "shoes": "boots", "shoesColor": "#c8c3ba", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('e3b4d88c-f58f-4772-8f27-b1fc06cc5a5e'::uuid, '{"skin": "#a8694a", "eyes": "new-11", "closedEyes": "new-5", "eyeColor": "#2a2420", "brows": "curl", "mouth": "soft-smile", "mouthOpen": "big-smile", "hair": "ponytail-textured", "hairColor": "#3b2a20", "top": "stripe-sweater", "topColor": "#c9c2b4", "bottom": "pants", "bottomColor": "#c9c2b4", "shoes": "sneakers", "shoesColor": "#2a2a2a", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('4c8c88d6-86f2-431e-b155-8ad7a61546e4'::uuid, '{"skin": "#e8b98a", "eyes": "tall", "closedEyes": "new-1", "eyeColor": "#2a2420", "brows": "arched", "mouth": "soft-smile", "mouthOpen": "laugh", "hair": "undercut-textured", "hairColor": "#1f1a17", "top": "me-crop-cardigan", "topColor": "#d8d4cc", "bottom": "pants", "bottomColor": "#6a4c7a", "shoes": "boots", "shoesColor": "#f4f4f4", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('1b58de03-445e-43ee-be42-23747c0b1e5e'::uuid, '{"skin": "#cc8860", "eyes": "new-8", "closedEyes": "new-3", "eyeColor": "#2a2420", "brows": "feather", "mouth": "smile", "mouthOpen": "big-smile", "hair": "ponytail-textured", "hairColor": "#5a3a24", "top": "two-tone-top", "topColor": "#7a8c6e", "bottom": "pants", "bottomColor": "#8b3a3a", "shoes": "sneakers", "shoesColor": "#2a2a2a", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('90a5fee5-dd08-4b5f-974f-fe8cb7511486'::uuid, '{"skin": "#f6d1a5", "eyes": "new-2", "closedEyes": "new-1", "eyeColor": "#2a2420", "brows": "arched", "mouth": "soft-smile", "mouthOpen": "laugh", "hair": "ponytail-textured", "hairColor": "#6b4a2f", "top": "longsleeve", "topColor": "#d8d4cc", "bottom": "light-jeans", "bottomColor": "#8b3a3a", "shoes": "sneakers", "shoesColor": "#2a2a2a", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('bd027e09-d127-4dd1-8b5e-0bd6b70c7415'::uuid, '{"skin": "#cc8860", "eyes": "new-7", "closedEyes": "new-2", "eyeColor": "#2a2420", "brows": "curl", "mouth": "soft-smile", "mouthOpen": "round-o", "hair": "space-buns-textured", "hairColor": "#7a5a3a", "top": "tshirt", "topColor": "#4a5a6a", "bottom": "light-jeans", "bottomColor": "#d8d4cc", "shoes": "ribbon-boots", "shoesColor": "#c8c3ba", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('59632fd1-fdd7-41f6-9aff-24d300c8c6bf'::uuid, '{"skin": "#a8694a", "eyes": "lidded", "closedEyes": "new-3", "eyeColor": "#2a2420", "brows": "arched", "mouth": "smile", "mouthOpen": "laugh", "hair": "spiky-up-textured", "hairColor": "#2b2220", "top": "me-crop-cardigan", "topColor": "#2e2e33", "bottom": "light-jeans", "bottomColor": "#c7a46a", "shoes": "sneakers", "shoesColor": "#2a2a2a", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('26b93b62-7820-4b74-afc9-d13294018276'::uuid, '{"skin": "#f6d1a5", "eyes": "new-1", "closedEyes": "new-2", "eyeColor": "#2a2420", "brows": "thin-arch", "mouth": "soft-smile", "mouthOpen": "big-smile", "hair": "twin-braids-textured", "hairColor": "#5a3a24", "top": "stripe-sweater", "topColor": "#2f3e56", "bottom": "light-jeans", "bottomColor": "#f1efe8", "shoes": "boots", "shoesColor": "#2a2a2a", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb),
    ('fc88955a-2acc-4136-9b7a-8db940aedf24'::uuid, '{"skin": "#a8694a", "eyes": "tall", "closedEyes": "new-1", "eyeColor": "#2a2420", "brows": "flat", "mouth": "smile", "mouthOpen": "big-smile", "hair": "slicked-back-textured", "hairColor": "#5a3a24", "top": "stripe-sweater", "topColor": "#2f3e56", "bottom": "shorts", "bottomColor": "#d8d4cc", "shoes": "boots", "shoesColor": "#6a4a35", "eyeX": 0, "eyeY": 0, "eyeSize": 0, "browY": 0, "browSize": 0, "mouthY": 0, "mouthSize": 0}'::jsonb)
) as v(id, avatar)
where p.id = v.id;

insert into public.bot_accounts (user_id)
select v.id from (values
  ('dc1caeb0-c7b0-4386-9da0-a995bee55e99'::uuid),
  ('0c33b01f-8088-450e-b1eb-2d9b6a85c8ea'::uuid),
  ('fe255470-cf6d-4a4f-a1d0-2ea86847277f'::uuid),
  ('3ff05c4d-bf9e-4213-84e8-097644e0f6a8'::uuid),
  ('14d08def-0635-439f-8d58-b42e10728db2'::uuid),
  ('0f6a5fa0-0e80-44dd-b6ac-03a6d0c6a0b1'::uuid),
  ('c36b166a-9123-4757-a0b0-d8ae51d16cb4'::uuid),
  ('b2dd3e7c-3af5-4ac7-a612-13928d758599'::uuid),
  ('f01f5f55-6484-457c-a35a-4f778a6214ad'::uuid),
  ('f78c6a1a-ca71-492d-8f89-ea644824f075'::uuid),
  ('b32f7128-79b5-4558-9cc9-b7baf233c3dd'::uuid),
  ('5702885a-fc40-4ed3-ad84-d3e6ad2ce8bf'::uuid),
  ('cc7d5f37-6175-4153-b93c-9af9cf4983eb'::uuid),
  ('8ba4ad5b-661c-494e-a89f-ab2d6d5d52d0'::uuid),
  ('e2b5d342-d8cb-4a21-9331-d2f30cd2c892'::uuid),
  ('ab50b29c-58ce-4e3e-9234-606f58432fac'::uuid),
  ('96fa906a-d687-4a6a-954f-f9372901192b'::uuid),
  ('6867323b-86b5-47a1-ad57-a8d1a1aa9501'::uuid),
  ('3cefe826-ac9a-4c61-a661-e9a462870d4f'::uuid),
  ('2a74005b-82a9-4fc2-a4bc-4fabdd5cbcc7'::uuid),
  ('43ac7ed9-04d9-4ee1-b5f4-f8579314bbeb'::uuid),
  ('a168a24f-0e21-4dd9-baaa-82ae3e6647a0'::uuid),
  ('25a6be7c-2490-4a5a-ab13-e7f15bb6b638'::uuid),
  ('b670abf2-25b5-4279-ab18-34f3be5f77a4'::uuid),
  ('35e88f9b-bb68-4a73-8b62-b01e80f21cab'::uuid),
  ('dbc98953-2f41-44d0-a43b-06286aa55cbd'::uuid),
  ('d8a93c35-4c62-47aa-bec2-ba1f53957e4f'::uuid),
  ('28f7696b-704a-487f-b4af-01fd7e4d4b74'::uuid),
  ('e3b4d88c-f58f-4772-8f27-b1fc06cc5a5e'::uuid),
  ('4c8c88d6-86f2-431e-b155-8ad7a61546e4'::uuid),
  ('1b58de03-445e-43ee-be42-23747c0b1e5e'::uuid),
  ('90a5fee5-dd08-4b5f-974f-fe8cb7511486'::uuid),
  ('bd027e09-d127-4dd1-8b5e-0bd6b70c7415'::uuid),
  ('59632fd1-fdd7-41f6-9aff-24d300c8c6bf'::uuid),
  ('26b93b62-7820-4b74-afc9-d13294018276'::uuid),
  ('fc88955a-2acc-4136-9b7a-8db940aedf24'::uuid)
) as v(id)
on conflict do nothing;

insert into public.subjects (user_id, name)
select user_id, '공부' from public.bot_accounts
on conflict (user_id, name) do nothing;
update public.bot_accounts b set subject_id = s.id
from public.subjects s where s.user_id = b.user_id and s.name = '공부' and b.subject_id is null;

commit;
