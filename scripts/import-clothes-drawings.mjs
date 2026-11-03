#!/usr/bin/env node
// 그리기 틀(2048×2048)에 그린 상의·하의·신발 그림을 스킨 부품으로 넣기 (#56)
//
// art/clothes-guide 의 틀을 밑그림으로 그려 투명 PNG 로 내보낸 그림을 받는다(art/README.md).
// 틀은 몸의 면을 칸으로 펼쳐 놓은 격자판이다. 한 칸은 머리카락 그림 한 칸과 같은 크기이고, 캔버스 전체는 32×32칸이다.
// 캔버스는 32×32(칸마다 1픽셀), 64×64(2픽셀)처럼 작게 그려도 되고 2048×2048 까지 받는다. 하는 일:
//   1) 작은 그림은 픽셀을 그대로 키워 2048 로 맞추고, 면마다 스킨(1024×1024)의 그 자리(src/avatar/uvFaces.json)에 옮긴다. 투명한 곳은 맨살이 보인다.
//   2) 색을 나눈다. 흰색은 고른 상의 색을 입힐 그림(-tint), 나머지(회색·검정 포함)는 칠한 색 그대로인 색 고정 그림으로.
//   3) 면 방향마다 밝기(SHADE)를 곱한다. 몸·다른 옷과 같은 느낌이 되고, 그릴 때 신경 쓰지 않아도 된다.
//   4) 왼팔·왼다리만 그리므로 오른쪽은 좌우를 뒤집어 만든다(바깥쪽 무늬가 양쪽 모두 바깥에 오게).
//   5) 틀에 없는 아랫면은 그 위 면의 아래 끝 줄을 이어 칠한다.
//
// 쓰는 법: node scripts/import-clothes-drawings.mjs [그림폴더] [내보낼폴더]
//   그림폴더를 빼면 art/clothes-drawings (그림은 그림폴더/칸/id.png).
//   내보낼폴더를 주면 그 폴더에만 그림을 쓰고 parts.json 은 고치지 않는다(시험해 볼 때).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readPng, writePng } from './png.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LIST = path.join(ROOT, 'src/avatar/parts.json')
const FACES = path.join(ROOT, 'src/avatar/uvFaces.json')
const W = 2048 // 계산에 쓰는 캔버스 한 변. 작은 그림은 이 크기로 키운다
const CELL = W / 32 // 틀 한 칸
const SKIN = 1024 // 스킨 한 변
const PAD = 2 // 면 가장자리 바깥까지 조금 더 칠한다(경계가 비어 보이지 않게). make-avatar-parts 와 같음
const SHADE = { top: 255, front: 245, left: 228, right: 228, back: 215, bottom: 200 } // avatarLogic.SHADE 와 같음
const TINT_MIN = 240 // RGB 가 모두 이 값 이상인 흰색만 고른 상의 색을 입힌다. 회색·검정을 포함한 나머지는 칠한 색 그대로
const SEEN = 8 / 255 // 이보다 투명한 픽셀은 없는 것으로 본다

// 틀의 면 자리 [왼쪽, 위, 너비, 높이] (칸 단위). art/clothes-guide 그림과 같은 숫자
const cells = (set) => Object.fromEntries(Object.entries(set).map(([d, r]) => [d, r.map((v) => v * CELL)]))
const TORSO = cells({ right: [2, 6, 6, 9], front: [8, 6, 8, 9], left: [16, 6, 6, 9], back: [22, 6, 8, 9], top: [8, 0, 8, 6] })
const ARM = cells({ right: [2, 20, 4, 11], front: [6, 20, 4, 11], left: [10, 20, 4, 11], back: [14, 20, 4, 11], top: [6, 16, 4, 4] })
// 하의·신발 틀은 다리 옆면 자리가 같고, 하의에는 다리 위 칸이, 신발에는 발바닥 칸이 있다
const LEG_SIDES = cells({ right: [2, 4, 4, 10], front: [6, 4, 4, 10], left: [10, 4, 4, 10], back: [14, 4, 4, 10] })
const LEG = { bottom: { ...LEG_SIDES, ...cells({ top: [6, 0, 4, 4] }) }, shoes: { ...LEG_SIDES, ...cells({ bottom: [6, 14, 4, 4] }) } }

