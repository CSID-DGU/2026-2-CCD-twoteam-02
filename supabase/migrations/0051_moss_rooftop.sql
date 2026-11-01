-- 두뜀 0051: 이끼 루프탑 (이끼 정원 건물 지붕 위 루프탑 카페, 20석)
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
--
-- 배경:
--   캠리단길 이끼 정원(slug moss) 건물 지붕 위에 루프탑 카페를 얹는다. 이끼 정원 안 계단으로 올라간다(지점 JSON 의 stairs).
--   천장 없이 낮은 난간을 두르고 바깥 거리·하늘·먼 도시가 그대로 보인다. 화면은 src/space/branches/moss-rooftop.json.
--   이끼 정원처럼 카페 종류(kind 'cafe')라 앉으면 그 자리가 내 자리가 된다. 회의실은 없다.
--   자리: 앞 난간 전망 바 1~6, 퍼걸러 아래 바 카운터 7~10, 캔들 테이블 11~20.
--   좌표는 JSON 과 같다. 화면은 JSON 에서 읽으므로 여기 값은 참고용이다(0002 와 같은 원칙).
--
-- 다시 실행하기: 지점은 slug 로 찾고(없으면 만듦), 좌석은 (지점, 번호)가 이미 있으면 좌표만 같은 값으로 다시 쓴다. 몇 번 실행해도 된다.
-- 예전 23석 배치로 실행한 DB 에 다시 실행하면 1~20번 좌표를 새 배치로 바꾸고 21~23번을 지운다.

begin;

insert into public.branches (name, slug, kind)
values ('이끼 루프탑', 'moss-rooftop', 'cafe')
on conflict (slug) do nothing;

insert into public.seats (branch_id, seat_number, pos_x, pos_z, rot)
select b.id, v.seat_number, v.pos_x, v.pos_z, v.rot
from public.branches b
cross join (values
  (1, -2.4, 3.55, 0),
  (2, -1.2, 3.55, 0),
  (3, 0, 3.55, 0),
  (4, 1.2, 3.55, 0),
  (5, 2.4, 3.55, 0),
  (6, 3.6, 3.55, 0),
  (7, 4.15, -2.85, 1.571),
  (8, 4.15, -1.9, 1.571),
  (9, 4.15, -0.95, 1.571),
  (10, 4.15, 0.0, 1.571),
  (11, -2.3, -2.5, 0),
  (12, -2.3, -2.5, 3.142),
  (13, -0.2, -2.5, 0),
  (14, -0.2, -2.5, 3.142),
  (15, -2.3, 0.5, 0),
  (16, -2.3, 0.5, 3.142),
  (17, -0.2, 0.5, 0),
  (18, -0.2, 0.5, 3.142),
  (19, 1.9, 0.5, 0),
  (20, 1.9, 0.5, 3.142)
) as v(seat_number, pos_x, pos_z, rot)
where b.slug = 'moss-rooftop'
on conflict (branch_id, seat_number) do update
  set pos_x = excluded.pos_x, pos_z = excluded.pos_z, rot = excluded.rot;

-- 처음 배치(23석, 소파 라운지 포함)로 이미 실행한 DB 정리: 지금 배치에 없는 21~23번을 지운다.
-- 앉은 기록(seat_sessions)이 있는 자리는 외래 키 때문에 지울 수 없으므로 건너뛴다(화면에 없어 아무도 앉을 수 없음).
delete from public.seats s
using public.branches b
where s.branch_id = b.id and b.slug = 'moss-rooftop' and s.seat_number > 20
  and not exists (select 1 from public.seat_sessions ss where ss.seat_id = s.id);

commit;
