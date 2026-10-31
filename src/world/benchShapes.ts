// 캠리단길 정원 벤치 모양 (참고: 공원 벤치). 크기는 지금 벤치와 같음 (worldLogic 의 BENCH 1.6×0.6, 앉는 높이 0.45)
//
//   나무   앉는 살 다섯 + 뒤로 기운 등받이 살 셋
//   주철   양옆 틀: 앞다리, 등받이까지 이어진 뒷다리, 앉는 판 받침, 팔걸이와 앞쪽 소용돌이 장식
// 벤치 기준 좌표: 앉은 사람이 +z 를 봄, 등받이는 -z 쪽. 나무·주철은 재질이 달라 모양을 따로 만듭니다.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BENCH } from './worldLogic'

const SEAT_Y = 0.45
const SLAT = { seat: 5, back: 3, t: 0.035, gap: 0.025 }
const LEAN = 0.28 // 등받이가 뒤로 기운 각도(라디안)
const SIDE_X = BENCH.w / 2 - 0.08 // 옆틀 자리

function merge(list: THREE.BufferGeometry[]) {
  const ready = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g
    for (const name of Object.keys(n.attributes)) if (!['position', 'normal'].includes(name)) n.deleteAttribute(name)
    return n
  })
  const out = mergeGeometries(ready)
  if (!out) throw new Error('벤치 모양을 합치지 못했습니다')
  return out
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)

export function benchWoodShape() {
  const parts: THREE.BufferGeometry[] = []
  const depth = BENCH.d - 0.06
  const slatD = (depth - SLAT.gap * (SLAT.seat - 1)) / SLAT.seat
  for (let i = 0; i < SLAT.seat; i++) {
    const z = -depth / 2 + slatD / 2 + i * (slatD + SLAT.gap)
    parts.push(box(BENCH.w, SLAT.t, slatD).translate(0, SEAT_Y, z))
  }
  const backH = 0.11
  for (let i = 0; i < SLAT.back; i++) {
    const y = 0.12 + i * (backH + SLAT.gap) // 등받이 판 안에서 높이
    const g = box(BENCH.w - 0.04, backH, SLAT.t).translate(0, y, 0)
    g.rotateX(-LEAN)
    g.translate(0, SEAT_Y, -BENCH.d / 2 + 0.04)
    parts.push(g)
  }
  return merge(parts)
}

export function benchIronShape() {
  const parts: THREE.BufferGeometry[] = []
  for (const sx of [-SIDE_X, SIDE_X]) {
    const front = BENCH.d / 2 - 0.06
    const back = -BENCH.d / 2 + 0.05
    parts.push(box(0.05, SEAT_Y, 0.05).translate(sx, SEAT_Y / 2, front)) // 앞다리
    // 뒷다리 + 등받이 기둥 (땅에서 등받이 위까지, 뒤로 기움)
    const post = box(0.05, 0.95, 0.05).translate(0, 0.475, 0)
    post.rotateX(-LEAN * 0.6)
    post.translate(sx, 0, back)
    parts.push(post)
    parts.push(box(0.05, 0.05, BENCH.d - 0.04).translate(sx, SEAT_Y - 0.04, 0)) // 앉는 판 받침
    parts.push(box(0.05, 0.04, BENCH.d * 0.8).translate(sx, SEAT_Y + 0.22, -0.02)) // 팔걸이
    parts.push(box(0.04, 0.22, 0.04).translate(sx, SEAT_Y + 0.11, front - 0.02)) // 팔걸이 앞 받침
    const scroll = new THREE.TorusGeometry(0.045, 0.012, 6, 12).rotateY(Math.PI / 2).translate(sx, SEAT_Y + 0.22, front + 0.03) // 소용돌이 장식
    parts.push(scroll)
    parts.push(box(0.04, 0.04, BENCH.d - 0.1).translate(sx, 0.12, 0)) // 다리 사이 가로대
  }
  return merge(parts)
}
