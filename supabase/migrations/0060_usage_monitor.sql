-- Supabase 사용량 모니터: 상태 테이블 + DB 기반 지표 집계 함수
-- 모든 테이블은 RLS를 켜고 정책을 두지 않으므로 service_role(Edge Function)만 접근할 수 있습니다.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1) 실행할 때마다 남기는 스냅샷 (추세 확인용, 90일 보관)
create table if not exists public.usage_monitor_snapshots (
  id          bigserial primary key,
  taken_at    timestamptz not null default now(),
  cycle_start date        not null,
  metric      text        not null,
  value       numeric     not null
);
create index if not exists usage_monitor_snapshots_idx
  on public.usage_monitor_snapshots (metric, taken_at desc);

-- 2) 누적형 카운터(Realtime 메시지, Egress 근사치)의 마지막 원시값과 주기 내 누적값
create table if not exists public.usage_monitor_counters (
  metric      text primary key,
  cycle_start date        not null,
  last_raw    numeric,
  accumulated numeric     not null default 0,
  updated_at  timestamptz not null default now()
);

-- 3) 주기 내 최대값(Realtime 동시접속 피크)
create table if not exists public.usage_monitor_peaks (
  cycle_start date    not null,
  metric      text    not null,
  peak        numeric not null,
  peak_at     timestamptz not null default now(),
  primary key (cycle_start, metric)
);

-- 4) 이미 보낸 경고 (같은 주기·지표·단계 경고는 한 번만)
create table if not exists public.usage_monitor_alerts_sent (
  cycle_start date not null,
  metric      text not null,
  threshold   int  not null,
  value       numeric,
  sent_at     timestamptz not null default now(),
  primary key (cycle_start, metric, threshold)
);

alter table public.usage_monitor_snapshots   enable row level security;
alter table public.usage_monitor_counters    enable row level security;
alter table public.usage_monitor_peaks       enable row level security;
alter table public.usage_monitor_alerts_sent enable row level security;

-- 5) DB 크기 / Storage 용량 / MAU(근사치)를 한 번에 계산
--    MAU: 이번 주기에 로그인했거나 세션을 갱신한 고유 사용자 수
create or replace function public.usage_monitor_db_stats(p_cycle_start timestamptz)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'db_size_bytes', pg_catalog.pg_database_size(pg_catalog.current_database()),
    'storage_bytes', coalesce((
        select sum((o.metadata->>'size')::bigint) from storage.objects o
      ), 0),
    'mau', (
      select count(*) from (
        select u.id as uid from auth.users u where u.last_sign_in_at >= p_cycle_start
        union
        select s.user_id from auth.sessions s where s.updated_at >= p_cycle_start
      ) t
    )
  );
$$;

revoke all on function public.usage_monitor_db_stats(timestamptz) from public, anon, authenticated;
grant execute on function public.usage_monitor_db_stats(timestamptz) to service_role;
