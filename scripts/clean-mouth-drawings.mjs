#!/usr/bin/env node
// 손으로 그린 입 그림을 다듬어 캐릭터 부품으로 넣기 (#56, 입 트래킹 #61)
//
// 김현이 프로크리에이트로 스킨 크기(1024×1024)에 그린 입 그림(제목_없는_아트워크-번호.png)을 받아
// 그린 모양·크기·기울기는 그대로 두고 삐뚤빼뚤한 곳만 다듬는다.
//   1) 검정 선: 4배로 키워 매끄럽게 한 뒤 가운데 줄(뼈대)만 남기고, 모든 입에 같은 굵기(LINE)로 다시 긋는다.
//      흐려서 끊긴 곳은 가까운 선 끝끼리 잇는다(GAP). 속이 꽉 찬 검정(놀란 입)은 선이 아니라 면이라 매끄럽게만 한다.
//   2) 흰색·빨강은 "치아·혀 자리 표시"로 본다. 선으로 막힌 칸에 표시가 조금이라도 있으면 그 칸을 통째로 흰색(치아)·빨강(혀)으로 채운다.
//   3) 벌린 입은 나머지 입 안을 어두운 자주색으로 칠한다. 참고한 만화 입 그림들처럼 치아와 혀가 또렷해진다.
//   4) 그림마다 따로 고르는 다듬기(DRAWINGS 의 옵션)
//      roundOutline: 바깥 테두리를 둥글게 다시 긋고, 안에는 치아 테두리만 남긴다(동그란 입 안에 이가 있는 모양)
//      fangs: 흰 표시 자리마다 위 테두리에서 내려오는 뾰족한 흰 삼각형(송곳니)
//      symmetric: 좌우 대칭
//   5) 입 자리(얼굴 8×8 칸 중 가로 4, 세로 6.5) 가운데로 옮겨 public/models/Parts/mouth·mouthOpen/id.png 로 저장하고
//      src/avatar/parts.json 의 입 목록을 새로 쓴다(여기 없는 id 의 줄은 그대로 둔다).
//      입 둘레(MOUTH_HD)만 4배로 그린 또렷한 그림도 id-hd.png 로 저장한다. 꾸미기 창의 입 그림과 말할 때 덮는 벌린 입이 이것을 쓴다
//      (스킨 그대로 쓰면 입이 가로 45px 남짓이라 크게 보여 줄 때 흐리다).
//
// 쓰는 법: node scripts/make-avatar-parts.mjs 를 먼저 돌린 뒤(면 자리 uvFaces.json 이 필요)
//          node scripts/clean-mouth-drawings.mjs 그림폴더
// 원본 그림은 저장소에 올리지 않는다(김현 컴퓨터의 notes/). 새 라이브러리 없이 Node 기본 기능(zlib)으로 PNG 를 읽고 쓴다.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public/models/Parts')
const LIST = path.join(ROOT, 'src/avatar/parts.json')
const FACES = path.join(ROOT, 'src/avatar/uvFaces.json')
const SIZE = 1024 // 스킨 그림 한 변
const U = 4 // 다듬을 때 키우는 배수 (한 픽셀을 4×4 로 나눠 가장자리를 매끈하게)
const FACE_UNITS = 8 // 머리 앞면(얼굴)을 8×8 칸으로 본다
const MOUTH_CENTER = { x: 4, y: 6.5 } // 입 자리 가운데 (얼굴 칸 단위). 말할 때 덮는 판(avatarLogic.MOUTH_OVERLAY)의 가운데와 맞춤
const MOUTH_HD = { x: 160, y: 208, w: 64, h: 36 } // 또렷한 그림이 담는 스킨 범위(픽셀). avatarLogic.MOUTH_HD 와 같아야 한다

