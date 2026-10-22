-- 두뜀 0020: 사용자 실험용 지점 room B, room C (#198, #199)
-- 실행 위치: Supabase 대시보드 > SQL Editor
--
-- 배경:
--   사용자 실험(docs/사용자-실험-재설계.md)은 조건마다 지점을 하나씩 둔다.
--     room A: 화상회의 화면 (3D 공간이 아니라 좌석이 없음 → DB에 넣지 않음)
--     room B: 혼자 공부. 다른 참여자·표시등·접속 인원 수를 숨긴다
--     room C: 아바타. 팀원 2명의 기록을 재생한 캐릭터가 옆자리에 있다
--   B와 C는 "함께 있는 사람"만 달라야 하므로 배치가 같다. 지금은 솔카페 배치를 그대로 복사한다.
--   좌표의 원본은 experiment 브랜치의 src/space/branches/ 지점 JSON 이다.
--
-- 지점 종류는 cafe(빈자리에 앉으면 내 자리, 0014)로 둔다. 실험에서는 키오스크를 쓰지 않는다.
--
-- 실행할 곳: **실험 전용 Supabase 프로젝트에서만** 실행한다(2026-10-22 결정).
--   experiment 브랜치에만 있는 파일이다. develop 이 쓰는 서비스 프로젝트에서는 실행하지 않는다.
--   실험 프로젝트에는 0001~0018 을 먼저 순서대로 실행한 뒤 이 파일을 실행한다.
--   (0019 귓속말은 develop 에만 있고 실험에서는 쓰지 않는다. 그래서 이 파일은 0020 이다)

begin;

insert into public.branches (name, slug, kind) values
  ('room B', 'room-b', 'cafe'),
  ('room C', 'room-c', 'cafe');

-- 좌석 20석: 솔카페와 같은 자리
insert into public.seats (branch_id, seat_number, pos_x, pos_z, rot)
select room.id, s.seat_number, s.pos_x, s.pos_z, s.rot
from public.seats s
join public.branches sol on sol.id = s.branch_id and sol.slug = 'sol'
cross join public.branches room
where room.slug in ('room-b', 'room-c');

-- 회의실 3개: 솔카페와 같은 자리 (실험에서는 쓰지 않지만 배치를 똑같이 둔다)
insert into public.rooms (branch_id, room_number, capacity, pos_x, pos_z, width, depth)
select room.id, r.room_number, r.capacity, r.pos_x, r.pos_z, r.width, r.depth
from public.rooms r
join public.branches sol on sol.id = r.branch_id and sol.slug = 'sol'
cross join public.branches room
where room.slug in ('room-b', 'room-c');

commit;
