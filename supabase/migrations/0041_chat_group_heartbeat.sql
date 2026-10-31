-- 두뜀 0041: 접속이 끊긴 사람은 채팅 그룹에서 빠진다 (#298 후속)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 DB. 0029 를 실행한 DB 에만. 실험 DB 에는 실행하지 않음)
--
-- 배경:
--   그룹 멤버(chat_group_members)는 "그룹 나가기"를 눌러야만 지워져서, 창을 닫았다 다시 켜도 계속 그룹이었다.
--   다른 멤버 화면에도 나간 사람이 계속 멤버로 남았다. 창을 닫으면(서비스를 나가면) 그룹에서도 빠지게 한다.
--
-- 어떻게 도나:
--   화면(useGroup)이 1분마다 chat_group_heartbeat() 를 불러 내 멤버 행의 last_seen_at 을 지금으로 갱신한다.
--   이 함수는 갱신하기 전에 먼저, 3분 넘게 신호가 없는 멤버를 모든 그룹에서 뺀다(한 명만 남은 그룹은 없어짐, 0029 와 같음).
--   - 창을 닫거나 컴퓨터가 꺼지면 신호가 끊겨, 접속 중인 다른 누군가의 다음 신호 때 빠진다(3~4분 안).
--   - 새로고침·잠깐 끊긴 인터넷은 3분 안에 돌아오므로 그룹이 그대로다.
--   - 같은 계정을 다른 탭에서 열어도(#347) 그 탭이 신호를 보내므로 그룹이 그대로다.
--   - 오래 쉬다 다시 들어오면, 내 첫 신호가 내 오래된 멤버 행부터 지운 뒤 갱신하므로 예전 그룹에 다시 붙지 않는다.
--   접속한 그룹 멤버가 아무도 없으면 오래된 행이 남아 있지만, 누가 들어오는 순간 첫 신호로 정리된다.
--
--   돌려주는 값: 정리한 뒤 내 그룹의 인원(나 포함, 그룹이 없으면 0). 화면이 알고 있는 인원과 다르면 그룹을 다시 읽는다.
--   (다른 사람의 신호가 내 그룹 멤버를 정리했을 때도 알아채려고)
--
-- 권한: 표 RLS 는 0029 그대로(내 그룹만 보기, 직접 쓰기 없음). 이 함수는 내 행만 갱신하고, 정리는 기준(3분)대로만 한다.

begin;

alter table public.chat_group_members
  add column last_seen_at timestamptz not null default now();

comment on column public.chat_group_members.last_seen_at is '마지막 접속 신호 시각. 3분 넘게 끊기면 그룹에서 빠진다 (0041)';

create function public.chat_group_heartbeat()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_stale constant interval := interval '3 minutes'; -- 이만큼 신호가 없으면 빠짐
  v_gone  uuid;
  v_group bigint;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;
  perform pg_advisory_xact_lock(298); -- 0029 의 초대·수락·나가기와 같은 잠금: 한 번에 하나씩

  -- 1. 신호가 끊긴 멤버 빼기 (나 자신도 포함: 오래 쉬다 돌아왔으면 예전 그룹에서 먼저 빠짐)
  for v_gone in
    select m.user_id from public.chat_group_members m where m.last_seen_at < now() - v_stale
  loop
    perform public.chat_group_remove(v_gone);
  end loop;

  -- 2. 아직 그룹에 있으면 내 신호 갱신
  update public.chat_group_members set last_seen_at = now()
  where user_id = v_user
  returning group_id into v_group;

  if v_group is null then
    return 0;
  end if;
  return (select count(*)::int from public.chat_group_members where group_id = v_group);
end;
$$;

revoke execute on function public.chat_group_heartbeat() from public, anon;
grant execute on function public.chat_group_heartbeat() to authenticated;

comment on function public.chat_group_heartbeat() is
  '그룹 접속 신호. 3분 넘게 끊긴 멤버를 빼고 내 신호를 갱신한 뒤 내 그룹 인원을 돌려준다. 화면이 1분마다 부른다. (0041)';

commit;

-- 화면 쪽 API(PostgREST)가 새 칸·함수를 바로 알도록 스키마 정보를 다시 읽게 한다.
notify pgrst, 'reload schema';
