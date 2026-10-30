-- 두뜀 0036: 휴식방 '숨 라운지' — 올리브 테라스 건물 4층 (카페 지점, 12석 라운지 소파, #57)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
-- 0014(카페 지점 종류 kind)를 먼저 실행해 두어야 한다.
--
-- 배경:
--   둥근 방에 누워 쉬는 라운지 소파 12개. 공부 타이머·집중 판정 없이 쉬기만 하는 방이다.
--   DB 에서는 카페(kind 'cafe')와 같다: 빈 소파에 누우면 내 자리, 일어나면 놓음(sit_cafe_seat·leave_cafe_seat 그대로).
--   "쉬기만 하는 방"은 화면이 지점 JSON 의 rest 로 정한다(src/space/branches/breath.json). 그래서 DB 함수는 바꾸지 않는다.
--   좌표는 breath.json 과 같다. 화면은 JSON 에서 읽으므로 여기 값은 참고용이다(0002 와 같은 원칙).
--   회의실은 두지 않는다(휴식방).
--
-- 다시 실행하기:
--   지점은 slug 가 이미 있으면 건너뛰고, 좌석은 번호가 이미 있으면 건너뛴다. 몇 번 실행해도 된다.

begin;

insert into public.branches (name, slug, kind)
values ('숨 라운지', 'breath', 'cafe')
on conflict (slug) do nothing;

insert into public.seats (branch_id, seat_number, pos_x, pos_z, rot)
select b.id, v.seat_number, v.pos_x, v.pos_z, v.rot
from public.branches b
cross join (values
  (1, 1.385, 5.168, -2.88),
  (2, 3.783, 3.783, -2.356),
  (3, 5.168, 1.385, -1.833),
  (4, 5.168, -1.385, -1.309),
  (5, 3.783, -3.783, -0.785),
  (6, 1.385, -5.168, -0.262),
  (7, -1.385, -5.168, 0.262),
  (8, -3.783, -3.783, 0.785),
  (9, -5.168, -1.385, 1.309),
  (10, -5.168, 1.385, 1.833),
  (11, -3.783, 3.783, 2.356),
  (12, -1.385, 5.168, 2.88)
) as v(seat_number, pos_x, pos_z, rot)
where b.slug = 'breath'
on conflict (branch_id, seat_number) do nothing;

commit;
