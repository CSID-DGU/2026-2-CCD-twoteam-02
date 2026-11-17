-- 두뜀 0071: 화면 에러·FPS 기록과 팀 전용 운영 대시보드 (#590)
--
-- 문제
--   운영을 열면 사용자 화면에서 생기는 요청 실패(4xx·5xx), 실시간 연결 끊김, 화면 끊김(FPS)을
--   신고가 없으면 알 수 없다. 서버 쪽은 usage-monitor 가 보지만 화면 쪽 기록이 없다.
--
-- 방법
--   1) 화면이 1분마다 요약해 보낸다. FPS 는 한 사람의 1분(장소별) 한 줄, 에러는 1분 동안 같은 에러를 묶어 한 줄.
--      웹캠·트래킹 수치·요청 본문·입력한 글은 보내지 않는다. 에러 메시지는 화면에서 입력값을 지운 앞부분만.
--   2) 두 표는 RLS 를 켜고 정책을 두지 않는다. 넣기는 ops_report, 보기는 ops_dashboard(팀만) 함수로만.
--      보낸 사람은 화면 값이 아니라 auth.uid() 로 정한다(0070 과 같은 원칙).
--   3) 너무 많이 보내지 못하게: 한 번에 FPS 5줄·에러 30줄, 한 사람의 한 분에 서로 다른 에러 30개, 횟수 10000 까지.
--      시각은 지금 기준 10분 전 ~ 1분 뒤만 받고, 벗어난 줄은 건너뛴다(PC 시계가 틀린 사람 때문에 전체를 버리지 않게).
--   4) 원본은 90일 보관. pg_cron 이 매일 지운다.
--
-- 적용할 DB: 서비스 Supabase 먼저(develop 머지 전). 운영 Supabase 는 main 에 올리기 전.
begin;

-- ---------------------------------------------------------------
-- 1. 표
--    유일 키에 null 이 끼면 같은 줄로 보지 않으므로 모든 칸을 not null(빈 문자열 기본값)로 둔다.
-- ---------------------------------------------------------------
create table public.ops_fps (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  minute      timestamptz not null,
  place       text not null check (char_length(place) between 1 and 40),
  fps_avg     smallint not null check (fps_avg between 0 and 1000),
  fps_min     smallint not null check (fps_min between 0 and 1000),
  low_seconds smallint not null check (low_seconds between 0 and 60), -- 30FPS 미만이었던 초
  seconds     smallint not null check (seconds between 1 and 60),     -- 실제로 잰 초 (다른 탭에 있던 시간 제외)
  browser     text not null default '' check (char_length(browser) <= 20),
  os          text not null default '' check (char_length(os) <= 20),
  mobile      boolean not null default false,
  cores       smallint not null default 0 check (cores between 0 and 256),
  gpu         text not null default '' check (char_length(gpu) <= 80),
  version     text not null default '' check (char_length(version) <= 12), -- 배포 커밋 앞 7자
  unique (user_id, minute, place)
);

create table public.ops_errors (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  minute  timestamptz not null,
  place   text not null default '' check (char_length(place) <= 40),
  kind    text not null check (kind in ('supabase', 'relay', 'realtime', 'js')),
  code    text not null check (char_length(code) between 1 and 16),      -- 409, 4503, TIMED_OUT, error
  target  text not null default '' check (char_length(target) <= 80),   -- rpc/assign_seat, room/lobby
  detail  text not null default '' check (char_length(detail) <= 120),  -- DB 에러 번호와 메시지 앞부분
  count   int not null check (count between 1 and 10000),
  browser text not null default '' check (char_length(browser) <= 20),
  version text not null default '' check (char_length(version) <= 12),
  unique (user_id, minute, kind, code, target, place)
);

create index ops_fps_minute on public.ops_fps (minute);
create index ops_errors_minute on public.ops_errors (minute);

alter table public.ops_fps enable row level security;
alter table public.ops_errors enable row level security;
revoke all on public.ops_fps, public.ops_errors from anon, authenticated;
-- 정책을 두지 않는다: 화면은 아래 함수로만 넣고 읽는다.

