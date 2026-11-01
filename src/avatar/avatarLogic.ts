// 캐릭터 꾸미기 계산 (#56). React·브라우저와 무관한 순수 로직입니다.
//
// 캐릭터 = 맨몸(피부색) + 뜬 눈(모양·색) + 감은 눈 + 눈썹 + 다문 입 + 벌린 입 + 머리(모양·색) + 상의(모양·색) + 하의(모양·색) + 신발(모양·색)
//          + 눈·입의 위치와 크기(#293)
// 맨몸·머리·옷·신발은 스킨 한 장에 겹쳐 그리고(composeSkin), 눈·눈썹·입은 얼굴 앞에 붙인 판에 스티커처럼 얹습니다(useFace).
// 회의실에서 말할 때(입 트래킹 #61)는 그 판의 다문 입이 벌린 입으로, 눈을 감으면(깜빡임) 뜬 눈이 감은 눈으로 바뀝니다.
// 부품 목록은 parts.json, 모델의 면 자리는 uvFaces.json (둘 다 scripts/make-avatar-parts.mjs 가 만듦)
// DB(profiles.avatar)에는 아래 Avatar 그대로 저장합니다(0024). 예전 {model: 'a'} 는 새 기본 차림으로 봅니다.
//
// 화면 부품들(Player 등)은 캐릭터를 "아바타 키" 글자 하나로 주고받습니다(avatarKey). 같은 키면 같은 스킨을 같이 씁니다.
import parts from './parts.json'
import uvFaces from './uvFaces.json'

