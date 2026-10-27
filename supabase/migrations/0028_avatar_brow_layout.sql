-- 두뜀 0028: 캐릭터 꾸미기 — 눈썹 높이·크기 (#293)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
-- 0027 을 먼저 실행해 두어야 한다.
--
-- 배경:
--   눈썹 높이(browY)·크기(browSize)를 눈과 따로 조절한다(눈썹 간격은 눈을 따라감). 정수 칸 2개를 더한다(없어도 됨).
--   범위는 다른 위치·크기 칸처럼 -50 ~ 50 의 정수만 확인한다. 나머지는 0027 과 같다.

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
    -- 꾸미기 형식: 13칸은 꼭 있고 mouthOpen·closedEyes 와 위치·크기 7칸은 있어도 없어도 된다.
    -- 부품 id 는 영문 소문자·숫자·- 32자까지, 색은 '#rrggbb', 위치·크기는 -50 ~ 50 의 정수
    -- 값이 null 이면 ->> 가 null 이 되고, check 는 null 을 "통과"로 친다. 그래서 coalesce 로 null 을 거짓으로 바꾼다.
    coalesce((
      avatar ?& array['skin', 'eyes', 'eyeColor', 'brows', 'mouth', 'hair', 'hairColor',
                      'top', 'topColor', 'bottom', 'bottomColor', 'shoes', 'shoesColor']
      and avatar - array['skin', 'eyes', 'closedEyes', 'eyeColor', 'brows', 'mouth', 'mouthOpen', 'hair', 'hairColor',
                         'top', 'topColor', 'bottom', 'bottomColor', 'shoes', 'shoesColor',
                         'eyeX', 'eyeY', 'eyeSize', 'browY', 'browSize', 'mouthY', 'mouthSize'] = '{}'::jsonb   -- 그 밖의 키는 허용하지 않는다
      and avatar ->> 'eyes' ~ '^[a-z0-9-]{1,32}$'
      and avatar ->> 'brows' ~ '^[a-z0-9-]{1,32}$'
      and avatar ->> 'mouth' ~ '^[a-z0-9-]{1,32}$'
      and (not avatar ? 'mouthOpen' or avatar ->> 'mouthOpen' ~ '^[a-z0-9-]{1,32}$')
      and (not avatar ? 'closedEyes' or avatar ->> 'closedEyes' ~ '^[a-z0-9-]{1,32}$')
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
      -- 위치·크기: 있으면 -50 ~ 50 의 정수(JSON 숫자). and 는 계산 순서를 보장하지 않아서, 1.5 같은 값을 int 로 바꾸다 오류가 나지 않게
      -- case 로 "정수 모양인지"를 먼저 보고 그때만 크기를 잰다
      and (not avatar ? 'eyeX' or case when jsonb_typeof(avatar -> 'eyeX') = 'number' and avatar ->> 'eyeX' ~ '^-?[0-9]{1,2}$' then abs((avatar ->> 'eyeX')::int) <= 50 else false end)
      and (not avatar ? 'eyeY' or case when jsonb_typeof(avatar -> 'eyeY') = 'number' and avatar ->> 'eyeY' ~ '^-?[0-9]{1,2}$' then abs((avatar ->> 'eyeY')::int) <= 50 else false end)
      and (not avatar ? 'eyeSize' or case when jsonb_typeof(avatar -> 'eyeSize') = 'number' and avatar ->> 'eyeSize' ~ '^-?[0-9]{1,2}$' then abs((avatar ->> 'eyeSize')::int) <= 50 else false end)
      and (not avatar ? 'browY' or case when jsonb_typeof(avatar -> 'browY') = 'number' and avatar ->> 'browY' ~ '^-?[0-9]{1,2}$' then abs((avatar ->> 'browY')::int) <= 50 else false end)
      and (not avatar ? 'browSize' or case when jsonb_typeof(avatar -> 'browSize') = 'number' and avatar ->> 'browSize' ~ '^-?[0-9]{1,2}$' then abs((avatar ->> 'browSize')::int) <= 50 else false end)
      and (not avatar ? 'mouthY' or case when jsonb_typeof(avatar -> 'mouthY') = 'number' and avatar ->> 'mouthY' ~ '^-?[0-9]{1,2}$' then abs((avatar ->> 'mouthY')::int) <= 50 else false end)
      and (not avatar ? 'mouthSize' or case when jsonb_typeof(avatar -> 'mouthSize') = 'number' and avatar ->> 'mouthSize' ~ '^-?[0-9]{1,2}$' then abs((avatar ->> 'mouthSize')::int) <= 50 else false end)
    ), false)
  );

comment on column public.profiles.avatar is
  '캐릭터 차림(#56): 피부색·뜬 눈·감은 눈(closedEyes, 없어도 됨)·눈색·눈썹·다문 입·벌린 입(mouthOpen, 없어도 됨)·머리·머리색·상의·상의색·하의·하의색·신발·신발색, 눈·눈썹·입 위치·크기(#293: eyeX·eyeY·eyeSize·browY·browSize·mouthY·mouthSize, 정수, 없어도 됨). 부품 목록은 src/avatar/parts.json. 예전 {"model":"a~r"} 도 받음';

commit;
