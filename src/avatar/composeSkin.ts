// 고른 차림으로 캐릭터 스킨 한 장을 만듭니다 (#56). 브라우저 캔버스를 씁니다.
//
// 맨몸(피부색) → 눈 → 입 → 눈썹 → 머리카락 → 하의 → 신발 → 상의 순서로 1024×1024 캔버스에 겹쳐 그립니다(avatarLogic.LAYERS).
// - 맨몸: 모델의 모든 면 자리(uvFaces)를 피부색으로 칠합니다. 면 방향마다 조금씩 어둡게(SHADE) 칠해 입체감을 줍니다.
// - 부품: 흰색·회색으로 그린 그림(tint)에 고른 색을 곱해 입히고(곱하기 = 흰색은 고른 색 그대로, 회색은 그만큼 어둡게),
//         색이 고정인 그림(file)을 그 위에 얹습니다.
// - 눈 감은 스킨: 눈만 감은 눈 그림(closed)으로 바꿔 한 장 더 만듭니다(눈 깜빡임).
//
// 같은 차림(아바타 키)은 한 번만 만들어 모든 캐릭터가 같이 씁니다. 꾸미기 창에서 색을 바꿀 때마다 새 스킨이 생기므로,
// 오래 안 쓴 것부터 MAX_SKINS 개만 남기고 버립니다.
import * as THREE from 'three'
import { LAYERS, SHADE, SKIN_SIZE, UV_FACES, findPart, parseAvatarKey, thumbRects } from './avatarLogic'
import type { Avatar, Part, Slot } from './avatarLogic'

export type AvatarSkin = { open: THREE.Texture; closed: THREE.Texture | null }

const MAX_SKINS = 40
const PAD = 2 // 면 가장자리 바깥까지 조금 더 칠함 (경계가 비어 보이지 않게)
const skins = new Map<string, Promise<AvatarSkin>>() // 넣은 순서 = 오래된 순서 (쓸 때마다 뒤로 옮김)
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
function tinted(img: CanvasImageSource, color: string, sx = 0, sy = 0, w = SKIN_SIZE, h = SKIN_SIZE) {
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

type Loaded = { part: Part; color: string | null; tint: HTMLImageElement | null; file: HTMLImageElement | null; closed: HTMLImageElement | null }

async function loadLayers(avatar: Avatar): Promise<Loaded[]> {
  return Promise.all(
    LAYERS.map(async ({ slot, color }) => {
      const part = findPart(slot, avatar[slot])!
      const [tint, file, closed] = await Promise.all(
        [part.tint, part.file, part.closed].map((url) => (url ? loadImage(url) : Promise.resolve(null))),
      )
      return { part, color: color ? avatar[color] : null, tint, file, closed }
    }),
  )
}

function texture(avatar: Avatar, layers: Loaded[], eyesClosed: boolean) {
  const c = canvas(SKIN_SIZE, SKIN_SIZE)
  const ctx = c.getContext('2d')!
  drawBody(ctx, avatar.skin)
  for (const [i, l] of layers.entries()) {
    if (eyesClosed && LAYERS[i].slot === 'eyes') {
      if (l.closed) ctx.drawImage(l.closed, 0, 0)
      continue
    }
    if (l.tint && l.color) ctx.drawImage(tinted(l.tint, l.color), 0, 0)
    if (l.file) ctx.drawImage(l.file, 0, 0)
  }
  const tex = new THREE.CanvasTexture(c)
  // glTF 모델의 원래 스킨과 같은 방식으로 붙입니다(위아래 뒤집지 않음, 색 공간 sRGB, 그림 반복). 걸러 그리기 설정은 useEyeSkin 이 맞춥니다.
  tex.flipY = false
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

async function compose(key: string): Promise<AvatarSkin> {
  const avatar = parseAvatarKey(key)
  const layers = await loadLayers(avatar)
  const eyes = layers[LAYERS.findIndex((l) => l.slot === 'eyes')]
  return { open: texture(avatar, layers, false), closed: eyes?.closed ? texture(avatar, layers, true) : null }
}

// 아바타 키의 스킨 (만들어 둔 것이 있으면 그것)
export function avatarSkin(key: string): Promise<AvatarSkin> {
  let p = skins.get(key)
  if (p) {
    skins.delete(key) // 방금 쓴 것으로 뒤로 옮김
  } else {
    p = compose(key)
    p.catch(() => skins.delete(key)) // 실패하면 다음에 다시 만들어 봅니다
  }
  skins.set(key, p)
  // 너무 많으면 오래 안 쓴 것부터 버립니다. 아직 쓰는 캐릭터가 있어도 그림(캔버스)은 남아 있어서 다시 올려 그려집니다.
  while (skins.size > MAX_SKINS) {
    const [oldKey, old] = skins.entries().next().value!
    skins.delete(oldKey)
    void old.then((s) => {
      s.open.dispose()
      s.closed?.dispose()
    }, () => {})
  }
  return p
}

// 꾸미기 창의 부품 그림: 그 부위의 대표 면들을 나란히, 지금 차림의 색으로 그립니다(맨몸 위에 얹은 모습).
const THUMB_GAP = 3 // 면 사이 간격(px, 썸네일 기준)
export async function drawPartThumb(target: HTMLCanvasElement, slot: Slot, part: Part, avatar: Avatar) {
  const rects = thumbRects(slot)
  const color = LAYERS.find((l) => l.slot === slot)!.color
  const [tint, file] = await Promise.all([part.tint, part.file].map((url) => (url ? loadImage(url) : Promise.resolve(null))))
  const ctx = target.getContext('2d')!
  ctx.clearRect(0, 0, target.width, target.height)
  ctx.imageSmoothingEnabled = false
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