export type Slot = 'eyes' | 'closedEyes' | 'brows' | 'mouth' | 'mouthOpen' | 'hair' | 'top' | 'bottom' | 'shoes'
// tint: 고른 색을 입힐 그림(흰색·회색), file: 색 고정 그림. "없음" 부품은 둘 다 없음
// 얼굴 부품(FACE_SLOTS)의 그림은 스티커: 얼굴 한 변 = FACE_PX 크기, 그림 가운데 = 기본 자리. 눈은 오른쪽 눈 하나만 그림
// box: 스티커에서 실제로 칠해진 범위(가운데 기준 [왼, 위, 오른, 아래], px). 눈과 입이 겹치지 않게 막을 때 씀
// model: 머리에 붙이는 입체 부품(머리카락, #296)의 3D 모델 파일(.gltf·.glb). Blockbench 로 머리 뼈 좌표(가로 -4~4, 세로 0~8,
//        얼굴 쪽 +z)에 맞춰 만들어 내보낸 것(1칸 = 1/16). modelScale: 붙일 때 키우는 배수(기본 16, 다른 단위로 만든 모델만 적음)
// hidden: 꾸미기 창 목록과 무작위 고르기에서 뺀 부품. 이미 고른 사람의 캐릭터에는 그대로 보임
// scale: 얼굴 부품을 놓을 때 그린 크기보다 더 키우는 배수(기본 1). 예전 그리기 틀에 그린 눈은 1.3 (예전 EYE_SCALE 과 같은 모습)
export type Part = {
  id: string
  name: string
  tint?: string
  file?: string
  box?: [number, number, number, number]
  model?: string
  modelScale?: number
  hidden?: boolean
  scale?: number
}
// 눈·눈썹·입 위치와 크기(#293). 모두 정수 단계. 눈 간격은 +가 넓게, 높이는 +가 위로, 크기는 +가 크게. 눈썹 간격은 눈을 따라감
export type LayoutField = 'eyeX' | 'eyeY' | 'eyeSize' | 'browY' | 'browSize' | 'mouthY' | 'mouthSize'
export type Avatar = {
  skin: string // 색은 모두 '#rrggbb'
  eyes: string // 뜬 눈
  closedEyes: string // 감은 눈 (깜빡일 때)
  eyeColor: string
  brows: string
  mouth: string // 다문 입
  mouthOpen: string // 벌린 입 (말할 때)
  hair: string
  hairColor: string
  top: string
  topColor: string
  bottom: string
  bottomColor: string
  shoes: string
  shoesColor: string
} & Record<LayoutField, number>
export type Face = { dir: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'; x0: number; y0: number; x1: number; y1: number }

export const PARTS = parts as Record<Slot, Part[]>
export const UV_FACES = uvFaces as Record<string, Face[]>
export const SKIN_SIZE = 1024 // 스킨 그림 한 변

// 스킨에 겹치는 순서와 각 부위에 입힐 색
export const LAYERS: { slot: Slot; color: ColorField | null }[] = [
  { slot: 'hair', color: 'hairColor' },
  { slot: 'bottom', color: 'bottomColor' },
  { slot: 'shoes', color: 'shoesColor' },
  { slot: 'top', color: 'topColor' },
]

// 얼굴 판에 얹는 부위와 입힐 색. 눈썹은 머리 색을 따릅니다.
export const FACE_SLOTS: { slot: Slot; color: ColorField | null }[] = [
  { slot: 'brows', color: 'hairColor' },
  { slot: 'eyes', color: 'eyeColor' },
  { slot: 'closedEyes', color: 'eyeColor' },
  { slot: 'mouth', color: null },
  { slot: 'mouthOpen', color: null },
]
type ColorField = 'skin' | 'eyeColor' | 'hairColor' | 'topColor' | 'bottomColor' | 'shoesColor'
export const isFaceSlot = (slot: Slot) => FACE_SLOTS.some((f) => f.slot === slot)

// 면 방향별 밝기(0~255). 맨몸과 기본 부품이 같은 값을 써서 면마다 조금씩 어두워져 입체감이 생깁니다. (스크립트의 SHADE 와 같음)
export const SHADE: Record<Face['dir'], number> = { top: 255, front: 245, left: 228, right: 228, back: 215, bottom: 200 }

export const DEFAULT_AVATAR: Avatar = {
  skin: '#f6d1a5',
  eyes: 'sparkle', // 초롱초롱 눈 (김현 그림, 10/27)
  closedEyes: 'new-1', // 새 감은 눈 1 (11/01 김현 그림. 예전 감은 눈은 지움)
  eyeColor: '#5b3a1e',
  brows: 'straight',
  mouth: 'soft-smile', // 살짝 웃는 입 (김현 그림, 10/27)
  mouthOpen: 'big-smile', // 활짝 벌린 입
  hair: 'none', // 머리카락 없음 (10/30 김현: 기본 머리 5종·단발·단색 버전을 지우고 텍스처 머리만 남김)
  hairColor: '#3b2a20',
  top: 'tshirt',
  topColor: '#4f86f7',
  bottom: 'pants',
  bottomColor: '#374151',
  shoes: 'sneakers',
  shoesColor: '#ef4444',
  eyeX: 0,
  eyeY: 0,
  eyeSize: 0,
  browY: 0,
  browSize: 0,
  mouthY: 0,
  mouthSize: 0,
}

// 꾸미기 창에서 바로 고를 수 있는 피부색 몇 가지 (색상표로 아무 색이나 고를 수도 있음)
export const SKIN_PRESETS = ['#f6d1a5', '#e8b98a', '#cc8860', '#a8694a', '#8d5641', '#5e3a2c']

const FIELDS = Object.keys(DEFAULT_AVATAR) as (keyof Avatar)[]
const COLOR = /^#[0-9a-f]{6}$/ // DB 제약과 같음
const ID = /^[a-z0-9-]{1,32}$/
const PART_FIELDS: Partial<Record<keyof Avatar, Slot>> = {
  eyes: 'eyes', closedEyes: 'closedEyes', brows: 'brows', mouth: 'mouth', mouthOpen: 'mouthOpen', hair: 'hair', top: 'top', bottom: 'bottom', shoes: 'shoes',
}
const isLayoutField = (key: string): key is LayoutField => key in LAYOUT

export const findPart = (slot: Slot, id: string) => PARTS[slot].find((p) => p.id === id)
// 꾸미기 창에서 고를 수 있는 부품 (화면에서 내린 hidden 부품은 뺌)
export const pickableParts = (slot: Slot) => PARTS[slot].filter((p) => !p.hidden)
export const isColor = (v: unknown): v is string => typeof v === 'string' && COLOR.test(v)
export const isId = (v: unknown): v is string => typeof v === 'string' && ID.test(v)

// DB 의 avatar 값 → 차림. 칸마다 모르는 부품·잘못된 색·범위 밖 숫자면 기본값. 예전 {model} 이나 빈 값은 기본 차림
// 위치·크기가 없던 예전 값은 기본 자리(0). 고른 부품으로는 눈과 입이 겹치면 겹치지 않게 맞춥니다(fitLayout).
export function avatarFromDb(raw: unknown): Avatar {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_AVATAR }
  const v = raw as Record<string, unknown>
  const out: Record<string, unknown> = { ...DEFAULT_AVATAR }
  for (const key of FIELDS) {
    const value = v[key]
    if (isLayoutField(key)) {
      if (Number.isInteger(value) && (value as number) >= LAYOUT[key].min && (value as number) <= LAYOUT[key].max) out[key] = value
      continue
    }
    const slot = PART_FIELDS[key]
    if (slot ? typeof value === 'string' && findPart(slot, value) : isColor(value)) out[key] = value
  }
  return fitLayout(out as Avatar)
}

