-- 두뜀 0057: 캠리단길 광장 캠프파이어 통나무 자리에서 공부하기 (8석)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
-- 0038(광장 지점 plaza, 벤치 1~16번)을 먼저 실행해 두어야 한다.
--
-- 배경:
--   광장 서쪽 잔디(world.json 의 campfire)에 캠프파이어를 두고, 둘레 통나무 의자 8개를 벤치처럼 공부 자리로 쓴다.
--   벤치와 같은 광장 지점(plaza, 카페 종류)의 좌석이고 번호는 벤치 다음 17~24번. 빈자리에 앉으면 내 자리, 일어나면 놓음.
--   sit_cafe_seat 는 seats 표에 있는 번호만 앉게 하므로 여기서 넣어야 앉을 수 있다. DB 함수는 바꾸지 않는다.
--
-- 좌석 번호와 좌표:
--   src/world/campfireLogic.ts 의 campfireSeats 와 같다(불 가운데 -18, 0 / 반지름 2.8 / 동서남북은 비워 반 칸 돌림).
--   화면은 world.json 에서 계산하므로 여기 좌표는 참고용이다(0002 와 같은 원칙). 방향(rot)은 앉은 사람이 보는 쪽(불).
--
-- 다시 실행하기: (지점, 번호)가 이미 있으면 좌표만 같은 값으로 다시 쓴다. 몇 번 실행해도 된다. 지우는 자리는 없다.

begin;

insert into public.seats (branch_id, seat_number, pos_x, pos_z, rot)
select b.id, v.seat_number, v.pos_x, v.pos_z, v.rot
from public.branches b
cross join (values
  (17, -19.072, -2.587, 0.393),
  (18, -20.587, -1.072, 1.178),
  (19, -20.587, 1.072, 1.963),
  (20, -19.072, 2.587, 2.749),
  (21, -16.928, 2.587, -2.749),
  (22, -15.413, 1.072, -1.963),
  (23, -15.413, -1.072, -1.178),
  (24, -16.928, -2.587, -0.393)
) as v(seat_number, pos_x, pos_z, rot)
where b.slug = 'plaza'
on conflict (branch_id, seat_number) do update
  set pos_x = excluded.pos_x, pos_z = excluded.pos_z, rot = excluded.rot;

commit;
