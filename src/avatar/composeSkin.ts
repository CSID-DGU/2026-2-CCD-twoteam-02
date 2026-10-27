// 고른 차림으로 캐릭터 그림을 만듭니다 (#56, #293). 브라우저 캔버스를 씁니다.
//
// 스킨: 맨몸(피부색) → 머리카락 → 하의 → 신발 → 상의 순서로 1024×1024 캔버스에 겹쳐 그립니다(avatarLogic.LAYERS).
// - 맨몸: 모델의 모든 면 자리(uvFaces)를 피부색으로 칠합니다. 면 방향마다 조금씩 어둡게(SHADE) 칠해 입체감을 줍니다.
// - 부품: 흰색·회색으로 그린 그림(tint)에 고른 색을 곱해 입히고(곱하기 = 흰색은 고른 색 그대로, 회색은 그만큼 어둡게),
//         색이 고정인 그림(file)을 그 위에 얹습니다.
// 얼굴: 눈썹·눈·입은 스킨에 그리지 않고 얼굴 앞 판에 얹을 투명 그림(faceTexture)을 따로 만듭니다(useFace).
//   부품 그림(스티커)을 고른 위치·크기(avatarLogic.faceLayout)에 놓습니다. 뜬 눈을 감은 눈으로, 다문 입을 벌린 입으로 바꾼 것도 만듭니다.
//
// 같은 차림(아바타 키)은 한 번만 만들어 모든 캐릭터가 같이 씁니다. 꾸미기 창에서 색을 바꿀 때마다 새 그림이 생기므로,
// 오래 안 쓴 것부터 정해진 개수만 남기고 버립니다.
import * as THREE from 'three'
import { FACE_PX, FACE_SLOTS, HOME_LAYOUT, LAYERS, SHADE, SKIN_SIZE, UV_FACES, faceLayout, faceThumbRect, findPart, isFaceSlot, parseAvatarKey, thumbRects } from './avatarLogic'
import type { Avatar, Part, Slot, Spot } from './avatarLogic'
import { drawModelThumb } from './partModel'

const MAX_SKINS = 40
const MAX_FACES = 60 // 얼굴 그림은 차림마다 눈(뜸·감음) × 입(다묾·벌림) 4장까지
const FACE_TEX = 512 // 얼굴 그림 한 변(px). 얼굴 좌표(1024)의 반
const PAD = 2 // 면 가장자리 바깥까지 조금 더 칠함 (경계가 비어 보이지 않게)
const skins = new Map<string, Promise<THREE.Texture>>() // 넣은 순서 = 오래된 순서 (쓸 때마다 뒤로 옮김)
const faces = new Map<string, Promise<THREE.Texture>>()
const images = new Map<string, Promise<HTMLImageElement>>()

function loadImage(url: string) {
  let p = images.get(url)
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`부품 그림을 불러오지 못했습니다: ${url}`))
      img.src = url
    })
    images.set(url, p)
  }
  return p
}
const loadOrNull = (url?: string) => (url ? loadImage(url) : Promise.resolve(null))

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

// 색에 밝기를 곱합니다. '#f6d1a5', 0.9 → 'rgb(...)'
function shaded(color: string, shade: number) {
  const v = [1, 3, 5].map((i) => Math.round((parseInt(color.slice(i, i + 2), 16) * shade) / 255))
  return `rgb(${v[0]}, ${v[1]}, ${v[2]})`
}

// 그림의 (sx, sy, w, h) 부분에 색을 곱해 입힌 캔버스. 그림이 투명한 곳은 투명 그대로
function tinted(img: HTMLImageElement, color: string, sx = 0, sy = 0, w = img.width, h = img.height) {
  const c = canvas(w, h)
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h)
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'destination-in' // 그림이 있던 곳만 남김
  ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h)
  return c
}

// 맨몸: 모든 면 자리를 피부색으로
function drawBody(ctx: CanvasRenderingContext2D, skin: string) {
  for (const faces of Object.values(UV_FACES)) {
    for (const f of faces) {
      ctx.fillStyle = shaded(skin, SHADE[f.dir])
      ctx.fillRect(f.x0 - PAD, f.y0 - PAD, f.x1 - f.x0 + PAD * 2, f.y1 - f.y0 + PAD * 2)
    }
  }
}