// 차림 → DB 에 넣을 값 (칸 순서대로)
export const avatarToDb = (a: Avatar) => Object.fromEntries(FIELDS.map((k) => [k, a[k]])) as Avatar

// 차림 ↔ 아바타 키. 칸 값을 정해진 순서로 이어 붙입니다. 예전처럼 글자 하나("a")가 오면 기본 차림
export const avatarKey = (a: Avatar) => FIELDS.map((k) => a[k]).join('|')
export function parseAvatarKey(key: string): Avatar {
  const values = key.split('|')
  if (values.length !== FIELDS.length) return { ...DEFAULT_AVATAR }
  return avatarFromDb(Object.fromEntries(FIELDS.map((k, i) => [k, isLayoutField(k) ? Number(values[i]) : values[i]])))
}

// 칸마다 무작위로 고른 차림 (꾸미기 창의 🎲)
export function randomAvatar(random: () => number = Math.random): Avatar {
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)]
  const color = () => '#' + Array.from({ length: 3 }, () => Math.floor(random() * 256).toString(16).padStart(2, '0')).join('')
  return {
    skin: pick(SKIN_PRESETS),
    eyes: pick(pickableParts('eyes')).id,
    closedEyes: pick(pickableParts('closedEyes')).id,
    eyeColor: color(),
    brows: pick(pickableParts('brows')).id,
    mouth: pick(pickableParts('mouth')).id,
    mouthOpen: pick(pickableParts('mouthOpen')).id,
    hair: pick(pickableParts('hair')).id,
    hairColor: color(),
    top: pick(pickableParts('top')).id,
    topColor: color(),
    bottom: pick(pickableParts('bottom')).id,
    bottomColor: color(),
    shoes: pick(pickableParts('shoes')).id,
    shoesColor: color(),
    ...HOME_LAYOUT, // 위치·크기는 기본 자리 그대로
  }
}

