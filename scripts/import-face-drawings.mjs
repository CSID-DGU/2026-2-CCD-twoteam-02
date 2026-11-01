#!/usr/bin/env node
// 얼굴 캔버스(2048×2048)에 크게 그린 눈·입 그림을 스티커 부품으로 넣기 (#293)
//
// art/face-guide/그리기-틀-2048.png 를 밑그림으로 깔고 부품마다 레이어를 따로 그려 2048×2048 그대로 내보낸 PNG 를 받는다(art/README.md).
// 크게 그렸으니 선은 다듬지 않고 그대로 쓴다. 하는 일:
//   1) 바탕: 그림 가장자리에 닿는 칸(입·눈 바깥)은 투명하게. 배경 레이어를 켠 채 흰 바탕으로 내보내도 된다.
//      선 가장자리의 반쯤 섞인 픽셀은 선 색 + 그만큼의 투명도로 바꿔, 피부 위에 얹어도 흰 테두리가 남지 않게 한다.
//   2) 칸 채우기(fill): 색을 칠하지 않고 선만 그린 그림은, 선으로 막힌 칸마다 색을 정해 채운다.
//      칸 번호는 칸의 가운데가 위에 있는 것부터(같으면 왼쪽부터) 1, 2, 3 … 이다. 칠해 온 그림은 그린 색 그대로 둔다.
//   3) 파랑·하늘색(눈동자 등)은 사용자가 고른 눈 색을 입힐 그림(-tint)으로 따로 뺀다. 진할수록 고른 색도 진하게.
//      눈은 한쪽만 그린다. 왼쪽 눈 자리에 그렸으면 좌우를 뒤집어 오른쪽 눈 그림으로 만든다(화면이 다시 뒤집어 왼쪽 눈을 그림).
//   4) 그 부품의 기본 자리(EYE_HOME·MOUTH_HOME, 2048 기준)를 가운데로 잘라 반 크기(얼굴 한 변 = 1024)의 스티커 그림으로 저장하고
//      src/avatar/parts.json 에 넣는다. 그림이 칠해진 범위(box)도 적는다.
//
// 쓰는 법: node scripts/import-face-drawings.mjs [그림폴더] [내보낼폴더]
//   그림폴더를 빼면 art/face-drawings (원본 그림을 모아 두는 곳).
//   내보낼폴더를 주면 그 폴더에만 그림을 쓰고 parts.json 은 고치지 않는다(시험해 볼 때).
// 새 라이브러리 없이 Node 기본 기능(zlib)으로 PNG 를 읽고 쓴다.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LIST = path.join(ROOT, 'src/avatar/parts.json')
const W = 2048 // 그린 얼굴 캔버스 한 변
const SIZE = W // writePng 기본 크기
// 기본 자리(2048 기준, 얼굴 1칸 = 256px). avatarLogic.EYE_HOME·MOUTH_HOME 의 두 배
const HOME = { eyes: { x: 1472, y: 960 }, closedEyes: { x: 1472, y: 960 }, mouth: { x: 1024, y: 1664 }, mouthOpen: { x: 1024, y: 1664 } }
// 예전 그리기 틀(눈 448, 가운데 높이 1120)에 그린 눈(oldFrame). 새 틀보다 160 아래에 있어서 그만큼 아래를 잘라 새 자리에 맞춘다
const OLD_EYE_HOME = { x: 1472, y: 1120 }
// 예전 틀에 그린 눈은 앱이 1.3배로 키워 보여 줬다. 새 틀에서도 같은 모습이 되게 부품에 이 배율(scale)을 적는다
const OLD_EYE_SCALE = 1.3
// 스티커 그림 크기(얼굴 1024 기준). 2048 그림에서는 이 두 배를 잘라 반으로 줄인다. make-avatar-parts 와 같음
const STICKER = { eyes: [320, 320], closedEyes: [320, 320], mouth: [512, 256], mouthOpen: [512, 256] }
const LINE = [31, 31, 36] // 선 색
// 칸 채우기 색 (김현 10/27: 혀는 붉은색, 입 안은 까만색)
const FILL = { teeth: [255, 255, 255], inside: [35, 25, 30], tongue: [214, 52, 64], white: [255, 255, 255] }

