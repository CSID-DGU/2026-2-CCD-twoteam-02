-- 두뜀 0013: 프로필 공부 기록 공개 범위 (#43)
-- 실행 위치: Supabase 대시보드 > SQL Editor
--
-- 배경:
--   사람마다 프로필이 있고, 거기에 공부 기록 요약(누적·이번 주·최근 7일·이번 주 과목별)이 보인다.
--   공개 범위는 이 "공부 기록"을 누가 볼 수 있는지를 정한다.
--     private : 나만
--     friends : 나와 친구 (friendships 에서 accepted 인 사람)
--     public  : 로그인한 모든 사람 (기본값, 팀 결정)
--   캐릭터·닉네임은 공개 범위와 상관없이 지점 안에서 항상 보인다. (avatars 뷰, 실시간 표시)
--
-- 왜 함수인가:
--   study_logs 는 본인 것만 읽을 수 있다(0004). 남의 프로필을 보려면 남의 기록이 필요한데,
--   테이블을 열면 몇 시에 무엇을 했는지 원본이 다 나간다. 그래서 security definer 함수가
--   공개 범위와 친구 여부를 직접 확인하고, 허락될 때만 합계 숫자만 돌려준다.
--
-- 날짜는 한국 시간(Asia/Seoul) 기준, 이번 주는 월요일부터다.
-- 공개 범위를 바꾸는 것은 기존 정책("본인 프로필만 수정한다", 0004)으로 이미 가능하다.

begin;

alter table public.profiles
  add column visibility text not null default 'public'
  check (visibility in ('private', 'friends', 'public'));

comment on column public.profiles.visibility is
  '프로필 공부 기록 공개 범위. private: 나만, friends: 친구만, public: 모두. 캐릭터 표시와는 무관하다.';

create function public.profile_summary(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me         uuid := auth.uid();
  v_nickname   text;
  v_visibility text;
  v_allowed    boolean;
  v_today      date := (now() at time zone 'Asia/Seoul')::date;
  v_week_start date := v_today - (extract(isodow from v_today)::int - 1); -- 이번 주 월요일
  v_week_from  timestamptz := v_week_start::timestamp at time zone 'Asia/Seoul';
  v_days_from  timestamptz := (v_today - 6)::timestamp at time zone 'Asia/Seoul'; -- 최근 7일의 첫날 0시
begin
  if v_me is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  select nickname, visibility into v_nickname, v_visibility
  from public.profiles where id = p_user;
  if v_nickname is null then
    return null; -- 없는 사용자
  end if;

  v_allowed := p_user = v_me
    or v_visibility = 'public'
    or (v_visibility = 'friends' and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = v_me and f.addressee_id = p_user)
          or (f.requester_id = p_user and f.addressee_id = v_me))
    ));

  -- 볼 수 없으면 이름과 공개 범위만 알려 준다.
  if not v_allowed then
    return jsonb_build_object(
      'id', p_user, 'nickname', v_nickname, 'visibility', v_visibility, 'allowed', false);
  end if;

  return jsonb_build_object(
    'id', p_user,
    'nickname', v_nickname,
    'visibility', v_visibility,
    'allowed', true,
    'total_seconds', (
      select coalesce(sum(focused_seconds), 0) from public.study_logs where user_id = p_user),
    'week_seconds', (
      select coalesce(sum(focused_seconds), 0) from public.study_logs
      where user_id = p_user and started_at >= v_week_from),
    -- 최근 7일: 공부 안 한 날도 0으로 채운다.
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('date', d.day, 'seconds', coalesce(s.seconds, 0)) order by d.day), '[]'::jsonb)
      from (select (v_today - g)::date as day from generate_series(0, 6) g) d
      left join (
        select (started_at at time zone 'Asia/Seoul')::date as day, sum(focused_seconds) as seconds
        from public.study_logs
        where user_id = p_user and started_at >= v_days_from
        group by 1
      ) s on s.day = d.day),
    -- 이번 주 과목별 (많은 순)
    'week_subjects', (
      select coalesce(jsonb_agg(jsonb_build_object('name', sub.name, 'seconds', t.seconds) order by t.seconds desc), '[]'::jsonb)
      from (
        select subject_id, sum(focused_seconds) as seconds
        from public.study_logs
        where user_id = p_user and started_at >= v_week_from
        group by subject_id
      ) t
      join public.subjects sub on sub.id = t.subject_id)
  );
end;
$$;

-- 로그인한 사용자만 부를 수 있다. (Supabase 는 public 스키마 함수를 anon 에게도 기본으로 열어 줌, 0006 참고)
revoke execute on function public.profile_summary(uuid) from public, anon;
grant execute on function public.profile_summary(uuid) to authenticated;

commit;

-- 화면 쪽 API(PostgREST)가 새 칸·함수를 바로 알도록 스키마 정보를 다시 읽게 한다.
notify pgrst, 'reload schema';
