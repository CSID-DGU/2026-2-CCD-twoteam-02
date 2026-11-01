-- 0048: 프로필에 내 손글씨 글씨체 칸 (스터디 플래너 노트 넘기기·글씨체, docs/superpowers/specs/2026-11-01-planner-notebook-design.md)
--
-- 왜: 가방 속 플래너·메모에 직접 쓴 글씨를 3가지 글씨체(오춘기 김작가·상주다정다감·묘은또박) 중에서 고르고,
--     다른 기기에서 로그인해도 같은 글씨로 보이게 계정에 저장한다. 값은 화면 코드(src/planner/handFonts.ts)의 id 와 같다.
-- 권한: profiles 는 0004 의 RLS("본인 프로필만 조회/수정")가 그대로 적용되어 정책을 더하지 않는다.
--     다른 사람이 보는 avatars 뷰(0010)·nicknames 뷰는 이 칸을 고르지 않으므로 남에게 보이지 않는다. 뷰는 고치지 않는다.
-- 적용: develop 으로 가는 PR 이라 머지 전에 서비스 DB(SQL Editor)에 실행한다(2026-11-01 실행함). experiment DB 에는 실행하지 않는다.
--     실행 전에 화면이 먼저 배포되면 글씨체를 읽지 못해 기본 글씨(오춘기 김작가)로 보이고, 고르기 저장만 실패한다.

begin;

alter table public.profiles
  add column hand_font text not null default 'ochungi'
  check (hand_font in ('ochungi', 'sangju', 'myoeun'));

commit;