-- ---------------------------------------------------------------
-- 2. 넣기
--   p_device  {browser, os, mobile, cores, gpu, version} 이번 호출의 모든 줄에 넣는다
--   p_fps     [{minute, place, fps_avg, fps_min, low_seconds, seconds}]   5줄까지
--   p_errors  [{minute, place, kind, code, target, detail, count}]        30줄까지
-- ---------------------------------------------------------------
create function public.ops_report(p_device jsonb, p_fps jsonb, p_errors jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me      uuid := (select auth.uid());
  v_fps     jsonb := coalesce(p_fps, '[]'::jsonb);
  v_errors  jsonb := coalesce(p_errors, '[]'::jsonb);
  v_browser text := left(coalesce(p_device ->> 'browser', ''), 20);
  v_os      text := left(coalesce(p_device ->> 'os', ''), 20);
  v_mobile  boolean := coalesce((p_device ->> 'mobile')::boolean, false);
  v_cores   int := least(greatest(coalesce((p_device ->> 'cores')::int, 0), 0), 256);
  v_gpu     text := left(coalesce(p_device ->> 'gpu', ''), 80);
  v_version text := left(coalesce(p_device ->> 'version', ''), 12);
  v_e       jsonb;
  v_minute  timestamptz;
  v_place   text;
  v_kind    text;
  v_code    text;
  v_target  text;
begin
  if v_me is null then
    raise exception '로그인이 필요해요.';
  end if;
  if jsonb_typeof(v_fps) <> 'array' or jsonb_typeof(v_errors) <> 'array' then
    raise exception '기록 형식이 맞지 않아요.';
  end if;
  if jsonb_array_length(v_fps) > 5 or jsonb_array_length(v_errors) > 30 then
    raise exception '한 번에 보낼 수 있는 기록을 넘었어요.';
  end if;

  for v_e in select value from jsonb_array_elements(v_fps) loop
    v_minute := date_trunc('minute', (v_e ->> 'minute')::timestamptz);
    continue when v_minute < now() - interval '10 minutes' or v_minute > now() + interval '1 minute';
    insert into public.ops_fps (user_id, minute, place, fps_avg, fps_min, low_seconds, seconds, browser, os, mobile, cores, gpu, version)
    values (
      v_me, v_minute, v_e ->> 'place',
      (v_e ->> 'fps_avg')::int, (v_e ->> 'fps_min')::int, (v_e ->> 'low_seconds')::int, (v_e ->> 'seconds')::int,
      v_browser, v_os, v_mobile, v_cores, v_gpu, v_version
    )
    on conflict (user_id, minute, place) do nothing;
  end loop;

  for v_e in select value from jsonb_array_elements(v_errors) loop
    v_minute := date_trunc('minute', (v_e ->> 'minute')::timestamptz);
    continue when v_minute < now() - interval '10 minutes' or v_minute > now() + interval '1 minute';
    v_place  := coalesce(v_e ->> 'place', '');
    v_kind   := v_e ->> 'kind';
    v_code   := v_e ->> 'code';
    v_target := coalesce(v_e ->> 'target', '');
    -- 처음 보는 에러는 이 사람의 이 분에 30종이 안 됐을 때만 받는다
    if not exists (
      select 1 from public.ops_errors o
      where o.user_id = v_me and o.minute = v_minute and o.kind = v_kind and o.code = v_code and o.target = v_target and o.place = v_place
    ) and (select count(*) from public.ops_errors o where o.user_id = v_me and o.minute = v_minute) >= 30 then
      continue;
    end if;
    insert into public.ops_errors (user_id, minute, place, kind, code, target, detail, count, browser, version)
    values (
      v_me, v_minute, v_place, v_kind, v_code, v_target, left(coalesce(v_e ->> 'detail', ''), 120),
      least(greatest(coalesce((v_e ->> 'count')::int, 1), 1), 10000), v_browser, v_version
    )
    on conflict (user_id, minute, kind, code, target, place) do update
      set count  = least(public.ops_errors.count + excluded.count, 10000),
          detail = case when excluded.detail <> '' then excluded.detail else public.ops_errors.detail end;
  end loop;
end;
$$;

revoke execute on function public.ops_report(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.ops_report(jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------
-- 3. 보기 (팀만). 대시보드에 필요한 요약을 jsonb 하나로 돌려준다.
--    시간대 묶음: 1시간 이하 1분, 24시간 이하 30분, 7일 이하 3시간, 그 위 1일. 기간은 31일까지.
--    이상치 분: 평균 30 미만이거나 30 미만이 10초 이상.
-- ---------------------------------------------------------------
create function public.ops_dashboard(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_span   interval := p_to - p_from;
  v_bucket int;
  v_step   interval;
  v_result jsonb;
begin
  if not public.is_team() then
    raise exception '팀만 볼 수 있어요.';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or v_span > interval '31 days' then
    raise exception '기간이 맞지 않아요.';
  end if;
  v_bucket := case
    when v_span <= interval '1 hour' then 60
    when v_span <= interval '24 hours' then 1800
    when v_span <= interval '7 days' then 10800
    else 86400
  end;
  v_step := make_interval(secs => v_bucket);

  with
    f as (select * from public.ops_fps where minute >= p_from and minute < p_to),
    e as (select * from public.ops_errors where minute >= p_from and minute < p_to),
    lf as (select * from f where fps_avg < 30 or low_seconds >= 10)
  select jsonb_build_object(
    'bucket_seconds', v_bucket,
    'summary', jsonb_build_object(
      'users', (select count(distinct u.user_id) from (select user_id from f union all select user_id from e) u),
      'errors', (select coalesce(sum(count), 0) from e),
      'errors_4xx', (select coalesce(sum(count), 0) from e where code ~ '^4\d\d$'),
      'errors_5xx', (select coalesce(sum(count), 0) from e where code ~ '^5\d\d$'),
      'fps_minutes', (select count(*) from f),
      'low_minutes', (select count(*) from lf),
      'fps_median', (select round(percentile_cont(0.5) within group (order by fps_avg))::int from f)
    ),
    'error_series', coalesce((
      select jsonb_agg(jsonb_build_object('t', s.t, 'kind', s.kind, 'n', s.n) order by s.t, s.kind)
      from (select date_bin(v_step, minute, timestamptz '2000-01-01') as t, kind, sum(count)::int as n from e group by 1, 2) s
    ), '[]'::jsonb),
    'fps_series', coalesce((
      select jsonb_agg(jsonb_build_object('t', s.t, 'avg', s.avg, 'low_pct', s.low_pct) order by s.t)
      from (
        select date_bin(v_step, minute, timestamptz '2000-01-01') as t,
               round(avg(fps_avg))::int as avg,
               round(100.0 * count(*) filter (where fps_avg < 30 or low_seconds >= 10) / count(*))::int as low_pct
        from f group by 1
      ) s
    ), '[]'::jsonb),
    'top_errors', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.count desc, t.last desc)
      from (
        select kind, code, target,
               mode() within group (order by detail) as detail,
               mode() within group (order by place) as place,
               sum(count)::int as count,
               count(distinct user_id)::int as users,
               min(minute) as first,
               max(minute) as last,
               mode() within group (order by browser) as browser,
               (array_agg(version order by minute desc))[1] as version
        from e group by kind, code, target
        order by sum(count) desc, max(minute) desc
        limit 50
      ) t
    ), '[]'::jsonb),
    'outliers', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.minute desc)
      from (
        select minute, place, fps_avg, fps_min, low_seconds, browser, os, mobile, gpu, version
        from lf order by minute desc limit 100
      ) o
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.ops_dashboard(timestamptz, timestamptz) from public, anon;
grant execute on function public.ops_dashboard(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------
-- 4. 90일 지난 기록 지우기. pg_cron 만 부른다.
-- ---------------------------------------------------------------
create function public.delete_old_ops_telemetry()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.ops_fps where minute < now() - interval '90 days';
  delete from public.ops_errors where minute < now() - interval '90 days';
$$;

revoke execute on function public.delete_old_ops_telemetry() from public, anon, authenticated;
comment on function public.delete_old_ops_telemetry() is
  '90일 지난 화면 에러·FPS 기록을 지운다. pg_cron 이 하루 한 번 부른다. (#590)';

commit;

-- 예약 작업 (트랜잭션 밖, 0045 와 같은 방식. 다시 실행해도 중복되지 않음). 매일 서울 새벽 4시 27분 (UTC 19:27)
create extension if not exists pg_cron;

select cron.unschedule('ops-telemetry-retention')
where exists (select 1 from cron.job where jobname = 'ops-telemetry-retention');

select cron.schedule(
  'ops-telemetry-retention',
  '27 19 * * *',
  $$ select public.delete_old_ops_telemetry(); $$
);

-- 화면 쪽 API(PostgREST)가 새 함수를 바로 알도록 스키마 정보를 다시 읽게 한다.
notify pgrst, 'reload schema';
