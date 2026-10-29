-- 두뜀 0031: 솔카페 좌석 21~28 추가 (#57 다이너 테마)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
-- 0014(솔카페)를 먼저 실행해 두어야 한다.
--
-- 배경:
--   솔카페를 다이너로 꾸미면서 회의실 쪽(동쪽)에 4인 테이블 2개를 더 놓았다(2026-10-29).
--   좌석 번호·좌표는 src/space/branches/sol.json 과 같다. 좌표는 화면이 JSON 에서 읽으므로 여기 값은 참고용이다
--   (0002 와 같은 원칙: 의자 위치는 저장하지 않는다).
--
-- 다시 실행하기:
--   이미 있는 번호는 건너뛴다(on conflict do nothing). 몇 번 실행해도 된다.

begin;

insert into public.seats (branch_id, seat_number, pos_x, pos_z, rot)
select b.id, v.seat_number, v.pos_x, v.pos_z, v.rot
from public.branches b
cross join (values
  (21, 6.1, -5.0, 0),      (22, 7.3, -5.0, 0),      (23, 6.1, -4.4, 3.1416), (24, 7.3, -4.4, 3.1416),
  (25, 6.1,  0.0, 0),      (26, 7.3,  0.0, 0),      (27, 6.1,  0.6, 3.1416), (28, 7.3,  0.6, 3.1416)
) as v(seat_number, pos_x, pos_z, rot)
where b.slug = 'sol'
on conflict (branch_id, seat_number) do nothing;

commit;
