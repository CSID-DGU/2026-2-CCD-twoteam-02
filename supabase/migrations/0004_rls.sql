-- 두뜀 0004: 행 수준 보안(RLS) 정책 (2주차, 백엔드·DB 육심호)
-- 실행 위치: Supabase 대시보드 > SQL Editor
--
-- 배경:
--   프로젝트 생성 시 자동 RLS를 켜 두어 모든 테이블이 잠긴 상태였다.
--   정책이 하나도 없으면 로그인한 사용자가 조회해도 결과가 늘 비어 있다.
--   키오스크 화면이 지점·좌석을 읽고 이용권을 발급하려면 여기서 권한을 열어야 한다.
--
-- 원칙 (팀 CLAUDE.md의 절대 규칙):
--   "Supabase 테이블에는 RLS를 적용한다. 본인 데이터만 조회·수정할 수 있어야 한다."
--
--   - 지점·좌석·회의실은 모두에게 같은 값인 배치 정보라 로그인한 사용자면 읽을 수 있다.
--   - 이용권·이용 기록·과목·공부 기록은 본인 행만 읽고 쓴다.
--   - 좌석 점유 현황은 남의 행을 읽어야 알 수 있으나, 누가 앉았는지는 알 필요가 없다.
--     그래서 seat_sessions 자체는 본인 것만 보이게 두고, 점유 여부만 돌려주는
--     함수를 따로 둔다. (아래 4번)
--
-- 로그인하지 않은 상태(anon)에는 아무 정책도 주지 않는다. 즉 전부 막힌다.

-- 중간에 실패하면 아무것도 남지 않도록 전체를 한 덩어리로 실행한다.
begin;

-- ---------------------------------------------------------------
-- 0. 모든 테이블에 RLS를 켠다.
--    자동 RLS로 이미 켜져 있어도 다시 실행해도 문제없다.
-- ---------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.branches      enable row level security;
alter table public.seats         enable row level security;
alter table public.rooms         enable row level security;
alter table public.passes        enable row level security;
alter table public.seat_sessions enable row level security;
alter table public.room_sessions enable row level security;
alter table public.subjects      enable row level security;
alter table public.study_logs    enable row level security;

-- ---------------------------------------------------------------
-- 1. 배치 정보: 로그인한 사용자면 읽을 수 있다. 쓰기는 아무도 못 한다.
--    지점 선택 화면과 키오스크 좌석 배치도가 쓴다.
-- ---------------------------------------------------------------
create policy "로그인 사용자는 지점을 조회한다"
  on public.branches for select to authenticated using (true);

create policy "로그인 사용자는 좌석을 조회한다"
  on public.seats for select to authenticated using (true);

create policy "로그인 사용자는 회의실을 조회한다"
  on public.rooms for select to authenticated using (true);

-- ---------------------------------------------------------------
-- 2. 내 정보: 본인 행만 읽고 고친다.
--    insert는 가입 시 handle_new_user 트리거(security definer)가 하므로 정책이 없어도 된다.
--    (security definer 함수는 RLS를 지나간다)
-- ---------------------------------------------------------------
create policy "본인 프로필만 조회한다"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "본인 프로필만 수정한다"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- 캐릭터 위에 이름을 띄우려면 남의 닉네임이 필요하다. 화면을 그리는 건 각자의 브라우저이므로
-- 그 브라우저가 값을 받아야 하기 때문이다. RLS는 행 단위라 컬럼 하나만 열 수 없어서,
-- 닉네임과 id만 담은 뷰를 따로 둔다. profiles 테이블 자체는 본인 것만 열려 있다.
-- 뷰는 만든 사람의 권한으로 도므로 profiles의 RLS를 지나간다. 의도한 동작이다.
create view public.nicknames as
  select id, nickname from public.profiles;

revoke all on public.nicknames from public, anon;
grant select on public.nicknames to authenticated;

-- ---------------------------------------------------------------
-- 3. 내 이용 기록: 본인 행만.
--    seat_sessions / room_sessions 의 insert 는 지금은 화면에서 직접 한다.
--    좌석 배정 함수를 만들 때(3주차) 함수 호출만 남기고 이 정책을 좁힌다.
-- ---------------------------------------------------------------
create policy "본인 이용권만 조회한다"
  on public.passes for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "본인 이용권만 발급한다"
  on public.passes for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- 시간 연장(6주차)에 쓸 자리. 연장 상한은 팀 논의 후 0005_ 에서 조건을 덧붙인다.
-- 지금은 상한이 없다는 점을 알고 열어 둔다. 화면에 연장 기능이 아직 없다.
create policy "본인 이용권만 수정한다"
  on public.passes for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "본인 좌석 이용만 조회한다"
  on public.seat_sessions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "본인 좌석 이용만 시작한다"
  on public.seat_sessions for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "본인 좌석 이용만 반납한다"
  on public.seat_sessions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "본인 회의실 이용만 조회한다"
  on public.room_sessions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "본인 회의실 이용만 시작한다"
  on public.room_sessions for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "본인 회의실 이용만 반납한다"
  on public.room_sessions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 과목과 공부 기록은 전부 본인 것이다.
create policy "본인 과목만 조회한다"
  on public.subjects for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "본인 과목만 등록한다"
  on public.subjects for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "본인 과목만 수정한다"
  on public.subjects for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "본인 과목만 삭제한다"
  on public.subjects for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "본인 공부 기록만 조회한다"
  on public.study_logs for select to authenticated
  using ((select auth.uid()) = user_id);

-- 공부 기록은 실험 데이터라 수정·삭제 정책을 일부러 만들지 않는다. 남기면 끝이다.
create policy "본인 공부 기록만 남긴다"
  on public.study_logs for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------
-- 4. 점유 현황: 좌석 번호와 인원 수만 돌려준다.
--
--    키오스크 좌석 배치도는 "몇 번 자리가 찼는지"를 알아야 하는데,
--    그러려면 남의 seat_sessions 행을 읽어야 한다. 테이블을 통째로 열면
--    누가 어디 앉았는지까지 노출되므로, 필요한 값만 돌려주는 함수를 둔다.
--
--    security definer 라서 함수 안에서는 RLS를 지나간다. 대신 돌려주는 값에
--    user_id 가 없으므로 "누가" 는 밖으로 나가지 않는다.
--    기본으로 모두에게 열려 있는 실행 권한을 거두고 로그인 사용자에게만 준다.
-- ---------------------------------------------------------------

-- 이용 중인 좌석 번호 목록
create function public.occupied_seat_numbers(p_branch_id bigint)
returns setof int
language sql
security definer
stable
set search_path = ''
as $$
  select s.seat_number
  from public.seat_sessions ss
  join public.seats s on s.id = ss.seat_id
  where ss.ended_at is null
    and s.branch_id = p_branch_id;
$$;

revoke execute on function public.occupied_seat_numbers(bigint) from public;
grant execute on function public.occupied_seat_numbers(bigint) to authenticated;

-- 회의실별 현재 인원과 정원
create function public.room_occupancy(p_branch_id bigint)
returns table (room_number int, occupied bigint, capacity int)
language sql
security definer
stable
set search_path = ''
as $$
  select r.room_number,
         count(rs.id) filter (where rs.ended_at is null),
         r.capacity
  from public.rooms r
  left join public.room_sessions rs on rs.room_id = r.id
  where r.branch_id = p_branch_id
  group by r.room_number, r.capacity
  order by r.room_number;
$$;

revoke execute on function public.room_occupancy(bigint) from public;
grant execute on function public.room_occupancy(bigint) to authenticated;

commit;
