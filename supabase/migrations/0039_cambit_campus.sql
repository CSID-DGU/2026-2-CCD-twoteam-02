-- 두뜀 0039: 캠빛 대학교 캠퍼스 건물 다섯 곳 — 도서관·강의동·정보관·학생회관 카페·학생 라운지 (카페 지점, #57)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
-- 0014(카페 지점 종류 kind)를 먼저 실행해 두어야 한다.
--
-- 배경:
--   캠퍼스(/campus, src/world/campus.json)의 건물 다섯 곳. 모두 카페 지점(빈자리에 앉으면 내 자리, 일어나면 놓음)이다.
--   건물마다 다른 공부 방식(도서관·정보관 고정 설정, 도서관 방해금지 고정, 학생 라운지 휴식)은 지점 JSON 의 rules·rest 로
--   화면이 정한다. DB 함수는 바꾸지 않는다. 회의실은 두지 않는다.
--   좌표는 src/space/branches/cambit-*.json 과 같다. 화면은 JSON 에서 읽으므로 여기 값은 참고용이다(0002 와 같은 원칙).
--
-- 다시 실행하기:
--   지점은 slug 가 이미 있으면 건너뛰고, 좌석은 번호가 이미 있으면 건너뛴다. 몇 번 실행해도 된다.

begin;

-- 캠빛 중앙도서관
insert into public.branches (name, slug, kind)
values ('캠빛 중앙도서관', 'cambit-library', 'cafe')
on conflict (slug) do nothing;

insert into public.seats (branch_id, seat_number, pos_x, pos_z, rot)
select b.id, v.seat_number, v.pos_x, v.pos_z, v.rot
from public.branches b
cross join (values
  (1, -4.5, -5.4, 3.142),
  (2, -3.25, -5.4, 3.142),
  (3, -2.0, -5.4, 3.142),
  (4, 2.0, -5.4, 3.142),
  (5, 3.25, -5.4, 3.142),
  (6, 4.5, -5.4, 3.142),
  (7, -4.5, -2.4, 3.142),
  (8, -3.25, -2.4, 3.142),
  (9, -2.0, -2.4, 3.142),
  (10, 2.0, -2.4, 3.142),
  (11, 3.25, -2.4, 3.142),
  (12, 4.5, -2.4, 3.142),
  (13, -4.5, 0.6, 3.142),
  (14, -3.25, 0.6, 3.142),
  (15, -2.0, 0.6, 3.142),
  (16, 2.0, 0.6, 3.142),
  (17, 3.25, 0.6, 3.142),
  (18, 4.5, 0.6, 3.142),
  (19, -4.5, 3.6, 3.142),
  (20, -3.25, 3.6, 3.142),
  (21, -2.0, 3.6, 3.142),
  (22, 2.0, 3.6, 3.142),
  (23, 3.25, 3.6, 3.142),
  (24, 4.5, 3.6, 3.142)
) as v(seat_number, pos_x, pos_z, rot)
where b.slug = 'cambit-library'
on conflict (branch_id, seat_number) do nothing;

-- 캠빛 강의동
insert into public.branches (name, slug, kind)
values ('캠빛 강의동', 'cambit-lecture', 'cafe')
on conflict (slug) do nothing;

insert into public.seats (branch_id, seat_number, pos_x, pos_z, rot)
select b.id, v.seat_number, v.pos_x, v.pos_z, v.rot
from public.branches b
cross join (values
  (1, -4.95, -3.2, 3.142),
  (2, -3.7, -3.2, 3.142),
  (3, -2.45, -3.2, 3.142),
  (4, -1.2, -3.2, 3.142),
  (5, 1.2, -3.2, 3.142),
  (6, 2.45, -3.2, 3.142),
  (7, 3.7, -3.2, 3.142),
  (8, 4.95, -3.2, 3.142),
  (9, -4.95, 0.0, 3.142),
  (10, -3.7, 0.0, 3.142),
  (11, -2.45, 0.0, 3.142),
  (12, -1.2, 0.0, 3.142),
  (13, 1.2, 0.0, 3.142),
  (14, 2.45, 0.0, 3.142),
  (15, 3.7, 0.0, 3.142),
  (16, 4.95, 0.0, 3.142),
  (17, -4.95, 3.2, 3.142),
  (18, -3.7, 3.2, 3.142),
  (19, -2.45, 3.2, 3.142),
  (20, -1.2, 3.2, 3.142),
  (21, 1.2, 3.2, 3.142),
  (22, 2.45, 3.2, 3.142),
  (23, 3.7, 3.2, 3.142),
  (24, 4.95, 3.2, 3.142)
) as v(seat_number, pos_x, pos_z, rot)
where b.slug = 'cambit-lecture'
on conflict (branch_id, seat_number) do nothing;

-- 캠빛 정보관
insert into public.branches (name, slug, kind)
values ('캠빛 정보관', 'cambit-info', 'cafe')
on conflict (slug) do nothing;

insert into public.seats (branch_id, seat_number, pos_x, pos_z, rot)
select b.id, v.seat_number, v.pos_x, v.pos_z, v.rot
from public.branches b
cross join (values
  (1, -4.5, -5.4, 3.142),
  (2, -3.25, -5.4, 3.142),
  (3, -2.0, -5.4, 3.142),
  (4, 2.0, -5.4, 3.142),
  (5, 3.25, -5.4, 3.142),
  (6, 4.5, -5.4, 3.142),
  (7, -4.5, -2.4, 3.142),
  (8, -3.25, -2.4, 3.142),
  (9, -2.0, -2.4, 3.142),
  (10, 2.0, -2.4, 3.142),
  (11, 3.25, -2.4, 3.142),
  (12, 4.5, -2.4, 3.142),
  (13, -4.5, 0.6, 3.142),
  (14, -3.25, 0.6, 3.142),
  (15, -2.0, 0.6, 3.142),
  (16, 2.0, 0.6, 3.142),
  (17, 3.25, 0.6, 3.142),
  (18, 4.5, 0.6, 3.142),
  (19, -4.5, 3.6, 3.142),
  (20, -3.25, 3.6, 3.142),
  (21, -2.0, 3.6, 3.142),
  (22, 2.0, 3.6, 3.142),
  (23, 3.25, 3.6, 3.142),
  (24, 4.5, 3.6, 3.142)
) as v(seat_number, pos_x, pos_z, rot)
where b.slug = 'cambit-info'
on conflict (branch_id, seat_number) do nothing;

-- 학생회관 카페
insert into public.branches (name, slug, kind)
values ('학생회관 카페', 'cambit-cafe', 'cafe')
on conflict (slug) do nothing;

insert into public.seats (branch_id, seat_number, pos_x, pos_z, rot)
select b.id, v.seat_number, v.pos_x, v.pos_z, v.rot
from public.branches b
cross join (values
  (1, -4.6, -3.8, 0),
  (2, -4.6, -3.2, 3.142),
  (3, -3.4, -3.8, 0),
  (4, -3.4, -3.2, 3.142),
  (5, 3.4, -3.8, 0),
  (6, 3.4, -3.2, 3.142),
  (7, 4.6, -3.8, 0),
  (8, 4.6, -3.2, 3.142),
  (9, -0.6, -0.8, 0),
  (10, -0.6, -0.2, 3.142),
  (11, 0.6, -0.8, 0),
  (12, 0.6, -0.2, 3.142),
  (13, -4.6, 2.2, 0),
  (14, -4.6, 2.8, 3.142),
  (15, -3.4, 2.2, 0),
  (16, -3.4, 2.8, 3.142),
  (17, 3.4, 2.2, 0),
  (18, 3.4, 2.8, 3.142),
  (19, 4.6, 2.2, 0),
  (20, 4.6, 2.8, 3.142)
) as v(seat_number, pos_x, pos_z, rot)
where b.slug = 'cambit-cafe'
on conflict (branch_id, seat_number) do nothing;

-- 학생 라운지
insert into public.branches (name, slug, kind)
values ('학생 라운지', 'cambit-lounge', 'cafe')
on conflict (slug) do nothing;

insert into public.seats (branch_id, seat_number, pos_x, pos_z, rot)
select b.id, v.seat_number, v.pos_x, v.pos_z, v.rot
from public.branches b
cross join (values
  (1, -5.15, -5, 1.571),
  (2, -5.15, -2.5, 1.571),
  (3, -5.15, 0, 1.571),
  (4, -5.15, 2.5, 1.571),
  (5, -5.15, 5, 1.571),
  (6, 5.15, -5, -1.571),
  (7, 5.15, -2.5, -1.571),
  (8, 5.15, 0, -1.571),
  (9, 5.15, 2.5, -1.571),
  (10, 5.15, 5, -1.571)
) as v(seat_number, pos_x, pos_z, rot)
where b.slug = 'cambit-lounge'
on conflict (branch_id, seat_number) do nothing;

commit;
