-- 두뜀 0070: 회의실 음성 연결 신호·채팅의 보낸 사람을 DB 가 정하게 하기 (#512)
--
-- 문제
--   회의 실시간 방(meeting:회의번호, 0021)은 참가자만 듣고 보낼 수 있지만, 메시지 안의 보낸 사람(from)은
--   보내는 화면이 적는다. 그래서 같은 회의 참가자가 다른 참가자 이름으로 채팅을 보내거나,
--   음성 연결 신호(WebRTC offer·answer·ICE)를 다른 사람인 척 보내 음성 연결을 가로챌 수 있었다.
--   (광장·지점은 중계 서버가 로그인 토큰으로 보낸 사람을 덮어써서 괜찮다. 회의실은 늘 Supabase 경로)
--
-- 방법
--   1) 회의마다 "보안 방" meeting:회의번호:secure 를 둔다. 참가자는 듣기(select)만 할 수 있고 보내기(insert) 정책은 없다.
--      0021 의 보내기 정책(can_use_meeting_channel)은 세 번째 칸이 있는 이름을 거절하므로 화면은 이 방에 보낼 수 없다.
--   2) 음성 신호·채팅은 화면이 send_meeting_event 를 부르면 DB 가 보낸 사람(from)을 auth.uid() 로 넣어
--      realtime.send 로 보안 방에 보낸다. 화면은 신호·채팅을 보안 방에서 온 것만 믿는다.
--   위치·고개 각도(초당 4번)는 매번 DB 를 거치면 무거워서 지금처럼 회의 방으로 보낸다(남은 위험, #512 에 기록).
--
-- 적용할 DB: 서비스 Supabase. 화면보다 먼저 실행한다(새 화면이 이 함수를 부름).
begin;

-- 보안 방 이름(meeting:회의번호:secure)이면 그 회의 참가자인지
create function public.can_hear_meeting_secure(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if split_part(p_topic, ':', 1) <> 'meeting' or split_part(p_topic, ':', 3) <> 'secure' or split_part(p_topic, ':', 4) <> '' then
    return false;
  end if;
  begin
    v_id := split_part(p_topic, ':', 2)::bigint;
  exception when others then
    return false;
  end;
  return public.is_meeting_member(v_id);
end;
$$;

revoke execute on function public.can_hear_meeting_secure(text) from public, anon;
grant execute on function public.can_hear_meeting_secure(text) to authenticated;

-- 듣기만. 보내기(insert) 정책은 일부러 두지 않는다: 이 방에는 send_meeting_event 만 보낸다
create policy "회의 참가자만 회의 보안 방을 듣는다"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and public.can_hear_meeting_secure((select realtime.topic()))
  );

-- 음성 신호·채팅 보내기. 보낸 사람은 화면이 아니라 여기서 정한다(auth.uid()).
--   p_event   'signal'(음성 연결 신호, payload {to, data}) 또는 'chat'(채팅, payload {text})
--   p_payload 화면이 보낸 값. 화면이 넣은 from 은 덮어쓴다
create function public.send_meeting_event(p_meeting_id bigint, p_event text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception '로그인이 필요해요.';
  end if;
  if p_event not in ('signal', 'chat') then
    raise exception '보낼 수 없는 메시지예요.';
  end if;
  if not public.is_meeting_member(p_meeting_id) then
    raise exception '회의에 참가한 사람만 보낼 수 있어요.';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception '메시지 형식이 맞지 않아요.';
  end if;
  -- 음성 연결 신호(SDP)는 몇 KB. 넉넉히 32KB 를 넘으면 거절 (방을 큰 메시지로 채우지 못하게)
  if octet_length(p_payload::text) > 32768 then
    raise exception '메시지가 너무 커요.';
  end if;
  perform realtime.send(
    p_payload || jsonb_build_object('from', v_me),
    p_event,
    'meeting:' || p_meeting_id || ':secure',
    true
  );
end;
$$;

revoke execute on function public.send_meeting_event(bigint, text, jsonb) from public, anon;
grant execute on function public.send_meeting_event(bigint, text, jsonb) to authenticated;

commit;
