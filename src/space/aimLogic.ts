// 조준점으로 고르기 (#354). React·three 와 무관한 순수 로직입니다. (Node 로 검사)
//
// 1인칭에서 마우스가 잠겨 있으면 화면 가운데(조준점)가 가리키는 사람·별자리를 E 로 엽니다.
// 캐릭터 모델에 직접 광선을 쏘면(뼈대로 움직이는 모델이라) 무거우므로, 사람을 세워 둔 원기둥으로 단순화해 맞혀 봅니다.
//
//   원기둥  발 높이(y0)부터 키(height)만큼, 반지름 BODY.radius. 서 있으면 BODY.standing, 앉아 있으면 BODY.seated
//   거리    AIM_RANGE 안에서 맞은 사람만. 멀리 지나가는 사람까지 잡히지 않게
//   여럿    가장 가까이 맞은 사람
//
// 벽에 가려졌는지는 화면 쪽(OtherParticipants)에서 장면에 광선을 쏴서 확인합니다(높이가 있는 실제 벽·건물).

export const AIM_RANGE = 8 // 이 거리(m) 안의 사람만 조준됨
export const BODY = { radius: 0.35, standing: 1.65, seated: 1.25 } // 캐릭터를 대신하는 원기둥 (모델 키 약 1.6m)
export const AIM_HZ = 10 // 조준 대상을 초당 이만큼 다시 확인

// E 를 눌렀을 때 조준한 사람·별자리를 열지 (#408). 지금 서 있는 자리에서 할 수 있는 일(문·계단·키오스크·빈자리 등)이 있으면
// 그 일이 먼저이고, 없을 때만 조준한 것을 엽니다. 조준이 먼저였을 때는 문 앞에 누가 서 있으면 문 대신 그 사람 프로필이 열려
// 남이 길을 막을 수 있었습니다. 화면 아래 안내도 같은 순서로 보여 줍니다(누르면 일어날 일 = 안내 문구).
export const aimWins = (placeReady: boolean, aimed: boolean) => aimed && !placeReady

// 조준점이 가리키는 것. 화면 아래 안내와 E 키가 씁니다.
export type AimTarget = { kind: 'person'; id: string; name: string } | { kind: 'sign'; id: string; name: string }

export type Vec3 = { x: number; y: number; z: number }
export type AimPerson = { id: string; name: string; x: number; z: number; y0: number; height: number }

// 같은 대상인지 (바뀔 때만 안내를 다시 그리려고)
export function sameTarget(a: AimTarget | null, b: AimTarget | null): boolean {
  if (a === null || b === null) return a === b
  return a.kind === b.kind && a.id === b.id
}

// origin 에서 dir(길이 1) 방향 광선이 사람 원기둥에 처음 닿는 거리. 안 닿으면 null
export function rayHitsBody(origin: Vec3, dir: Vec3, p: AimPerson, radius = BODY.radius): number | null {
  // 바닥 평면(xz)에서 원과 만나는 구간 [t0, t1]
  const ox = origin.x - p.x
  const oz = origin.z - p.z
  const a = dir.x * dir.x + dir.z * dir.z
  const c = ox * ox + oz * oz - radius * radius
  let t0: number
  let t1: number
  if (a < 1e-9) {
    // 바로 위·아래를 보는 중: 원 안에 있으면 모든 거리, 아니면 안 닿음
    if (c > 0) return null
    t0 = -Infinity
    t1 = Infinity
  } else {
    const b = 2 * (ox * dir.x + oz * dir.z)
    const disc = b * b - 4 * a * c
    if (disc < 0) return null
    const s = Math.sqrt(disc)
    t0 = (-b - s) / (2 * a)
    t1 = (-b + s) / (2 * a)
  }
  // 높이가 원기둥 안(y0 ~ y0+height)인 구간
  let lo = t0
  let hi = t1
  if (Math.abs(dir.y) < 1e-9) {
    if (origin.y < p.y0 || origin.y > p.y0 + p.height) return null
  } else {
    const ta = (p.y0 - origin.y) / dir.y
    const tb = (p.y0 + p.height - origin.y) / dir.y
    lo = Math.max(lo, Math.min(ta, tb))
    hi = Math.min(hi, Math.max(ta, tb))
  }
  if (lo > hi || hi < 0) return null
  return Math.max(lo, 0)
}

// 조준점에 가장 가까이 맞은 사람과 그 거리. range 안에 아무도 없으면 null
export function pickAimPerson(origin: Vec3, dir: Vec3, people: AimPerson[], range = AIM_RANGE): { person: AimPerson; dist: number } | null {
  let best: { person: AimPerson; dist: number } | null = null
  for (const p of people) {
    const d = rayHitsBody(origin, dir, p)
    if (d === null || d > range) continue
    if (!best || d < best.dist) best = { person: p, dist: d }
  }
  return best
}