// 오래 안 쓴 것부터 버리는 그림 보관함: key 의 그림이 있으면 그것, 없으면 make 로 만들어 넣습니다.
// 아직 쓰는 캐릭터가 있어도 버린 그림(캔버스)은 남아 있어서 다시 올려 그려집니다.
function cached(store: Map<string, Promise<THREE.Texture>>, max: number, key: string, make: () => Promise<THREE.Texture>) {
  let p = store.get(key)
  if (p) {
    store.delete(key) // 방금 쓴 것으로 뒤로 옮김
  } else {
    p = make()
    p.catch(() => store.delete(key)) // 실패하면 다음에 다시 만들어 봅니다
  }
  store.set(key, p)
  while (store.size > max) {
    const [oldKey, old] = store.entries().next().value!
    store.delete(oldKey)
    void old.then((t) => t.dispose(), () => {})
  }
  return p
}

// ── 스킨 ──────────────────────────────────────────────────────────
async function composeSkin(key: string): Promise<THREE.Texture> {
  const avatar = parseAvatarKey(key)
  const layers = await Promise.all(
    LAYERS.map(async ({ slot, color }) => {
      const part = findPart(slot, avatar[slot])!
      const [tint, file] = await Promise.all([loadOrNull(part.tint), loadOrNull(part.file)])
      return { color: color ? avatar[color] : null, tint, file }
    }),
  )
  const c = canvas(SKIN_SIZE, SKIN_SIZE)
  const ctx = c.getContext('2d')!
  drawBody(ctx, avatar.skin)
  for (const l of layers) {
    if (l.tint && l.color) ctx.drawImage(tinted(l.tint, l.color), 0, 0)
    if (l.file) ctx.drawImage(l.file, 0, 0)
  }
  const tex = new THREE.CanvasTexture(c)
  // glTF 모델의 원래 스킨과 같은 방식으로 붙입니다(위아래 뒤집지 않음, 색 공간 sRGB, 그림 반복). 걸러 그리기 설정은 useSkin 이 맞춥니다.
  tex.flipY = false
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

// 아바타 키의 스킨 (만들어 둔 것이 있으면 그것)
export const avatarSkin = (key: string) => cached(skins, MAX_SKINS, key, () => composeSkin(key))

// ── 얼굴 (#293) ───────────────────────────────────────────────────
type Sticker = { tint: HTMLImageElement | null; file: HTMLImageElement | null; color: string | null }
async function loadSticker(slot: Slot, avatar: Avatar): Promise<Sticker> {
  const part = findPart(slot, avatar[slot as keyof Avatar] as string)!
  const color = FACE_SLOTS.find((f) => f.slot === slot)!.color
  const [tint, file] = await Promise.all([loadOrNull(part.tint), loadOrNull(part.file)])
  return { tint, file, color: color ? avatar[color] : null }
}

// 스티커 하나를 얼굴 좌표 at 에 놓습니다(그림 가운데 = at). mirror 면 좌우를 뒤집어(왼쪽 눈·눈썹)
function drawSticker(ctx: CanvasRenderingContext2D, s: Sticker, at: Spot, mirror: boolean) {
  const imgs: CanvasImageSource[] = []
  if (s.tint && s.color) imgs.push(tinted(s.tint, s.color))
  if (s.file) imgs.push(s.file)
  ctx.save()
  ctx.translate(at.x, at.y)
  ctx.scale(mirror ? -at.scale : at.scale, at.scale)
  for (const img of imgs) {
    const { width, height } = img as HTMLCanvasElement
    ctx.drawImage(img, -width / 2, -height / 2)
  }
  ctx.restore()
}

// 차림의 눈썹·두 눈·입을 얼굴 좌표(FACE_PX)로 그립니다. 호출하는 쪽이 ctx 의 배율을 정합니다.
// only: 그 부위만 그림(썸네일), eyesClosed: 뜬 눈 대신 감은 눈, talking: 다문 입 대신 벌린 입
async function drawFace(ctx: CanvasRenderingContext2D, avatar: Avatar, opts: { only?: Slot; eyesClosed?: boolean; talking?: boolean; part?: Part } = {}) {
  const L = faceLayout(avatar)
  const mouthSlot: Slot = opts.talking ? 'mouthOpen' : 'mouth'
  const eyeSlot: Slot = opts.eyesClosed ? 'closedEyes' : 'eyes'
  const slots: Slot[] = opts.only ? [opts.only] : ['brows', eyeSlot, mouthSlot]
  // 썸네일은 고를 부품(part)으로 바꿔 그림
  const a = opts.part && opts.only ? { ...avatar, [opts.only]: opts.part.id } : avatar
  const stickers = await Promise.all(slots.map((slot) => loadSticker(slot, a)))
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  slots.forEach((slot, i) => {
    const s = stickers[i]
    if (slot === 'mouth' || slot === 'mouthOpen') return drawSticker(ctx, s, L.mouth, false)
    const at = slot === 'brows' ? L.brow : L.eye
    drawSticker(ctx, s, at, false)
    drawSticker(ctx, s, { ...at, x: FACE_PX - at.x }, true)
  })
}

async function composeFace(key: string, eyesClosed: boolean, talking: boolean): Promise<THREE.Texture> {
  const c = canvas(FACE_TEX, FACE_TEX)
  const ctx = c.getContext('2d')!
  ctx.scale(FACE_TEX / FACE_PX, FACE_TEX / FACE_PX)
  await drawFace(ctx, parseAvatarKey(key), { eyesClosed, talking })
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4 // 비스듬히 봐도 덜 흐리게
  return tex
}

// 얼굴 판에 얹을 그림: 눈썹·두 눈·입 (투명 바탕). eyesClosed 면 감은 눈, talking 이면 벌린 입
export const faceTexture = (key: string, eyesClosed: boolean, talking: boolean) =>
  cached(faces, MAX_FACES, `${key}#${eyesClosed ? 1 : 0}${talking ? 1 : 0}`, () => composeFace(key, eyesClosed, talking))

// ── 꾸미기 창의 부품 그림 ─────────────────────────────────────────────
// 스킨 부품은 대표 면들을 나란히, 얼굴 부품은 기본 자리에 놓은 얼굴에서 그 둘레만. 지금 차림의 색으로, 맨몸 위에 얹은 모습
const THUMB_GAP = 3 // 면 사이 간격(px, 썸네일 기준)
export async function drawPartThumb(target: HTMLCanvasElement, slot: Slot, part: Part, avatar: Avatar) {
  const color = LAYERS.find((l) => l.slot === slot)?.color ?? null
  if (part.model) return drawModelThumb(target, part, avatar.skin, color ? avatar[color] : '#ffffff') // 입체 부품(머리카락)
  const ctx = target.getContext('2d')!
  // 크게 그린 그림을 작게 줄이므로 부드럽게 줄입니다(건너뛰며 줄이면 가는 선이 끊겨 보임).
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (isFaceSlot(slot)) {
    const r = faceThumbRect(slot)
    const scale = Math.min(target.width / r.w, target.height / r.h)
    const w = r.w * scale, h = r.h * scale, x = (target.width - w) / 2, y = (target.height - h) / 2
    const home = { ...avatar, ...HOME_LAYOUT } // 썸네일은 기본 자리로
    const c = canvas(target.width, target.height)
    const fctx = c.getContext('2d')!
    fctx.fillStyle = shaded(avatar.skin, SHADE.front)
    fctx.fillRect(x, y, w, h)
    fctx.save()
    fctx.beginPath()
    fctx.rect(x, y, w, h)
    fctx.clip()
    fctx.translate(x - r.x * scale, y - r.y * scale)
    fctx.scale(scale, scale)
    await drawFace(fctx, home, { only: slot, part })
    fctx.restore()
    ctx.clearRect(0, 0, target.width, target.height)
    ctx.drawImage(c, 0, 0)
    return
  }
  const rects = thumbRects(slot)
  const [tint, file] = await Promise.all([loadOrNull(part.tint), loadOrNull(part.file)])
  ctx.clearRect(0, 0, target.width, target.height)
  const totalW = rects.reduce((s, r) => s + r.w, 0)
  const maxH = Math.max(...rects.map((r) => r.h))
  const gaps = THUMB_GAP * (rects.length - 1)
  const scale = Math.min((target.width - gaps) / totalW, target.height / maxH)
  let x = (target.width - totalW * scale - gaps) / 2
  for (const r of rects) {
    const w = r.w * scale, h = r.h * scale, y = (target.height - maxH * scale) / 2 // 위를 맞춤
    ctx.fillStyle = shaded(avatar.skin, SHADE.front)
    ctx.fillRect(x, y, w, h)
    if (tint && color) ctx.drawImage(tinted(tint, avatar[color], r.x, r.y, r.w, r.h), x, y, w, h)
    if (file) ctx.drawImage(file, r.x, r.y, r.w, r.h, x, y, w, h)
    x += w + THUMB_GAP
  }
}
