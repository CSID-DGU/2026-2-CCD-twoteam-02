-- 두뜀 0064: 신고 심각도와 Slack 알림 시각 (#471)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
--
-- 배경:
--   신고가 들어와도 목록을 열기 전에는 알 수 없고, 우선순위를 나눌 방법이 없다.
--   - severity: 팀이 신고 목록에서 고른다. null 은 아직 안 정한 것(미지정).
--   - notified_at: Edge Function report-alert 가 Slack 전송에 성공하면 적는다. null 이면 다음 실행 때 보낸다.
--
-- 권한:
--   칸 단위 grant 로 나눈다(0030 과 같은 방식). 사용자의 insert 권한은 정해진 칸에만 있어 새 칸을 넣을 수 없다.
--   update 는 0030 의 "팀만 확인 표시를 바꾼다" 정책을 그대로 받아 팀만 severity 를 바꾼다.
--   notified_at 은 authenticated 에게 주지 않으므로 팀도 바꿀 수 없고, service role 인 함수만 쓴다.
--
-- 한 번만 실행한다. 두 번 실행하면 칸이 이미 있다는 오류로 전체가 취소된다.

begin;

alter table public.reports
  add column severity text check (severity in ('critical', 'normal', 'low')),
  add column notified_at timestamptz;

-- 이미 있는 신고가 한꺼번에 Slack 으로 가지 않게 보낸 것으로 표시한다
update public.reports set notified_at = now();

-- 1분마다 도는 확인이 표 전체를 훑지 않게 한다
create index reports_unnotified_idx on public.reports (created_at)
  where notified_at is null;

grant update (severity) on public.reports to authenticated;

commit;

-- 화면 쪽 API(PostgREST)가 새 칸을 바로 알도록 스키마 정보를 다시 읽게 한다.
notify pgrst, 'reload schema';
