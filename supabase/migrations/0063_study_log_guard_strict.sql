-- 공부 기록 조각 겹침 검사 강화와 과목 주인 확인 (#415)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 DB. experiment DB 에는 실행하지 않음)
--
-- 1. check_study_log (0040) 의 겹침 검사
--    0040 은 앞뒤 1초씩을 빼고 겹침을 봐서, 1초 이하 조각은 같은 시각에 여러 개 들어갈 수 있었다.
--    화면은 앞 조각의 끝 = 다음 조각의 시작으로 저장하므로(studyLogic takeChunk) 여유가 없어도 걸리지 않는다.
--    그래서 여유를 없애고 "구간이 실제로 겹치면" 거절한다. 맞닿은 조각은 겹침이 아니다.
--    길이가 0 인 조각(시작 = 끝)도 거절한다. 화면은 1초보다 짧은 조각을 보내지 않는다(MIN_CHUNK_MS).
--    나머지 검사(내 자리 이용 기록, 시계 여유 10분, 반올림 여유 1초)는 0040 과 같다.
--
-- 2. 과목 주인 확인
--    study_logs·study_segments 의 subject_id 는 과목 번호만 가리켜서, 남의 과목 번호도 들어갈 수 있었다.
--    외래 키를 (과목 번호, 사용자) 짝으로 바꿔 본인 과목만 가리키게 한다.
--    과목을 지우면 과목 칸만 비우는 동작(0050)은 on delete set null (subject_id) 로 그대로 둔다(PostgreSQL 15 이상).
--    서비스 DB 에 남의 과목을 가리키는 기록이 없는 것을 확인했다(2026-11-02, 0건).
--
-- 3. profile_summary (0050) 의 과목 이름 조인에 과목 주인 조건을 더한다. 나머지는 0050 과 같다.
--
-- 이미 저장된 기록은 건드리지 않는다.

begin;

-- ---------------------------------------------------------------
-- 1. 겹침 검사
-- ---------------------------------------------------------------
create or replace function public.check_study_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clock     constant interval := interval '10 minutes'; -- 컴퓨터 시계와 서버 시계가 어긋날 수 있는 여유
  v_rounding  constant int      := 1;                      -- focused_seconds 반올림 여유(초)
  v_session   record;
begin
  -- 같은 사람의 조각은 하나씩 차례로 검사 (동시에 두 조각이 들어와도 겹침을 놓치지 않게)
  perform pg_advisory_xact_lock(hashtext('study_logs:' || new.user_id::text));

  -- 4. 길이가 있어야 함
  if new.ended_at <= new.started_at then
    raise exception '기록 조각의 길이가 없습니다.' using errcode = '22023';
  end if;

  -- 3. 공부한 초가 조각 길이보다 길면 안 됨
  if new.focused_seconds > extract(epoch from (new.ended_at - new.started_at)) + v_rounding then
    raise exception '공부 시간이 기록 조각 길이보다 깁니다.' using errcode = '22023';
  end if;

  -- 2. 내 자리 이용 기록 안의 시간이어야 함
  select ss.user_id, ss.started_at, ss.ended_at into v_session
  from public.seat_sessions ss
  where ss.id = new.session_id;
  if v_session.user_id is distinct from new.user_id then
    raise exception '내 자리 이용 기록이 아닙니다.' using errcode = '42501';
  end if;
  if new.started_at < v_session.started_at - v_clock
     or new.ended_at > coalesce(v_session.ended_at, now()) + v_clock then
    raise exception '자리를 이용한 시간 밖의 기록입니다.' using errcode = '22023';
  end if;

  -- 1. 같은 사람의 다른 조각과 겹치면 안 됨 (끝 = 시작으로 맞닿은 것은 괜찮음)
  if exists (
    select 1 from public.study_logs l
    where l.user_id = new.user_id
      and l.started_at < new.ended_at
      and l.ended_at > new.started_at
  ) then
    raise exception '이미 기록된 시간과 겹칩니다.' using errcode = '23P01';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------
-- 2. 과목은 본인 것만
-- ---------------------------------------------------------------
alter table public.subjects
  add constraint subjects_id_user_key unique (id, user_id);

alter table public.study_logs drop constraint study_logs_subject_id_fkey;
alter table public.study_logs
  add constraint study_logs_subject_id_fkey
  foreign key (subject_id, user_id) references public.subjects (id, user_id)
  on delete set null (subject_id);

alter table public.study_segments drop constraint study_segments_subject_id_fkey;
alter table public.study_segments
  add constraint study_segments_subject_id_fkey
  foreign key (subject_id, user_id) references public.subjects (id, user_id)
  on delete set null (subject_id);

-- ---------------------------------------------------------------
-- 3. 프로필 요약: 과목 이름은 그 사람의 과목에서만
-- ---------------------------------------------------------------
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
      left join public.subjects sub on sub.id = t.subject_id and sub.user_id = p_user)
  );
end;
$$;

commit;