// ── 얼굴 배치 (#293) ─────────────────────────────────────────────
// 얼굴 좌표: 머리 앞면 한 변 = FACE_PX(얼굴 8×8 칸 중 1칸 = 128), 왼쪽 위가 (0, 0). 스티커 그림도 이 크기로 그린다.
export const FACE_PX = 1024
export const EYE_HOME = { x: 736, y: 480 } // 오른쪽(화면 오른쪽) 눈의 기본 가운데. 왼쪽 눈은 얼굴 가운데를 기준으로 좌우 대칭 (새 그리기 틀: 2048 기준 높이 960)
export const MOUTH_HOME = { x: 512, y: 832 } // 입의 기본 가운데
export const EYE_SCALE = 1 // 눈 그림을 그린 크기 그대로 놓음 (새 그리기 틀은 눈 틀을 512 로 키움). 크기 막대는 이 크기를 기준으로
export const BROW_HOME_Y = 280 // 눈썹 가운데의 기본 높이 (새 그리기 틀: 2048 기준 560). 눈썹 가로 자리는 눈을 따라감
export const LAYOUT_STEP = 16 // 위치 한 단계(얼굴 좌표 px). 2048 얼굴 지도로는 32px
export const SIZE_STEP = 0.05 // 크기 한 단계 (5%)
// 단계 범위. 김현이 정한 얼굴 지도(2048): 눈 위 320·아래 192·좌우 192, 입 위 192·아래 128 (단계 수는 나중에 다시 정함)
// 크기는 80~120%, 눈만 150%까지(10/27 김현: 눈을 더 크게)
export const LAYOUT: Record<LayoutField, { min: number; max: number }> = {
  eyeX: { min: -6, max: 6 },
  eyeY: { min: -6, max: 10 },
  eyeSize: { min: -4, max: 10 },
  browY: { min: -4, max: 8 },
  browSize: { min: -4, max: 6 },
  mouthY: { min: -4, max: 6 },
  mouthSize: { min: -4, max: 4 },
}
// 모든 칸이 기본 자리(0)
export const HOME_LAYOUT = Object.fromEntries(Object.keys(LAYOUT).map((k) => [k, 0])) as Record<LayoutField, number>
const GAP = 8 // 눈과 입, 두 눈 사이에 남길 최소 간격
const EDGE = 4 // 얼굴 가장자리에 남길 간격
// box 를 적지 않은 부품은 그리는 틀 크기로 봄 (notes 의 얼굴 지도: 눈 448×448, 입 1024×480 을 반으로)
const DEFAULT_BOX: Partial<Record<Slot, [number, number, number, number]>> = {
  eyes: [-112, -112, 112, 112], closedEyes: [-112, -112, 112, 112], brows: [-112, -35, 112, 35], mouth: [-256, -120, 256, 120], mouthOpen: [-256, -120, 256, 120],
}

export type Spot = { x: number; y: number; scale: number }
// 차림의 위치·크기 → 오른쪽 눈·오른쪽 눈썹·입이 놓일 가운데와 배율 (왼쪽 눈·눈썹은 x 를 FACE_PX - x 로 뒤집음)
export function faceLayout(a: Avatar): { eye: Spot; brow: Spot; mouth: Spot } {
  const eye = { x: EYE_HOME.x + a.eyeX * LAYOUT_STEP, y: EYE_HOME.y - a.eyeY * LAYOUT_STEP, scale: EYE_SCALE * (1 + a.eyeSize * SIZE_STEP) }
  return {
    eye,
    brow: { x: eye.x, y: BROW_HOME_Y - a.browY * LAYOUT_STEP, scale: 1 + a.browSize * SIZE_STEP }, // 가로는 눈을 따라감
    mouth: { x: MOUTH_HOME.x, y: MOUTH_HOME.y - a.mouthY * LAYOUT_STEP, scale: 1 + a.mouthSize * SIZE_STEP },
  }
}