// 기준값 (길이는 모두 스킨 픽셀)
const LINE = 2 // 선 굵기
const DARK_AT = 0.18 // 이만큼 진하면 검정 선으로 본다 (그린 선이 반투명하게 흐린 곳도 잡히게 낮게)
const FILL_AT = 0.15 // 칸 넓이 중 흰색·빨강 표시가 이만큼 넘으면 그 칸 전체를 치아·혀로 칠한다
const SOLID_R = 3.5 // 검정 두께의 절반이 이보다 크면 선이 아니라 꽉 찬 면
const GAP = 5 // 선 끝끼리 이만큼 가까우면 잇는다
const FANG_HALF = 2 // 송곳니 윗변 폭의 절반(최소)
const FANG_LEN = 5 // 송곳니 길이(최소)
const COLORS = { inside: [88, 34, 40], teeth: [255, 255, 255], tongue: [226, 86, 106], black: [31, 31, 36] }

// [그림 번호, 칸, id, 이름, 다듬기 옵션]. 다문 입(mouth)은 평소 얼굴에, 벌린 입(mouthOpen)은 회의실에서 말할 때 그 자리를 덮는다
// 11번(침 흘리는 입)은 넣지 않기로 했다(10/27)
const DRAWINGS = [
  [1, 'mouth', 'smirk', '씩 웃는 입'],
  [3, 'mouth', 'smile', '웃는 입'],
  [6, 'mouth', 'slant', '비스듬한 입'],
  [8, 'mouth', 'flat', '일자 입'],
  [10, 'mouth', 'tail', '삐죽 입'],
  [12, 'mouth', 'kiss', '뽀뽀 입'],
  [14, 'mouth', 'wavy', '물결 입'],
  [2, 'mouthOpen', 'grin', '활짝 웃는 입'],
  [4, 'mouthOpen', 'small-o', '작게 벌린 입'],
  [5, 'mouthOpen', 'wide', '크게 벌린 입'],
  [7, 'mouthOpen', 'teeth', '이 드러낸 입', { roundOutline: true }],
  [9, 'mouthOpen', 'laugh', '웃으며 벌린 입'],
  [13, 'mouthOpen', 'gasp', '놀란 입'],
  [15, 'mouthOpen', 'fangs', '송곳니 입', { fangs: true, symmetric: true }],
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

// ── 그림 다듬기 도구 (w×h 칸의 0~1 값 배열을 다룬다) ─────────────────────
// 가우스 흐리기: 가장자리를 부드럽게 한 뒤 0.5 로 자르면 삐뚤빼뚤한 테두리가 매끄러워진다
function blur(src, w, h, sigma) {
  const rad = Math.ceil(sigma * 3), kernel = []
  let sum = 0
  for (let i = -rad; i <= rad; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma))
    kernel.push(v)
    sum += v
  }
  const pass = (a, horizontal) => {
    const o = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let acc = 0
        for (let i = -rad; i <= rad; i++) {
          const xx = horizontal ? Math.min(w - 1, Math.max(0, x + i)) : x
          const yy = horizontal ? y : Math.min(h - 1, Math.max(0, y + i))
          acc += a[yy * w + xx] * kernel[i + rad]
        }
        o[y * w + x] = acc / sum
      }
    }
    return o
  }
  return pass(pass(src, true), false)
}
// 거리: 칸마다 가장 가까운 "켜진(1) 칸"까지의 곧은 거리 (Felzenszwalb 방식, 가로·세로 두 번)
function distance(mask, w, h) {
  const INF = 1e12, n = Math.max(w, h)
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1)
  const g = new Float64Array(w * h).map((_, i) => (mask[i] ? 0 : INF))
  const line = (len) => {
    let k = 0
    v[0] = 0
    z[0] = -INF
    z[1] = INF
    for (let q = 1; q < len; q++) {
      let s
      for (;;) { // z[0] 이 -INF 라 k 는 0 아래로 내려가지 않는다
        const p = v[k]
        s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p)
        if (s <= z[k]) k--
        else break
      }
      k++
      v[k] = q
      z[k] = s
      z[k + 1] = INF
    }
    k = 0
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++
      d[q] = (q - v[k]) ** 2 + f[v[k]]
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = g[y * w + x]
    line(h)
    for (let y = 0; y < h; y++) g[y * w + x] = d[y]
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x]
    line(w)
    for (let x = 0; x < w; x++) g[y * w + x] = Math.sqrt(d[x])
  }
  return g
}
// 얇게 깎기(Zhang-Suen): 굵은 선의 바깥부터 깎아 가운데 한 줄(뼈대)만 남긴다
function thin(mask, w, h) {
  const a = Uint8Array.from(mask)
  const P = (x, y) => a[y * w + x]
  let changed = true
  while (changed) {
    changed = false
    for (const step of [0, 1]) {
      const del = []
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (!P(x, y)) continue
          const n = [P(x, y - 1), P(x + 1, y - 1), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1), P(x - 1, y + 1), P(x - 1, y), P(x - 1, y - 1)]
          const B = n.reduce((s, q) => s + q, 0)
          if (B < 2 || B > 6) continue
          let A = 0
          for (let k = 0; k < 8; k++) if (!n[k] && n[(k + 1) % 8]) A++
          if (A !== 1) continue
          if (step === 0 ? n[0] * n[2] * n[4] || n[2] * n[4] * n[6] : n[0] * n[2] * n[6] || n[0] * n[4] * n[6]) continue
          del.push(y * w + x)
        }
      }
      for (const i of del) a[i] = 0
      if (del.length) changed = true
    }
  }
  return a
}
// 켜진 칸을 이어진 덩어리끼리 번호 매기기. diagonal 이면 대각선으로 닿아도 이어진 것으로 본다
function label(mask, w, h, diagonal) {
  const lab = new Int32Array(w * h), sizes = [0]
  const steps = diagonal ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]]
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || lab[i]) continue
    const id = sizes.length, stack = [i]
    let count = 0
    lab[i] = id
    while (stack.length) {
      const k = stack.pop(), x = k % w, y = (k / w) | 0
      count++
      for (const [dx, dy] of steps) {
        const nx = x + dx, ny = y + dy, j = ny * w + nx
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && mask[j] && !lab[j]) {
          lab[j] = id
          stack.push(j)
        }
      }
    }
    sizes.push(count)
  }
  return { lab, sizes }
}
// 선이 아닌 칸들을 나누고, 그림 테두리에 닿는 칸(입 바깥)의 번호를 모은다
function regions(line, w, h) {
  const { lab, sizes } = label(line.map((q) => 1 - q), w, h, false)
  const outside = new Set()
  for (let x = 0; x < w; x++) outside.add(lab[x]).add(lab[(h - 1) * w + x])
  for (let y = 0; y < h; y++) outside.add(lab[y * w]).add(lab[y * w + w - 1])
  return { lab, sizes, outside }
}
// 뼈대의 끝점끼리 가까우면 곧은 선으로 잇는다. 같은 짧은 획의 두 끝(뼈대를 따라가도 가까운 것)은 잇지 않는다
function bridgeGaps(skeleton, w, h, gap) {
  const RING = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]
  const around = (i) => {
    const x = i % w, y = (i / w) | 0
    return RING.map(([dx, dy]) => (x + dx >= 0 && y + dy >= 0 && x + dx < w && y + dy < h ? (y + dy) * w + x + dx : -1))
  }
  // 끝점: 둘레 8칸을 한 바퀴 돌 때 빈칸→선 바뀜이 한 번뿐인 점 (계단 모양 끝도 잡힘)
  const isEnd = (i) => {
    const v = around(i).map((j) => (j >= 0 ? skeleton[j] : 0))
    let turns = 0
    for (let k = 0; k < 8; k++) if (!v[k] && v[(k + 1) % 8]) turns++
    return turns === 1 && v.reduce((s, q) => s + q, 0) <= 3
  }
  const reach = (from) => { // 뼈대를 따라 gap×3 걸음 안에 닿는 점들
    const seen = new Map([[from, 0]]), queue = [from]
    while (queue.length) {
      const k = queue.shift(), d = seen.get(k)
      if (d >= gap * 3) continue
      for (const j of around(k)) if (j >= 0 && skeleton[j] && !seen.has(j)) { seen.set(j, d + 1); queue.push(j) }
    }
    return seen
  }
  const ends = []
  for (let i = 0; i < w * h; i++) if (skeleton[i] && isEnd(i)) ends.push(i)
  const pairs = []
  for (const a of ends) for (const b of ends) {
    if (a >= b) continue
    const d = Math.hypot((a % w) - (b % w), ((a / w) | 0) - ((b / w) | 0))
    if (d <= gap) pairs.push([d, a, b])
  }
  pairs.sort((p, q) => p[0] - q[0])
  const used = new Set()
  for (const [, a, b] of pairs) {
    if (used.has(a) || used.has(b) || reach(a).has(b)) continue
    used.add(a).add(b)
    const ax = a % w, ay = (a / w) | 0, bx = b % w, by = (b / w) | 0, n = Math.ceil(Math.hypot(bx - ax, by - ay)) * 2
    for (let t = 0; t <= n; t++) skeleton[Math.round(ay + ((by - ay) * t) / n) * w + Math.round(ax + ((bx - ax) * t) / n)] = 1
  }
}
// 켜진 칸들을 모두 감싸는 볼록한 모양(고무줄을 두른 모양)을 채운 그림
function convexHull(mask, w, h) {
  const pts = []
  for (let y = 0; y < h; y++) {
    let first = -1, last = -1
    for (let x = 0; x < w; x++) if (mask[y * w + x]) { if (first < 0) first = x; last = x }
    if (first >= 0) pts.push([first, y], [last, y])
  }
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1])
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (list) => {
    const hull = []
    for (const p of list) {
      while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) hull.pop()
      hull.push(p)
    }
    return hull.slice(0, -1)
  }
  const poly = [...half(pts), ...half([...pts].reverse())]
  return new Float32Array(w * h).map((_, i) => {
    const p = [i % w, (i / w) | 0]
    return poly.every((a, k) => cross(a, poly[(k + 1) % poly.length], p) >= 0) ? 1 : 0
  })
}
// 좌우를 겹쳐 반 넘게 칠한 곳만 남김 → 좌우 대칭
const mirror = (m, w, h) =>
  m.map((q, i) => ((q + m[(((i / w) | 0) + 1) * w - 1 - (i % w)]) / 2 >= 0.5 ? 1 : 0))
