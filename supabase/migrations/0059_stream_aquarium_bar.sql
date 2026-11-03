-- 0059: 물결 라운지(slug stream) 어항 바 — 원통 어항을 둘러싼 원형 바 하이스툴 4자리(25·30·31·32) 추가, 터브 자리(17~24, 23 제외)를 창 쪽으로 돌림
--
-- 왜: 가운데 어항을 둘러앉는 자리를 만든다. 좌석 번호가 DB 에 없으면 sit_cafe_seat 가 '좌석을 찾을 수 없습니다' 오류를 내므로 번호를 넣는다.
--     화면은 지점 JSON(src/space/branches/stream.json) 좌표를 쓰고, 여기 좌표는 같은 값으로 맞춰 둔다.
-- 권한: seats 표의 RLS 는 그대로.
-- 적용: develop 으로 가는 PR 이라 서비스 DB(SQL Editor)에 실행한다. 새 번호(25·30~32)는 머지 전에, 23번 삭제는 머지 뒤에(배포된 화면에 23번이 남아 있는 동안 지우면 앉을 때 오류). experiment DB 에는 실행하지 않는다.
-- 다시 실행하기: (지점, 번호)가 이미 있으면 좌표만 같은 값으로 다시 쓴다. 몇 번 실행해도 된다.

insert into public.seats (branch_id, seat_number, pos_x, pos_z, rot)
select b.id, v.seat_number, v.pos_x, v.pos_z, v.rot
from public.branches b
cross join (values
  (17, -6.3, 1.2, 0),
  (18, -6.3, 3.6, 0),
  (19, -3.8, 4.6, 0),
  (20, -1.6, 4.6, 0),
  (21, 2.2, 4.2, 0),
  (22, 5.8, 3.4, 0),
  (24, -4.6, -0.4, 0),
  (25, 1.012, 1.678, -2.749),
  (30, -1.078, -0.412, 1.178),
  (31, -1.078, 0.812, 1.963),
  (32, -0.212, 1.678, 2.749)
) as v(seat_number, pos_x, pos_z, rot)
where b.slug = 'stream'
on conflict (branch_id, seat_number) do update
  set pos_x = excluded.pos_x, pos_z = excluded.pos_z, rot = excluded.rot;

-- 23번과 26~29번은 지나가는 길을 막아 뺐다. 먼저 넣었던 DB 에서도 지운다. 앉은 기록이 있는 번호는 외래 키 때문에 남긴다(화면에 없으니 앉을 수 없음).
delete from public.seats s
using public.branches b
where s.branch_id = b.id
  and b.slug = 'stream'
  and s.seat_number in (23, 26, 27, 28, 29)
  and not exists (select 1 from public.seat_sessions ss where ss.seat_id = s.id);
