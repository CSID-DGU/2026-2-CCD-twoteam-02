#!/usr/bin/env node
// 캐릭터 꾸미기 기본 부품과 안내 그림 만들기 (#56)
//
// 캐릭터는 3D 모델 하나(character-a.glb)에 스킨 그림(1024×1024) 한 장을 입힌다. 스킨은 화면이 겹겹이 만든다.
//   맨몸(고른 피부색) → 머리카락 → 하의 → 신발 → 상의
// 눈·눈썹·입은 스킨에 그리지 않고, 얼굴 앞에 붙인 판에 "스티커"처럼 얹는다(사용자가 옮기고 키울 수 있게, #293).
//   스티커 그림: 얼굴 한 변 = 1024 크기(얼굴 1칸 = 128px)로 그리고, 그림 가운데 = 그 부품의 기본 자리.
//   눈은 오른쪽(화면 오른쪽) 눈 하나만 그리고 왼쪽은 화면이 좌우를 뒤집어 그린다. 눈썹은 가로 자리만 눈을 따라가고 높이·크기는 따로 조절한다(avatarLogic.BROW_HOME_Y).
// 이 스크립트가 만드는 것
//   src/avatar/uvFaces.json            : 모델의 부위(메시)별 면 자리(UV, 픽셀)와 방향. 화면이 맨몸을 칠하고 썸네일을 자를 때 씀
//   public/models/Parts/부위/이름*.png  : 코드로 그린 간단한 기본 부품 (팀이 그린 부품으로 바꾸거나 더하면 됨). 눈썹은 스티커 그림
//       이름-tint.png   : 고른 색을 입힐 부분. 흰색·회색으로 그림 (회색이 어두울수록 고른 색도 어둡게)
//       이름.png        : 색이 고정인 부분 (눈동자, 신발 밑창 등)
//   기본 부품은 시험용으로 단순하게 칠한 것이다
//   눈(뜬 눈·감은 눈)·입(다문 입·벌린 입)은 여기서 만들지 않는다. 김현이 그린 그림을 scripts/import-face-drawings.mjs 로 넣는다
//   public/models/Parts/templates/부위.png : 새 부품을 그릴 때 쓰는 안내 그림 (면마다 색이 다름, README 참고)
//   art/hair/머리-시작.bbmodel        : Blockbench 로 머리카락을 만들 때 여는 시작 파일. 머리 크기 상자와 기본 머리들(HAIR_BOXES)이 들어 있음
//   src/avatar/parts.json              : 부품 목록. 기본 부품 줄은 새로 쓰고, 팀이 직접 추가한 줄은 그대로 둔다
//                                        스티커 부품에는 그림이 실제로 칠해진 범위(box: 가운데 기준 [왼, 위, 오른, 아래])를 적는다.
//                                        화면이 눈과 입이 겹치지 않게 막을 때 쓴다
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
// 스티커 그림 크기(가로, 세로). 가운데가 기본 자리라 부품이 다 들어갈 만큼 넉넉하게
const STICKER = { brows: [256, 128] }

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
function writePng(file, rgba, w = SIZE, h = SIZE) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // 비트
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4) // 줄마다 필터 0
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
const blank = (w = SIZE, h = SIZE) => Buffer.alloc(w * h * 4)
// w: 그림 한 줄의 픽셀 수 (스킨이 아닌 스티커 그림에 칠할 때)
function rect(buf, x0, y0, x1, y1, rgb, a = 255, w = SIZE) {
  const h = buf.length / 4 / w
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(h, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, Math.ceil(x1)); x++) {
      const i = (y * w + x) * 4
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

// ── 입체 부품 (머리카락, #296) ─────────────────────────────────────────
// 머리(head) 뼈 안쪽 좌표: 가로 -4~4, 세로 0(턱)~8(정수리), 앞(얼굴)이 z = +4. 상자 하나 = [가로, 세로, 깊이, 가운데 x, y, z]
// 화면이 이 모델을 머리에 붙이고, 고른 머리 색을 입히고, 면 방향마다 밝기를 다르게 칠한다(useHair).
// 나중에 Blockbench 로 만든 모델로 바꾸거나 더하면 된다(public/models/Parts/README.md).
const cap = [[8.8, 1.8, 8.8, 0, 8.5, 0]] // 정수리를 덮는 판
const HAIR_BOXES = {
  short: [...cap, [8.8, 3.2, 0.7, 0, 6.6, -4.35], [0.7, 2.6, 8.8, 4.35, 6.9, 0], [0.7, 2.6, 8.8, -4.35, 6.9, 0],
    [3.2, 1.6, 0.6, -2.6, 7.2, 4.35], [2.6, 1.1, 0.6, 0.2, 7.45, 4.35], [2.4, 1.9, 0.6, 2.9, 7.05, 4.35]], // 앞머리 계단
  long: [...cap, [8.8, 10, 0.9, 0, 3.6, -4.4], [0.9, 8.6, 6, 4.45, 4.3, -1.4], [0.9, 8.6, 6, -4.45, 4.3, -1.4],
    [0.9, 6.6, 2.8, 4.45, 5.3, 2.9], [0.9, 6.6, 2.8, -4.45, 5.3, 2.9], [8.8, 1.4, 0.6, 0, 7.4, 4.35]],
  buzz: [[8.4, 0.7, 8.4, 0, 8.35, 0], [8.4, 2.2, 0.4, 0, 7, -4.2], [0.4, 1.6, 8.4, 4.2, 7.4, 0], [0.4, 1.6, 8.4, -4.2, 7.4, 0],
    [8.4, 0.6, 0.4, 0, 7.75, 4.2]],
  spiky: [[8.6, 1.4, 8.6, 0, 8.3, 0], [8.6, 2.4, 0.6, 0, 7, -4.3], [8.6, 1, 0.6, 0, 7.6, 4.3],
    [2.2, 2.6, 2.2, -2.6, 9.9, 1.8], [2.2, 3.4, 2.2, 0.2, 10.3, 1.4], [2.2, 2.4, 2.2, 2.8, 9.8, 1.9],
    [2.2, 3, 2.2, -1.6, 10.1, -1.8], [2.2, 2.6, 2.2, 1.9, 9.9, -1.6]],
  bun: [...cap, [8.8, 3.2, 0.7, 0, 6.6, -4.35], [0.7, 2.6, 8.8, 4.35, 6.9, 0], [0.7, 2.6, 8.8, -4.35, 6.9, 0],
    [8.8, 1.2, 0.6, 0, 7.5, 4.35], [3.6, 3.2, 3.6, 0, 10.6, -1.2]],
}

// 상자 목록 → glTF 파일 (모델 하나, 재질 'tint' 하나. 버퍼는 파일 안에 base64 로). 새 라이브러리 없이 직접 쓴다
// Blockbench 가 내보내는 것과 같게 머리 1칸을 1/16 로 줄여 쓴다(화면이 16배 키워 붙임, partModel.MODEL_UNIT)
const BB_UNIT = 16
function writeBoxGltf(file, boxes) {
  const pos = [], nor = [], idx = []
  // 면마다 [법선, 네 꼭짓점(-1·+1 로 표시)]
  const FACES = [
    [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]],
    [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
    [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
    [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
    [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
    [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
  ]
  for (const [w, h, d, cx, cy, cz] of boxes) {
    for (const [n, corners] of FACES) {
      const base = pos.length / 3
      for (const [sx, sy, sz] of corners) {
        pos.push((cx + (sx * w) / 2) / BB_UNIT, (cy + (sy * h) / 2) / BB_UNIT, (cz + (sz * d) / 2) / BB_UNIT)
        nor.push(...n)
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }
  const f32 = (a) => Buffer.from(new Float32Array(a).buffer)
  const posBuf = f32(pos), norBuf = f32(nor), idxBuf = Buffer.from(new Uint16Array(idx).buffer)
  const pad = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)])
  const bin = Buffer.concat([pad(posBuf), pad(norBuf), pad(idxBuf)])
  const min = [0, 1, 2].map((k) => Math.min(...pos.filter((_, i) => i % 3 === k)))
  const max = [0, 1, 2].map((k) => Math.max(...pos.filter((_, i) => i % 3 === k)))
  const gltf = {
    asset: { version: '2.0', generator: 'make-avatar-parts.mjs' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'hair' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ name: 'tint', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } }],
    buffers: [{ byteLength: bin.length, uri: `data:application/octet-stream;base64,${bin.toString('base64')}` }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBuf.length, target: 34962 },
      { buffer: 0, byteOffset: pad(posBuf).length, byteLength: norBuf.length, target: 34962 },
      { buffer: 0, byteOffset: pad(posBuf).length + pad(norBuf).length, byteLength: idxBuf.length, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count: nor.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: idx.length, type: 'SCALAR' },
    ],
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(gltf) + '\n')
}

// Blockbench 시작 파일(.bbmodel, Blockbench 의 프로젝트 파일 = JSON). 빈 '내 머리' 묶음 + 머리 확인용 상자 + 얼굴 쪽 표시 + 기본 머리들(묶음마다)
// '내 머리' 묶음만 내보내진다(나머지 묶음은 export: false). 사용법은 art/hair/사용법.md
// Blockbench 좌표는 픽셀 단위이고 머리 뼈 좌표와 숫자가 같다(머리 = -4~4, 0~8, -4~4). 얼굴은 +Z(남쪽, South)
const HAIR_NAMES = { short: '짧은 머리', long: '긴 머리', buzz: '아주 짧은 머리', spiky: '삐죽 머리', bun: '똥머리' }
function writeHairStarter(file) {
  const uuid = () => crypto.randomUUID()
  const side = { uv: [0, 0, 1, 1] } // 그림을 정하지 않은 면 (texture: null 로 두면 Blockbench 가 면을 숨김)
  const cube = (name, from, to, color, visibility = true) => ({
    name, box_uv: false, rescale: false, locked: false, from, to, autouv: 0, color, origin: [0, 0, 0], visibility,
    faces: { north: side, east: side, south: side, west: side, up: side, down: side }, type: 'cube', uuid: uuid(),
  })
  const group = (name, cubes, visibility = true, exported = false) => ({
    name, origin: [0, 0, 0], color: 0, uuid: uuid(), export: exported, isOpen: false, locked: false, visibility, autouv: 0,
    children: cubes.map((c) => c.uuid),
  })
  const elements = [], outliner = []
  outliner.push({ ...group('내 머리 (이 묶음 안의 상자만 내보내짐)', [], true, true), isOpen: true })
  // 머리 확인용: 얼굴 쪽에 코처럼 작은 상자를 붙여 앞을 알 수 있게. 내보내지 않음
  const head = [cube('머리 (확인용)', [-4, 0, -4], [4, 8, 4], 1), cube('얼굴 쪽 표시', [-1, 3, 4], [1, 4.5, 5], 2)]
  elements.push(...head)
  outliner.push(group('머리 확인용 (내보내지 않음)', head))
  for (const [id, boxes] of Object.entries(HAIR_BOXES)) {
    const visible = id === 'short' // 처음에는 짧은 머리만 보이게. 나머지는 눈 아이콘을 눌러 보기
    const cubes = boxes.map(([w, h, d, cx, cy, cz], k) =>
      cube(`${id}-${k + 1}`, [cx - w / 2, cy - h / 2, cz - d / 2], [cx + w / 2, cy + h / 2, cz + d / 2], 0, visible))
    elements.push(...cubes)
    outliner.push(group(`예시: ${HAIR_NAMES[id]} (내보내지 않음)`, cubes, visible))
  }
  const project = {
    meta: { format_version: '4.10', model_format: 'free', box_uv: false },
    name: '머리-시작', model_identifier: '', resolution: { width: 16, height: 16 },
    elements, outliner, textures: [],
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(project, null, 1) + '\n')
}

// ── 기본 부품 ─────────────────────────────────────────────────────
// 칸마다 [id, 이름, 그리기]. 그리기는 { tint, file } 중 필요한 것을 채운다. 그리기가 null 이면 "없음"
// 그리기 대신 상자 목록(배열)이면 입체 부품: 모델 파일(.gltf)을 만들어 목록에 model 로 적는다
const DARK = [31, 31, 36]

function makeParts(faces) {
  const arms = ['arm-left', 'arm-right']
  const legs = ['leg-left', 'leg-right']
  return {
    // 눈·눈썹·입은 그린 그림을 넣으므로(scripts/import-face-drawings.mjs) 여기서는 "없음"만 둔다. parts.json 의 그 줄들은 그대로 남는다
    eyes: [],
    closedEyes: [],
    brows: [['none', '없음', null]],
    mouth: [],
    mouthOpen: [],
    // 머리카락은 머리에 붙이는 입체 부품(#296). 그리기 대신 상자 목록(HAIR_BOXES)을 주면 3D 모델 파일(.gltf)로 만든다
    // 코드로 만든 기본 머리는 지우고(10/30) Blockbench 로 만든 머리만 쓴다. HAIR_BOXES 는 머리-시작.bbmodel 의 예시로만 남김
    hair: [
      ['none', '없음', null],
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
// 스티커 그림들이 실제로 칠해진 범위 (가운데 기준 [왼, 위, 오른, 아래], 스티커 픽셀)
function boxOf(bufs, w, h) {
  let x0 = w, y0 = h, x1 = 0, y1 = 0
  for (const buf of bufs) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (buf[(y * w + x) * 4 + 3] < 8) continue
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1)
  }
  return [x0 - w / 2, y0 - h / 2, x1 - w / 2, y1 - h / 2]
}
for (const [slot, items] of Object.entries(makeParts(faces))) {
  list[slot] = []
  const [w, h] = STICKER[slot] ?? [SIZE, SIZE]
  for (const [id, name, draw] of items) {
    generated.add(`${slot}/${id}`)
    const item = { id, name }
    if (Array.isArray(draw)) {
      writeBoxGltf(path.join(OUT, slot, `${id}.gltf`), draw)
      item.model = `/models/Parts/${slot}/${id}.gltf`
    } else if (draw) {
      const p = { tint: blank(w, h), file: blank(w, h) }
      draw(p)
      for (const [kind, suffix] of [['tint', '-tint'], ['file', '']]) {
        if (isEmpty(p[kind])) continue
        writePng(path.join(OUT, slot, `${id}${suffix}.png`), p[kind], w, h)
        item[kind] = `/models/Parts/${slot}/${id}${suffix}.png`
      }
      if (STICKER[slot]) item.box = boxOf([p.tint, p.file], w, h)
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
    // 눈·입 기본 자리(avatarLogic.EYE_HOME·MOUTH_HOME, 그리는 틀 크기). 눈·입은 스티커라 이 안내 그림에는 그리지 않고, 다른 부품이 피할 자리만 보여 줌
    for (const x of [2.25, 5.75]) face(out, faces, x - 0.875, 3.5, x + 0.875, 5.25, [255, 255, 255]) // 눈 자리
    face(out, faces, 2, 5.5625, 6, 7.4375, [40, 40, 40]) // 입 자리
  }),
  top: template(['torso', 'arm-left', 'arm-right'], [0, 1]),
  bottom: template(legs, [0, 1]),
  shoes: template(legs, [0.55, 1]),
}
for (const [name, buf] of Object.entries(templates)) writePng(path.join(OUT, 'templates', `${name}.png`), buf)
writeHairStarter(path.join(ROOT, 'art/hair/머리-시작.bbmodel'))

// 목록: 기본 부품 줄은 새로 쓰고, 팀이 직접 추가한 부품(그 밖의 id)은 그대로 둡니다.
const old = fs.existsSync(LIST) ? JSON.parse(fs.readFileSync(LIST, 'utf8')) : {}
for (const slot of Object.keys(list)) list[slot].push(...(old[slot] ?? []).filter((item) => !generated.has(`${slot}/${item.id}`)))
fs.writeFileSync(LIST, JSON.stringify(list, null, 2) + '\n')
console.log(`목록 ${path.relative(ROOT, LIST)}, 면 자리 ${path.relative(ROOT, FACES)}`)
