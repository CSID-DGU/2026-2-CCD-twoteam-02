-- 두뜀 0015: 사용자가 넣는 값의 크기를 제한한다 (백엔드·DB 육심호)
-- 실행 위치: Supabase 대시보드 > SQL Editor
--
-- 배경:
--   화면의 maxLength 는 방어선이 아니다. API 를 직접 부르면 그냥 지나간다.
--   실제로 찔러 보니 두 곳이 뚫려 있었다.
--
--   1) profiles.avatar
--      0010 의 제약은 "model 키가 있고 a~r 인가"만 본다. 그래서
--      {"model":"a","junk":"<20만 자>"} 가 그대로 저장된다. 확인했다.
--
--      이게 단순한 용량 낭비보다 나쁜 이유: avatar 는 avatars 뷰로 모든 로그인
--      사용자에게 열려 있다. 같은 지점에 들어가면 서로의 프로필을 읽으므로,
--      한 명이 큰 값을 넣어 두면 그 공간에 들어온 모든 사람이 그걸 내려받는다.
--      한 명이 여러 명에게 부담을 떠넘기는 구조라 반드시 막아야 한다.
--
--   2) study_logs.devices (text[])
--      개수도 글자 수도 제한이 없다.
--
--   3) subjects 행 개수
--      20자 제한은 있지만 몇 개까지인지는 없다. 로컬에서 200개가 들어가는 것을 확인했다.
--      과목은 화면에 목록으로 뿌려지므로 많아지면 실제로 화면이 느려진다.
--
--   이용권·친구 요청의 개수 제한은 이번에 넣지 않는다. 트리거가 늘어나는 비용에 비해
--   캡스톤 범위에서 악용 가능성이 낮고, 한도를 잘못 잡으면 정상 사용자가 막힌다.
--   (10분권을 반복 발급하는 테스트가 걸릴 수 있다) 필요해지면 그때 추가한다.
--
--   이메일과 비밀번호는 Supabase Auth 가 이미 막는다. 10만 자로 가입을 시도해
--   "An email address is too long", "Password cannot be longer than 72 characters"
--   로 거부되는 것을 확인했다. 그래서 여기서는 다루지 않는다.

begin;

-- ---------------------------------------------------------------
-- 1. avatar 는 model 키 하나만 허용한다
--
--    'avatar - model' 은 model 키를 뺀 나머지다. 그게 빈 객체라는 것은
--    "model 외에 아무 키도 없다"는 뜻이다. 하위 질의를 쓸 수 없는
--    check 제약 안에서도 쓸 수 있는 방법이다.
--
--    나중에 머리·옷 같은 파츠를 추가하려면 이 제약을 고치는 마이그레이션이
--    필요하다. 그 불편함을 감수하는 대신, 지금은 확실히 막는다.
-- ---------------------------------------------------------------

-- 이미 들어간 쓰레기 값을 먼저 치운다. 제약을 걸기 전에 해야 한다.
update public.profiles
   set avatar = jsonb_build_object(
         'model',
         case when avatar ->> 'model' ~ '^[a-r]$' then avatar ->> 'model' else 'a' end
       )
 where avatar - 'model' <> '{}'::jsonb
    or avatar ->> 'model' is null
    or avatar ->> 'model' !~ '^[a-r]$';

alter table public.profiles drop constraint if exists profiles_avatar_model_check;

alter table public.profiles
  add constraint profiles_avatar_model_check
  check (
    avatar ? 'model'
    and avatar ->> 'model' ~ '^[a-r]$'
    and avatar - 'model' = '{}'::jsonb   -- model 외의 키는 허용하지 않는다
  );

comment on column public.profiles.avatar is
  '캐릭터 설정. model 키 하나만 쓴다({"model":"a"}). 파츠를 늘릴 때는 제약도 같이 고친다.';

-- ---------------------------------------------------------------
-- 2. study_logs.devices 의 개수와 글자 수
--
--    감지하는 전자기기 종류는 많지 않다. 넉넉히 10개, 전체 300자로 둔다.
--
--    "각 항목이 30자 이하" 로 쓰려면 unnest 로 풀어 세야 하는데, check 제약 안에는
--    하위 질의를 넣을 수 없다. 그래서 array_to_string 으로 이어 붙인 전체 길이를 본다.
--    막으려는 것이 "거대한 값이 들어오는 것" 이므로 전체 길이를 재는 것으로 충분하다.
-- ---------------------------------------------------------------
alter table public.study_logs
  add constraint study_logs_devices_check
  check (
    coalesce(array_length(devices, 1), 0) <= 10   -- 빈 배열 '{}' 은 length 가 null 이다
    and char_length(array_to_string(devices, '')) <= 300
  );

comment on column public.study_logs.devices is
  '감지된 전자기기 종류. 최대 10개, 전체 300자.';

-- ---------------------------------------------------------------
-- 3. 과목 개수 제한
--
--    check 제약으로는 "같은 테이블의 다른 행 수"를 셀 수 없어 트리거로 막는다.
--    좌석 중복 배정을 유니크 인덱스로 막은 것과 같은 이유로, 화면이 아니라 DB 가 막는다.
-- ---------------------------------------------------------------
create or replace function public.check_subject_limit()
returns trigger
language plpgsql
as $$
declare
  cnt int;
begin
  select count(*) into cnt from public.subjects where user_id = new.user_id;
  if cnt >= 50 then
    raise exception '과목은 최대 50개까지 등록할 수 있습니다.';
  end if;
  return new;
end;
$$;

create trigger subjects_limit
  before insert on public.subjects
  for each row execute function public.check_subject_limit();

comment on function public.check_subject_limit() is
  '한 사람이 등록할 수 있는 과목 수를 50개로 제한한다. 대량 생성으로 화면이 느려지는 것을 막는다.';

commit;
