-- 두뜀 0074: 과목 색 고르기
--
-- 문제
--   과목 색은 화면이 "내 과목 중 몇 번째인지"로 정해서 고를 수 없었다.
--   내 기록의 하루 시계는 또 다른 색 목록을 "그날 처음 공부한 순서"로 써서, 같은 과목이 화면마다 다른 색이었다.
--
-- 방법
--   subjects.color : 과목을 만들 때나 과목 관리에서 고른 색(#rrggbb). 내 기록(하루 시계·도넛)과 플래너가 같은 색을 쓴다.
--   비어 있으면(null) 화면이 지금처럼 만든 순서로 색을 붙인다. 이미 있는 과목은 그대로 두고, 바꾸고 싶은 과목만 고르면 된다.
--   고를 수 있는 색 목록은 화면(src/study/subjectLogic.ts 의 SUBJECT_PALETTE)에 있다. DB 는 형식만 본다.
--
-- 권한은 그대로다: subjects 의 insert·update 정책이 본인 것만 허용한다(0004).
--
-- 적용할 DB: 서비스 Supabase (develop 머지 전). 운영 Supabase 는 main 에 올리기 전.
begin;

alter table public.subjects
  add column color text
  check (color is null or color ~ '^#[0-9a-f]{6}$');

comment on column public.subjects.color is
  '과목 색(#rrggbb 소문자). 내 기록과 플래너에서 이 과목을 칠하는 색. null 이면 화면이 만든 순서로 정한다. (0074)';

commit;

-- 화면 쪽 API(PostgREST)가 새 칸을 바로 알도록 스키마 정보를 다시 읽게 한다.
notify pgrst, 'reload schema';
