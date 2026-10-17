-- 두뜀 0019: 친구 귓속말(1대1 채팅)용 비공개 실시간 방 권한 (#49)
-- 실행 위치: Supabase 대시보드 > SQL Editor
--
-- 메시지는 저장하지 않는다:
--   귓속말은 브라우저끼리 실시간 방(Realtime Broadcast)으로 주고받기만 한다.
--   메시지를 담는 테이블은 만들지 않는다. 기록은 각자 브라우저 화면에만 있고,
--   새로고침·접속 끊김·로그아웃하면 사라진다.
--   이 파일은 "누가 어느 방에 들어가 듣고 보낼 수 있나" 규칙만 만든다.
--
-- 방: 친구 두 사람마다 하나. 이름은 whisper:{작은 계정 번호}:{큰 계정 번호}
--   - 엿듣기 방지: 방 이름에 내 계정 번호가 있고, 상대와 친구(accepted)일 때만 들어갈 수 있다.
--   - 사칭 방지: 방에 두 사람만 있으므로 내가 보낸 것이 아니면 상대가 보낸 것이다.
--     (보낸 사람을 메시지에 적어 믿을 필요가 없다)
--
-- 비공개 방(private channel): 화면에서 supabase.channel(이름, { config: { private: true } })로 들어가면
--   Supabase Realtime 이 realtime.messages 테이블의 RLS 정책으로 권한을 확인한다.
--   select 정책 = 듣기(방에 들어가기), insert 정책 = 보내기.
--   (realtime.messages 는 Supabase 가 만든 표다. 화면에서 직접 보내는 브로드캐스트는 여기에 저장되지 않는다)

begin;

-- ---------------------------------------------------------------
-- 1. 이 방에서 귓속말할 수 있는지
--    whisper:{a}:{b} 에서 a < b 이고, 내가 둘 중 하나이고, 둘이 친구일 때만 true
--    friendships 는 본인이 들어간 줄만 보이지만(0012) 정책 안에서 확실히 읽도록 security definer 로 둔다.
-- ---------------------------------------------------------------
create function public.can_whisper(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me text := (select auth.uid())::text;
  v_a  text := split_part(p_topic, ':', 2);
  v_b  text := split_part(p_topic, ':', 3);
begin
  if v_me is null or split_part(p_topic, ':', 1) <> 'whisper' or split_part(p_topic, ':', 4) <> '' then
    return false;
  end if;
  -- 같은 두 사람의 방이 하나뿐이도록 이름 순서를 정해 둔다.
  if v_a = '' or v_b = '' or v_a >= v_b or v_me not in (v_a, v_b) then
    return false;
  end if;
  return exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id::text = v_a and f.addressee_id::text = v_b)
        or (f.requester_id::text = v_b and f.addressee_id::text = v_a))
  );
end;
$$;

revoke execute on function public.can_whisper(text) from public, anon;
grant execute on function public.can_whisper(text) to authenticated;

comment on function public.can_whisper(text) is
  '귓속말 방(whisper:a:b)에 들어갈 수 있는지. 내가 a·b 중 하나이고 둘이 친구여야 한다. (#49)';

-- ---------------------------------------------------------------
-- 2. 비공개 방 권한 (브로드캐스트만)
-- ---------------------------------------------------------------
create policy "친구끼리 귓속말 방을 듣는다"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and public.can_whisper((select realtime.topic()))
  );

create policy "친구끼리 귓속말 방에 보낸다"
  on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and public.can_whisper((select realtime.topic()))
  );

commit;
