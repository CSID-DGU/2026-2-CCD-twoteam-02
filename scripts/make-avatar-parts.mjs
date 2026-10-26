#!/usr/bin/env node
// 캐릭터 꾸미기 기본 부품과 안내 그림 만들기 (#56)
//
// 캐릭터는 3D 모델 하나(character-a.glb)에 스킨 그림(1024×1024) 한 장을 입힌다. 스킨은 화면이 겹겹이 만든다.
//   맨몸(고른 피부색) → 눈 → 입 → 눈썹 → 머리카락 → 하의 → 신발 → 상의
// 이 스크립트가 만드는 것
//   src/avatar/uvFaces.json            : 모델의 부위(메시)별 면 자리(UV, 픽셀)와 방향. 화면이 맨몸을 칠하고 썸네일을 자를 때 씀
//   public/models/Parts/부위/이름*.png  : 코드로 그린 간단한 기본 부품 (팀이 그린 부품으로 바꾸거나 더하면 됨)
//       이름-tint.png   : 고른 색을 입힐 부분. 흰색·회색으로 그림 (회색이 어두울수록 고른 색도 어둡게)
//       이름.png        : 색이 고정인 부분 (눈동자, 신발 밑창 등)
//       이름-closed.png : 눈 감은 그림 (눈 부품만)
//   눈은 김현이 그린 그림을 도형으로 다시 그린 것이다(EYE_SHAPES). 그 밖의 기본 부품은 시험용으로 단순하게 칠한 것
//   public/models/Parts/templates/부위.png : 새 부품을 그릴 때 쓰는 안내 그림 (면마다 색이 다름, README 참고)
//   src/avatar/parts.json              : 부품 목록. 기본 부품 줄은 새로 쓰고, 팀이 직접 추가한 줄은 그대로 둔다
//
// 쓰는 법: node scripts/make-avatar-parts.mjs
// 새 라이브러리 없이 Node 기본 기능(zlib)으로 PNG 를 쓴다. 모델 읽기는 이미 쓰는 three 의 GLTFLoader.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public/models/Parts')
const LIST = path.join(ROOT, 'src/avatar/parts.json')
const FACES = path.join(ROOT, 'src/avatar/uvFaces.json')
const SIZE = 1024 // 스킨 그림 한 변
const PAD = 2 // 면 가장자리에 닿는 칠은 이만큼 더 칠한다. 화면이 그림을 읽을 때 경계가 비어 보이지 않게
const FACE_UNITS = 8 // 머리 앞면(얼굴)을 8×8 칸으로 보고 눈·입 자리를 정한다

// 면 방향별 밝기(회색). 색을 입히면 면마다 조금씩 어두워져 입체감이 생긴다. 맨몸도 같은 값(avatarLogic.SHADE)
const SHADE = { top: 255, front: 245, left: 228, right: 228, back: 215, bottom: 200 }
// 안내 그림의 면 색
const FACE_COLORS = {
  front: [239, 68, 68], // 앞 (빨강)
  back: [59, 130, 246], // 뒤 (파랑)
  left: [34, 197, 94], // 캐릭터의 왼쪽 (초록)
  right: [234, 179, 8], // 캐릭터의 오른쪽 (노랑)
  top: [168, 85, 247], // 위 (보라)
  bottom: [107, 114, 128], // 아래 (회색)
}
const SIDES = ['front', 'back', 'left', 'right'] // 위아래가 있는 옆면들 (줄 번호가 작은 쪽이 몸의 위)

// ── PNG 쓰기 (RGBA) ──────────────────────────────────────────────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function writePng(file, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0)
  ihdr.writeUInt32BE(SIZE, 4)
  ihdr[8] = 8 // 비트
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
  for (let y = 0; y < SIZE; y++) rgba.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4) // 줄마다 필터 0
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, png)
}

