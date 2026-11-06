-- 0066_seat_channels.sql (#442)
-- 광장·캠퍼스·해변이 채널로 나뉘면 서로 보이지 않는 사람끼리 같은 벤치 번호를 고를 수 있다.
-- 그래서 "자리당 이용 중 1건"을 "채널의 자리당 이용 중 1건"으로 바꾼다.
--   channel 은 나뉘는 공간(plaza, campus, beach)에서만 2 이상이 된다.
--   지점은 언제나 1번이라 좌석 중복 방지는 예전과 똑같다.
--   channel 을 안 넘기는 예전 화면도 1번으로 그대로 동작한다.

begin;

alter table public.seat_sessions
  add column channel smallint not null default 1 check (channel between 1 and 999);

-- 이름을 그대로 둔다. sit_cafe_seat 의 예외 처리가 이 이름으로 알아본다.
drop index public.seat_sessions_one_active_per_seat;
create unique index seat_sessions_one_active_per_seat
  on public.seat_sessions (seat_id, channel) where ended_at is null;

drop function public.sit_cafe_seat(bigint, int);

create function public.sit_cafe_seat(p_branch_id bigint, p_seat_number int, p_channel int default 1)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user       uuid := auth.uid();
  v_minutes    int  := 720; -- 카페 이용 기록의 시간(12시간). 일어나면 바로 끝난다.
  v_kind       text;
  v_slug       text;
  v_channel    int  := 1;
  v_seat_id    bigint;
  v_pass_id    uuid;
  v_session_id uuid;
  v_constraint text;
  v_place      text;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  select kind, slug into v_kind, v_slug from public.branches where id = p_branch_id;
  if v_kind is distinct from 'cafe' then
    raise exception '이 지점은 키오스크에서 자리를 받아야 합니다.' using errcode = '22023';
  end if;

  -- 나뉘는 공간만 채널을 따른다. 지점에 번호를 보내도 1번으로 앉아 중복이 생기지 않는다.
  if v_slug in ('plaza', 'campus', 'beach') then
    if p_channel is null or p_channel not between 1 and 999 then
      raise exception '채널 번호가 올바르지 않습니다.' using errcode = '22023';
    end if;
    v_channel := p_channel;
  end if;

  -- 0016: 시간이 지났다고 자리를 치우지 않는다.

  select id into v_seat_id
  from public.seats
  where branch_id = p_branch_id and seat_number = p_seat_number;
  if v_seat_id is null then
    raise exception '%번 좌석을 찾을 수 없습니다.', p_seat_number using errcode = 'P0002';
  end if;

  insert into public.passes (user_id, branch_id, duration_minutes)
  values (v_user, p_branch_id, v_minutes)
  returning id into v_pass_id;

  insert into public.seat_sessions (user_id, seat_id, pass_id, expires_at, channel)
  values (v_user, v_seat_id, v_pass_id, now() + make_interval(mins => v_minutes), v_channel)
  returning id into v_session_id;

  return v_session_id;

exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'seat_sessions_one_active_per_seat' then
      raise exception '%번 자리에 이미 다른 사람이 앉아 있습니다.', p_seat_number using errcode = '23505';
    elsif v_constraint = 'seat_sessions_one_active_per_user' then
      -- 지금 쓰고 있는 자리를 알려 준다. 화면은 DT001 을 보고 "반납하고 앉기" 창을 띄운다. (0014)
      select b.name || ' ' || st.seat_number || '번 자리' into v_place
      from public.seat_sessions ss
      join public.seats st on st.id = ss.seat_id
      join public.branches b on b.id = st.branch_id
      where ss.user_id = v_user and ss.ended_at is null
      limit 1;
      raise exception '%를 이용 중이에요. 반납하면 이 자리에 앉을 수 있어요.', coalesce(v_place, '다른 자리')
        using errcode = 'DT001';
    else
      raise; -- 좌석·회의실 동시 이용 차단 트리거(0003) 등은 메시지를 그대로 넘긴다
    end if;
end;
$$;

-- 로그인한 사용자만 부를 수 있다. (0006 참고)
revoke all on function public.sit_cafe_seat(bigint, int, int) from public, anon;
grant execute on function public.sit_cafe_seat(bigint, int, int) to authenticated;

commit;

notify pgrst, 'reload schema';