const on = (m, cut) => m.map((q) => (q >= cut ? 1 : 0))

// ── 그림 한 장 다듬기 ─────────────────────────────────────────────────
// png: 원본, open: 벌린 입이면 입 안을 어둡게, opts: 다듬기 옵션. 돌려주는 것: 입 자리로 옮긴 스킨 크기 RGBA
function clean(png, open, opts, center) {
  // 그림이 있는 범위(조금 여유)만 다룬다
  let x0 = SIZE, y0 = SIZE, x1 = -1, y1 = -1
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (png.rgba[(y * SIZE + x) * 4 + 3] <= 20) continue
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
  }
  if (x1 < 0) throw new Error('빈 그림')
  x0 -= 6; y0 -= 6; x1 += 6; y1 += 6
  const w0 = x1 - x0 + 1, h0 = y1 - y0 + 1, w = w0 * U, h = h0 * U

  // 1) 원래 크기에서 픽셀마다 검정 진하기와 치아(흰색)·혀(빨강) 표시를 나눈다. 흰색과 검정 사이 회색은 진하기로만 센다
  const dark0 = new Float32Array(w0 * h0), teeth0 = new Float32Array(w0 * h0), tongue0 = new Float32Array(w0 * h0)
  for (let y = 0; y < h0; y++) for (let x = 0; x < w0; x++) {
    const i = ((y + y0) * SIZE + x + x0) * 4, j = y * w0 + x
    const [r, g, b] = png.rgba.subarray(i, i + 3), a = png.rgba[i + 3] / 255
    if (a < 0.1) continue
    const chroma = Math.max(r, g, b) - Math.min(r, g, b), lum = 0.3 * r + 0.59 * g + 0.11 * b
    if (chroma > 80) { // 색이 있는 표시: 빨강만 혀로 쓴다
      if (r > g && r > b) tongue0[j] = a
      continue
    }
    dark0[j] = a * (1 - lum / 255)
    if (lum > 170) teeth0[j] = a * (lum / 255)
  }
  // U 배로 키우기 (이웃 픽셀 사이를 부드럽게 이어서)
  const up = (src) => new Float32Array(w * h).map((_, i) => {
    const X = Math.min(w0 - 1.001, Math.max(0, ((i % w) + 0.5) / U - 0.5)), Y = Math.min(h0 - 1.001, Math.max(0, (((i / w) | 0) + 0.5) / U - 0.5))
    const xi = Math.floor(X), yi = Math.floor(Y), fx = X - xi, fy = Y - yi, k = yi * w0 + xi
    return src[k] * (1 - fx) * (1 - fy) + src[k + 1] * fx * (1 - fy) + src[k + w0] * (1 - fx) * fy + src[k + w0 + 1] * fx * fy
  })
  const teethMark = up(teeth0), tongueMark = up(tongue0)

  // 2) 검정 선: 매끄럽게 → 덩어리마다 선인지 면인지 → 선은 뼈대만 남겨 끊긴 곳을 잇고 같은 굵기로 다시 긋기
  const black = on(blur(up(dark0), w, h, 0.6 * U), DARK_AT)
  const depth = distance(black.map((q) => 1 - q), w, h) // 검정 안쪽에서 바깥까지 거리 = 두께의 절반
  const blobs = label(black, w, h, true), solid = new Set(), deepest = new Float32Array(blobs.sizes.length)
  for (let i = 0; i < w * h; i++) if (blobs.lab[i]) deepest[blobs.lab[i]] = Math.max(deepest[blobs.lab[i]], depth[i])
  deepest.forEach((d, id) => d > SOLID_R * U && solid.add(id))
  const skeleton = thin(black.map((q, i) => (q && !solid.has(blobs.lab[i]) ? 1 : 0)), w, h)
  bridgeGaps(skeleton, w, h, GAP * U)
  const fromSkeleton = distance(skeleton, w, h)
  const solidSmooth = on(blur(black.map((q, i) => (q && solid.has(blobs.lab[i]) ? 1 : 0)), w, h, 1.2 * U), 0.5)
  // 흰 표시 한가운데는 선을 올리지 않는다(작은 치아가 선에 묻히지 않게)
  const teethCore = on(blur(teethMark, w, h, 0.5 * U), 0.15)
  let line = new Float32Array(w * h).map((_, i) => (!teethCore[i] && (fromSkeleton[i] <= (LINE * U) / 2 || solidSmooth[i]) ? 1 : 0))

  // 3) 선으로 막힌 칸마다 표시가 FILL_AT 넘게 있으면 그 칸 전체를 치아·혀로
  let { lab, sizes, outside } = regions(line, w, h)
  const fillMarked = (mark) => {
    const amount = new Float32Array(sizes.length)
    for (let i = 0; i < w * h; i++) amount[lab[i]] += mark[i]
    return new Float32Array(w * h).map((_, i) => {
      const id = lab[i]
      return id && !line[i] && !outside.has(id) && amount[id] / sizes[id] > FILL_AT ? 1 : 0
    })
  }
  let teeth = fillMarked(teethMark)
  const tongue = fillMarked(tongueMark)
  const shape = line.map((q, i) => (q || !outside.has(lab[i]) ? 1 : 0)) // 입 전체 모양(선 + 막힌 칸)

  // 4) 그림마다 고른 다듬기
  if (opts.roundOutline) {
    // 입 전체 모양을 고무줄로 두른 듯 볼록하게, 모서리를 둥글게 → 그 가장자리 안쪽으로 선 한 줄
    const round = on(blur(convexHull(shape, w, h), w, h, 1.5 * U), 0.5)
    const fromOut = distance(round.map((q) => 1 - q), w, h)
    // 치아를 바깥 테두리 쪽으로만 넓혀 테두리에 닿게 하고(위아래 치아 사이는 그대로) 매끄럽게
    const toTeeth = distance(teeth, w, h)
    teeth = on(blur(toTeeth.map((d, i) => (round[i] && (d === 0 || (d <= 1.5 * LINE * U && fromOut[i] <= 2 * LINE * U)) ? 1 : 0)), w, h, 1.2 * U), 0.5)
      .map((q, i) => q * round[i])
    // 안쪽 선은 치아 테두리만 남긴다
    const fromTeeth = distance(teeth, w, h), inTeeth = distance(teeth.map((q) => 1 - q), w, h)
    line = line.map((_, i) => (round[i] && (fromOut[i] <= LINE * U || (teeth[i] ? inTeeth[i] : fromTeeth[i]) <= (LINE * U) / 2) ? 1 : 0))
    teeth = teeth.map((q, i) => (q && !line[i] ? 1 : 0))
  }
  if (opts.fangs) {
    // 바깥 테두리만 같은 굵기로 다시 긋고(옛 송곳니 테두리는 지움), 흰 표시 덩어리마다 위 테두리에서 내려오는 뾰족한 삼각형
    const fromOut = distance(shape.map((q) => 1 - q), w, h)
    line = shape.map((q, i) => (q && fromOut[i] <= LINE * U ? 1 : 0))
    const marks = label(teeth, w, h, true), fangs = new Float32Array(w * h)
    const boxes = marks.sizes.map(() => [w, h, -1, -1])
    for (let i = 0; i < w * h; i++) {
      const id = marks.lab[i]
      if (!id || marks.sizes[id] < 4 * U * U) continue // 아주 작은 점은 뺀다
      const b = boxes[id], x = i % w, y = (i / w) | 0
      b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y)
    }
    for (const [bx0, by0, bx1, by1] of boxes) {
      if (bx1 < 0) continue
      const cx = (bx0 + bx1) / 2, half = Math.max((bx1 - bx0 + 1) / 2, FANG_HALF * U)
      let top = by0
      while (top > 0 && !line[top * w + Math.round(cx)]) top-- // 위 테두리 안쪽 끝에서 시작
      const bottom = Math.max(by1, top + FANG_LEN * U)
      for (let y = top; y <= bottom; y++) for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
        const t = (y - top) / (bottom - top)
        if (x >= 0 && x < w && y < h && Math.abs(x - cx) <= half * (1 - t) && shape[y * w + x]) fangs[y * w + x] = 1
      }
    }
    teeth = fangs.map((q, i) => (q && !line[i] ? 1 : 0))
  }

  // 5) 벌린 입: 선으로 막힌 칸 중 치아·혀가 아닌 곳 = 입 안 → 어두운 자주색
  let inside = new Float32Array(w * h)
  if (open) {
    ;({ lab, outside } = regions(line, w, h))
    inside = inside.map((_, i) => (lab[i] && !outside.has(lab[i]) && !teeth[i] && !tongue[i] ? 1 : 0))
  }
  if (opts.symmetric) {
    line = mirror(line, w, h)
    teeth = mirror(teeth, w, h)
    inside = mirror(inside, w, h)
  }

  // 6) 칠하기(입 안 → 치아 → 혀 → 선 순서로 위에 얹음). 그림 가운데를 입 자리 가운데로 옮긴다
  // cover(m, k): 칠 하나가 덮는 정도(0~1). 겹친 순서대로 섞어 한 픽셀의 색을 만든다
  const blend = (layers, cover) => {
    let r = 0, g = 0, b = 0, a = 0
    for (const [m, c] of layers) {
      const k = cover(m)
      if (!k) continue
      r = c[0] * k + r * (1 - k)
      g = c[1] * k + g * (1 - k)
      b = c[2] * k + b * (1 - k)
      a = k + a * (1 - k)
    }
    return a <= 0.01 ? null : [Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(a * 255)]
  }
  const order = [[inside, COLORS.inside], [teeth, COLORS.teeth], [tongue, COLORS.tongue], [line, COLORS.black]]
  const dx = Math.round(center.x - (x0 + x1) / 2), dy = Math.round(center.y - (y0 + y1) / 2)
  // 스킨 크기: U×U 칸을 한 픽셀로 줄인다
  const skin = Buffer.alloc(SIZE * SIZE * 4)
  for (let y = 0; y < h0; y++) for (let x = 0; x < w0; x++) {
    const px = blend(order, (m) => {
      let sum = 0
      for (let sy = 0; sy < U; sy++) for (let sx = 0; sx < U; sx++) sum += m[(y * U + sy) * w + x * U + sx]
      return sum / (U * U)
    })
    if (px) skin.set(px, ((y + y0 + dy) * SIZE + x + x0 + dx) * 4)
  }
  // 또렷한 그림: U 배 크기 그대로, 가장자리만 살짝 흐려 계단을 없앤다
  const soft = order.map(([m, c]) => [blur(m, w, h, 0.6), c])
  const hdW = MOUTH_HD.w * U, hdH = MOUTH_HD.h * U, hd = Buffer.alloc(hdW * hdH * 4)
  const ox = (x0 + dx - MOUTH_HD.x) * U, oy = (y0 + dy - MOUTH_HD.y) * U // 다듬은 그림의 (0, 0) 이 또렷한 그림의 어디인지
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x + ox, Y = y + oy
    if (X < 0 || Y < 0 || X >= hdW || Y >= hdH) continue
    const px = blend(soft, (m) => m[y * w + x])
    if (px) hd.set(px, (Y * hdW + X) * 4)
  }
  return { skin, hd }
}