// 넣을 그림. 그림 파일은 그림폴더/칸/id.png
const DRAWINGS = [
  { slot: 'top', id: 'me-crop-cardigan', name: '크롭티와 가디건' },
  { slot: 'top', id: 'stripe-sweater', name: '줄무늬 스웨터' },
  { slot: 'top', id: 'two-tone-top', name: '투톤 맨투맨' },
  { slot: 'top', id: 'check-overalls', name: '체크 멜빵과 반팔티' },
  { slot: 'bottom', id: 'check-shorts', name: '체크 반바지' },
  { slot: 'bottom', id: 'dark-jeans', name: '찐청 긴바지' },
  { slot: 'bottom', id: 'light-jeans', name: '연청 긴바지' },
  { slot: 'bottom', id: 'light-denim-shorts', name: '연청 반바지' },
  { slot: 'bottom', id: 'dark-denim-shorts', name: '찐청 반바지' },
  { slot: 'shoes', id: 'ribbon-boots', name: '리본 부츠' },
]

// 작은 그림의 픽셀을 그대로 키워 2048 로 맞춘다 (32·64·128 … 처럼 2048 을 나누어떨어지는 정사각형만)
function upscale({ w, h, rgba }, file) {
  if (w !== h || W % w) throw new Error(`${file}: 32×32, 64×64 … 2048×2048 그림이어야 합니다 (지금 ${w}×${h})`)
  const k = W / w
  if (k === 1) return rgba
  const out = Buffer.alloc(W * W * 4)
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) rgba.copy(out, (y * W + x) * 4, (Math.floor(y / k) * w + Math.floor(x / k)) * 4, (Math.floor(y / k) * w + Math.floor(x / k)) * 4 + 4)
  return out
}

// 2048 그림을 색을 입힐 부분과 색 고정 부분으로 나눈다 (둘 다 미리 곱한 알파)
function split(rgba) {
  const N = W * W
  const tint = new Float32Array(N * 4), fixed = new Float32Array(N * 4)
  for (let i = 0; i < N; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], a = rgba[i * 4 + 3] / 255
    if (a < SEEN) continue
    const out = Math.min(r, g, b) >= TINT_MIN ? tint : fixed
    out.set([r * a, g * a, b * a, a], i * 4)
  }
  return { tint, fixed }
}

// 칸 src 를 스킨의 면 dest 자리에 옮긴다. flip 이면 좌우를 뒤집고, row 를 주면 그 줄(0~1)만 위아래로 늘려 칠한다
function place(from, to, src, dest, shade, { flip = false, row = null } = {}) {
  const [sx, sy, sw, sh] = src
  const dw = dest.x1 - dest.x0, dh = dest.y1 - dest.y0
  const k = shade / 255
  for (let y = dest.y0 - PAD; y < dest.y1 + PAD; y++) for (let x = dest.x0 - PAD; x < dest.x1 + PAD; x++) {
    // 면 밖(PAD)은 가장 가까운 면 안쪽 픽셀과 같게
    let u = Math.min(dw - 1, Math.max(0, x - dest.x0))
    const v = Math.min(dh - 1, Math.max(0, y - dest.y0))
    if (flip) u = dw - 1 - u
    const x0 = sx + Math.floor((u * sw) / dw), x1 = sx + Math.floor(((u + 1) * sw) / dw)
    const y0 = row === null ? sy + Math.floor((v * sh) / dh) : sy + Math.floor(row * (sh - 1))
    const y1 = row === null ? sy + Math.floor(((v + 1) * sh) / dh) : y0 + 1
    let r = 0, g = 0, b = 0, a = 0, n = 0
    for (let Y = y0; Y < y1; Y++) for (let X = x0; X < x1; X++) {
      const i = (Y * W + X) * 4
      r += from[i]; g += from[i + 1]; b += from[i + 2]; a += from[i + 3]; n++
    }
    if (!n || a / n < 0.01) continue
    to.set([Math.round((r / a) * k), Math.round((g / a) * k), Math.round((b / a) * k), Math.round((a / n) * 255)], (y * SKIN + x) * 4)
  }
}

