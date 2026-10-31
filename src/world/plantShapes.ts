// 캠리단길 풀·꽃 모양 (코드로 만든 입체, 외부 모델 없음). 종류마다 하나씩 만들어 InstancedMesh 로 여러 번 그립니다.
//
// 색은 꼭짓점 색(vertex color)으로 칠합니다.
//   초록만 있는 것(풀 포기·관목·고사리): 뿌리 쪽 어둡고 끝 쪽 밝은 회색 → 재질 색(초록)이 색조를 입힘 (눈 오면 하얘짐)
//   꽃이 있는 것(장미·라벤더·들꽃): 잎·꽃 색을 꼭짓점에 그대로, 재질 색은 흰색
// 높이 y 는 0(뿌리)부터 위로. 바람 흔들림은 y 가 클수록 커짐 (worldMaterials.swayMaterial)
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

type RGB = [number, number, number]
const hex = (h: string): RGB => {
  const c = new THREE.Color(h)
  return [c.r, c.g, c.b]
}

// 꼭짓점 색을 높이에 따라 low → high 로 칠함
function paintByHeight(g: THREE.BufferGeometry, low: RGB, high: RGB, top?: number) {
  const pos = g.attributes.position as THREE.BufferAttribute
  g.computeBoundingBox()
  const y0 = g.boundingBox!.min.y
  const y1 = top ?? g.boundingBox!.max.y
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const k = Math.min(1, Math.max(0, (pos.getY(i) - y0) / Math.max(1e-6, y1 - y0)))
    for (let c = 0; c < 3; c++) col[i * 3 + c] = low[c] + (high[c] - low[c]) * k
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}
const paint = (g: THREE.BufferGeometry, rgb: RGB) => paintByHeight(g, rgb, rgb)

// 여러 모양을 하나로 합침. 모양마다 가진 값(uv·번호 목록)이 달라 합치기 전에 맞춤 (위치·법선·색만 남김)
function merge(list: THREE.BufferGeometry[]) {
  const ready = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g
    if (!n.attributes.normal) n.computeVertexNormals()
    for (const name of Object.keys(n.attributes)) if (!['position', 'normal', 'color'].includes(name)) n.deleteAttribute(name)
    return n
  })
  const out = mergeGeometries(ready)
  if (!out) throw new Error('풀 모양을 합치지 못했습니다')
  return out
}

// 풀잎 하나: 아래가 넓고 끝이 뾰족한 얇은 판, lean 만큼 바깥으로 휨
function blade(h: number, w: number, lean: number, angle: number) {
  const g = new THREE.BufferGeometry()
  const v = [-w / 2, 0, 0, w / 2, 0, 0, w * 0.25, h * 0.55, lean * 0.4, -w * 0.25, h * 0.55, lean * 0.4, 0, h, lean]
  const idx = [0, 1, 2, 0, 2, 3, 3, 2, 4]
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  g.setIndex(idx)
  g.rotateY(angle)
  g.computeVertexNormals()
  return g
}

const GRAY = { dark: [0.45, 0.45, 0.45] as RGB, light: [1, 1, 1] as RGB }

// 풀 포기: 잎 다섯 장이 사방으로
export function tuftShape() {
  const blades = [0, 1, 2, 3, 4].map((i) => blade(0.32 + (i % 3) * 0.07, 0.06, 0.08 + (i % 2) * 0.05, (i / 5) * Math.PI * 2 + i * 0.3))
  return paintByHeight(merge(blades), GRAY.dark, GRAY.light)
}

// 관목: 둥근 잎 덩어리 셋을 겹침
export function bushShape() {
  const parts = [
    [0, 0.36, 0, 0.42],
    [0.22, 0.27, 0.1, 0.3],
    [-0.18, 0.28, -0.12, 0.32],
  ].map(([x, y, z, r]) => {
    const g = new THREE.IcosahedronGeometry(r, 1)
    g.scale(1, 0.85, 1)
    g.translate(x, y, z)
    return g
  })
  return paintByHeight(merge(parts), [0.5, 0.5, 0.5], [1, 1, 1])
}

// 장미 덤불: 초록 잎 덩어리 + 분홍 꽃송이 다섯
export function roseShape() {
  const leaf = paint(new THREE.IcosahedronGeometry(0.34, 1).scale(1, 0.9, 1).translate(0, 0.38, 0), hex('#7cc254'))
  const flowers = [
    [0.18, 0.62, 0.1], [-0.2, 0.58, 0.05], [0.02, 0.7, -0.18], [0.12, 0.5, -0.24], [-0.1, 0.5, 0.26],
  ].map(([x, y, z], i) => paint(new THREE.IcosahedronGeometry(0.08 + (i % 2) * 0.02, 0).translate(x, y, z), hex(i % 3 ? '#f4a3c0' : '#ee7fa6')))
  return merge([leaf, ...flowers])
}

