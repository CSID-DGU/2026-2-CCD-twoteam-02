-- 두뜀 0034: 새 지점 3개 — 월넛 바·이끼 정원·물결 라운지 (카페, #57)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
-- 0014(카페 지점 종류 kind)를 먼저 실행해 두어야 한다.
--
-- 배경:
--   광장 북동 골목에 월넛 바 건물을 두고, 올리브 테라스 건물 2·3층에 이끼 정원·물결 라운지를 쌓는다(src/world/world.json). 각각 24석 카페 지점이다.
--   좌표는 src/space/branches/{walnut,moss,stream}.json 과 같다. 화면은 JSON 에서 읽으므로 여기 값은 참고용이다(0002 와 같은 원칙).
--   회의실은 0014 와 같이 별다방의 회의실 배치를 그대로 복사한다.
--
-- 다시 실행하기:
--   지점은 slug 가 이미 있으면 건너뛰고, 좌석·회의실은 번호가 이미 있으면 건너뛴다. 몇 번 실행해도 된다.

begin;

-- 월넛 바
insert into public.branches (name, slug, kind)
values ('월넛 바', 'walnut', 'cafe')
on conflict (slug) do nothing;

insert into public.seats (branch_id, seat_number, pos_x, pos_z, rot)
select b.id, v.seat_number, v.pos_x, v.pos_z, v.rot
from public.branches b
cross join (values
  (1, -1.559, -3.514, 2.179),
  (2, -1.206, -3.132, 2.454),
  (3, -0.762, -2.859, 2.729),
  (4, -0.26, -2.718, 3.004),
  (5, 0.26, -2.718, 3.279),
  (6, 0.762, -2.859, 3.554),
  (7, 1.206, -3.132, 3.829),
  (8, 1.559, -3.514, 4.104),
  (9, -5.0, 1.45, 6.284),
  (10, -5.142, 1.647, 8.175),
  (11, -5.0, 1.75, 9.425),
  (12, -4.858, 1.647, 10.675),
  (13, 5.0, 1.45, 6.284),
  (14, 4.858, 1.647, 8.175),
  (15, 5.0, 1.75, 9.425),
  (16, 5.142, 1.647, 10.675),
  (17, -6.3, -5.5, 1.571),
  (18, -6.3, -2.5, 1.571),
  (19, 6.3, -5.5, -1.571),
  (20, 6.3, -2.5, -1.571),
  (21, -2.6, 4.8, 3.142),
  (22, 2.6, 4.8, 3.142),
  (23, -5.2, 5.0, 3.142),
  (24, 5.2, 5.0, 3.142)
) as v(seat_number, pos_x, pos_z, rot)
where b.slug = 'walnut'
on conflict (branch_id, seat_number) do nothing;

insert into public.rooms (branch_id, room_number, capacity, pos_x, pos_z, width, depth)
select nb.id, r.room_number, r.capacity, r.pos_x, r.pos_z, r.width, r.depth
from public.rooms r
join public.branches byeol on byeol.id = r.branch_id and byeol.slug = 'byeol'
cross join public.branches nb
where nb.slug = 'walnut'
on conflict do nothing;

-- 이끼 정원
insert into public.branches (name, slug, kind)
values ('이끼 정원', 'moss', 'cafe')
on conflict (slug) do nothing;

insert into public.seats (branch_id, seat_number, pos_x, pos_z, rot)
select b.id, v.seat_number, v.pos_x, v.pos_z, v.rot
from public.branches b
cross join (values
  (1, -4.542, -5.062, 3.542),
  (2, -4.487, -5.299, 5.433),
  (3, -4.658, -5.338, 6.683),
  (4, -4.75, -5.188, 7.933),
  (5, 3.528, -5.268, 2.642),
  (6, 3.748, -5.373, 4.533),
  (7, 3.672, -5.532, 5.783),
  (8, 3.498, -5.51, 7.033),
  (9, -3.523, 0.471, 5.742),
  (10, -3.746, 0.567, 7.633),
  (11, -3.677, 0.729, 8.883),
  (12, -3.502, 0.714, 10.133),
  (13, 3.934, 0.665, 6.742),
  (14, 3.893, 0.905, 8.633),
  (15, 4.066, 0.935, 9.883),
  (16, 4.149, 0.779, 11.133),
  (17, -6.3, -2.2, 1.571),
  (18, -6.3, 3.4, 1.571),
  (19, 2.2, -2.6, 3.142),
  (20, 6.0, 3.4, -1.571),
  (21, 2.4, 4.4, 3.142),
  (22, -4.0, 4.6, 3.142),
  (23, 6.6, -3.0, -1.571),
  (24, -0.6, -6.4, 0.0)
) as v(seat_number, pos_x, pos_z, rot)
where b.slug = 'moss'
on conflict (branch_id, seat_number) do nothing;

insert into public.rooms (branch_id, room_number, capacity, pos_x, pos_z, width, depth)
select nb.id, r.room_number, r.capacity, r.pos_x, r.pos_z, r.width, r.depth
from public.rooms r
join public.branches byeol on byeol.id = r.branch_id and byeol.slug = 'byeol'
cross join public.branches nb
where nb.slug = 'moss'
on conflict do nothing;

-- 물결 라운지
insert into public.branches (name, slug, kind)
values ('물결 라운지', 'stream', 'cafe')
on conflict (slug) do nothing;

insert into public.seats (branch_id, seat_number, pos_x, pos_z, rot)
select b.id, v.seat_number, v.pos_x, v.pos_z, v.rot
from public.branches b
cross join (values
  (1, -5.0, -5.65, 3.142),
  (2, -4.858, -5.847, 5.033),
  (3, -5.0, -5.95, 6.283),
  (4, -5.142, -5.847, 7.533),
  (5, 0.8, -5.45, 3.142),
  (6, 0.942, -5.647, 5.033),
  (7, 0.8, -5.75, 6.283),
  (8, 0.658, -5.647, 7.533),
  (9, 5.4, -5.25, 3.142),
  (10, 5.542, -5.447, 5.033),
  (11, 5.4, -5.55, 6.283),
  (12, 5.258, -5.447, 7.533),
  (13, 4.6, 0.45, 6.284),
  (14, 4.458, 0.647, 8.175),
  (15, 4.6, 0.75, 9.425),
  (16, 4.742, 0.647, 10.675),
  (17, -6.3, 1.2, 1.571),
  (18, -6.3, 3.6, 1.571),
  (19, -3.8, 4.6, 3.142),
  (20, -1.6, 4.6, 3.142),
  (21, 2.2, 4.2, 3.142),
  (22, 5.8, 3.4, -1.571),
  (23, 3.0, -2.2, 0.0),
  (24, -4.6, -0.4, 1.571)
) as v(seat_number, pos_x, pos_z, rot)
where b.slug = 'stream'
on conflict (branch_id, seat_number) do nothing;

insert into public.rooms (branch_id, room_number, capacity, pos_x, pos_z, width, depth)
select nb.id, r.room_number, r.capacity, r.pos_x, r.pos_z, r.width, r.depth
from public.rooms r
join public.branches byeol on byeol.id = r.branch_id and byeol.slug = 'byeol'
cross join public.branches nb
where nb.slug = 'stream'
on conflict do nothing;

commit;
