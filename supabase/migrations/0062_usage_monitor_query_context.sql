-- 일일 점검 개선: 느린 쿼리 원문을 더 길게(설명 판별용), 예약 작업 목록·함수 설명 함께 반환
-- 0061_usage_monitor_health.sql 이후에 실행. 여러 번 실행해도 안전합니다.
--
-- 팁: 우리 앱 함수에 설명을 달아두면 일일 점검의 쿼리 설명에 함께 표시됩니다.
--   comment on function public.release_disconnected() is '연결 끊긴 사용자의 좌석 정리';

create or replace function public.usage_monitor_health_stats()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  slow   jsonb := null;
  cron_jobs   jsonb := '[]'::jsonb;
  fn_comments jsonb := '{}'::jsonb;
begin
  select jsonb_build_object(
    'connections', (
      select count(*) from pg_catalog.pg_stat_activity
      where backend_type = 'client backend'),
    'max_connections', pg_catalog.current_setting('max_connections')::int,
    'longest_running_min', (
      select coalesce(round((extract(epoch from max(now() - query_start)) / 60)::numeric, 1), 0)
      from pg_catalog.pg_stat_activity
      where backend_type = 'client backend' and state = 'active'
        and pid <> pg_catalog.pg_backend_pid()),
    'long_running_count', (
      select count(*) from pg_catalog.pg_stat_activity
      where backend_type = 'client backend' and state = 'active'
        and pid <> pg_catalog.pg_backend_pid()
        and now() - query_start > interval '5 minutes'),
    'idle_in_tx', (
      select count(*) from pg_catalog.pg_stat_activity
      where backend_type = 'client backend' and state like 'idle in transaction%'
        and now() - state_change > interval '5 minutes'),
    'blocked', (
      select count(*) from pg_catalog.pg_stat_activity
      where backend_type = 'client backend'
        and pg_catalog.cardinality(pg_catalog.pg_blocking_pids(pid)) > 0
        and now() - query_start > interval '1 minute'),
    'cache_hit_pct', (
      select round(100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 2)
      from pg_catalog.pg_stat_database where datname = pg_catalog.current_database()),
    'dead_tuples', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select schemaname || '.' || relname as tbl,
               n_dead_tup as dead,
               n_live_tup as live,
               round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 1) as dead_pct,
               greatest(last_autovacuum, last_vacuum) as last_vacuum
        from pg_catalog.pg_stat_user_tables
        where n_dead_tup > 1000 and n_dead_tup > 0.2 * (n_live_tup + n_dead_tup)
        order by n_dead_tup desc limit 5) t)
  ) into result;

  -- pg_stat_statements가 없거나 권한이 없으면 건너뜀
  begin
    execute $q$
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select left(regexp_replace(s.query, '\s+', ' ', 'g'), 600) as query,
               r.rolname as role,
               s.calls,
               round(s.mean_exec_time::numeric, 1) as mean_ms,
               round((s.total_exec_time / 1000)::numeric, 1) as total_sec,
               round((100 * s.total_exec_time / nullif(sum(s.total_exec_time) over (), 0))::numeric, 1) as pct
        from extensions.pg_stat_statements s
        join pg_catalog.pg_roles r on r.oid = s.userid
        order by s.total_exec_time desc
        limit 5) t
    $q$ into slow;
  exception when others then
    slow := null;
  end;

  -- 쿼리 설명용: 예약 작업 목록, public 함수 설명(COMMENT)
  begin
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object('jobname', jobname, 'schedule', schedule, 'command', command)), '[]'::jsonb)
      from cron.job where active
    $q$ into cron_jobs;
  exception when others then
    cron_jobs := '[]'::jsonb;
  end;

  select coalesce(jsonb_object_agg(p.proname, d.description), '{}'::jsonb) into fn_comments
  from pg_catalog.pg_proc p
  join pg_catalog.pg_description d on d.objoid = p.oid and d.classoid = 'pg_catalog.pg_proc'::pg_catalog.regclass
  where p.pronamespace = 'public'::pg_catalog.regnamespace;

  return result || jsonb_build_object('slow_queries', slow, 'cron_jobs', cron_jobs, 'fn_comments', fn_comments);
end;
$$;

revoke all on function public.usage_monitor_health_stats() from public, anon, authenticated;
grant execute on function public.usage_monitor_health_stats() to service_role;
