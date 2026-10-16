-- 두뜀 0017: 접속이 끊기면 자리를 자동으로 반납한다 (백엔드·DB 육심호)
-- 실행 위치: Supabase 대시보드 > SQL Editor
-- 관련 이슈: #155
--
-- 배경:
--   0016 에서 "시간이 지나도 자리를 유지한다"로 바꾸면서, 자리가 비는 길이
--   직접 반납 하나만 남았다. 탭을 닫고 돌아오지 않으면 그 자리는 계속 잡혀 있다.
--   좌석이 20석뿐이라 몇 명만 그래도 지점이 막힌다.
--
--   last_seen_at 칸은 0001 에 이미 있었지만 아무도 쓰지 않고 있었다. 이제 쓴다.
--
-- 어떻게 도나:
--   화면이 1분마다 heartbeat() 를 불러 last_seen_at 을 지금으로 갱신한다.
--   pg_cron 이 1분마다 release_disconnected() 를 돌려, 5분 넘게 소식이 없는
--   자리를 end_reason = 'disconnected' 로 끝낸다.
--
--   왜 pg_cron 인가: "자리를 배정할 때 같이 정리하는" 방식은 아무도 배정하지 않으면
--   영영 안 치워진다. 그러면 키오스크 배치도에 빈자리가 이용 중으로 보인다.
--
--   주의: 무료 플랜은 7일간 활동이 없으면 프로젝트가 멈추고 예약 작업도 같이 멈춘다.
--   깨울 때 cron.job 에 이 작업이 남아 있는지 확인해야 한다.
--
-- 기준을 5분으로 둔 이유:
--   화장실에 다녀오거나 잠깐 네트워크가 끊겨도 자리를 지킬 수 있게 넉넉히 잡았다.
--   공부 기록을 5분마다 저장하는 주기(studyLogic.SAVE_INTERVAL_MS)와도 맞아떨어진다.
--   용어 문서에는 3분으로 적혀 있었지만, 절전이나 잠깐의 끊김으로 자리를 잃는 쪽이
--   빈자리가 2분 더 막히는 것보다 나쁘다고 보았다.

begin;

-- ---------------------------------------------------------------
-- 1. 접속 신호
--
--    지금 쓰는 자리의 last_seen_at 을 갱신한다. 좌석과 회의실을 동시에 쓸 수 없으므로
--    (0003 트리거) 둘 다 갱신해도 실제로는 한쪽만 맞는다.
--
--    남은 시간도 같이 돌려준다. 화면이 1분마다 남은 시간을 읽고 있었는데,
--    신호를 따로 보내면 통신이 두 번이 된다. 한 번에 합친다.
-- ---------------------------------------------------------------
create or replace function public.heartbeat()
returns table (kind text, number int, expires_at timestamptz, expired boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  update public.seat_sessions set last_seen_at = now()
  where user_id = v_user and ended_at is null;

  update public.room_sessions set last_seen_at = now()
  where user_id = v_user and ended_at is null;

  return query
    select 'seat', s.seat_number, ss.expires_at, ss.expires_at <= now()
    from public.seat_sessions ss
    join public.seats s on s.id = ss.seat_id
    where ss.user_id = v_user and ss.ended_at is null
    union all
    select 'room', r.room_number, rs.expires_at, rs.expires_at <= now()
    from public.room_sessions rs
    join public.rooms r on r.id = rs.room_id
    where rs.user_id = v_user and rs.ended_at is null;
end;
$$;

revoke execute on function public.heartbeat() from public, anon;
grant execute on function public.heartbeat() to authenticated;

comment on function public.heartbeat() is
  '아직 접속해 있다고 알리고 지금 쓰는 자리를 돌려준다. 화면이 1분마다 부른다. (#155)';

-- ---------------------------------------------------------------
-- 2. 소식이 끊긴 자리 반납
--
--    이 함수는 사람이 아니라 pg_cron 이 부른다. 그래서 auth.uid() 를 보지 않고
--    실행 권한도 로그인 사용자에게 주지 않는다.
--
--    끝난 시각은 "지금"이 아니라 마지막으로 소식을 들은 시각으로 적는다.
--    실제로 그때까지만 쓴 것이고, 기록을 뽑을 때도 그 편이 맞다.
-- ---------------------------------------------------------------
create or replace function public.release_disconnected()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gap  interval := interval '5 minutes';
  v_seat int;
  v_room int;
begin
  with done as (
    update public.seat_sessions
    set ended_at = last_seen_at, end_reason = 'disconnected'
    where ended_at is null and last_seen_at < now() - v_gap
    returning 1
  )
  select count(*) into v_seat from done;

  with done as (
    update public.room_sessions
    set ended_at = last_seen_at, end_reason = 'disconnected'
    where ended_at is null and last_seen_at < now() - v_gap
    returning 1
  )
  select count(*) into v_room from done;

  return v_seat + v_room;
end;
$$;

revoke execute on function public.release_disconnected() from public, anon, authenticated;

comment on function public.release_disconnected() is
  '5분 넘게 소식이 없는 자리를 반납한다. pg_cron 이 1분마다 부른다. (#155)';

commit;

-- ---------------------------------------------------------------
-- 3. 예약 작업 등록
--
--    트랜잭션 밖에서 돌린다. cron.schedule 은 되돌릴 수 없고,
--    확장 설치가 트랜잭션 안에서 막히는 경우가 있다.
--
--    이미 같은 이름이 있으면 지우고 다시 건다. 이 파일을 다시 돌려도 중복되지 않는다.
-- ---------------------------------------------------------------
create extension if not exists pg_cron;

select cron.unschedule('release-disconnected')
where exists (select 1 from cron.job where jobname = 'release-disconnected');

select cron.schedule(
  'release-disconnected',
  '* * * * *',                              -- 1분마다
  $$ select public.release_disconnected(); $$
);