// ── 모델에서 면 자리 읽기 ─────────────────────────────────────────
// 메시마다 면(사각형)의 UV 범위(픽셀)와 면이 보는 방향. UV 는 1 을 넘거나 0 보다 작을 수 있어(그림을 반복해 붙임) 정수 부분을 뺀다.
// glTF 의 UV 는 위쪽이 0 이라 그대로 픽셀 줄 번호가 된다. 18종 모두 모양과 UV 가 같다(10/18 확인).
async function readFaces() {
  globalThis.self ??= globalThis // GLTFLoader 가 브라우저 전역을 찾음
  const buf = fs.readFileSync(path.join(ROOT, 'public/models/character-a.glb'))
  const gltf = await new Promise((resolve, reject) =>
    new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', resolve, reject),
  )
  const faces = {}
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return
    const { uv, normal } = o.geometry.attributes
    const index = o.geometry.index
    const at = (i) => (index ? index.getX(i) : i)
    let minU = Infinity, minV = Infinity
    for (let i = 0; i < uv.count; i++) {
      minU = Math.min(minU, uv.getX(i))
      minV = Math.min(minV, uv.getY(i))
    }
    const du = Math.floor(minU), dv = Math.floor(minV)
    const byDir = {}
    const triangles = (index ? index.count : uv.count) / 3
    for (let t = 0; t < triangles; t++) {
      const ids = [at(t * 3), at(t * 3 + 1), at(t * 3 + 2)]
      const us = ids.map((i) => (uv.getX(i) - du) * SIZE)
      const vs = ids.map((i) => (uv.getY(i) - dv) * SIZE)
      const n = ids.reduce((s, i) => [s[0] + normal.getX(i), s[1] + normal.getY(i), s[2] + normal.getZ(i)], [0, 0, 0])
      const axis = n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)))
      const dir = axis === 0 ? (n[0] > 0 ? 'left' : 'right') : axis === 1 ? (n[1] > 0 ? 'top' : 'bottom') : n[2] > 0 ? 'front' : 'back'
      const f = (byDir[dir] ??= { dir, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }) // 면 하나 = 삼각형 두 개
      f.x0 = Math.min(f.x0, ...us)
      f.y0 = Math.min(f.y0, ...vs)
      f.x1 = Math.max(f.x1, ...us)
      f.y1 = Math.max(f.y1, ...vs)
    }
    faces[o.name] = Object.values(byDir).map((f) => ({
      dir: f.dir,
      x0: Math.round(f.x0),
      y0: Math.round(f.y0),
      x1: Math.round(f.x1),
      y1: Math.round(f.y1),
    }))
  })
  return faces
}

// ── 그리기 도구 ───────────────────────────────────────────────────
const blank = () => Buffer.alloc(SIZE * SIZE * 4)
function rect(buf, x0, y0, x1, y1, rgb, a = 255) {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(SIZE, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(SIZE, Math.ceil(x1)); x++) {
      const i = (y * SIZE + x) * 4
      buf[i] = rgb[0]
      buf[i + 1] = rgb[1]
      buf[i + 2] = rgb[2]
      buf[i + 3] = a
    }
  }
}
const gray = (v) => [v, v, v]

// 면 하나의 일부를 칠한다. from·to: 면의 위(0)~아래(1) 중 어디까지. 면 가장자리에 닿으면 PAD 만큼 더 칠한다.
function fillFace(buf, f, from, to, rgb) {
  const h = f.y1 - f.y0
  const y0 = f.y0 + h * from - (from === 0 ? PAD : 0)
  const y1 = f.y0 + h * to + (to === 1 ? PAD : 0)
  rect(buf, f.x0 - PAD, y0, f.x1 + PAD, y1, rgb)
}

// 메시들의 면을 칠한다. sides: 옆면을 위에서부터 어디까지 칠할지 [from, to]. top·bottom: 윗면·아랫면도 칠할지
// rgb 를 주면 그 색으로, 아니면 면 방향별 회색(SHADE)으로
function cover(buf, faces, meshes, { sides = [0, 1], top = false, bottom = false, only = null, rgb = null } = {}) {
  for (const name of meshes) {
    for (const f of faces[name]) {
      if (only && !only.includes(f.dir)) continue
      const c = rgb ?? gray(SHADE[f.dir])
      if (SIDES.includes(f.dir)) fillFace(buf, f, sides[0], sides[1], c)
      else if ((f.dir === 'top' && top) || (f.dir === 'bottom' && bottom)) fillFace(buf, f, 0, 1, c)
    }
  }
}

// 얼굴(머리 앞면)을 8×8 칸으로 보고 칠한다. (x0, y0)~(x1, y1) 은 칸 단위, 위·왼쪽이 0
function face(buf, faces, x0, y0, x1, y1, rgb) {
  const f = faces.head.find((x) => x.dir === 'front')
  const cw = (f.x1 - f.x0) / FACE_UNITS, ch = (f.y1 - f.y0) / FACE_UNITS
  rect(buf, f.x0 + x0 * cw, f.y0 + y0 * ch, f.x0 + x1 * cw, f.y0 + y1 * ch, rgb)
}
// 두 눈 자리에 같은 모양을 칠한다. 눈은 얼굴 3.8~5.3 줄, 왼쪽 1.5~3 칸 · 오른쪽 5~6.5 칸
const EYES_X = [1.5, 5]
function bothEyes(buf, faces, dx0, dy0, dx1, dy1, rgb) {
  for (const x of EYES_X) face(buf, faces, x + dx0, 3.8 + dy0, x + dx1, 3.8 + dy1, rgb)
}

