-- 두뜀 0043: 캠퍼스 가운데 등불 나무 광장에서 공부하기 — 캠퍼스를 카페 종류 지점으로 (빈백 10석)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
-- 0014(카페 지점 종류 kind)를 먼저 실행해 두어야 한다.
--
-- 배경:
--   캠퍼스(/campus) 쿼드 가운데 등불 나무 둘레의 빈백에 앉아, 광장 벤치(0038)와 똑같이 공부(타이머·집중 판정·기록 저장)한다.
--   공부 기록은 좌석 이용 기록에 붙어야 하므로 캠퍼스를 카페(kind 'cafe') 지점 'campus' 로 등록하고 빈백을 그 지점의 좌석으로 둔다.
--   카페와 같다: 빈자리에 앉으면 내 자리, 일어나면 놓음(sit_cafe_seat·leave_cafe_seat 그대로). DB 함수는 바꾸지 않는다.
--   is_open 은 false: 캠퍼스는 건물이 아니라서 열린 지점 목록에 들어가지 않게 한다(0038 광장과 같음).
--
-- 좌석 번호와 좌표:
--   campus.json courtyard.bags 순서대로(불규칙하게 놓은 빈백) 하나씩. src/world/worldLogic.ts 의 courtyardSeats 와 같다.
--   화면은 campus.json 에서 계산하므로 여기 좌표는 참고용이다(0002 와 같은 원칙). 방향(rot)은 앉은 사람이 보는 쪽.
--
-- 다시 실행하기:
--   지점은 slug 가 이미 있으면 건너뛰고, 좌석은 번호가 이미 있으면 건너뛴다. 몇 번 실행해도 된다.

begin;

insert into public.branches (name, slug, kind, is_open)
values ('등불나무 광장', 'campus', 'cafe', false)
on conflict (slug) do nothing;

insert into public.seats (branch_id, seat_number, pos_x, pos_z, rot)
select b.id, v.seat_number, v.pos_x, v.pos_z, v.rot
from public.branches b
cross join (values
  (1, 1.75, 3.93, -2.98),
  (2, 4.18, 2.93, -1.97),
  (3, 4.3, 1.32, -2.01),
  (4, 3.86, -3.02, -0.56),
  (5, 1.64, -3.87, -0.58),
  (6, -1.61, -4.42, 0.59),
  (7, -4.39, -2.96, 0.66),
  (8, -4.23, -1.21, 1.4),
  (9, -3.93, 2.75, 1.97),
  (10, -2.19, 4.49, 2.97)
) as v(seat_number, pos_x, pos_z, rot)
where b.slug = 'campus'
on conflict (branch_id, seat_number) do nothing;

commit;
