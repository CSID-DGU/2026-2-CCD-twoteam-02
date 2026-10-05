-- 두뜀 0002: 지점·좌석 정보를 클라이언트 레이아웃에 맞춤 (1주차, 백엔드·DB 육심호)
-- 실행 위치: Supabase 대시보드 > SQL Editor
--
-- 배경:
--   0001은 좌석을 5열×4행 임시 격자(pos_x 0~4, pos_y 0~3)로 넣었다.
--   그 뒤 아바타·화면 파트(김현)가 src/space/branches/byeol.json 으로
--   x/z 평면 좌표(단위 m, 원점은 지점 중앙)와 회전값 rot 을 확정해 구현했다.
--   (src/space/BranchScene.tsx, src/space/layout.ts)
--   이 파일은 DB를 그 값에 맞춘다.
--
-- 좌표의 원본은 byeol.json 이다. 이 테이블은 키오스크 배치도와 좌석 점유 조회를
-- 질의 한 번으로 처리하기 위한 사본이며, 배치가 바뀌면 마이그레이션으로 다시 맞춘다.
-- 의자 위치는 layout.ts 의 spotsOf() 가 책상 좌표와 rot 으로 계산하므로 저장하지 않는다.

-- 중간에 실패하면 아무것도 남지 않도록 전체를 한 덩어리로 실행한다.
begin;

-- ---------------------------------------------------------------
-- 1. 지점: 클라이언트 식별자(slug)를 추가하고 이름을 맞춘다.
--    byeol.json 의 id = 'byeol', name = '별다방'
-- ---------------------------------------------------------------
alter table public.branches add column slug text;

update public.branches
set slug = 'byeol', name = '별다방'
where name = '두뜀 1호점';

alter table public.branches alter column slug set not null;
alter table public.branches add constraint branches_slug_key unique (slug);

-- ---------------------------------------------------------------
-- 2. 좌석: pos_y(행 번호)를 pos_z(깊이 좌표)로 바꾸고 회전값을 추가한다.
--    rot: 앉았을 때 바라보는 방향(라디안). 0 = +z 쪽, 3.1416 = -z 쪽.
-- ---------------------------------------------------------------
alter table public.seats rename column pos_y to pos_z;
alter table public.seats add column rot numeric not null default 0;

comment on column public.seats.pos_x is 'byeol.json 기준 책상 중심 x (m, 원점 지점 중앙)';
comment on column public.seats.pos_z is 'byeol.json 기준 책상 중심 z (m, 원점 지점 중앙)';
comment on column public.seats.rot  is '앉았을 때 바라보는 방향(라디안)';

-- ---------------------------------------------------------------
-- 3. 좌석 20석의 좌표를 byeol.json 값으로 교체한다.
-- ---------------------------------------------------------------
update public.seats s
set pos_x = v.x, pos_z = v.z, rot = v.rot
from (values
  ( 1, -9.0, -4.0, 0.0),
  ( 2, -6.5, -4.0, 0.0),
  ( 3, -4.0, -4.0, 0.0),
  ( 4, -1.5, -4.0, 0.0),
  ( 5,  1.0, -4.0, 0.0),
  ( 6, -9.0, -3.4, 3.1416),
  ( 7, -6.5, -3.4, 3.1416),
  ( 8, -4.0, -3.4, 3.1416),
  ( 9, -1.5, -3.4, 3.1416),
  (10,  1.0, -3.4, 3.1416),
  (11, -9.0,  1.0, 0.0),
  (12, -6.5,  1.0, 0.0),
  (13, -4.0,  1.0, 0.0),
  (14, -1.5,  1.0, 0.0),
  (15,  1.0,  1.0, 0.0),
  (16, -9.0,  1.6, 3.1416),
  (17, -6.5,  1.6, 3.1416),
  (18, -4.0,  1.6, 3.1416),
  (19, -1.5,  1.6, 3.1416),
  (20,  1.0,  1.6, 3.1416)
) as v(seat_number, x, z, rot)
where s.seat_number = v.seat_number
  and s.branch_id = (select id from public.branches where slug = 'byeol');

commit;
