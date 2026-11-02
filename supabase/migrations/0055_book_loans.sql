-- 0055: 도서관 책 대여 (docs/superpowers/specs/2026-11-02-library-books-design.md)
--
-- 왜: 로비의 도서관에서 책을 14일 동안 빌려 읽는다. 빌린 책 목록·기한·읽던 문단 자리를 계정에 저장해 다른 기기에서도 이어 읽는다.
-- 권한(CLAUDE.md 절대 규칙: RLS): 본인 대여만 보고 반납·읽던 자리를 고친다. 빌리기는 borrow_book 함수로만 한다(직접 insert·delete 정책·권한 없음).
--     기한(due_at)은 함수가 정한다. 사용자는 returned_at·position 열만 고칠 수 있다.
--     반납한 책을 되살리지 못하게 트리거로 막는다(되살리면 5권 제한을 넘길 수 있다). borrow_book 은 null -> due_at 로만 바꾸므로 영향 없다.
--     게스트(익명 로그인, 0045)도 쓸 수 있다. 계정이 지워지면 같이 지워진다(cascade).
-- 적용: develop 으로 가는 PR 이라 머지 전에 서비스 DB(SQL Editor)에 실행한다. experiment DB 에는 실행하지 않는다.
--     실행 전에 화면이 먼저 배포되면 대여 목록을 읽지 못하고 빌리기가 실패한다.

begin;

create table public.book_loans (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  book_id     text not null check (char_length(book_id) between 1 and 80),
  borrowed_at timestamptz not null default now(),
  due_at      timestamptz not null,
  returned_at timestamptz,
  position    int not null default 0 check (position >= 0)
);

-- 같은 책을 동시에 두 번 빌리지 못하게 (반납한 행은 제외)
create unique index book_loans_one_active on public.book_loans (user_id, book_id) where returned_at is null;

alter table public.book_loans enable row level security;

create policy "내 대여를 본다" on public.book_loans for select to authenticated using (user_id = (select auth.uid()));
create policy "내 대여를 고친다" on public.book_loans for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 테이블 권한을 모두 회수한 뒤 필요한 것만 준다(0054 와 같은 방식). 기한(due_at)은 사용자가 고치지 못하게 열 단위로 막는다.
-- borrow_book 은 security definer 라 이 권한과 상관없이 insert·update 한다.
revoke all on public.book_loans from authenticated, anon;
grant select on public.book_loans to authenticated;
grant update (returned_at, position) on public.book_loans to authenticated;

-- 반납한 행(returned_at 이 있는 행)을 다시 null 로 되돌리지 못하게 한다.
create or replace function public.book_loans_no_unreturn()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.returned_at is not null and new.returned_at is null then
    raise exception '반납한 책은 되살릴 수 없어요.';
  end if;
  return new;
end;
$$;

create trigger book_loans_no_unreturn
  before update on public.book_loans
  for each row execute function public.book_loans_no_unreturn();

-- 빌리기: 사용자별로 줄을 세워(advisory lock) 동시에 눌러도 5권을 넘지 않게 한다.
create or replace function public.borrow_book(p_book_id text)
returns public.book_loans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_loan public.book_loans;
begin
  if v_me is null then
    raise exception '로그인이 필요합니다.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_me::text));

  -- 기한이 지난 책은 기한 시각에 반납된 것으로 정리한다(같은 책을 다시 빌릴 수 있게).
  update public.book_loans
     set returned_at = due_at
   where user_id = v_me and returned_at is null and due_at <= now();

  if (select count(*) from public.book_loans where user_id = v_me and returned_at is null) >= 5 then
    raise exception '5권까지 빌릴 수 있어요.';
  end if;

  insert into public.book_loans (user_id, book_id, due_at)
  values (v_me, p_book_id, now() + interval '14 days')
  returning * into v_loan;

  return v_loan;
end;
$$;

revoke all on function public.borrow_book(text) from public, anon;
grant execute on function public.borrow_book(text) to authenticated;

commit;
