-- 두뜀 0032: 새 지점 올리브 테라스 (카페, 원목·올리브 나무 테마, #57)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
-- 0014(카페 지점 종류 kind)를 먼저 실행해 두어야 한다.
--
-- 배경:
--   로비 가운데 문으로 들어가는 세 번째 지점. 솔카페처럼 키오스크 없이 빈자리에 앉으면 내 자리가 되는 카페다.
--   좌석 24석: 가운데 올리브 나무를 둘러싼 고리 테이블 1~8, 서쪽 원목 부스 9~16, 동쪽 창가 테이블 17~24.
--   좌표는 src/space/branches/olive.json 과 같다. 화면은 JSON 에서 읽으므로 여기 값은 참고용이다(0002 와 같은 원칙).
--   회의실은 0014 와 같이 별다방의 회의실 배치를 그대로 복사한다.
--
-- 다시 실행하기:
--   지점은 slug 가 이미 있으면 건너뛰고, 좌석·회의실은 번호가 이미 있으면 건너뛴다. 몇 번 실행해도 된다.

begin;

insert into public.branches (name, slug, kind)
values ('올리브 테라스', 'olive', 'cafe')
on conflict (slug) do nothing;

insert into public.seats (branch_id, seat_number, pos_x, pos_z, rot)
select b.id, v.seat_number, v.pos_x, v.pos_z, v.rot
from public.branches b
cross join (values
  (1, 0.44, 0.062, 3.534),
  (2, 1.062, -0.56, 4.32),
  (3, 1.062, -1.44, 5.105),
  (4, 0.44, -2.062, 5.89),
  (5, -0.44, -2.062, 6.676),
  (6, -1.062, -1.44, 7.461),
  (7, -1.062, -0.56, 8.247),
  (8, -0.44, 0.062, 9.032),
  (9, -6.6, -5.8, 0),
  (10, -6.6, -5.2, 3.1416),
  (11, -6.6, -2.8, 0),
  (12, -6.6, -2.2, 3.1416),
  (13, -6.6, 0.2, 0),
  (14, -6.6, 0.8, 3.1416),
  (15, -6.6, 3.2, 0),
  (16, -6.6, 3.8, 3.1416),
  (17, 6.2, -6.3, 0),
  (18, 6.2, -5.7, 3.1416),
  (19, 6.2, -3.8, 0),
  (20, 6.2, -3.2, 3.1416),
  (21, 6.2, -1.3, 0),
  (22, 6.2, -0.7, 3.1416),
  (23, 6.2, 1.2, 0),
  (24, 6.2, 1.8, 3.1416)
) as v(seat_number, pos_x, pos_z, rot)
where b.slug = 'olive'
on conflict (branch_id, seat_number) do nothing;

insert into public.rooms (branch_id, room_number, capacity, pos_x, pos_z, width, depth)
select olive.id, r.room_number, r.capacity, r.pos_x, r.pos_z, r.width, r.depth
from public.rooms r
join public.branches byeol on byeol.id = r.branch_id and byeol.slug = 'byeol'
cross join public.branches olive
where olive.slug = 'olive'
on conflict do nothing;

commit;
