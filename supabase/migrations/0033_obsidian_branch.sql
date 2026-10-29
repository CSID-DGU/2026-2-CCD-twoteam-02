-- 두뜀 0033: 새 지점 흑요 라운지 (카페, 검은 원형 부스·대리석 테이블 테마, #57)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
-- 0014(카페 지점 종류 kind)를 먼저 실행해 두어야 한다.
--
-- 배경:
--   로비 북쪽 벽 오른쪽 끝 문으로 들어가는 네 번째 지점. 솔카페·올리브 테라스처럼 빈자리에 앉으면 내 자리가 되는 카페다.
--   좌석 24석: 원형 부스 6개 × 4자리(열린 쪽 의자 1 + 부스 안 3). 부스 1(1~4)·2(5~8)·3(9~12)은 북쪽 줄, 4~6(13~24)은 남쪽 줄.
--   좌표는 src/space/branches/obsidian.json 과 같다. 화면은 JSON 에서 읽으므로 여기 값은 참고용이다(0002 와 같은 원칙).
--   회의실은 0014 와 같이 별다방의 회의실 배치를 그대로 복사한다.
--
-- 다시 실행하기:
--   지점은 slug 가 이미 있으면 건너뛰고, 좌석·회의실은 번호가 이미 있으면 건너뛴다. 몇 번 실행해도 된다.

begin;

insert into public.branches (name, slug, kind)
values ('흑요 라운지', 'obsidian', 'cafe')
on conflict (slug) do nothing;

insert into public.seats (branch_id, seat_number, pos_x, pos_z, rot)
select b.id, v.seat_number, v.pos_x, v.pos_z, v.rot
from public.branches b
cross join (values
  (1, -5.0, -4.35, 3.142),
  (2, -4.858, -4.547, 5.033),
  (3, -5.0, -4.65, 6.283),
  (4, -5.142, -4.547, 7.533),
  (5, 0.0, -4.35, 3.142),
  (6, 0.142, -4.547, 5.033),
  (7, 0.0, -4.65, 6.283),
  (8, -0.142, -4.547, 7.533),
  (9, 5.0, -4.35, 3.142),
  (10, 5.142, -4.547, 5.033),
  (11, 5.0, -4.65, 6.283),
  (12, 4.858, -4.547, 7.533),
  (13, -5.0, 1.35, 6.283),
  (14, -5.142, 1.547, 8.175),
  (15, -5.0, 1.65, 9.425),
  (16, -4.858, 1.547, 10.675),
  (17, 0.0, 1.35, 6.283),
  (18, -0.142, 1.547, 8.175),
  (19, 0.0, 1.65, 9.425),
  (20, 0.142, 1.547, 10.675),
  (21, 5.0, 1.35, 6.283),
  (22, 4.858, 1.547, 8.175),
  (23, 5.0, 1.65, 9.425),
  (24, 5.142, 1.547, 10.675)
) as v(seat_number, pos_x, pos_z, rot)
where b.slug = 'obsidian'
on conflict (branch_id, seat_number) do nothing;

insert into public.rooms (branch_id, room_number, capacity, pos_x, pos_z, width, depth)
select obs.id, r.room_number, r.capacity, r.pos_x, r.pos_z, r.width, r.depth
from public.rooms r
join public.branches byeol on byeol.id = r.branch_id and byeol.slug = 'byeol'
cross join public.branches obs
where obs.slug = 'obsidian'
on conflict do nothing;

commit;
