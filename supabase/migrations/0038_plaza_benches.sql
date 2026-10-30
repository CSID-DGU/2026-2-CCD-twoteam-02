-- 두뜀 0038: 광장 벤치에서 공부하기 — 광장을 카페 종류 지점으로 (벤치 자리 16석)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
-- 0014(카페 지점 종류 kind)를 먼저 실행해 두어야 한다.
--
-- 배경:
--   광장(첫 화면)의 벤치에 앉아 지점 자리와 똑같이 공부(타이머·집중 판정·기록 저장)할 수 있게 한다.
--   공부 기록(study_logs)은 좌석 이용 기록(seat_sessions)에, 그것은 지점 좌석(seats)과 이용권(passes)에 붙어야 한다.
--   그래서 광장을 카페(kind 'cafe') 지점 'plaza' 로 등록하고 벤치 자리를 그 지점의 좌석으로 둔다.
--   카페와 같다: 빈자리에 앉으면 내 자리, 일어나면 놓음(sit_cafe_seat·leave_cafe_seat 그대로). DB 함수는 바꾸지 않는다.
--   is_open 은 false: 광장은 건물이 아니라서 광장 입구 목록(WorldScene 의 열린 지점)에 들어가지 않게 한다.
--   자리를 쓰는 중 다른 곳에 앉으려 하면 안내에 "광장 3번 자리를 이용 중이에요"처럼 이름이 나온다.
--
-- 좌석 번호와 좌표:
--   world.json 의 벤치 순서대로 벤치마다 두 자리(벤치 기준 왼쪽부터). src/world/worldLogic.ts 의 benchSeats 와 같다.
--   화면은 world.json 에서 계산하므로 여기 좌표는 참고용이다(0002 와 같은 원칙). 방향(rot)은 앉은 사람이 보는 쪽.
--
-- 다시 실행하기:
--   지점은 slug 가 이미 있으면 건너뛰고, 좌석은 번호가 이미 있으면 건너뛴다. 몇 번 실행해도 된다.

begin;

insert into public.branches (name, slug, kind, is_open)
values ('광장', 'plaza', 'cafe', false)
on conflict (slug) do nothing;

insert into public.seats (branch_id, seat_number, pos_x, pos_z, rot)
select b.id, v.seat_number, v.pos_x, v.pos_z, v.rot
from public.branches b
cross join (values
  (1, -5.4, -9, 0),
  (2, -4.6, -9, 0),
  (3, 4.6, -9, 0),
  (4, 5.4, -9, 0),
  (5, -4.6, 9, 3.142),
  (6, -5.4, 9, 3.142),
  (7, 5.4, 9, 3.142),
  (8, 4.6, 9, 3.142),
  (9, 9, -5.4, -1.571),
  (10, 9, -4.6, -1.571),
  (11, 9, 4.6, -1.571),
  (12, 9, 5.4, -1.571),
  (13, -9, -4.6, 1.571),
  (14, -9, -5.4, 1.571),
  (15, -9, 5.4, 1.571),
  (16, -9, 4.6, 1.571)
) as v(seat_number, pos_x, pos_z, rot)
where b.slug = 'plaza'
on conflict (branch_id, seat_number) do nothing;

commit;