// 넣을 그림. 그림 파일은 그림폴더/칸/id.png. 칸: eyes(뜬 눈)·closedEyes(감은 눈)·mouth(다문 입)·mouthOpen(벌린 입)
// fill: 칸 번호 순서대로 채울 색(선만 그린 그림). oldFrame: 예전 그리기 틀에 그린 눈 (예전 자리로 자르고 1.3배로 놓음)
const DRAWINGS = [
  { slot: 'eyes', id: 'tall', name: '길쭉한 눈', oldFrame: true },
  { slot: 'eyes', id: 'side-glance', name: '곁눈질 눈', oldFrame: true },
  { slot: 'eyes', id: 'blank', name: '멍한 눈', oldFrame: true },
  { slot: 'eyes', id: 'sparkle', name: '초롱초롱 눈', oldFrame: true },
  { slot: 'eyes', id: 'lidded', name: '나른한 눈', oldFrame: true },
  { slot: 'eyes', id: 'sleepy', name: '졸린 눈', oldFrame: true },
  { slot: 'eyes', id: 'almond', name: '아몬드 눈', oldFrame: true },
  { slot: 'eyes', id: 'crying', name: '우는 눈', oldFrame: true },
  { slot: 'eyes', id: 'half', name: '심드렁한 눈', oldFrame: true },
  { slot: 'eyes', id: 'tiny-ring', name: '작은 동그라미 눈', oldFrame: true },
  { slot: 'eyes', id: 'dot', name: '점 눈', oldFrame: true },
  { slot: 'eyes', id: 'new-1', name: '새 눈 1 (시험)' },
  { slot: 'eyes', id: 'new-2', name: '새 눈 2 (시험)' },
  { slot: 'eyes', id: 'new-3', name: '새 눈 3 (시험)' },
  { slot: 'eyes', id: 'new-4', name: '새 눈 4 (시험)' },
  { slot: 'eyes', id: 'new-5', name: '새 눈 5 (시험)' },
  { slot: 'eyes', id: 'new-6', name: '새 눈 6 (시험)' },
  { slot: 'eyes', id: 'new-7', name: '새 눈 7 (시험)' },
  { slot: 'eyes', id: 'new-8', name: '새 눈 8 (시험)' },
  { slot: 'eyes', id: 'new-9', name: '새 눈 9 (시험)' },
  { slot: 'eyes', id: 'new-10', name: '새 눈 10 (시험)' },
  { slot: 'eyes', id: 'new-11', name: '새 눈 11 (시험)' },
  { slot: 'closedEyes', id: 'new-1', name: '새 감은 눈 1 (시험)' },
  { slot: 'closedEyes', id: 'new-2', name: '새 감은 눈 2 (시험)' },
  { slot: 'closedEyes', id: 'new-3', name: '새 감은 눈 3 (시험)' },
  { slot: 'closedEyes', id: 'new-4', name: '새 감은 눈 4 (시험)' },
  { slot: 'closedEyes', id: 'new-5', name: '새 감은 눈 5 (시험)' },
  { slot: 'mouth', id: 'soft-smile', name: '살짝 웃는 입' },
  { slot: 'mouth', id: 'smile', name: '웃는 입' },
  { slot: 'mouth', id: 'wavy', name: '물결 입' },
  { slot: 'mouth', id: 'frown', name: '시무룩한 입' },
  { slot: 'mouth', id: 'tongue-out', name: '메롱 입' },
  { slot: 'mouthOpen', id: 'big-smile', name: '활짝 벌린 입' },
  { slot: 'mouthOpen', id: 'laugh', name: '깔깔 웃는 입' },
  { slot: 'mouthOpen', id: 'teeth-grin', name: '이 보이게 웃는 입' },
  { slot: 'mouthOpen', id: 'round-o', name: '동그랗게 벌린 입' },
  { slot: 'mouthOpen', id: 'bucktooth', name: '앞니 입' },
  { slot: 'mouthOpen', id: 'wide-open', name: '크게 벌린 입' },
  { slot: 'mouthOpen', id: 'gasp', name: '놀라 벌린 입' },
  { slot: 'mouthOpen', id: 'tongue-open', name: '혀 내민 입' },
  { slot: 'mouthOpen', id: 'drool', name: '침 흘리는 입' },
  { slot: 'mouthOpen', id: 'clench', name: '이 악문 입' },
]

