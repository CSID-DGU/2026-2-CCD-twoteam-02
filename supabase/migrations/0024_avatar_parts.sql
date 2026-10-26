-- 두뜀 0024: 캐릭터 꾸미기 — 부위·색을 골라 저장 (#56)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
--
-- 배경:
--   0015 는 avatar 에 model 키 하나({"model":"a"})만 받았다. 캐릭터 꾸미기(#56)부터는 맨몸에서부터 부위와 색을 고른다.
--     {"skin":"#f6d1a5", "eyes":"basic", "eyeColor":"#5b3a1e", "brows":"straight", "mouth":"smile",
--      "hair":"short", "hairColor":"#3b2a20", "top":"tshirt", "topColor":"#4f86f7",
--      "bottom":"pants", "bottomColor":"#374151", "shoes":"sneakers", "shoesColor":"#ef4444"}
--   부품 목록은 화면 쪽 파일(src/avatar/parts.json)에 있고 팀이 계속 늘리므로, DB 는 부품 id 와 색의 모양만 확인한다.
--   목록에 없는 id 가 들어오면 화면이 그 칸만 기본값으로 그린다.
--
--   예전 값 {"model":"a"} 도 계속 받는다. 이미 저장된 값은 그대로 두고, 화면이 새 기본 차림으로 읽는다.
--   (이 파일을 실행한 뒤 PR 을 머지하기 전까지 배포된 예전 화면이 {"model"} 로 저장해도 거부되지 않게)
--
--   avatar 는 avatars 뷰로 모든 로그인 사용자에게 보이므로(0010), 아무 키나 큰 값이 들어가지 않게 키와 모양을 막는 것은 그대로다(0015 의 이유).

begin;

alter table public.profiles drop constraint if exists profiles_avatar_model_check;

alter table public.profiles
  add constraint profiles_avatar_model_check
  check (
    -- 예전 형식: {"model": a~r}
    (
      avatar ? 'model'
      and avatar ->> 'model' ~ '^[a-r]$'
      and avatar - 'model' = '{}'::jsonb
    )
    or
    -- 꾸미기 형식: 13칸 모두 있어야 하고, 부품 id 는 영문 소문자·숫자·- 32자까지, 색은 '#rrggbb'
    -- 값이 null 이면 ->> 가 null 이 되고, check 는 null 을 "통과"로 친다. 그래서 coalesce 로 null 을 거짓으로 바꾼다.
    coalesce((
      avatar ?& array['skin', 'eyes', 'eyeColor', 'brows', 'mouth', 'hair', 'hairColor',
                      'top', 'topColor', 'bottom', 'bottomColor', 'shoes', 'shoesColor']
      and avatar - array['skin', 'eyes', 'eyeColor', 'brows', 'mouth', 'hair', 'hairColor',
                         'top', 'topColor', 'bottom', 'bottomColor', 'shoes', 'shoesColor'] = '{}'::jsonb   -- 그 밖의 키는 허용하지 않는다
      and avatar ->> 'eyes' ~ '^[a-z0-9-]{1,32}$'
      and avatar ->> 'brows' ~ '^[a-z0-9-]{1,32}$'
      and avatar ->> 'mouth' ~ '^[a-z0-9-]{1,32}$'
      and avatar ->> 'hair' ~ '^[a-z0-9-]{1,32}$'
      and avatar ->> 'top' ~ '^[a-z0-9-]{1,32}$'
      and avatar ->> 'bottom' ~ '^[a-z0-9-]{1,32}$'
      and avatar ->> 'shoes' ~ '^[a-z0-9-]{1,32}$'
      and avatar ->> 'skin' ~ '^#[0-9a-f]{6}$'
      and avatar ->> 'eyeColor' ~ '^#[0-9a-f]{6}$'
      and avatar ->> 'hairColor' ~ '^#[0-9a-f]{6}$'
      and avatar ->> 'topColor' ~ '^#[0-9a-f]{6}$'
      and avatar ->> 'bottomColor' ~ '^#[0-9a-f]{6}$'
      and avatar ->> 'shoesColor' ~ '^#[0-9a-f]{6}$'
    ), false)
  );

comment on column public.profiles.avatar is
  '캐릭터 차림(#56): 피부색·눈·눈색·눈썹·입·머리·머리색·상의·상의색·하의·하의색·신발·신발색. 부품 목록은 src/avatar/parts.json. 예전 {"model":"a~r"} 도 받음(화면은 기본 차림으로 읽음)';

commit;
