-- 두뜀 0018: 솔카페에서 다른 자리를 쓰는 중이면 "반납하고 앉기" 창이 다시 뜨게 한다
-- 실행 위치: Supabase 대시보드 > SQL Editor
-- 관련: #44 (솔카페, 0014), #38·#151 (시간이 끝나도 자리 유지, 0016)
--
-- 무엇이 깨졌나:
--   0014 의 sit_cafe_seat 은 이미 다른 자리(예: 별다방 7번)를 쓰는 중이면
--   errcode 'DT001' 과 함께 "별다방 7번 자리를 이용 중이에요…"를 돌려줬다.
--   화면(BranchScene)은 DT001 을 보고 "반납하고 앉기" 창을 띄운다.
--
--   0016 이 "시간이 지난 기록을 치우는 호출(expire_stale_sessions)"을 빼려고 이 함수를 다시 만들면서,
--   DT001 부분이 빠진 예전 형태로 돌아갔다. 지금은 '23505' 와 "이미 다른 자리를 이용 중입니다."만 돌려줘서
--   화면이 반납 창 대신 4초짜리 안내만 띄운다.
--
-- 어떻게 고치나:
--   0016 의 본문(시간으로 치우지 않음)을 그대로 두고, 예외 처리만 0014 처럼 되살린다.
--   화면 코드는 바꾸지 않는다.

begin;

create or replace function public.sit_cafe_seat(p_branch_id bigint, p_seat_number int)
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

  select kind into v_kind from public.branches where id = p_branch_id;
  if v_kind is distinct from 'cafe' then
    raise exception '이 지점은 키오스크에서 자리를 받아야 합니다.' using errcode = '22023';
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

  insert into public.seat_sessions (user_id, seat_id, pass_id, expires_at)
  values (v_user, v_seat_id, v_pass_id, now() + make_interval(mins => v_minutes))
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
revoke execute on function public.sit_cafe_seat(bigint, int) from public, anon;
grant execute on function public.sit_cafe_seat(bigint, int) to authenticated;

commit;

notify pgrst, 'reload schema';