// 라벤더: 가는 줄기 일곱 + 끝에 보라 꽃이삭
export function lavenderShape() {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    const lean = 0.08 + (i % 3) * 0.04
    const h = 0.45 + (i % 4) * 0.06
    const x = Math.cos(a) * lean
    const z = Math.sin(a) * lean
    const stem = new THREE.CylinderGeometry(0.008, 0.012, h, 4).translate(0, h / 2, 0)
    stem.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, x / h, 0, z / h, 0)) // 바깥으로 기울임
    parts.push(paint(stem, hex('#9cc76a')))
    parts.push(paint(new THREE.ConeGeometry(0.03, 0.16, 5).rotateX(Math.PI).translate(x, h + 0.06, z), hex(i % 2 ? '#8e74c9' : '#a38ad8')))
  }
  return merge(parts)
}

// 고사리: 바깥으로 휘어 늘어진 잎 일곱 장
export function fernShape() {
  const fronds = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const g = blade(0.5 + (i % 3) * 0.08, 0.16, 0.32, (i / 7) * Math.PI * 2)
    return g
  })
  return paintByHeight(merge(fronds), [0.4, 0.45, 0.4], [1, 1, 1])
}

// 들꽃(데이지): 가는 줄기 다섯 + 흰 꽃잎 판 + 노란 가운데
export function daisyShape() {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + i
    const r = 0.05 + (i % 2) * 0.06
    const h = 0.22 + (i % 3) * 0.06
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    parts.push(paint(new THREE.CylinderGeometry(0.006, 0.008, h, 4).translate(x, h / 2, z), hex('#8cc65c')))
    parts.push(paint(new THREE.CircleGeometry(0.045, 8).rotateX(-Math.PI / 2).translate(x, h, z), hex(i % 4 ? '#fbfaf3' : '#f6e27a')))
    parts.push(paint(new THREE.CircleGeometry(0.015, 6).rotateX(-Math.PI / 2).translate(x, h + 0.003, z), hex('#f2c230')))
  }
  // 아래 잎 몇 장
  for (let i = 0; i < 3; i++) parts.push(paint(blade(0.14, 0.05, 0.06, (i / 3) * Math.PI * 2), hex('#86c256')))
  return merge(parts)
}

// 활엽수 잎 덩어리 (참고: 정원 카페의 풍성한 나무). 둥근 덩어리 여러 개를 겹쳐 뭉게뭉게, 아래쪽은 그늘져 어둡게.
// variant 마다 덩어리 배치가 달라 나무끼리 똑같아 보이지 않음. 높이 0 = 잎 덩어리 아래 끝 (줄기 위에 얹음)
export const CANOPY_VARIANTS = 3
export function canopyShape(variant: number) {
  let s = (variant + 1) * 9301
  const r = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  const blobs: THREE.BufferGeometry[] = [new THREE.IcosahedronGeometry(1.35, 1).translate(0, 1.3, 0)]
  const n = 6 + variant
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.6
    const d = 0.8 + r() * 0.5
    const rad = 0.75 + r() * 0.45
    blobs.push(new THREE.IcosahedronGeometry(rad, 1).translate(Math.cos(a) * d, 0.8 + r() * 1.1, Math.sin(a) * d))
  }
  blobs.push(new THREE.IcosahedronGeometry(0.9, 1).translate(r() * 0.4 - 0.2, 2.3, r() * 0.4 - 0.2))
  return paintByHeight(merge(blobs), [0.42, 0.45, 0.4], [1, 1, 0.95])
}

// 줄기: 아래가 굵고 위로 가늘어지는 기둥 + 위쪽에서 갈라지는 가지 둘
export function trunkShape(h: number) {
  const parts = [
    new THREE.CylinderGeometry(0.13, 0.22, h, 8).translate(0, h / 2, 0),
    new THREE.CylinderGeometry(0.05, 0.09, 1.1, 6).rotateZ(0.7).translate(0.35, h - 0.1, 0),
    new THREE.CylinderGeometry(0.05, 0.09, 1.0, 6).rotateZ(-0.6).rotateY(1.9).translate(-0.2, h - 0.2, 0.25),
  ]
  return paintByHeight(merge(parts), [0.75, 0.75, 0.75], [1, 1, 1])
}