// ── PNG 읽기·쓰기 (8비트 RGBA·RGB, 인터레이스 없음) ─────────────────────
function readPng(file) {
  const buf = fs.readFileSync(file)
  let pos = 8, w = 0, h = 0, type = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), name = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len)
    if (name === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      type = data[9]
      if (data[8] !== 8 || data[12] !== 0 || (type !== 6 && type !== 2)) throw new Error(`${file}: 8비트 RGBA·RGB PNG 만 읽습니다`)
    } else if (name === 'IDAT') idat.push(data)
    pos += 12 + len
  }
  const ch = type === 6 ? 4 : 3, stride = w * ch
  const raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(stride * h)
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)]
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[y * stride + x - ch] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= ch && y ? px[(y - 1) * stride + x - ch] : 0
      let v = raw[y * (stride + 1) + 1 + x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      px[y * stride + x] = v & 255
    }
  }
  const rgba = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) rgba.set(ch === 4 ? px.subarray(i * 4, i * 4 + 4) : [px[i * 3], px[i * 3 + 1], px[i * 3 + 2], 255], i * 4)
  return { w, h, rgba }
}
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

// ── 그림 한 장 → 스티커 ─────────────────────────────────────────────
// 돌려주는 것: { fixed, tint } (스티커 크기 RGBA, tint 는 파랑이 없으면 null)
function convert(file, slot, fill = [], home = HOME[slot]) {
  const { w, h, rgba } = readPng(file)
  if (w !== W || h !== W) throw new Error(`${file}: ${W}×${W} 그림이어야 합니다 (지금 ${w}×${h})`)
  const N = W * W
  if (slot === 'eyes' || slot === 'closedEyes') mirrorIfLeft(rgba)
  // 픽셀마다: 진하기(검정 선), 파랑·하늘색(눈 색 자리)인지
  const dark = new Float32Array(N), blue = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    const [r, g, b] = rgba.subarray(i * 4, i * 4 + 3), a = rgba[i * 4 + 3] / 255
    if (b > r + 50 && a > 0.05) { blue[i] = 1; continue }
    const chroma = Math.max(r, g, b) - Math.min(r, g, b)
    dark[i] = chroma > 60 ? 0 : a * (1 - (r + g + b) / 765) // 색이 있는 칠(혀·입 안)은 선이 아님
  }
  // 선(진하기 0.5 이상)이 아닌 곳을 칸으로 나눈다. 그림 가장자리에 닿는 칸 = 바깥
  const lab = new Int32Array(N), regions = []
  for (let i = 0; i < N; i++) {
    if (dark[i] >= 0.5 || lab[i]) continue
    const id = regions.length + 1, stack = [i]
    let n = 0, sx = 0, sy = 0, outside = false
    lab[i] = id
    while (stack.length) {
      const k = stack.pop(), x = k % W, y = (k / W) | 0
      n++; sx += x; sy += y
      if (!x || !y || x === W - 1 || y === W - 1) outside = true
      for (const j of [k + 1, k - 1, k + W, k - W]) {
        if (j < 0 || j >= N || lab[j] || dark[j] >= 0.5 || Math.abs((j % W) - x) > 1) continue
        lab[j] = id
        stack.push(j)
      }
    }
    regions.push({ id, n, cx: sx / n, cy: sy / n, outside })
  }
  const inner = regions.filter((r) => !r.outside && r.n > 200).sort((a, b) => a.cy - b.cy || a.cx - b.cx)
  if (fill.length && fill.length !== inner.length) throw new Error(`${file}: 막힌 칸이 ${inner.length}개인데 fill 은 ${fill.length}개`)
  const fillOf = new Map(fill.map((name, k) => [inner[k].id, FILL[name]]))
  const outsideIds = new Set(regions.filter((r) => r.outside).map((r) => r.id))
  // 선 밑에도 옆 칸의 채움 색을 깔아 둔다(선 가장자리가 비치지 않게). 선 픽셀에 가장 가까운 칸 색을 몇 번 퍼뜨림
  const under = new Array(N).fill(null)
  for (let i = 0; i < N; i++) if (fillOf.has(lab[i])) under[i] = fillOf.get(lab[i])
  for (let pass = 0; pass < 24; pass++) {
    const add = []
    for (let i = 0; i < N; i++) {
      if (under[i] || dark[i] < 0.5) continue
      for (const j of [i + 1, i - 1, i + W, i - W]) if (j >= 0 && j < N && under[j]) { add.push([i, under[j]]); break }
    }
    for (const [i, c] of add) under[i] = c
  }
  // 2048 그림의 색(미리 곱한 알파): 고정 색 그림과 눈 색 그림
  const fixed = new Float32Array(N * 4), tint = new Float32Array(N * 4)
  let hasTint = false
  for (let i = 0; i < N; i++) {
    const [r, g, b] = rgba.subarray(i * 4, i * 4 + 3), a = rgba[i * 4 + 3] / 255
    if (blue[i]) { // 눈 색 자리: 파랑·하늘색의 밝기를 회색으로
      tint.set([b * a, b * a, b * a, a], i * 4)
      hasTint = true
      continue
    }
    const d = Math.min(1, dark[i])
    let c, alpha
    if (outsideIds.has(lab[i])) {
      c = LINE; alpha = d // 바깥: 선이 섞인 만큼만 보이게
    } else if (under[i]) {
      c = under[i].map((v, j) => v * (1 - d) + LINE[j] * d); alpha = 1 // 채운 칸·그 둘레 선
    } else if (lab[i]) {
      c = [r, g, b]; alpha = a // 칠해 온 칸: 그린 색 그대로
    } else {
      c = LINE; alpha = d // 선
    }
    for (let j = 0; j < 3; j++) fixed[i * 4 + j] = c[j] * alpha
    fixed[i * 4 + 3] = alpha
  }
  // 기본 자리를 가운데로 (스티커의 두 배 크기) 잘라 반으로 줄인다(2×2 평균)
  const [sw, sh] = STICKER[slot]
  const shrink = (src) => {
    const out = Buffer.alloc(sw * sh * 4)
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const X = home.x - sw + x * 2 + dx, Y = home.y - sh + y * 2 + dy
        if (X < 0 || Y < 0 || X >= W || Y >= W) continue
        const i = (Y * W + X) * 4
        r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3]
      }
      if (a / 4 < 0.01) continue
      out.set([Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round((a / 4) * 255)], (y * sw + x) * 4)
    }
    return out
  }
  return { fixed: shrink(fixed), tint: hasTint ? shrink(tint) : null }
}

