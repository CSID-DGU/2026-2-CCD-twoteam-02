-- 두뜀 0050: 과목 정리·이름 수정·삭제 (#369)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트)
--
-- 배경:
--   과목은 추가만 되고 정리·수정·삭제가 없었다. 학기가 끝난 과목이 공부 시작 창에 계속 쌓이고,
--   이름을 잘못 지어도 고칠 수 없었다. 기록이 있는 과목은 외래 키(on delete 없음) 때문에 지울 수도 없었다(23503).
--
-- 바꾸는 것:
--   1) subjects.archived_at : 값이 있으면 "정리한 과목". 공부 시작 창에서 빠지고 내 기록에는 이름 그대로 남는다.
--   2) study_logs·study_segments 의 subject_id : 비어 있어도 되게 하고, 과목을 지우면 비워지게(on delete set null).
--      공부 시간은 그대로 남고 이름만 없어진다. 화면에서는 "(지운 과목)"으로 묶어 보여 준다.
--   3) profile_summary : 이번 주 과목별을 inner join 으로 묶어서, 과목을 지우면 그 시간이 빠졌다.
--      left join 으로 바꾸고 이름이 없으면 '(지운 과목)'으로 묶는다. (화면의 subjectLogic.ts DELETED_SUBJECT 와 같은 글자)
--      과목 번호(id)도 같이 돌려줘 화면이 줄을 번호로 구분한다(#115: 이름이 겹치면 줄이 남는 문제).
--
-- 이름 수정·정리·삭제의 권한은 이미 있다: subjects 의 update·delete 정책이 본인 것만 허용한다(0004).
-- 과목 50개 제한(0015)은 정리한 과목도 센다. 개수를 줄이려면 지운다.
--
-- 중간에 실패하면 아무것도 남지 않도록 전체를 한 덩어리로 실행한다.

begin;

-- 1) 정리
alter table public.subjects add column archived_at timestamptz;

comment on column public.subjects.archived_at is
  '과목을 정리한 시각. 값이 있으면 공부 시작 창에서 빠진다(내 기록에는 남음). null 로 되돌리면 다시 꺼낸다.';

-- 2) 지워도 기록은 남게
alter table public.study_logs alter column subject_id drop not null;
alter table public.study_logs drop constraint study_logs_subject_id_fkey;
alter table public.study_logs
  add constraint study_logs_subject_id_fkey
  foreign key (subject_id) references public.subjects (id) on delete set null;

alter table public.study_segments alter column subject_id drop not null;
alter table public.study_segments drop constraint study_segments_subject_id_fkey;
alter table public.study_segments
  add constraint study_segments_subject_id_fkey
  foreign key (subject_id) references public.subjects (id) on delete set null;

-- 과목을 지울 때 위 set null 이 기록을 빨리 찾도록 (없으면 지울 때마다 기록 표 전체를 훑는다)
create index study_logs_subject_idx on public.study_logs (subject_id);
create index study_segments_subject_idx on public.study_segments (subject_id);

-- 3) 프로필 요약: 0013 과 같고, 마지막 'week_subjects' 만 바뀐다.
create or replace function public.profile_summary(p_user uuid)
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
    -- 이번 주 과목별 (많은 순). 지운 과목(subject_id 가 빈 기록)은 한 줄로 묶는다.
    'week_subjects', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.subject_id, 'name', coalesce(sub.name, '(지운 과목)'), 'seconds', t.seconds) order by t.seconds desc), '[]'::jsonb)
      from (
        select subject_id, sum(focused_seconds) as seconds
        from public.study_logs
        where user_id = p_user and started_at >= v_week_from
        group by subject_id
      ) t
      left join public.subjects sub on sub.id = t.subject_id)
  );
end;
$$;

commit;