// 그림 한 벌 → 스킨 크기 그림 하나 (색을 입힐 부분 또는 색 고정 부분)
function toSkin(from, faces, slot) {
  const out = Buffer.alloc(SKIN * SKIN * 4)
  if (slot !== 'top') {
    const set = LEG[slot]
    for (const f of faces['leg-left']) if (set[f.dir]) place(from, out, set[f.dir], f, SHADE[f.dir])
    // 오른다리: 왼다리를 좌우로 뒤집은 모습 (오른팔과 같음)
    const mirror = { ...set, right: set.left, left: set.right }
    for (const f of faces['leg-right']) if (mirror[f.dir]) place(from, out, mirror[f.dir], f, SHADE[f.dir], { flip: true })
    return out
  }
  for (const f of faces.torso) {
    if (f.dir === 'bottom') place(from, out, TORSO.front, f, SHADE.bottom, { row: 1 })
    else place(from, out, TORSO[f.dir], f, SHADE[f.dir])
  }
  for (const f of faces['arm-left']) {
    if (f.dir === 'bottom') place(from, out, ARM.front, f, SHADE.bottom, { row: 1 })
    else place(from, out, ARM[f.dir], f, SHADE[f.dir])
  }
  // 오른팔: 왼팔을 좌우로 뒤집은 모습. 오른팔의 바깥(right)은 틀의 바깥(left), 안쪽(left)은 틀의 안쪽(right)
  const MIRROR = { right: ARM.left, left: ARM.right, front: ARM.front, back: ARM.back, top: ARM.top }
  for (const f of faces['arm-right']) {
    if (f.dir === 'bottom') place(from, out, ARM.front, f, SHADE.bottom, { flip: true, row: 1 })
    else place(from, out, MIRROR[f.dir], f, SHADE[f.dir], { flip: true })
  }
  return out
}

const hasPixels = (buf) => {
  for (let i = 3; i < buf.length; i += 4) if (buf[i]) return true
  return false
}

// ── 만들기 ─────────────────────────────────────────────────────────
const [dirArg, outArg] = process.argv.slice(2)
const dir = dirArg ?? path.join(ROOT, 'art/clothes-drawings')
const OUT = outArg ? path.resolve(outArg) : path.join(ROOT, 'public/models/Parts')
const faces = JSON.parse(fs.readFileSync(FACES, 'utf8'))
const list = JSON.parse(fs.readFileSync(LIST, 'utf8'))
for (const d of DRAWINGS) {
  const file = path.join(dir, d.slot, `${d.id}.png`)
  if (!fs.existsSync(file)) throw new Error(`${file} 가 없음`)
  const { tint, fixed } = split(upscale(readPng(file), file))
  const item = { id: d.id, name: d.name }
  const tintSkin = toSkin(tint, faces, d.slot), fixedSkin = toSkin(fixed, faces, d.slot)
  if (hasPixels(tintSkin)) {
    writePng(path.join(OUT, d.slot, `${d.id}-tint.png`), tintSkin, SKIN, SKIN)
    item.tint = `/models/Parts/${d.slot}/${d.id}-tint.png`
  }
  if (hasPixels(fixedSkin)) {
    writePng(path.join(OUT, d.slot, `${d.id}.png`), fixedSkin, SKIN, SKIN)
    item.file = `/models/Parts/${d.slot}/${d.id}.png`
  }
  console.log(`${d.slot}/${d.id}.png (${d.name})`)
  if (outArg) continue
  // 이미 있는 부품은 그 자리에서 바꾸고, 화면에서 내린 표시(hidden)는 그대로 둔다
  const items = (list[d.slot] ??= [])
  const at = items.findIndex((p) => p.id === d.id)
  if (at < 0) items.push(item)
  else items[at] = items[at].hidden ? { ...item, hidden: true } : item
}
if (!outArg) {
  fs.writeFileSync(LIST, JSON.stringify(list, null, 2) + '\n')
  console.log(`목록 ${path.relative(ROOT, LIST)}`)
}