// ── 눈: 도형으로 그리기 ─────────────────────────────────────────────
// 김현이 프로크리에이트로 그린 눈 12종(10/27)을 원·타원·둥근 네모·선으로 다시 그린 것이다. 크기·굵기·위치는 아래 숫자로 고친다.
// 한쪽 눈을 그리고 반대쪽은 좌우를 뒤집어 대칭을 맞춘다. 가장자리는 한 픽셀을 4×4 로 나눠 칠해 매끈하게 한다.
// 좌표: 눈 가운데가 (0, 0), 단위는 스킨 픽셀. x 는 바깥쪽(관자놀이 쪽)이 +, y 는 아래가 +
// 칠하는 종류: 'black'(동공·속눈썹) · 'white'(흰자·반짝임) · 'ink'(가는 테두리)는 고정 색, 숫자는 눈 색을 입힐 회색 밝기(눈동자)
const SUPER = 4
const EYE_CENTER = { x: [2.25, 5.75], y: 4.55 } // 얼굴 칸 단위 (안내 그림의 눈 자리 가운데)
const EYE_REACH = 20 // 눈 가운데에서 이만큼(px) 안만 칠한다
const circle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r
const ellipse = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
const rrect = (cx, cy, hw, hh, r) => (x, y) => {
  const dx = Math.max(Math.abs(x - cx) - (hw - r), 0), dy = Math.max(Math.abs(y - cy) - (hh - r), 0)
  return Math.abs(x - cx) <= hw && Math.abs(y - cy) <= hh && dx * dx + dy * dy <= r * r
}
const capsule = (x0, y0, x1, y1, w) => (x, y) => {
  const vx = x1 - x0, vy = y1 - y0, t = Math.max(0, Math.min(1, ((x - x0) * vx + (y - y0) * vy) / (vx * vx + vy * vy)))
  return (x - x0 - t * vx) ** 2 + (y - y0 - t * vy) ** 2 <= (w / 2) ** 2
}
const below = (x0, y0, x1, y1) => (x, y) => (y - y0) * (x1 - x0) - (x - x0) * (y1 - y0) >= 0 // 선 (x0,y0)→(x1,y1) 의 아래쪽
const and = (...fs) => (x, y) => fs.every((f) => f(x, y))
const not = (f) => (x, y) => !f(x, y)
const ring = (cx, cy, r, w) => and(circle(cx, cy, r), not(circle(cx, cy, r - w)))
// 테두리: 캐릭터 원래 얼굴처럼 색면으로만 그리고, 동그란 눈·속눈썹 눈·나른한 눈만 가늘고 짙은 갈색 테두리를 둔다 (10/27 결정)
const INK_W = 1.3 // 가는 테두리 굵기
const lash = (deg, r0 = 10.2, r1 = 15.5) => {
  const a = (deg * Math.PI) / 180
  return [capsule(r0 * Math.sin(a), -r0 * Math.cos(a), r1 * Math.sin(a), -r1 * Math.cos(a), 1.8), 'black']
}

