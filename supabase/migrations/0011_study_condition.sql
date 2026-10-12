-- 두뜀 0011: 공부 기록에 실험 조건을 남긴다 (#47 캐릭터 숨김 모드)
-- 실행 위치: Supabase 대시보드 > SQL Editor
--
-- 배경:
--   사용자 실험은 같은 지점에서 "다른 참여자 캐릭터가 보이는 조건(visible)"과
--   "숨긴 조건(hidden, 캠 OFF 에 해당)"을 비교한다. 두 조건의 공부 기록을 나눠 보려면
--   기록마다 어느 조건이었는지 남아 있어야 한다.
--
--   조건은 진행자가 준 링크(?condition=hidden)로 브라우저에 정해지고,
--   공부 기록을 저장할 때 같이 보낸다. (src/study/condition.ts, StudyRunner.tsx)
--
-- 기본값을 visible 로 두는 이유:
--   이 파일을 실행하기 전에 쌓인 기록은 모두 보이는 모드였다.
--   또 화면 코드는 이 칸이 아직 없으면 조건 없이 다시 저장하도록 되어 있어,
--   실행 순서가 어긋나도 기록 저장이 멈추지 않는다.
--
-- RLS: study_logs 의 기존 정책(본인 것만 조회·추가)을 그대로 따른다. 바꿀 것 없음.

begin;

alter table public.study_logs
  add column condition text not null default 'visible'
  check (condition in ('visible', 'hidden'));

comment on column public.study_logs.condition is
  '사용자 실험 조건. visible: 다른 참여자 캐릭터가 보임, hidden: 캐릭터 숨김 모드(접속 인원 수만 표시)';

commit;

-- 화면 쪽 API(PostgREST)가 새 칸을 바로 알도록 스키마 정보를 다시 읽게 한다.
notify pgrst, 'reload schema';
