-- 두뜀 0012: 친구 (#41 친구 등록)
-- 실행 위치: Supabase 대시보드 > SQL Editor
--
-- 배경:
--   친구 요청을 보내고, 상대가 수락하면 서로의 친구 목록에 보인다.
--   친구 찾기는 닉네임으로 하는데 닉네임은 겹칠 수 있으므로, 화면에서는
--   "민수#4F2A"처럼 계정 번호 앞 네 자리를 태그로 붙여 구분한다. (DB 변경 없음, avatars 뷰 사용)
--
-- 한 줄 = 두 사람 사이의 관계 하나
--   status = 'pending'  : requester 가 addressee 에게 요청을 보낸 상태
--   status = 'accepted' : addressee 가 수락해 친구가 된 상태
--   거절·요청 취소·친구 삭제는 모두 줄을 지운다. (다시 요청할 수 있게)
--
-- 권한 (CLAUDE.md 절대 규칙: 본인 데이터만 조회·수정):
--   - 조회: 내가 요청자이거나 받은 사람인 줄만
--   - 추가: 내 이름으로, 대기 상태로만
--   - 수정: 받은 사람만, 대기 → 수락으로만. 고칠 수 있는 칸은 status 하나뿐이다.
--   - 삭제: 둘 중 누구나
-- 중간에 실패하면 아무것도 남지 않도록 전체를 한 덩어리로 실행한다.

begin;

create table public.friendships (
  id           bigint generated always as identity primary key,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  check (requester_id <> addressee_id),                       -- 나 자신에게는 요청 불가
  check ((status = 'accepted') = (accepted_at is not null))   -- 수락했으면 수락 시각이 있다
);

-- 같은 두 사람 사이에는 한 줄만. A→B 와 B→A 가 따로 생기지 않게 순서를 무시하고 묶는다.
create unique index friendships_pair_key
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

-- "받은 요청" 조회용 (요청자 쪽은 위 유니크 인덱스로 충분하지 않아 따로 둔다)
create index friendships_requester_idx on public.friendships (requester_id);
create index friendships_addressee_idx on public.friendships (addressee_id);

-- 수락 시각은 화면이 아니라 DB가 적는다. 화면은 status 만 'accepted' 로 바꾸면 된다.
create function public.set_friendship_accepted_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'accepted' and old.status <> 'accepted' then
    new.accepted_at := now();
  end if;
  return new;
end;
$$;

create trigger friendships_accepted_at
  before update on public.friendships
  for each row execute function public.set_friendship_accepted_at();

-- ---------------------------------------------------------------
-- 권한
-- ---------------------------------------------------------------
alter table public.friendships enable row level security;

-- 로그인하지 않은 사용자는 아무것도 못 한다.
revoke all on public.friendships from public, anon;
-- 로그인 사용자도 수정은 status 칸만. (요청자·받는 사람을 바꿔 치기하지 못하게)
revoke update on public.friendships from authenticated;
grant select, insert, delete on public.friendships to authenticated;
grant update (status) on public.friendships to authenticated;

create policy "내가 들어간 친구 관계만 조회한다"
  on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

create policy "내 이름으로 대기 중인 요청만 보낸다"
  on public.friendships for insert to authenticated
  with check (
    (select auth.uid()) = requester_id
    and status = 'pending'
    and accepted_at is null
  );

create policy "받은 요청만 수락한다"
  on public.friendships for update to authenticated
  using ((select auth.uid()) = addressee_id and status = 'pending')
  with check ((select auth.uid()) = addressee_id and status = 'accepted');

create policy "거절·취소·친구 삭제는 둘 중 누구나 한다"
  on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

comment on table public.friendships is
  '친구 관계. pending: 요청 보냄, accepted: 친구. 거절·취소·삭제는 줄을 지운다.';

commit;

-- 화면 쪽 API(PostgREST)가 새 테이블을 바로 알도록 스키마 정보를 다시 읽게 한다.
notify pgrst, 'reload schema';