// [id, 이름, 칠하기 목록(나중 것이 위)]
const EYE_SHAPES = [
  ['sly', '새침한 눈', () => {
    const shape = and(circle(0, 1, 11), below(-12, -2, 12, -9)) // 바깥쪽이 높은 눈꺼풀 선
    return [[shape, 'white'], [and(circle(-3, -1.5, 5.2), shape), 190], [circle(-1.4, -2.6, 1.5), 'white']]
  }],
  ['sleepy', '졸린 눈', () => {
    const shape = and((x, y) => y >= -4, ellipse(0, -4, 13, 9))
    return [[shape, 'white'], [and(circle(0, -1.5, 4.2), shape), 180]]
  }],
  ['oval', '세로 눈', () => [
    [ellipse(0, 0, 7.5, 14), 'white'], [ellipse(0, 1, 4.6, 8.5), 190], [ellipse(0, 1.5, 2.2, 3.6), 'black'], [circle(1.2, -2.2, 1.3), 'white'],
  ]],
  ['ring', '동그란 눈', () => [[circle(0, 0, 11), 'white'], [ring(0, 0, 11, INK_W), 'ink']]],
  ['lashes', '속눈썹 눈', () => [
    [circle(0, 0, 11), 'white'], [circle(0, 0.5, 4.2), 170], [circle(1.4, -0.9, 1.1), 'white'], [ring(0, 0, 11, INK_W), 'ink'],
    lash(18), lash(40), lash(62),
  ]],
  ['square', '네모 눈', () => [[rrect(0, 0, 7, 7.5, 2.4), 190]]],
  ['dot', '콩알 눈', () => [[circle(0, 0.5, 3), 170]]],
  ['sparkle', '반짝 눈', () => [
    [rrect(0, 0.5, 8, 8.5, 2.6), 160], [capsule(-2.5, -4.5, 3, 5, 2.2), 'white'],
    [capsule(6, -7, 11, -11, 1.8), 'black'], [capsule(7.5, -4.5, 13, -5.5, 1.8), 'black'], [capsule(4, -8, 6, -13, 1.8), 'black'],
  ]],
  ['lidded', '나른한 눈', () => {
    const lidY = -3.5 // 눈꺼풀 선. 그 위는 피부가 보임
    return [
      [and(circle(0, 0, 11.5), (x, y) => y > lidY), 'white'], [and(circle(0, 3.2, 3.6), (x, y) => y > lidY + 1), 170],
      [ring(0, 0, 11.5, INK_W), 'ink'], [and(circle(0, 0, 11.5), capsule(-12, lidY, 12, lidY, INK_W)), 'ink'],
    ]
  }],
  ['pupil', '큰 눈동자', () => [[circle(0, 0, 11.5), 'white'], [circle(0, 0.6, 7), 170], [circle(3.4, -3, 2.1), 'white']]],
  ['arch', '아치 눈', () => {
    const shape = (x, y) => circle(0, -2, 9.5)(x, y) || rrect(0, 4.5, 9.5, 6.5, 2.5)(x, y) // 위가 둥글고 아래가 평평
    const pupil = (x, y) => circle(0, 3, 4.5)(x, y) || rrect(0, 7, 4.5, 4, 1)(x, y) // 아래에 붙은, 위가 둥근 눈동자
    return [[shape, 'white'], [and(pupil, shape), 170], [circle(2.3, 1.7, 1.5), 'white']]
  }],
  ['squint', '꼭 감은 눈', () => squint()], // > < 모양
]
// > < : 뾰족한 끝이 얼굴 가운데(안쪽, -x)를 향함
function squint() {
  return [[capsule(8.5, -8.5, -8, 0, 2.4), 'black'], [capsule(-8, 0, 8.5, 8.5, 2.4), 'black']]
}
const EYE_CLOSED = () => [[capsule(-10, 0, 10, 0, 3), 'black']] // 감은 눈 (모든 눈 공통)
const EYE_COLORS = { black: [31, 31, 36], white: [255, 255, 255], ink: [70, 45, 40] } // 고정 색: 검정(동공·속눈썹) · 흰색 · 짙은 갈색(가는 테두리)

// 칠하기 목록을 두 눈 자리에 그린다. 고정 색은 fixed 그림에, 눈 색 부분은 tint 그림에
function paintEyes(faces, ops, fixed, tint) {
  const f = faces.head.find((x) => x.dir === 'front')
  const cell = (f.x1 - f.x0) / FACE_UNITS
  const cy = f.y0 + EYE_CENTER.y * cell
  for (const [k, ux] of EYE_CENTER.x.entries()) {
    const cx = f.x0 + ux * cell
    const side = k === 0 ? -1 : 1 // 그림 왼쪽 눈은 바깥쪽이 -x
    for (let py = Math.floor(cy - EYE_REACH); py <= cy + EYE_REACH; py++) {
      for (let px = Math.floor(cx - EYE_REACH); px <= cx + EYE_REACH; px++) {
        let fixedN = 0, tintN = 0, gray = 0
        const rgb = [0, 0, 0]
        for (let sy = 0; sy < SUPER; sy++) {
          for (let sx = 0; sx < SUPER; sx++) {
            const x = (px + (sx + 0.5) / SUPER - cx) * side, y = py + (sy + 0.5) / SUPER - cy
            let kind = null
            for (const [inside, k2] of ops) if (inside(x, y)) kind = k2
            if (kind === null) continue
            if (typeof kind === 'number') {
              tintN++
              gray += kind
            } else {
              fixedN++
              for (let c = 0; c < 3; c++) rgb[c] += EYE_COLORS[kind][c]
            }
          }
        }
        const i = (py * SIZE + px) * 4, n = SUPER * SUPER
        if (fixedN) {
          fixed.set([...rgb.map((v) => Math.round(v / fixedN)), Math.round((255 * fixedN) / n)], i)
        }
        if (tintN && tint) {
          const g = Math.round(gray / tintN)
          tint.set([g, g, g, Math.round((255 * tintN) / n)], i)
        }
      }
    }
  }
}

