-- 두뜀 0053: 이끼 정원 뒷벽 창가 바 (책장 사이 통창 앞 바 좌석 3개)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
--
-- 배경:
--   이끼 정원(slug moss) 뒷벽 책장 두 개 사이에 바깥이 보이는 통창(theme.windows)을 내고, 그 앞에 창가 바를 놓았다.
--   그 자리에 있던 24번(터브 의자 + 낮은 테이블, 빈 벽을 봄)을 없애고 바 좌석 24·25·26번으로 바꾼다.
--   좌표는 src/space/branches/moss.json 과 같다. 화면은 JSON 에서 읽으므로 여기 값은 참고용이다(0002 와 같은 원칙).
--   sit_cafe_seat 는 seats 표에 있는 번호만 앉게 하므로 25·26번을 넣어야 앉을 수 있다.
--
-- 다시 실행하기: (지점, 번호)가 이미 있으면 좌표만 같은 값으로 다시 쓴다. 몇 번 실행해도 된다. 지우는 자리는 없다.

begin;

insert into public.seats (branch_id, seat_number, pos_x, pos_z, rot)
select b.id, v.seat_number, v.pos_x, v.pos_z, v.rot
from public.branches b
cross join (values
  (24, -1.4, -7.4, 3.142),
  (25, 0.0, -7.4, 3.142),
  (26, 1.4, -7.4, 3.142)
) as v(seat_number, pos_x, pos_z, rot)
where b.slug = 'moss'
on conflict (branch_id, seat_number) do update
  set pos_x = excluded.pos_x, pos_z = excluded.pos_z, rot = excluded.rot;

commit;