type Box = { x0: number; y0: number; x1: number; y1: number }
function boxAt(slot: Slot, id: string, at: Spot): Box | null {
  const part = findPart(slot, id)
  if (!part || (!part.tint && !part.file)) return null // "없음"
  const [l, t, r, b] = part.box ?? DEFAULT_BOX[slot]!
  const k = at.scale * (part.scale ?? 1)
  return { x0: at.x + l * k, y0: at.y + t * k, x1: at.x + r * k, y1: at.y + b * k }
}
// 이 위치·크기로 얼굴에 들어가는지: 얼굴 밖으로 나가거나, 두 눈(눈썹)이 겹치거나, 눈과 눈썹·입이 겹치면 false
export function layoutFits(a: Avatar): boolean {
  const L = faceLayout(a)
  const mid = FACE_PX / 2
  // 뜬 눈과 감은 눈 중 더 큰 범위 (깜빡여도 겹치지 않게)
  const eye = unionBox(boxAt('eyes', a.eyes, L.eye), boxAt('closedEyes', a.closedEyes, L.eye))
  const brow = boxAt('brows', a.brows, L.brow)
  const closed = boxAt('mouth', a.mouth, L.mouth), open = boxAt('mouthOpen', a.mouthOpen, L.mouth)
  const mouths = [closed, open].filter((m): m is Box => m !== null)
  for (const b of [eye, brow]) {
    if (!b) continue
    if (b.x0 < mid + GAP / 2 || b.x1 > FACE_PX - EDGE || b.y0 < EDGE) return false
  }
  // 눈썹은 눈보다 위에 (가로로 겹치는 자리면 눈썹 아래 끝이 눈 위 끝보다 GAP 만큼 위)
  if (eye && brow && brow.x0 < eye.x1 && brow.x1 > eye.x0 && brow.y1 + GAP > eye.y0) return false
  for (const m of mouths) {
    if (m.x0 < EDGE || m.x1 > FACE_PX - EDGE || m.y1 > FACE_PX - EDGE) return false
    // 눈이 입과 가로로 겹치는 자리에 있으면, 눈 아래 끝이 입 위 끝보다 GAP 만큼 위여야 함
    if (eye && eye.x0 < m.x1 && eye.x1 > m.x0 && eye.y1 + GAP > m.y0) return false
  }
  return true
}
function unionBox(a: Box | null, b: Box | null): Box | null {
  if (!a || !b) return a ?? b
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }
}
const clampLayout = (field: LayoutField, v: number) => Math.max(LAYOUT[field].min, Math.min(LAYOUT[field].max, Math.round(v)))
// field 를 target 쪽으로 한 단계씩 옮기다가 얼굴에 안 들어가게 되기 직전에 멈춥니다(슬라이더를 끌 때)
export function moveLayout(a: Avatar, field: LayoutField, target: number): Avatar {
  const goal = clampLayout(field, target)
  if (!layoutFits(a)) return fitLayout({ ...a, [field]: goal })
  let cur = a
  const dir = Math.sign(goal - a[field])
  for (let v = a[field] + dir; dir !== 0 && (dir > 0 ? v <= goal : v >= goal); v += dir) {
    const next = { ...cur, [field]: v }
    if (!layoutFits(next)) break
    cur = next
  }
  return cur
}
// 부품을 바꿔서 겹치게 됐으면 겹치지 않을 때까지: 눈썹을 올리고 → 눈을 올리고 → 입을 내리고 → 눈·입·눈썹을 줄이고 → 그래도 안 되면 기본 자리
export function fitLayout(a: Avatar): Avatar {
  if (layoutFits(a)) return a
  const tries: [LayoutField, number][] = [['browY', 1], ['eyeY', 1], ['mouthY', -1], ['eyeSize', -1], ['mouthSize', -1], ['browSize', -1]]
  let cur = a
  for (const [field, dir] of tries) {
    for (let v = cur[field] + dir; v >= LAYOUT[field].min && v <= LAYOUT[field].max; v += dir) {
      cur = { ...cur, [field]: v }
      if (layoutFits(cur)) return cur
    }
  }
  return { ...a, ...HOME_LAYOUT }
}

// ── 썸네일 ─────────────────────────────────────────────────────────
// 스킨 부품은 대표 면들(나란히 그림): 상의는 팔·몸통·팔 앞면, 하의는 두 다리 앞면, 신발은 두 다리 아래쪽, 머리카락은 얼굴 전체
export type Rect = { x: number; y: number; w: number; h: number }
const front = (mesh: string, from = 0): Rect => {
  const f = UV_FACES[mesh].find((x) => x.dir === 'front')!
  const y = f.y0 + (f.y1 - f.y0) * from
  return { x: f.x0, y, w: f.x1 - f.x0, h: f.y1 - y }
}
export function thumbRects(slot: Slot): Rect[] {
  if (slot === 'top') return [front('arm-right'), front('torso'), front('arm-left')]
  if (slot === 'bottom') return [front('leg-right'), front('leg-left')]
  if (slot === 'shoes') return [front('leg-right', 0.5), front('leg-left', 0.5)]
  return [front('head')]
}
// 얼굴 부품은 기본 자리에 놓은 얼굴에서 그 둘레만 잘라 크게 보여 줌 (얼굴 좌표)
export function faceThumbRect(slot: Slot): Rect {
  if (slot === 'mouth' || slot === 'mouthOpen') return { x: 256, y: 692, w: 512, h: 280 }
  return { x: 120, y: 300, w: 784, h: 420 } // 눈썹~눈 줄
}
