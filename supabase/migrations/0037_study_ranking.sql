-- 두뜀 0037: 공부 시간 순위 (#59, 광장 순위 게시판)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 DB. experiment DB 에는 실행하지 않음)
--
-- 배경:
--   광장 게시판에 오늘·이번 주 공부 시간 순위를 보여 준다.
--   공부 시간은 study_logs.focused_seconds(초록불) 합계를 분으로 바꾼 값이다(버림).
--   공부 중에는 5분마다 기록 조각이 저장되므로, 공부 중인 사람도 5분 안쪽으로 반영된다.
--   한 조각의 시간은 그 조각의 실제 길이를 넘지 못하게 자른다(직접 넣은 터무니없는 값 막기).
--
-- 누가 순위에 나오나:
--   프로필 공부 기록 공개 범위(0013)가 '모두'(public)인 사람만. 그래서 순위는 누구에게나 같다.
--   '친구만'·'나만'인 사람은 남의 순위에 나오지 않고, 자기 줄(me)만 자기에게 돌아간다.
--
-- 왜 함수인가:
--   study_logs 는 본인 것만 읽을 수 있다(0004). profile_summary(0013)처럼 security definer 함수가
--   공개 범위를 직접 확인하고, 닉네임과 분 단위 합계만 돌려준다. 기록 원본(시각·과목)은 내보내지 않는다.
--
-- 순위 규칙:
--   1분 이상만. 같은 분이면 같은 등수(rank: 1, 2, 2, 4). 같은 등수 안에서는 닉네임 순.
--   top 은 20줄까지(20위에 동점이 걸려도 20줄에서 자름).
--   me.rank 는 "내가 공개 순위에 들어갔다면"의 등수 = 나보다 분이 많은 공개 사용자 수 + 1. 내가 0분이면 null.
--
-- 기간: 서울(Asia/Seoul) 기준. today 는 오늘 0시부터, week 는 이번 주 월요일 0시부터. 기록의 시작 시각(started_at)으로 거른다.

begin;

create function public.study_ranking(p_period text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me         uuid := auth.uid();
  v_today      date := (now() at time zone 'Asia/Seoul')::date;
  v_from       timestamptz;
  v_top_n      constant int := 20;
  v_my_minutes bigint;
  v_my_vis     text;
  v_top        jsonb;
  v_my_rank    bigint;
begin
  if v_me is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  if p_period = 'today' then
    v_from := v_today::timestamp at time zone 'Asia/Seoul';
  elsif p_period = 'week' then
    v_from := (v_today - (extract(isodow from v_today)::int - 1))::timestamp at time zone 'Asia/Seoul'; -- 이번 주 월요일 0시
  else
    raise exception '기간은 today 또는 week 입니다.' using errcode = '22023';
  end if;

  -- 한 번에 계산: 기간 안 기록 → 사람별 분 → 공개 순위 1~20위, 내 분, 내 등수
  --   한 조각의 시간은 그 조각의 실제 길이(ended_at - started_at)를 넘지 못하게 자릅니다.
  --   study_logs 는 본인이 직접 넣는 표라, 터무니없는 값 하나로 순위 1위가 되거나 합계가 넘쳐
  --   모두의 순위가 오류 나는 것을 막습니다. 합계는 bigint 로 둡니다.
  with logs as (
    select l.user_id,
           least(l.focused_seconds::bigint, floor(extract(epoch from (l.ended_at - l.started_at)))::bigint) as seconds
    from public.study_logs l
    where l.started_at >= v_from
  ),
  totals as (
    select user_id, div(sum(seconds), 60)::bigint as minutes from logs group by user_id -- 정수 몫 (bigint 의 sum 은 numeric 이라 / 60 이 소수가 됨)
  ),
  pub as (
    select p.id, p.nickname, t.minutes, rank() over (order by t.minutes desc) as rnk
    from totals t
    join public.profiles p on p.id = t.user_id
    where p.visibility = 'public' and t.minutes >= 1
  ),
  mine as (
    select coalesce((select t.minutes from totals t where t.user_id = v_me), 0) as minutes
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object('rank', r.rnk, 'id', r.id, 'nickname', r.nickname, 'minutes', r.minutes)
                               order by r.minutes desc, r.nickname, r.id), '[]'::jsonb)
     from (select * from pub order by minutes desc, nickname, id limit v_top_n) r),
    m.minutes,
    case when m.minutes >= 1
      then (select count(*) + 1 from pub where pub.minutes > m.minutes and pub.id <> v_me) end
  into v_top, v_my_minutes, v_my_rank
  from mine m;

  select p.visibility into v_my_vis from public.profiles p where p.id = v_me;

  return jsonb_build_object(
    'period', p_period,
    'top', v_top,
    'me', jsonb_build_object('minutes', v_my_minutes, 'rank', v_my_rank, 'visibility', coalesce(v_my_vis, 'public'))
  );
end;
$$;

-- 로그인한 사용자만 부를 수 있다. (Supabase 는 public 스키마 함수를 anon 에게도 기본으로 열어 줌, 0006 참고)
revoke execute on function public.study_ranking(text) from public, anon;
grant execute on function public.study_ranking(text) to authenticated;

commit;

-- 화면 쪽 API(PostgREST)가 새 함수를 바로 알도록 스키마 정보를 다시 읽게 한다.
notify pgrst, 'reload schema';
