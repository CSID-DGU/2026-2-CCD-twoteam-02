-- DB 상태 점검 확장 (0060_usage_monitor.sql 이후에 실행)
-- 여러 번 실행해도 안전합니다.

-- 상태형 지표의 현재 단계 (0=정상, 1=주의, 2=위험) — 재알림·복구 알림용
create table if not exists public.usage_monitor_health_state (
  metric        text primary key,
  level         int  not null default 0,
  since         timestamptz not null default now(),
  last_alert_at timestamptz,
  value         numeric
);

-- 직전 실행값 보관 (CPU 사용률 계산용)
create table if not exists public.usage_monitor_kv (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.usage_monitor_health_state enable row level security;
alter table public.usage_monitor_kv           enable row level security;

-- DB 내부 상태 한 번에 수집
-- 쿼리 원문(pg_stat_activity)은 실제 값이 들어 있을 수 있어 Slack으로 보내지 않고,
-- 느린 쿼리는 값이 $1 등으로 치환된 pg_stat_statements 기준으로만 보냅니다.
create or replace function public.usage_monitor_health_stats()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  slow   jsonb := null;
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
        select left(regexp_replace(s.query, '\s+', ' ', 'g'), 120) as query,
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

  return result || jsonb_build_object('slow_queries', slow);
end;
$$;

revoke all on function public.usage_monitor_health_stats() from public, anon, authenticated;
grant execute on function public.usage_monitor_health_stats() to service_role;
