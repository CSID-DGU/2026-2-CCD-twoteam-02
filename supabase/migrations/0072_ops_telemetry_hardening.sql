-- 두뜀 0072: 운영 기록 넣기·보기 함수 보강 (#590, 0071 검토 후속)
--
-- 문제 (0071 브랜치 검토에서 나옴)
--   1) 기록은 로그인한 누구나(게스트 포함) 보낼 수 있는데 대상·코드·장소·버전의 글자를 검사하지 않았다.
--      이 값은 대시보드의 "AI 프롬프트 복사"에서 명령 줄(rg, git show)에 들어가, 셸 명령을 심어 팀원 AI 도구로 흘려보낼 수 있었다.
--   2) FPS 는 장소 이름이 자유 문자열이라, 장소를 바꿔 가며 보내면 한 사람이 줄을 무한히 늘릴 수 있었다.
--   3) 시간대 묶음 기준점(timestamptz '2000-01-01')이 DB 세션 시간대를 따라, 시간대가 바뀌면 하루·3시간 묶음이 어긋났다.
--
-- 방법
--   1) ops_report: 코드·대상·장소는 정해진 글자만 받고 아니면 그 줄을 건너뛴다. 버전은 커밋 7자 또는 dev 가 아니면 비운다.
--      (화면 buildPrompt 도 같은 검사로 한 번 더 거른다)
--   2) FPS 장소는 plaza·campus·beach·meeting·branch:<slug> 만, 한 사람의 한 분에 3줄까지.
--   3) ops_dashboard: 기준점을 UTC 로 고정 ('2000-01-01 00:00:00+00').
--   표·권한은 0071 그대로다. create or replace 는 실행 권한을 유지한다.
--
-- 적용할 DB: 0071 을 적용한 DB(서비스). 운영은 main 에 올리기 전에 0071 다음에 실행.
begin;

create or replace function public.ops_report(p_device jsonb, p_fps jsonb, p_errors jsonb)
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
  v_version text := coalesce(p_device ->> 'version', '');
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
  -- 배포 버전은 커밋 앞 7자 또는 dev 만. 아니면 비움 (프롬프트의 git show 줄에 들어감)
  if v_version !~ '^([0-9a-f]{7}|dev)$' then
    v_version := '';
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
    v_place := v_e ->> 'place';
    -- 정해진 장소만 (장소 이름을 바꿔 가며 줄을 무한히 늘리지 못하게)
    continue when v_place is null or v_place !~ '^(plaza|campus|beach|meeting|branch:[a-z0-9_-]{1,32})$';
    -- 한 사람의 한 분에 3줄까지 (한 분 안에 장소를 옮기는 경우)
    continue when (select count(*) from public.ops_fps o where o.user_id = v_me and o.minute = v_minute) >= 3;
    insert into public.ops_fps (user_id, minute, place, fps_avg, fps_min, low_seconds, seconds, browser, os, mobile, cores, gpu, version)
    values (
      v_me, v_minute, v_place,
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
    -- 형식이 맞지 않는 줄은 건너뜀. 이 값들은 대시보드의 AI 프롬프트 명령 줄(rg)에 들어가므로 정해진 글자만 허용
    continue when v_code is null or v_code !~ '^[A-Za-z0-9_]{1,16}$'
      or v_target !~ '^[A-Za-z0-9_:./-]*$'
      or v_place !~ '^[a-z0-9:_-]*$';
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

create or replace function public.ops_dashboard(p_from timestamptz, p_to timestamptz)
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
      from (select date_bin(v_step, minute, timestamptz '2000-01-01 00:00:00+00') as t, kind, sum(count)::int as n from e group by 1, 2) s
    ), '[]'::jsonb),
    'fps_series', coalesce((
      select jsonb_agg(jsonb_build_object('t', s.t, 'avg', s.avg, 'low_pct', s.low_pct) order by s.t)
      from (
        select date_bin(v_step, minute, timestamptz '2000-01-01 00:00:00+00') as t,
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

commit;

-- 화면 쪽 API(PostgREST)가 바뀐 함수를 바로 알도록 스키마 정보를 다시 읽게 한다.
notify pgrst, 'reload schema';
