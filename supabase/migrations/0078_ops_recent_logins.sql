-- 두뜀 0078: 관리자 대시보드에 최근 로그인한 사람 보여 주기 (#612)
--
-- 로그인 시각(auth.users.last_sign_in_at)은 화면에서 직접 읽을 수 없다. 팀(is_team, 0030)만 부를 수 있는 함수로 돌려준다.
-- 돌려주는 것: 계정 번호, 닉네임, 마지막 로그인 시각, 가입 시각(새 계정 표시), 게스트인지. 이메일·프로필·공부 기록은 넣지 않는다.
-- 같이 공부하는 봇(0075)은 로그인하지 않으므로 뺀다.
--
-- 적용할 DB: 서비스 Supabase (develop 머지 전).
begin;

create function public.ops_recent_logins(p_since timestamptz)
returns table (id uuid, nickname text, last_sign_in_at timestamptz, created_at timestamptz, is_guest boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_team() then
    raise exception '팀만 볼 수 있습니다.' using errcode = '42501';
  end if;
  return query
    select u.id, p.nickname, u.last_sign_in_at, u.created_at, coalesce(u.is_anonymous, false)
    from auth.users u
    join public.profiles p on p.id = u.id
    where u.last_sign_in_at >= coalesce(p_since, now() - interval '24 hours')
      and not exists (select 1 from public.bot_accounts b where b.user_id = u.id)
    order by u.last_sign_in_at desc
    limit 200;
end;
$$;

revoke execute on function public.ops_recent_logins(timestamptz) from public, anon;
grant execute on function public.ops_recent_logins(timestamptz) to authenticated;
comment on function public.ops_recent_logins(timestamptz) is
  '관리자 대시보드(#612): p_since 이후 로그인한 사람 (최근 200명, 봇 제외). 팀만.';

commit;

notify pgrst, 'reload schema';