// ── 만들기 ─────────────────────────────────────────────────────────
const dir = process.argv[2]
if (!dir) {
  console.error('쓰는 법: node scripts/clean-mouth-drawings.mjs 그림폴더')
  process.exit(1)
}
// 그림 번호 → 파일. macOS 파일 이름은 한글이 풀어 쓴 형태(NFD)라 NFC 로 맞춰 비교한다
const files = new Map()
for (const name of fs.readdirSync(dir)) {
  const m = name.normalize('NFC').match(/^제목_없는_아트워크-(\d+)\.png$/)
  if (m) files.set(Number(m[1]), path.join(dir, name))
}
const head = JSON.parse(fs.readFileSync(FACES, 'utf8')).head.find((f) => f.dir === 'front')
const cell = (head.x1 - head.x0) / FACE_UNITS
const center = { x: head.x0 + MOUTH_CENTER.x * cell, y: head.y0 + MOUTH_CENTER.y * cell }

const list = JSON.parse(fs.readFileSync(LIST, 'utf8'))
const made = { mouth: [], mouthOpen: [] }
for (const [n, slot, id, name, opts = {}] of DRAWINGS) {
  const file = files.get(n)
  if (!file) throw new Error(`${dir} 에 제목_없는_아트워크-${n}.png 가 없음`)
  const { skin, hd } = clean(readPng(file), slot === 'mouthOpen', opts, center)
  writePng(path.join(OUT, slot, `${id}.png`), skin)
  writePng(path.join(OUT, slot, `${id}-hd.png`), hd, MOUTH_HD.w * U, MOUTH_HD.h * U)
  made[slot].push({ id, name, file: `/models/Parts/${slot}/${id}.png`, hd: `/models/Parts/${slot}/${id}-hd.png` })
  console.log(`${n}번 → ${slot}/${id} (${name})`)
}
// 입 목록: 여기서 만든 줄을 앞에, 팀이 따로 추가한 줄(그 밖의 id)은 뒤에 그대로
for (const slot of Object.keys(made)) {
  const ids = new Set(made[slot].map((item) => item.id))
  list[slot] = [...made[slot], ...(list[slot] ?? []).filter((item) => !ids.has(item.id))]
}
fs.writeFileSync(LIST, JSON.stringify(list, null, 2) + '\n')
console.log(`목록 ${path.relative(ROOT, LIST)}`)
