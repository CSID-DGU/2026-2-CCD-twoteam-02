-- 두뜀 0065: 남이 확인한 신고의 심각도도 바꿀 수 있게 하기 (#471)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
--
-- 배경:
--   0030 의 update 정책은 수정 뒤 checked_by 가 비었거나 본인이어야 통과한다.
--   확인 칸만 바꿀 수 있던 때는 맞았지만, 0064 로 severity 를 바꾸게 되면서
--   A 가 확인한 신고의 심각도를 B 가 바꾸면 checked_by 가 A 그대로라 거절된다.
--
-- 바꾸는 것:
--   정책(RLS)은 수정 전 값을 볼 수 없어서, "남의 이름으로 확인 못 함" 검사를 트리거로 옮긴다.
--   확인 칸(checked_at, checked_by)이 바뀔 때만 검사하므로 심각도만 바꾸는 것은 통과한다.
--   SQL Editor·service role 은 auth.uid() 가 없어 정책과 마찬가지로 이 검사를 받지 않는다.
--
-- 다시 실행해도 결과가 같다.

begin;

create or replace function public.guard_report_checked_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and (new.checked_at, new.checked_by) is distinct from (old.checked_at, old.checked_by)
     and new.checked_by is not null
     and new.checked_by <> auth.uid() then
    raise exception '다른 사람의 이름으로 확인 표시를 할 수 없습니다' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_report_checked_by() from public, anon, authenticated;

drop trigger if exists reports_guard_checked_by on public.reports;
create trigger reports_guard_checked_by
  before update on public.reports
  for each row execute function public.guard_report_checked_by();

drop policy if exists "팀만 확인 표시를 바꾼다" on public.reports;
drop policy if exists "팀만 확인 표시와 심각도를 바꾼다" on public.reports;
create policy "팀만 확인 표시와 심각도를 바꾼다"
  on public.reports for update to authenticated
  using (public.is_team())
  with check (public.is_team());

commit;
