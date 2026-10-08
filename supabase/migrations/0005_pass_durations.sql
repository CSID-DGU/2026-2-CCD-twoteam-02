-- 두뜀 0005: 이용권 시간을 정해진 값으로만 발급하게 함 (2주차, 백엔드·DB 육심호)
-- 실행 위치: Supabase 대시보드 > SQL Editor
--
-- 배경:
--   키오스크에서 고를 수 있는 이용 시간은 10분·30분·1시간·2시간으로 정했다.
--   화면에서만 네 가지를 보여 주면, 화면을 거치지 않고 API를 직접 호출해
--   9999분짜리 이용권을 만들 수 있다. DB에서도 같은 값만 받도록 막는다.
--
--   무료 서비스라 한 자리를 오래 점유하는 것을 어디까지 허용할지는 팀에서 논의 중이다.
--   연장 상한은 결정된 뒤 별도 마이그레이션으로 추가한다. 지금은 상한이 없다.

begin;

alter table public.passes
  add constraint passes_duration_allowed
  check (duration_minutes in (10, 30, 60, 120));

comment on column public.passes.duration_minutes is
  '이용 시간(분). 10·30·60·120 만 허용한다. 키오스크 선택지와 같은 값이다.';

commit;
