// 캠퍼스 굽은 산책로·축구장 모양 (three.js 도형만, 화면 부품과 나눔)
//
//   walkGeometry  점을 이은 길: 마디마다 길쭉한 판 + 꺾이는 곳마다 둥근 판 (이음매가 둥글게)
//   pitchLines    축구장 흰 선: 테두리, 하프라인, 센터서클, 센터 점, 페널티 박스, 골 에어리어 (땅에 붙인 얇은 판)
//   netTexture    골망 그물 무늬 (투명한 바탕에 흰 격자)
//   ballTexture   축구공 무늬 (흰 바탕에 검은 오각형 점)
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Pitch } from './ballLogic'
import type { Walk } from './worldLogic'
import { TILE } from './worldTextures'

// 땅에 눕힌 판들(위치·크기·각)을 하나로 합침
function flat(parts: THREE.BufferGeometry[]) {
  const ready = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k)
    return n
  })
  return mergeGeometries(ready) ?? new THREE.BufferGeometry()
}

export function walkGeometry(walk: Walk) {
  const parts: THREE.BufferGeometry[] = []
  const pts = walk.points
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i]
    const disc = new THREE.CircleGeometry(walk.w / 2, 20)
    disc.rotateX(-Math.PI / 2)
    disc.translate(x, 0, z)
    parts.push(disc)
    if (i === 0) continue
    const [px, pz] = pts[i - 1]
    const len = Math.hypot(x - px, z - pz)
    const seg = new THREE.PlaneGeometry(walk.w, len)
    seg.rotateX(-Math.PI / 2)
    seg.rotateY(Math.atan2(x - px, z - pz))
    seg.translate((x + px) / 2, 0, (z + pz) / 2)
    parts.push(seg)
  }
  const g = flat(parts)
  // 판마다 0~1 이던 UV 를 월드 자리(m ÷ 반복 크기)로: 콘크리트 판 무늬가 길 전체에 이어지게
  const pos = g.attributes.position as THREE.BufferAttribute
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / TILE.concrete
    uv[i * 2 + 1] = pos.getZ(i) / TILE.concrete
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

export const LINE_W = 0.1 // 흰 선 굵기(m)
// 축구장 크기 비율 (실제 축구장을 이 크기로 줄인 값): 페널티 박스·골 에어리어 폭과 깊이, 센터서클 반지름
const AREA = { penaltyW: 0.6, penaltyD: 0.16, goalW: 0.34, goalD: 0.06, circle: 0.16 }

export function pitchLines(p: Pitch) {
  const parts: THREE.BufferGeometry[] = []
  const bar = (cx: number, cz: number, w: number, d: number) => {
    const g = new THREE.PlaneGeometry(w, d)
    g.rotateX(-Math.PI / 2)
    g.translate(p.x + cx, 0, p.z + cz)
    parts.push(g)
  }
  const box = (cz: number, w: number, d: number) => {
    // 골라인에 붙은 네모 (세 변)
    const s = Math.sign(cz)
    const inner = cz - s * d
    bar(-w / 2, cz - (s * d) / 2, LINE_W, d)
    bar(w / 2, cz - (s * d) / 2, LINE_W, d)
    bar(0, inner, w + LINE_W, LINE_W)
  }
  bar(0, -p.d / 2, p.w + LINE_W, LINE_W)
  bar(0, p.d / 2, p.w + LINE_W, LINE_W)
  bar(-p.w / 2, 0, LINE_W, p.d)
  bar(p.w / 2, 0, LINE_W, p.d)
  bar(0, 0, p.w, LINE_W)
  for (const s of [-1, 1]) {
    box((s * p.d) / 2, p.w * AREA.penaltyW, p.d * AREA.penaltyD)
    box((s * p.d) / 2, p.w * AREA.goalW, p.d * AREA.goalD)
  }
  const r = p.d * AREA.circle
  const ring = new THREE.RingGeometry(r - LINE_W / 2, r + LINE_W / 2, 48)
  ring.rotateX(-Math.PI / 2)
  ring.translate(p.x, 0, p.z)
  parts.push(ring)
  const spot = new THREE.CircleGeometry(0.12, 16)
  spot.rotateX(-Math.PI / 2)
  spot.translate(p.x, 0, p.z)
  parts.push(spot)
  return flat(parts)
}

const canvasTex = (w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat = false) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

let net: THREE.CanvasTexture | null = null
export function netTexture() {
  net ??= canvasTex(64, 64, (ctx) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 3
    ctx.strokeRect(0, 0, 64, 64)
  }, true)
  return net
}

let ball: THREE.CanvasTexture | null = null
export function ballTexture() {
  ball ??= canvasTex(256, 128, (ctx) => {
    ctx.fillStyle = '#f7f7f2'
    ctx.fillRect(0, 0, 256, 128)
    ctx.fillStyle = '#1d1d1d'
    const spots = [[32, 30], [96, 30], [160, 30], [224, 30], [0, 96], [64, 96], [128, 96], [192, 96], [256, 96], [64, 0], [192, 0], [128, 128]]
    for (const [x, y] of spots) {
      ctx.beginPath()
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 - Math.PI / 2
        ctx.lineTo(x + Math.cos(a) * 15, y + Math.sin(a) * 13)
      }
      ctx.fill()
    }
  })
  return ball
}
