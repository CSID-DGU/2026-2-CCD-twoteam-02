// 나무껍질 그림과 굵기가 변하는 가지 도형 (등불 나무·벚나무가 같이 씀). three.js 만 쓰는 코드입니다.
import * as THREE from 'three'
import type { Limb } from './lanternShape'

const WRAPS = 2 // 둘레에 그림 반복 수
const TILE = 1.6 // 길이 방향 그림 한 장 크기(m)

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

// 나무껍질: 세로로 길게 갈라진 골과 밝은 등성이. 색(map)과 결(bumpMap)로 같이 씀
let barkTex: THREE.CanvasTexture | null = null
export function barkTexture() {
  if (barkTex) return barkTex
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const ctx = c.getContext('2d')!
  const rand = seeded(29)
  ctx.fillStyle = '#c6c0b8'
  ctx.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 620; i++) {
    const v = Math.round(60 + rand() * 190)
    ctx.strokeStyle = `rgb(${v},${v - 6},${v - 12})`
    ctx.lineWidth = 1 + rand() * 5
    const x = rand() * 512
    const y = rand() * 512
    const len = 40 + rand() * 170
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.bezierCurveTo(x + (rand() - 0.5) * 16, y + len / 3, x + (rand() - 0.5) * 16, y + (len * 2) / 3, x + (rand() - 0.5) * 10, y + len)
    ctx.stroke()
  }
  barkTex = new THREE.CanvasTexture(c)
  barkTex.colorSpace = THREE.SRGBColorSpace
  barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping
  barkTex.anisotropy = 4
  return barkTex
}
// 가지 하나를 굵기가 변하는 관으로. 줄기 밑동(ridge > 0)은 둘레를 울퉁불퉁하게 해 뿌리처럼 보임
export function limbTube(l: Limb, radial: number, ridge: number) {
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const n = l.pts.length
  const up = new THREE.Vector3(0, 1, 0)
  let along = 0
  for (let i = 0; i < n; i++) {
    const p = new THREE.Vector3(...l.pts[i])
    const a = new THREE.Vector3(...l.pts[Math.max(i - 1, 0)])
    const b = new THREE.Vector3(...l.pts[Math.min(i + 1, n - 1)])
    const tan = b.clone().sub(a).normalize()
    const side = new THREE.Vector3().crossVectors(tan, Math.abs(tan.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up).normalize()
    const front = new THREE.Vector3().crossVectors(side, tan).normalize()
    if (i > 0) along += p.distanceTo(a)
    const t = i / (n - 1)
    for (let k = 0; k <= radial; k++) {
      const th = (k / radial) * Math.PI * 2
      const bump = 1 + ridge * Math.pow(1 - t, 3) * (0.5 + 0.5 * Math.sin(th * 5 + 0.7))
      const d = side.clone().multiplyScalar(Math.cos(th)).add(front.clone().multiplyScalar(Math.sin(th)))
      const q = p.clone().add(d.clone().multiplyScalar(l.radii[i] * bump))
      pos.push(q.x, q.y, q.z)
      nor.push(d.x, d.y, d.z)
      uv.push((k / radial) * WRAPS, along / TILE)
    }
    if (i > 0) {
      for (let k = 0; k < radial; k++) {
        const a0 = (i - 1) * (radial + 1) + k
        const b0 = a0 + radial + 1
        idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