// ── 기본 부품 ─────────────────────────────────────────────────────
// 칸마다 [id, 이름, 그리기]. 그리기는 { tint, file, closed } 중 필요한 것을 채운다. 그리기가 null 이면 "없음"
const DARK = [31, 31, 36]
const LIPS = [120, 50, 50]

function makeParts(faces) {
  const arms = ['arm-left', 'arm-right']
  const legs = ['leg-left', 'leg-right']
  return {
    eyes: EYE_SHAPES.map(([id, name, ops]) => [id, name, (p) => {
      paintEyes(faces, ops(), p.file, p.tint)
      paintEyes(faces, EYE_CLOSED(), p.closed, null)
    }]),
    brows: [
      ['none', '없음', null],
      ['straight', '일자', (p) => bothEyes(p.tint, faces, 0, -0.9, 1.5, -0.55, gray(200))],
      ['thick', '진한', (p) => bothEyes(p.tint, faces, -0.15, -1.0, 1.6, -0.45, gray(170))],
    ],
    mouth: [
      ['none', '없음', null],
      ['smile', '웃음', (p) => {
        face(p.file, faces, 3, 6.0, 5, 6.35, LIPS)
        face(p.file, faces, 2.6, 5.65, 3, 6.0, LIPS)
        face(p.file, faces, 5, 5.65, 5.4, 6.0, LIPS)
      }],
      ['line', '일자', (p) => face(p.file, faces, 3, 6.0, 5, 6.3, LIPS)],
      ['open', '벌린 입', (p) => {
        face(p.file, faces, 3.2, 5.8, 4.8, 6.6, [70, 25, 30])
        face(p.file, faces, 3.5, 6.3, 4.5, 6.6, [200, 90, 100]) // 혀
      }],
    ],
    hair: [
      ['none', '없음', null],
      ['short', '짧은 머리', (p) => {
        cover(p.tint, faces, ['head'], { sides: [0, 0.25], top: true, only: ['top', 'left', 'right'] })
        cover(p.tint, faces, ['head'], { sides: [0, 0.4], only: ['back'] })
        cover(p.tint, faces, ['head'], { sides: [0, 0.12], only: ['front'] })
      }],
      ['long', '긴 머리', (p) => {
        cover(p.tint, faces, ['head'], { sides: [0, 0.8], top: true, only: ['top', 'left', 'right'] })
        cover(p.tint, faces, ['head'], { sides: [0, 1], only: ['back'] })
        cover(p.tint, faces, ['head'], { sides: [0, 0.16], only: ['front'] })
      }],
      ['buzz', '아주 짧은 머리', (p) => {
        cover(p.tint, faces, ['head'], { sides: [0, 0.1], top: true })
      }],
    ],
    top: [
      ['tshirt', '반팔 티셔츠', (p) => {
        cover(p.tint, faces, ['torso'], { top: true, bottom: true })
        cover(p.tint, faces, arms, { sides: [0, 0.4], top: true })
      }],
      ['longsleeve', '긴팔 티셔츠', (p) => {
        cover(p.tint, faces, ['torso'], { top: true, bottom: true })
        cover(p.tint, faces, arms, { sides: [0, 0.85], top: true })
      }],
      ['tank', '민소매', (p) => cover(p.tint, faces, ['torso'], { top: true, bottom: true })],
    ],
    bottom: [
      ['pants', '긴바지', (p) => cover(p.tint, faces, legs, { top: true })],
      ['shorts', '반바지', (p) => cover(p.tint, faces, legs, { sides: [0, 0.45], top: true })],
    ],
    shoes: [
      ['none', '없음', null],
      ['sneakers', '운동화', (p) => {
        cover(p.tint, faces, legs, { sides: [0.8, 1], bottom: true })
        cover(p.file, faces, legs, { sides: [0.94, 1], rgb: gray(245) }) // 흰 밑창 (색 고정)
      }],
      ['boots', '부츠', (p) => cover(p.tint, faces, legs, { sides: [0.55, 1], bottom: true })],
    ],
  }
}

