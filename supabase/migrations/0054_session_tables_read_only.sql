-- 이용권·좌석·회의실 이용 테이블의 직접 쓰기 권한 회수 (#413)
--
-- 이용권 발급, 좌석·회의실 배정, 반납, 연장, 접속 신호, 자동 반납은 모두
-- security definer 함수(0008·0009·0014·0016·0017·0018)가 한다. 함수는 만든 사람(postgres)
-- 권한으로 돌기 때문에 호출한 사람의 테이블 권한이 필요 없다.
-- 그런데 Supabase 가 public 스키마의 새 테이블에 authenticated 의 쓰기 권한을 기본으로 주고,
-- 0004 의 "본인 행만" 쓰기 정책이 그 권한을 그대로 열어 두어서
-- 함수를 거치지 않고 Data API 로 직접 쓸 수 있었다.
--
-- 그래서 passes·seat_sessions·room_sessions 는 SELECT 만 남긴다.
-- 화면은 이 세 테이블을 조회만 한다(useMySeat·useCafeSeat).
--
-- study_logs 는 공부 기록 저장(StudyRunner)이 직접 INSERT 하므로 SELECT·INSERT 를 남긴다.
-- 수정·삭제 정책은 원래 없어서(0004) 막혀 있었지만, 남아 있던 UPDATE·DELETE·TRUNCATE 권한도 같이 회수한다.
--
-- RLS 정책은 지우지 않는다. 권한이 없으면 정책은 쓰이지 않는다.
-- 다시 실행해도 결과는 같다.

begin;

revoke all on public.passes, public.seat_sessions, public.room_sessions
  from public, anon, authenticated;
grant select on public.passes, public.seat_sessions, public.room_sessions to authenticated;

revoke all on public.study_logs from public, anon, authenticated;
grant select, insert on public.study_logs to authenticated;

commit;
