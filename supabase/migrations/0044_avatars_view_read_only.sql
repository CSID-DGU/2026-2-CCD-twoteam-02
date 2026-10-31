-- avatars 뷰를 읽기 전용으로 (#381)
--
-- 0010 은 avatars 뷰를 읽기만 하도록 만들려고 public·anon 의 권한만 회수했다.
-- 그런데 Supabase 는 public 스키마에 새로 만든 테이블·뷰에 authenticated 의 쓰기 권한
-- (INSERT·UPDATE·DELETE 등)을 기본으로 준다. 그 권한이 그대로 남아 있었다.
-- 이 뷰는 만든 사람(postgres) 권한으로 profiles 를 읽고 쓰기 때문에,
-- 뷰를 거친 쓰기는 profiles 의 "본인 행만" 규칙(0004)을 거치지 않는다.
--
-- 그래서 authenticated 의 권한을 모두 회수하고 SELECT 만 다시 준다.
-- 화면은 avatars 를 읽기만 하므로(select) 동작은 바뀌지 않는다.
--
-- 서비스 DB 에는 2026-11-01 에 같은 SQL 을 먼저 적용했다. 다시 실행해도 결과는 같다.

begin;

revoke all on public.avatars from public, anon, authenticated;
grant select on public.avatars to authenticated;

commit;
