// 캐릭터 꾸미기 계산 (#56). React·브라우저와 무관한 순수 로직입니다.
//
// 캐릭터 = 맨몸(피부색) + 눈(모양·색) + 눈썹 + 입 + 머리(모양·색) + 상의(모양·색) + 하의(모양·색) + 신발(모양·색)
// 부품 목록은 parts.json, 모델의 면 자리는 uvFaces.json (둘 다 scripts/make-avatar-parts.mjs 가 만듦)
// DB(profiles.avatar)에는 아래 Avatar 그대로 저장합니다(0024). 예전 {model: 'a'} 는 새 기본 차림으로 봅니다.
//
// 화면 부품들(Player 등)은 캐릭터를 "아바타 키" 글자 하나로 주고받습니다(avatarKey). 같은 키면 같은 스킨을 같이 씁니다.
import parts from './parts.json'
import uvFaces from './uvFaces.json'

export type Slot = 'eyes' | 'brows' | 'mouth' | 'hair' | 'top' | 'bottom' | 'shoes'
// tint: 고른 색을 입힐 그림(흰색·회색), file: 색 고정 그림, closed: 눈 감은 그림(눈만). "없음" 부품은 셋 다 없음
export type Part = { id: string; name: string; tint?: string; file?: string; closed?: string }
export type Avatar = {
  skin: string // 색은 모두 '#rrggbb'
  eyes: string
  eyeColor: string
  brows: string
  mouth: string
  hair: string
  hairColor: string
  top: string
  topColor: string
  bottom: string
  bottomColor: string
  shoes: string
  shoesColor: string
}
export type Face = { dir: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'; x0: number; y0: number; x1: number; y1: number }

export const PARTS = parts as Record<Slot, Part[]>
export const UV_FACES = uvFaces as Record<string, Face[]>
export const SKIN_SIZE = 1024 // 스킨 그림 한 변

// 겹치는 순서와 각 부위에 입힐 색. 눈썹은 머리 색을 따릅니다.
export const LAYERS: { slot: Slot; color: keyof Avatar | null }[] = [
  { slot: 'eyes', color: 'eyeColor' },
  { slot: 'mouth', color: null },
  { slot: 'brows', color: 'hairColor' },
  { slot: 'hair', color: 'hairColor' },
  { slot: 'bottom', color: 'bottomColor' },
  { slot: 'shoes', color: 'shoesColor' },
  { slot: 'top', color: 'topColor' },
]

// 면 방향별 밝기(0~255). 맨몸과 기본 부품이 같은 값을 써서 면마다 조금씩 어두워져 입체감이 생깁니다. (스크립트의 SHADE 와 같음)
export const SHADE: Record<Face['dir'], number> = { top: 255, front: 245, left: 228, right: 228, back: 215, bottom: 200 }

export const DEFAULT_AVATAR: Avatar = {
  skin: '#f6d1a5',
  eyes: 'pupil', // 큰 눈동자 (김현 그림, 10/27)
  eyeColor: '#5b3a1e',
  brows: 'straight',
  mouth: 'smile',
  hair: 'short',
  hairColor: '#3b2a20',
  top: 'tshirt',
  topColor: '#4f86f7',
  bottom: 'pants',
  bottomColor: '#374151',
  shoes: 'sneakers',
  shoesColor: '#ef4444',
}

// 꾸미기 창에서 바로 고를 수 있는 피부색 몇 가지 (색상표로 아무 색이나 고를 수도 있음)
export const SKIN_PRESETS = ['#f6d1a5', '#e8b98a', '#cc8860', '#a8694a', '#8d5641', '#5e3a2c']

const FIELDS = Object.keys(DEFAULT_AVATAR) as (keyof Avatar)[]
const COLOR = /^#[0-9a-f]{6}$/ // DB 제약과 같음
const ID = /^[a-z0-9-]{1,32}$/
const PART_FIELDS: Partial<Record<keyof Avatar, Slot>> = {
  eyes: 'eyes', brows: 'brows', mouth: 'mouth', hair: 'hair', top: 'top', bottom: 'bottom', shoes: 'shoes',
}

export const findPart = (slot: Slot, id: string) => PARTS[slot].find((p) => p.id === id)
export const isColor = (v: unknown): v is string => typeof v === 'string' && COLOR.test(v)
export const isId = (v: unknown): v is string => typeof v === 'string' && ID.test(v)

// DB 의 avatar 값 → 차림. 칸마다 모르는 부품·잘못된 색이면 기본값. 예전 {model} 이나 빈 값은 기본 차림
export function avatarFromDb(raw: unknown): Avatar {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_AVATAR }
  const v = raw as Record<string, unknown>
  const out = { ...DEFAULT_AVATAR }
  for (const key of FIELDS) {
    const slot = PART_FIELDS[key]
    const value = v[key]
    if (slot ? typeof value === 'string' && findPart(slot, value) : isColor(value)) out[key] = value as string
  }
  return out
}

