-- 두뜀 0025: 캐릭터 꾸미기 — "벌린 입" 칸 추가 (#56, 입 트래킹 #61)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
-- 0024 를 먼저 실행해 두어야 한다.
--
-- 배경:
--   입을 "다문 입(mouth)"과 "벌린 입(mouthOpen)"으로 나눠 사용자가 둘 다 고른다.
--   평소에는 다문 입이 보이고, 회의실에서 말하면 고른 벌린 입이 그 자리를 덮는다.
--   0024 는 13칸만 받으므로 mouthOpen 을 더한다. 이미 저장된 13칸 값(mouthOpen 없음)도 계속 받는다
--   (화면이 기본 벌린 입으로 읽는다). 예전 {"model"} 형식도 그대로 받는다.

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
    -- 꾸미기 형식: 13칸은 꼭 있고 mouthOpen 은 있어도 없어도 된다. 부품 id 는 영문 소문자·숫자·- 32자까지, 색은 '#rrggbb'
    -- 값이 null 이면 ->> 가 null 이 되고, check 는 null 을 "통과"로 친다. 그래서 coalesce 로 null 을 거짓으로 바꾼다.
    coalesce((
      avatar ?& array['skin', 'eyes', 'eyeColor', 'brows', 'mouth', 'hair', 'hairColor',
                      'top', 'topColor', 'bottom', 'bottomColor', 'shoes', 'shoesColor']
      and avatar - array['skin', 'eyes', 'eyeColor', 'brows', 'mouth', 'mouthOpen', 'hair', 'hairColor',
                         'top', 'topColor', 'bottom', 'bottomColor', 'shoes', 'shoesColor'] = '{}'::jsonb   -- 그 밖의 키는 허용하지 않는다
      and avatar ->> 'eyes' ~ '^[a-z0-9-]{1,32}$'
      and avatar ->> 'brows' ~ '^[a-z0-9-]{1,32}$'
      and avatar ->> 'mouth' ~ '^[a-z0-9-]{1,32}$'
      and (not avatar ? 'mouthOpen' or avatar ->> 'mouthOpen' ~ '^[a-z0-9-]{1,32}$')
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
  '캐릭터 차림(#56): 피부색·눈·눈색·눈썹·다문 입·벌린 입(mouthOpen, 없어도 됨)·머리·머리색·상의·상의색·하의·하의색·신발·신발색. 부품 목록은 src/avatar/parts.json. 예전 {"model":"a~r"} 도 받음';

commit;