// 그림이 얼굴 왼쪽 반에 있으면(왼쪽 눈 자리에 그림) 좌우를 뒤집어 오른쪽 눈 자리로 옮긴다
function mirrorIfLeft(rgba) {
  let sum = 0, n = 0
  for (let i = 0; i < W * W; i++) if (rgba[i * 4 + 3] > 30) { sum += i % W; n++ }
  if (!n || sum / n >= W / 2) return
  for (let y = 0; y < W; y++) for (let x = 0; x < W / 2; x++) {
    const a = (y * W + x) * 4, b = (y * W + W - 1 - x) * 4
    for (let c = 0; c < 4; c++) { const t = rgba[a + c]; rgba[a + c] = rgba[b + c]; rgba[b + c] = t }
  }
}

// 그림이 칠해진 범위 (가운데 기준 [왼, 위, 오른, 아래], 스티커 픽셀)
function boxOf(bufs, w, h) {
  let x0 = w, y0 = h, x1 = 0, y1 = 0
  for (const buf of bufs) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (buf[(y * w + x) * 4 + 3] < 8) continue
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1)
  }
  return [x0 - w / 2, y0 - h / 2, x1 - w / 2, y1 - h / 2]
}

// ── 만들기 ─────────────────────────────────────────────────────────
const [dirArg, outArg] = process.argv.slice(2)
const dir = dirArg ?? path.join(ROOT, 'art/face-drawings')
const OUT = outArg ? path.resolve(outArg) : path.join(ROOT, 'public/models/Parts')
const find = (name) => {
  const f = path.join(dir, name)
  if (!fs.existsSync(f)) throw new Error(`${dir} 에 ${name} 가 없음`)
  return f
}
const list = JSON.parse(fs.readFileSync(LIST, 'utf8'))
for (const d of DRAWINGS) {
  const [w, h] = STICKER[d.slot]
  const item = { id: d.id, name: d.name }
  const file = `${d.slot}/${d.id}.png`
  const open = convert(find(file), d.slot, d.fill, d.oldFrame ? OLD_EYE_HOME : HOME[d.slot])
  const bufs = [open.fixed]
  writePng(path.join(OUT, d.slot, `${d.id}.png`), open.fixed, w, h)
  item.file = `/models/Parts/${d.slot}/${d.id}.png`
  if (open.tint) {
    writePng(path.join(OUT, d.slot, `${d.id}-tint.png`), open.tint, w, h)
    item.tint = `/models/Parts/${d.slot}/${d.id}-tint.png`
    bufs.push(open.tint)
  }
  item.box = boxOf(bufs, w, h)
  if (d.oldFrame) item.scale = OLD_EYE_SCALE
  console.log(`${file} (${d.name})`)
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
