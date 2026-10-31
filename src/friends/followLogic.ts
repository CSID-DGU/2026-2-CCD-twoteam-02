// 친구 따라가기·친구 부르기. React·three.js 와 무관한 순수 로직입니다. (Node 로 검사)
//
//   따라가기  친구 목록·프로필 창의 [따라가기] → 친구가 있는 장소로 가서 친구 바로 옆에 섬 (친구 수락 없음, 친구에게 알림만)
//   부르기    [부르기] → 친구 채팅 로그에 [부름] 줄, 친구가 [가기]를 누르면 부른 사람 바로 옆에 섬 (1분 뒤 만료)
//
// 갈 장소는 사이트 전체 접속 상태(OnlineProvider)에 보이는 그 사람의 장소로 정합니다(메시지에 적힌 값을 믿지 않음).
// 회의실 안·일반 화면(내 기록 등)에 있으면 갈 수 없습니다.

export const BESIDE = { near: 1.2, far: 2, ring: 12 } // 옆에 설 거리(m)와 둘레를 몇 방향으로 살필지
export const BODY_R = 0.3 // 캐릭터 충돌 반경 (Player 와 같음)
export const ARRIVE_WAIT_MS = 3000 // 도착한 장소에서 친구 위치를 기다리는 시간. 넘으면 그 장소 입구에 섬
export const SUMMON_MS = 60 * 1000 // [부름] 줄이 유효한 시간. 지나면 "지난 부름" (오래된 부름으로 계속 따라가지 않게)

type Box = { x: number; z: number; w: number; d: number }
export type Places = { lobby: string; campus: string; campusPath: string; isBranch: (place: string) => boolean }

// 접속 상태의 장소 → 갈 주소. 갈 수 없는 곳(회의실·일반 화면)이면 null
export function routeOfPlace(place: string | undefined, p: Places): string | null {
  if (!place) return null
  if (place === p.lobby) return '/'
  if (place === p.campus) return p.campusPath
  if (p.isBranch(place)) return `/space?branch=${encodeURIComponent(place)}`
  return null
}

const hits = (x: number, z: number, o: Box) => Math.abs(x - o.x) < o.w / 2 + BODY_R && Math.abs(z - o.z) < o.d / 2 + BODY_R

// 친구(target) 둘레에서 장애물과 겹치지 않고 공간(가운데 0,0, 크기 bounds) 안인 첫 자리. 가까운 거리부터,
// 내가 오는 쪽(prefer 방향, 라디안. 없으면 친구 앞쪽 남쪽 +Z)부터 돌아가며 찾습니다. 다 막혔으면 null(입구에 섬)
export function besideSpot(
  target: { x: number; z: number },
  obstacles: Box[],
  bounds: { w: number; d: number },
  prefer = 0,
): { x: number; z: number; heading: number } | null {
  const inside = (x: number, z: number) => Math.abs(x) <= bounds.w / 2 - BODY_R && Math.abs(z) <= bounds.d / 2 - BODY_R
  for (const r of [BESIDE.near, BESIDE.far]) {
    for (let k = 0; k < BESIDE.ring; k++) {
      // prefer 에서 시작해 양옆으로 번갈아 (0, +1, −1, +2, −2 …)
      const step = Math.ceil(k / 2) * (k % 2 ? 1 : -1)
      const a = prefer + (step * 2 * Math.PI) / BESIDE.ring
      const x = target.x + Math.sin(a) * r
      const z = target.z + Math.cos(a) * r
      if (!inside(x, z) || obstacles.some((o) => hits(x, z, o))) continue
      // 친구를 바라보게 (Player 방향 0 = +Z)
      return { x, z, heading: Math.atan2(target.x - x, target.z - z) }
    }
  }
  return null
}

// [부름] 줄이 아직 유효한지
export const summonAlive = (at: number, now: number) => now - at < SUMMON_MS