// 차림 → DB 에 넣을 값 (칸 순서대로)
export const avatarToDb = (a: Avatar) => Object.fromEntries(FIELDS.map((k) => [k, a[k]])) as Avatar

// 차림 ↔ 아바타 키. 칸 값을 정해진 순서로 이어 붙입니다. 예전처럼 글자 하나("a")가 오면 기본 차림
export const avatarKey = (a: Avatar) => FIELDS.map((k) => a[k]).join('|')
export function parseAvatarKey(key: string): Avatar {
  const values = key.split('|')
  if (values.length !== FIELDS.length) return { ...DEFAULT_AVATAR }
  return avatarFromDb(Object.fromEntries(FIELDS.map((k, i) => [k, values[i]])))
}

// 칸마다 무작위로 고른 차림 (꾸미기 창의 🎲)
export function randomAvatar(random: () => number = Math.random): Avatar {
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)]
  const color = () => '#' + Array.from({ length: 3 }, () => Math.floor(random() * 256).toString(16).padStart(2, '0')).join('')
  return {
    skin: pick(SKIN_PRESETS),
    eyes: pick(PARTS.eyes).id,
    eyeColor: color(),
    brows: pick(PARTS.brows).id,
    mouth: pick(PARTS.mouth).id,
    hair: pick(PARTS.hair).id,
    hairColor: color(),
    top: pick(PARTS.top).id,
    topColor: color(),
    bottom: pick(PARTS.bottom).id,
    bottomColor: color(),
    shoes: pick(PARTS.shoes).id,
    shoesColor: color(),
  }
}

// 썸네일로 보여 줄 자리: 부위마다 대표 면들(나란히 그림). 머리 쪽은 얼굴, 상의는 팔·몸통·팔 앞면, 하의는 두 다리 앞면, 신발은 두 다리 아래쪽
type Rect = { x: number; y: number; w: number; h: number }
const front = (mesh: string, from = 0): Rect => {
  const f = UV_FACES[mesh].find((x) => x.dir === 'front')!
  const y = f.y0 + (f.y1 - f.y0) * from
  return { x: f.x0, y, w: f.x1 - f.x0, h: f.y1 - y }
}
// 얼굴(머리 앞면)의 일부를 8×8 칸 단위로 자른 자리. 눈·입은 얼굴에서 작아서 그 둘레만 잘라 크게 보여 줍니다.
const FACE_UNITS = 8
const faceArea = (c0: number, r0: number, c1: number, r1: number): Rect => {
  const f = front('head'), cell = f.w / FACE_UNITS
  return { x: f.x + c0 * cell, y: f.y + r0 * cell, w: (c1 - c0) * cell, h: (r1 - r0) * cell }
}
export function thumbRects(slot: Slot): Rect[] {
  if (slot === 'top') return [front('arm-right'), front('torso'), front('arm-left')]
  if (slot === 'bottom') return [front('leg-right'), front('leg-left')]
  if (slot === 'shoes') return [front('leg-right', 0.5), front('leg-left', 0.5)]
  if (slot === 'eyes' || slot === 'brows') return [faceArea(0.6, 2.5, 7.4, 6.3)] // 눈썹~눈 줄
  if (slot === 'mouth') return [faceArea(2, 4.9, 6, 7.5)] // 입 둘레
  return [front('head')] // 머리카락은 얼굴 전체
}
