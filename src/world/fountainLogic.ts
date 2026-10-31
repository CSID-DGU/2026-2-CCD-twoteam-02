// 캠리단길 3단 분수의 모양 값과 물방울 움직임. React 와 무관한 순수 로직입니다. (Node 로 검사)
//
// 모양 (분수 가운데 기준, m)
//   BASIN  바닥의 둥근 수반: 벽 높이, 테두리 굵기, 물 높이 (반지름은 world.json 의 fountain.r)
//   TIERS  위로 쌓은 접시 셋 (아래가 크고 위가 작음): 가장자리 반지름 r, 가장자리 높이 y, 깊이, 물이 가장자리보다 낮은 정도 lip
// 물줄기 (waterSheets)  접시마다 가장자리에서 바로 아래 물(아래 접시, 맨 아래는 수반)까지 떨어지는 물 막
// 물방울 (Drop)          접시 가장자리에서 바깥으로 튀어 나와 떨어지고, 아래 물에 닿으면 한 번 튀어 오른 뒤 다시 가장자리에서 태어남
export const BASIN = { h: 0.55, lip: 0.14, waterY: 0.47 }
export const TIERS = [
  { r: 1.45, y: 1.35, depth: 0.3, lip: 0.05 },
  { r: 0.95, y: 2.15, depth: 0.24, lip: 0.05 },
  { r: 0.55, y: 2.8, depth: 0.18, lip: 0.04 },
]
export const GRAVITY = 9.8 // m/s²
export const DROPS = 240 // 물방울 수 (점 하나씩, 한 번에 그림)
const OUT = { min: 0.25, max: 0.7 } // 가장자리에서 바깥으로 나가는 빠르기(m/s)
const UP_MAX = 0.35 // 처음 위로 뜨는 빠르기 최대(m/s)
const SPLASH = { up: 1.3, spread: 0.7, keep: 0.3 } // 물에 닿아 튈 때: 위로 빠르기, 옆으로 흩어짐, 남는 옆 빠르기 비율

// 이 접시에서 떨어진 물이 닿는 높이 (아래 접시의 물, 맨 아래 접시는 수반의 물)
export function landingY(tier: number) {
  return tier === 0 ? BASIN.waterY : TIERS[tier - 1].y - TIERS[tier - 1].lip
}

export type Sheet = { r: number; top: number; bottom: number }
export function waterSheets(): Sheet[] {
  return TIERS.map((t, i) => ({ r: t.r, top: t.y, bottom: landingY(i) }))
}

export type Drop = { x: number; y: number; z: number; vx: number; vy: number; vz: number; tier: number; bounced: boolean }
export const newDrop = (): Drop => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, tier: 0, bounced: false })

export function spawnDrop(d: Drop, rand: () => number) {
  d.tier = Math.min(TIERS.length - 1, Math.floor(rand() * TIERS.length))
  const t = TIERS[d.tier]
  const a = rand() * Math.PI * 2
  const out = OUT.min + rand() * (OUT.max - OUT.min)
  d.x = Math.cos(a) * t.r
  d.z = Math.sin(a) * t.r
  d.y = t.y
  d.vx = Math.cos(a) * out
  d.vz = Math.sin(a) * out
  d.vy = rand() * UP_MAX
  d.bounced = false
}

// dt 초만큼 움직입니다. 물에 처음 닿으면 'bounce', 튄 뒤 다시 닿으면 다시 태어나며 'respawn'
export function stepDrop(d: Drop, dt: number, rand: () => number): 'fall' | 'bounce' | 'respawn' {
  d.vy -= GRAVITY * dt
  d.x += d.vx * dt
  d.y += d.vy * dt
  d.z += d.vz * dt
  const floor = landingY(d.tier)
  if (d.y > floor) return 'fall'
  if (d.bounced) {
    spawnDrop(d, rand)
    return 'respawn'
  }
  d.y = floor
  d.vy = SPLASH.up * (0.4 + 0.6 * rand())
  d.vx = d.vx * SPLASH.keep + (rand() - 0.5) * SPLASH.spread
  d.vz = d.vz * SPLASH.keep + (rand() - 0.5) * SPLASH.spread
  d.bounced = true
  return 'bounce'
}

// 처음 물방울들. 모두 같은 때 태어나면 한꺼번에 떨어지므로 높이를 흩어 둡니다.
export function makeDrops(rand: () => number): Drop[] {
  return Array.from({ length: DROPS }, () => {
    const d = newDrop()
    spawnDrop(d, rand)
    const floor = landingY(d.tier)
    d.y = floor + rand() * (d.y - floor)
    return d
  })
}

export function writePositions(drops: Drop[], out: Float32Array) {
  drops.forEach((d, i) => {
    out[i * 3] = d.x
    out[i * 3 + 1] = d.y
    out[i * 3 + 2] = d.z
  })
}
