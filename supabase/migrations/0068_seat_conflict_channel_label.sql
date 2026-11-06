-- 0068_seat_conflict_channel_label.sql (#484)
-- 자리 반납 창 문구의 채널 번호를 "지금 앉으려는 채널과 다르면" 붙인다.
-- 0067 은 기존 자리가 2채널 이상일 때만 붙여서, 1채널 자리를 둔 채 6채널에서 앉으면
-- "Cam Study Cafe 44번 자리"처럼 어느 채널 자리인지 빠졌다.
-- 채널이 다르면 채널이 2개 이상 열린 것이라 "채널이 하나면 번호를 숨긴다"는 규칙과도 맞는다.
-- 같은 채널 안에서 다른 자리에 앉을 때는 번호가 필요 없어 그대로 뺀다.
--
-- 인자·반환값이 0067 과 같아 create or replace 로 바꾸고, 권한(0067)도 그대로 남는다. 화면 코드는 바뀌지 않는다.

begin;

create or replace function public.sit_cafe_seat(p_branch_id bigint, p_seat_number int, p_channel int default 1)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user       uuid := auth.uid();
  v_minutes    int  := 720; -- 카페 이용 기록의 시간(12시간). 일어나면 바로 끝난다.
  v_kind       text;
  v_seat_id    bigint;
  v_pass_id    uuid;
  v_session_id uuid;
  v_constraint text;
  v_place      text;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  if p_channel is null or p_channel not between 1 and 999 then
    raise exception '채널 번호가 올바르지 않습니다.' using errcode = '22023';
  end if;

  select kind into v_kind from public.branches where id = p_branch_id;
  if v_kind is distinct from 'cafe' then
    raise exception '이 지점은 키오스크에서 자리를 받아야 합니다.' using errcode = '22023';
  end if;

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
  values (v_user, v_seat_id, v_pass_id, now() + make_interval(mins => v_minutes), p_channel)
  returning id into v_session_id;

  return v_session_id;

exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'seat_sessions_one_active_per_seat' then
      raise exception '%번 자리에 이미 다른 사람이 앉아 있습니다.', p_seat_number using errcode = '23505';
    elsif v_constraint = 'seat_sessions_one_active_per_user' then
      -- 지금 쓰고 있는 자리를 알려 준다. 화면은 DT001 을 보고 "반납하고 앉기" 창을 띄운다. (0014)
      -- 앉으려는 채널과 다른 채널의 자리면 번호를 붙인다 (1채널이어도)
      select case when ss.channel <> p_channel then ss.channel || '채널 ' else '' end || b.name || ' ' || st.seat_number || '번 자리'
        into v_place
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

commit;

notify pgrst, 'reload schema';
