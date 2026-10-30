-- 두뜀 0040: 공부 기록 조각을 넣을 때 검사하기 (#343, 겹치거나 지어낸 공부 시간 막기)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 DB. experiment DB 에는 실행하지 않음)
--
-- 배경:
--   study_logs 는 화면(StudyRunner)이 5분마다 "이 시간 동안 공부함" 조각을 직접 넣는 표다(0004: 본인 것만 넣기, 수정·삭제 없음).
--   그 권한은 앱 화면만 쓰는 것이 아니라서, 개발자 도구로 요청을 직접 보내면
--     - 같은 시간대의 조각을 여러 개 넣거나(겹치기)
--     - 실제로 앉아 있지 않던 시간의 조각을 지어 넣어
--   순위 게시판(0037)·프로필 요약(0013)·칭호의 공부 시간을 부풀릴 수 있었다.
--
-- 무엇을 막나 (새로 넣는 조각만. 이미 저장된 기록은 건드리지 않는다):
--   1. 같은 사람의 다른 조각과 시간이 겹치면 거절
--   2. 조각이 붙은 자리 이용 기록(seat_sessions)이 내 것이 아니거나, 그 이용 시작~끝(안 끝났으면 지금) 밖이면 거절
--   3. focused_seconds 가 조각 길이보다 길면 거절
--
-- 정상 기록이 걸리지 않게 둔 여유:
--   - 조각은 차례대로 저장되고 앞 조각의 끝 = 다음 조각의 시작이라 겹치지 않는다. 그래도 1초까지는 겹침으로 보지 않는다.
--   - focused_seconds 는 초를 반올림해 조각 길이보다 1초 클 수 있다 → 1초 여유
--   - 조각 시각은 사용자 컴퓨터 시계, 이용 기록 시각은 서버 시계라 어긋날 수 있다 → 앞뒤 10분 여유
--   - 같은 계정이 두 탭에서 동시에 넣는 일은 #347(한 탭만 쓰기)로 막았다. 그래도 동시에 들어오면 사람마다 차례로 검사한다(잠금).
--
-- 거절되면 화면은 "기록 저장 실패"를 띄우고 그 조각만 버린다(StudyRunner 그대로).

begin;

create function public.check_study_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_overlap   constant interval := interval '1 second';  -- 이만큼까지는 겹침으로 보지 않음
  v_clock     constant interval := interval '10 minutes'; -- 컴퓨터 시계와 서버 시계가 어긋날 수 있는 여유
  v_rounding  constant int      := 1;                      -- focused_seconds 반올림 여유(초)
  v_session   record;
begin
  -- 같은 사람의 조각은 하나씩 차례로 검사 (동시에 두 조각이 들어와도 겹침을 놓치지 않게)
  perform pg_advisory_xact_lock(hashtext('study_logs:' || new.user_id::text));

  -- 3. 공부한 초가 조각 길이보다 길면 안 됨
  if new.focused_seconds > extract(epoch from (new.ended_at - new.started_at)) + v_rounding then
    raise exception '공부 시간이 기록 조각 길이보다 깁니다.' using errcode = '22023';
  end if;

  -- 2. 내 자리 이용 기록 안의 시간이어야 함
  select ss.user_id, ss.started_at, ss.ended_at into v_session
  from public.seat_sessions ss
  where ss.id = new.session_id;
  if v_session.user_id is distinct from new.user_id then
    raise exception '내 자리 이용 기록이 아닙니다.' using errcode = '42501';
  end if;
  if new.started_at < v_session.started_at - v_clock
     or new.ended_at > coalesce(v_session.ended_at, now()) + v_clock then
    raise exception '자리를 이용한 시간 밖의 기록입니다.' using errcode = '22023';
  end if;

  -- 1. 같은 사람의 다른 조각과 겹치면 안 됨
  if exists (
    select 1 from public.study_logs l
    where l.user_id = new.user_id
      and l.started_at < new.ended_at - v_overlap
      and l.ended_at > new.started_at + v_overlap
  ) then
    raise exception '이미 기록된 시간과 겹칩니다.' using errcode = '23P01';
  end if;

  return new;
end;
$$;

create trigger study_logs_guard
  before insert on public.study_logs
  for each row execute function public.check_study_log();

commit;
