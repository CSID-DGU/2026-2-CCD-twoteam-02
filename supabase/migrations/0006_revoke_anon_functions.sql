-- 두뜀 0006: 점유 현황 함수를 비로그인(anon)에게서 거둠 (2주차, 백엔드·DB 육심호)
-- 실행 위치: Supabase 대시보드 > SQL Editor
--
-- 배경:
--   0004에서 `revoke execute ... from public` 으로 함수를 잠갔다고 생각했으나,
--   실제 Supabase에 적용한 뒤 확인해 보니 로그인하지 않은 상태에서도 함수가 실행됐다.
--
--   원인: Supabase는 public 스키마의 함수 실행 권한을 anon·authenticated 에게
--   기본으로 부여한다(alter default privileges ... grant execute on functions).
--   PUBLIC 에서 거두는 것은 "모두에게 열린 기본 권한"만 없앨 뿐,
--   anon 에게 따로 부여된 권한은 그대로 남는다. 그래서 anon 을 명시해 거둬야 한다.
--
--   영향: 지금은 이용 중인 좌석이 없어 빈 결과만 나왔지만, 운영 중이었다면
--   로그인하지 않은 사람이 어느 좌석이 찼는지 조회할 수 있었다.
--   (좌석 번호와 인원 수뿐이라 개인 정보가 새지는 않는다)

begin;

revoke execute on function public.occupied_seat_numbers(bigint) from anon;
revoke execute on function public.room_occupancy(bigint) from anon;

-- 앞으로 public 스키마에 만드는 함수도 anon 에게 자동으로 열리지 않게 한다.
-- 이미 만들어진 함수에는 영향이 없으므로 위에서 따로 거뒀다.
alter default privileges in schema public revoke execute on functions from anon;

commit;
