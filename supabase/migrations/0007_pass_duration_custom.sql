-- 두뜀 0007: 이용 시간을 10분 단위 자유 입력으로 바꿈 (2주차, 백엔드·DB 육심호)
-- 실행 위치: Supabase 대시보드 > SQL Editor
--
-- 배경:
--   0005에서 이용 시간을 10·30·60·120분 네 가지로 못박았다.
--   그 뒤 키오스크 화면을 정하면서, 정해진 네 가지 중에 고르는 것 말고도
--   10분 단위로 +/- 를 눌러 원하는 시간을 직접 맞출 수 있게 하기로 했다.
--   40분·70분 같은 값이 막히므로 조건을 "10의 배수이고 10분 이상"으로 바꾼다.
--
--   상한은 두지 않는다. 한 자리를 오래 점유하는 문제를 어디까지 허용할지는
--   연장 상한과 함께 팀에서 논의 중이라, 결정된 뒤 한 번에 넣는다.

begin;

alter table public.passes drop constraint passes_duration_allowed;

alter table public.passes
  add constraint passes_duration_allowed
  check (duration_minutes >= 10 and duration_minutes % 10 = 0);

comment on column public.passes.duration_minutes is
  '이용 시간(분). 10분 이상, 10분 단위. 상한은 아직 없다(팀 논의 중).';

commit;
