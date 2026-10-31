-- 두뜀 0045: 게스트 입장 (#375) — 로그인 없이 닉네임만으로 들어와 보기
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 DB. experiment DB 에는 실행하지 않음)
-- 먼저 할 일: 대시보드 > Authentication > Sign In / Providers 에서 "Allow anonymous sign-ins" 켜기
--
-- 배경:
--   SNS 링크로 들어온 사람이 회원가입 화면에서 많이 나간다. 게스트는 Supabase 익명 로그인으로 진짜 계정 번호를 받는다
--   (auth.users.is_anonymous = true, 로그인 정보(JWT)의 is_anonymous = true). 그래서 지금 RLS·좌석·공부 기록·실시간이 그대로 돈다.
--   나중에 가입하면 같은 계정에 이메일을 붙이는 방식(익명 → 정식 전환)이라 계정 번호가 그대로고 기록이 이어진다.
--   닉네임은 익명 로그인 때 options.data.nickname 으로 넘겨 handle_new_user(0001·0035)가 프로필을 만든다.
--
-- 이 파일이 하는 일:
--   1. 게스트 판별 함수 is_guest()(지금 로그인한 사람), is_guest_user(계정 번호)
--   2. 게스트 제한 (화면도 막지만 개발자 도구로 우회해도 DB 가 막는다)
--      - 친구 요청을 보내거나 받지 않고 수락하지 않는다 → 친구가 없으니 귓속말·그룹·따라가기·부르기도 안 됨
--      - 회의실 만들기·참가 (meeting_members 에 들어가는 순간 거절)
--      - 순위(study_ranking)에 오르지 않는다 (보기는 됨)
--   3. 닉네임 금칙어: banned_words 표 + profiles 닉네임 트리거. 가입·게스트·닉네임 변경 모두.
--      화면(src/auth/nicknameRules.ts)도 같은 목록으로 먼저 알려 준다. 목록을 바꾸면 둘 다 바꾼다.
--   4. 30일 넘게 접속하지 않은 게스트 계정 삭제 (하루 한 번 pg_cron). 프로필·기록은 cascade 로 같이 지워진다.
--      마지막 접속 = 마지막 로그인·로그인 세션 갱신(auth.sessions.updated_at) 중 늦은 때.

begin;

-- ---------------------------------------------------------------
-- 1. 게스트 판별
-- ---------------------------------------------------------------
-- 지금 요청을 보낸 사람이 게스트인지 (로그인 정보의 is_anonymous)
create function public.is_guest()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

-- 그 계정이 게스트인지 (친구 요청을 받는 사람 확인용). auth.users 를 읽으므로 security definer
create function public.is_guest_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select u.is_anonymous from auth.users u where u.id = p_user), false);
$$;

revoke execute on function public.is_guest() from public, anon;
revoke execute on function public.is_guest_user(uuid) from public, anon;
grant execute on function public.is_guest() to authenticated;
grant execute on function public.is_guest_user(uuid) to authenticated; -- RLS 규칙 안에서 부르므로 필요

-- ---------------------------------------------------------------
-- 2. 게스트 제한
-- ---------------------------------------------------------------
-- 친구: restrictive 규칙은 기존 규칙(0012)과 "그리고"로 묶인다.
create policy "게스트는 친구 요청을 보내지도 받지도 않는다"
  on public.friendships as restrictive for insert to authenticated
  with check (not public.is_guest() and not public.is_guest_user(addressee_id));

create policy "게스트는 친구 요청을 수락하지 않는다"
  on public.friendships as restrictive for update to authenticated
  using (not public.is_guest());

-- 회의: create_meeting·join_meeting(0021)이 meeting_members 에 넣을 때 막는다. 함수 안에서도 로그인 정보는 부른 사람 것.
create function public.block_guest_meeting()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_guest() then
    raise exception '회의실은 가입하면 쓸 수 있어요.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger meeting_members_no_guest
  before insert on public.meeting_members
  for each row execute function public.block_guest_meeting();

-- 순위: 0037 그대로에 "게스트 빼기" 한 줄만 더함
create or replace function public.study_ranking(p_period text)
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
    join auth.users u on u.id = p.id and not u.is_anonymous -- 게스트는 순위에 오르지 않음 (0045)
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


-- ---------------------------------------------------------------
-- 3. 닉네임 금칙어
-- ---------------------------------------------------------------
create table public.banned_words (
  word text primary key check (word = lower(word) and word !~ '\s')
);
alter table public.banned_words enable row level security; -- 규칙이 없으니 화면(API)에서는 읽고 쓸 수 없음
revoke all on public.banned_words from anon, authenticated;
comment on table public.banned_words is '닉네임 금칙어 (0045). 띄어쓰기를 빼고 소문자로 바꾼 닉네임에 들어 있으면 거절. src/auth/nicknameRules.ts 와 같게';

insert into public.banned_words (word) values
  ('시발'), ('씨발'), ('씨바'), ('시팔'), ('씨팔'), ('ㅅㅂ'), ('ㅆㅂ'), ('병신'),
  ('븅신'), ('ㅂㅅ'), ('좆'), ('존나'), ('ㅈㄴ'), ('개새'), ('새끼'), ('ㅅㄲ'),
  ('미친'), ('지랄'), ('ㅈㄹ'), ('염병'), ('닥쳐'), ('꺼져'), ('니미'), ('느금'),
  ('니애미'), ('애미'), ('애비'), ('섹스'), ('보지'), ('자지'), ('걸레'), ('창녀'),
  ('한남'), ('김치녀'), ('틀딱'), ('fuck'), ('shit'), ('bitch'), ('sex'), ('porn'),
  ('관리자'), ('운영자'), ('운영진'), ('admin'), ('두뜀');

create function public.check_nickname()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_flat text := lower(regexp_replace(new.nickname, '\s', '', 'g'));
begin
  if exists (select 1 from public.banned_words b where strpos(v_flat, b.word) > 0) then
    raise exception '쓸 수 없는 낱말이 들어 있어요. 다른 닉네임을 정해 주세요.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger profiles_nickname_check
  before insert or update of nickname on public.profiles
  for each row execute function public.check_nickname();

-- ---------------------------------------------------------------
-- 4. 오래 안 온 게스트 지우기
-- ---------------------------------------------------------------
create function public.delete_stale_guests()
returns int
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from auth.users u
    where u.is_anonymous
      and greatest(
            u.created_at,
            coalesce(u.last_sign_in_at, u.created_at),
            coalesce((select max(s.updated_at) from auth.sessions s where s.user_id = u.id), u.created_at)
          ) < now() - interval '30 days'
    returning 1
  )
  select count(*)::int from gone;
$$;

revoke execute on function public.delete_stale_guests() from public, anon, authenticated;
comment on function public.delete_stale_guests() is
  '30일 넘게 접속하지 않은 게스트(익명) 계정을 지운다. pg_cron 이 하루 한 번 부른다. (0045)';

commit;

-- 예약 작업 (트랜잭션 밖, 0017 과 같은 방식. 다시 실행해도 중복되지 않음). 매일 서울 새벽 4시 17분 (UTC 19:17)
create extension if not exists pg_cron;

select cron.unschedule('delete-stale-guests')
where exists (select 1 from cron.job where jobname = 'delete-stale-guests');

select cron.schedule(
  'delete-stale-guests',
  '17 19 * * *',
  $$ select public.delete_stale_guests(); $$
);

-- 화면 쪽 API(PostgREST)가 새 함수를 바로 알도록 스키마 정보를 다시 읽게 한다.
notify pgrst, 'reload schema';