// ── 만들기 ─────────────────────────────────────────────────────────
const faces = await readFaces()
for (const m of ['head', 'torso', 'arm-left', 'arm-right', 'leg-left', 'leg-right'])
  if (!faces[m]?.length) throw new Error(`모델에 ${m} 메시가 없음`)
fs.mkdirSync(path.dirname(FACES), { recursive: true })
fs.writeFileSync(FACES, JSON.stringify(faces, null, 2) + '\n')

const list = {}
const generated = new Set()
const isEmpty = (buf) => !buf.some((v, i) => i % 4 === 3 && v !== 0)
for (const [slot, items] of Object.entries(makeParts(faces))) {
  list[slot] = []
  for (const [id, name, draw] of items) {
    generated.add(`${slot}/${id}`)
    const item = { id, name }
    if (draw) {
      const p = { tint: blank(), file: blank(), closed: blank() }
      draw(p)
      for (const [kind, suffix] of [['tint', '-tint'], ['file', ''], ['closed', '-closed']]) {
        if (isEmpty(p[kind])) continue
        writePng(path.join(OUT, slot, `${id}${suffix}.png`), p[kind])
        item[kind] = `/models/Parts/${slot}/${id}${suffix}.png`
      }
    }
    list[slot].push(item)
  }
  console.log(`${slot}: ${items.map(([id]) => id).join(', ')}`)
}

// 안내 그림: 그 부위가 쓰는 면을 방향별 색으로 칠하고 둘레는 진하게. 얼굴 안내 그림에는 8×8 칸 선과 눈·입 자리를 표시
function template(meshes, range, extra) {
  const map = new Array(SIZE * SIZE).fill(null)
  for (const name of meshes) {
    for (const f of faces[name]) {
      const [from, to] = SIDES.includes(f.dir) ? range : [0, 1]
      const h = f.y1 - f.y0
      for (let y = Math.floor(f.y0 + h * from); y < Math.ceil(f.y0 + h * to); y++)
        for (let x = f.x0; x < f.x1; x++) map[y * SIZE + x] ??= f.dir
    }
  }
  const out = blank()
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      const dir = map[y * SIZE + x]
      if (!dir) continue
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => map[(y + dy) * SIZE + (x + dx)] !== dir)
      const c = FACE_COLORS[dir]
      rect(out, x, y, x + 1, y + 1, edge ? c.map((v) => v >> 1) : c, edge ? 255 : 120)
    }
  }
  extra?.(out)
  return out
}
const legs = ['leg-left', 'leg-right']
const templates = {
  head: template(['head'], [0, 1], (out) => {
    const f = faces.head.find((x) => x.dir === 'front')
    const cw = (f.x1 - f.x0) / FACE_UNITS
    for (let k = 1; k < FACE_UNITS; k++) {
      rect(out, f.x0 + k * cw, f.y0, f.x0 + k * cw + 1, f.y1, [255, 255, 255], 160) // 세로 칸 선
      rect(out, f.x0, f.y0 + k * cw, f.x1, f.y0 + k * cw + 1, [255, 255, 255], 160) // 가로 칸 선
    }
    for (const x of EYES_X) face(out, faces, x, 3.8, x + 1.5, 5.3, [255, 255, 255]) // 눈 자리
    face(out, faces, 2.5, 5.6, 5.5, 7.2, [40, 40, 40]) // 입 자리 (입 트래킹 #61 의 입 모양도 여기)
  }),
  top: template(['torso', 'arm-left', 'arm-right'], [0, 1]),
  bottom: template(legs, [0, 1]),
  shoes: template(legs, [0.55, 1]),
}
for (const [name, buf] of Object.entries(templates)) writePng(path.join(OUT, 'templates', `${name}.png`), buf)

// 목록: 기본 부품 줄은 새로 쓰고, 팀이 직접 추가한 부품(그 밖의 id)은 그대로 둡니다.
const old = fs.existsSync(LIST) ? JSON.parse(fs.readFileSync(LIST, 'utf8')) : {}
for (const slot of Object.keys(list)) list[slot].push(...(old[slot] ?? []).filter((item) => !generated.has(`${slot}/${item.id}`)))
fs.writeFileSync(LIST, JSON.stringify(list, null, 2) + '\n')
console.log(`목록 ${path.relative(ROOT, LIST)}, 면 자리 ${path.relative(ROOT, FACES)}`)
