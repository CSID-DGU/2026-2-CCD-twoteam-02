// 회의실 테마: 지점 테마를 8×8m 회의실에 맞게 줄여 옮깁니다. (#57) React·화면과 무관한 순수 함수입니다.
//
// 지점 테마(theme.ts)의 바닥·벽·천장 색, 조명, 문 모양, 가구 색은 그대로 쓰고,
// 자리가 정해진 소품(조명·러그·화분·액자 등)은 지점 배치가 16×16m 기준이라 회의실 자리로 다시 놓습니다.
//   - 천장 조명: 지점에 있는 종류만, 테이블 위(둥근 전구 4개·간접조명 고리·버섯 조명) 또는 가운데 팬 + 구석 펜던트
//   - 러그: 테이블 밑에 깔고, 화분·올리브 나무: 북쪽 구석(문 반대쪽), 액자: 북쪽 벽
//   - 부스·바·물길·선반·메뉴판처럼 큰 소품은 회의실에 넣지 않습니다.
// 이렇게 만든 테마를 지점처럼 Decor 에 넘겨 그리고, 화분·나무는 decorBoxes 로 부딪히게 합니다.
import type { BranchTheme } from '../space/theme'
import { ceilingHeightOf } from '../space/theme'
import { tableRadius } from './meetingLogic'

export const MEETING_TABLE_H = 0.74 // 회의 테이블 높이 (지점 책상과 같음)
const CEILING_MAX = 3.2 // 회의실은 작아서 지점보다 천장을 낮게 (지점 천장이 4m 넘으면 좁은 통로처럼 보임)
const CORNER = 2.9 // 구석 소품 자리 (가운데에서 x·z 로 이만큼. 벽은 ±4)
const GLOBE_DROP = 0.9 // 둥근 전구가 천장에서 내려오는 길이
const RUG_OUT = 1.0 // 러그가 테이블 가장자리 밖으로 나오는 길이 (의자까지 덮음)
const COVE_OUT = 0.5 // 간접조명 고리가 테이블보다 큰 만큼
const PENDANT_AT = 2.6 // 팬이 있는 지점(다이너)의 펜던트 자리: 구석 4곳 (가운데에서 x·z 로 이만큼)

// 지점 테마 → 회의실 테마. 테마가 없는 지점(별다방)은 지금처럼 기본 모습입니다.
export function meetingRoomTheme(theme: BranchTheme | undefined, capacity: number): BranchTheme | undefined {
  if (!theme) return undefined
  const r = tableRadius(capacity)
  const height = Math.min(ceilingHeightOf(theme), CEILING_MAX)
  const c = theme.ceiling
  const globe = c?.globes?.[0]
  const ceiling: BranchTheme['ceiling'] = c && {
    color: c.color,
    height,
    fans: c.fans?.length ? [{ x: 0, z: 0 }] : undefined,
    lamps: c.lamps?.length
      ? [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: sx * PENDANT_AT, z: sz * PENDANT_AT })))
      : undefined,
    // 둥근 전구: 테이블 위 네 개, 하나만 실제 빛 (빛이 많으면 느려짐)
    globes: globe
      ? [0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4
          return { x: Math.sin(a) * r * 0.55, z: Math.cos(a) * r * 0.55, y: height - GLOBE_DROP, style: globe.style, light: i === 0 }
        })
      : undefined,
    grid: c.grid && { ...c.grid, y: Math.min(c.grid.y, height - 0.3) },
    coves: c.coves?.length ? [{ x: 0, z: 0, r: r + COVE_OUT }] : undefined,
  }
  const rug = theme.rugs?.[0]
  const planter = theme.planters?.[0]
  return {
    floor: theme.floor,
    wall: theme.wall,
    ceiling,
    light: theme.light,
    door: theme.door,
    desk: theme.desk,
    chair: theme.chair,
    booth: theme.booth, // 대리석 색만 테이블에 씁니다 (부스 자리 booths 는 없음)
    furniture: theme.furniture && { style: theme.furniture.style, accent: theme.furniture.accent, chrome: theme.furniture.chrome, trim: theme.furniture.trim },
    rugs: rug ? [{ ...rug, x: 0, z: 0, r: r + RUG_OUT }] : undefined,
    planters: planter ? [{ ...planter, x: CORNER, z: -CORNER, w: 1.1, d: 1.1 }] : undefined,
    tree: theme.tree && { ...theme.tree, x: -CORNER, z: -CORNER, height: Math.min(theme.tree.height, height - 0.4) },
    mushrooms: theme.mushrooms?.length ? [{ x: 0, z: 0, y: MEETING_TABLE_H, light: true }] : undefined,
    frames: theme.frames?.slice(0, 2).map((f, i, all) => ({ ...f, x: all.length > 1 ? (i ? 1.6 : -1.6) : 0, z: -4, face: 's' as const })),
  }
}

export type ChairKind = 'box' | 'wood' | 'tub'

// 지점 자리에 쓴 의자로 회의실 의자 모양을 고릅니다.
export function chairKindOf(theme: BranchTheme | undefined, seats: { chair?: string }[]): ChairKind {
  if (!theme?.furniture) return 'box'
  return seats.some((s) => s.chair === 'tub') ? 'tub' : 'wood'
}
