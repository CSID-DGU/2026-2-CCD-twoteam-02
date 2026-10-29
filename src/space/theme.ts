// 지점 테마 (#57): 바닥·벽·천장·액자·카운터의 색과 배치. 값은 지점 JSON(theme)에 있고 여기서는 읽어 계산만 합니다.
// 테마가 없는 지점(별다방)은 DEFAULT_COLORS 로 전과 똑같이 그립니다. React·three 와 무관한 순수 로직입니다.

export type FanSpot = { x: number; z: number; scale?: number } // scale: 크기 배율 (기본 1)

// 벽 액자. face 는 액자가 보는 쪽(n·s·e·w). 좌표는 벽 좌표를 그대로 적고, framePose 가 벽 안쪽으로 띄웁니다.
// style: 간판 모양 (patternTexture.signTexture). plain = 색 바탕에 글자, badge = 타원 배지 + 체크 띠,
// ribbon = 빨간 리본 간판, tin = 양철 간판(두 줄). sub 는 작은 글자(선택).
export type SignStyle = 'plain' | 'badge' | 'ribbon' | 'tin'
export type Frame = { x: number; z: number; face: 'n' | 's' | 'e' | 'w'; text: string; bg: string; style?: SignStyle; sub?: string }

// 가구 모양. diner = 크롬 테두리·다리가 있는 테이블과 등받이 소파. 없으면 상자 책상·의자.
// tables: 여러 자리가 같이 쓰는 긴 높은 테이블(바 테이블). 이 안에 있는 자리는 개별 책상을 그리지 않는다. 높은 의자(tall) 자리용.
export type SharedTable = { x: number; z: number; w: number; d: number }
export type Furniture = { style: 'diner'; accent: string; chrome: string; trim?: string; tables?: SharedTable[] } // accent: 소파 등받이 흰 띠, chrome: 다리·기둥, trim: 상판 테두리 색(없으면 chrome)

// 자리가 공용 테이블 안에 있는지 (개별 책상을 그릴지 정하는 데 씀)
export function insideTable(seat: { x: number; z: number }, tables?: SharedTable[]): boolean {
  return (tables ?? []).some((t) => Math.abs(seat.x - t.x) <= t.w / 2 && Math.abs(seat.z - t.z) <= t.d / 2)
}

export type BranchTheme = {
  floor?: { pattern: 'checker'; colors: [string, string]; cell: number } // cell: 체크 한 칸 크기(m)
  wall?: { color: string; neon?: string } // neon: 벽 위쪽 네온 띠 색 (없으면 안 그림)
  ceiling?: { color: string; height?: number; fans?: FanSpot[]; lamps?: { x: number; z: number }[] } // height: 천장·벽 높이(기본 2.5), lamps: 펜던트 조명 자리
  menu?: Menu // 메뉴판 (커피 바 뒤 벽 등)
  frames?: Frame[]
  counter?: { style: 'tile'; top: string; stools?: { x: number; z: number }[] } // 커피 바 자리를 타일 카운터로
  desk?: string
  chair?: string // 의자 기본색. 가까이·내 자리 강조색은 테마와 무관
  furniture?: Furniture
  light?: Partial<{ ambient: number; sun: number; color: string }> // 빠진 칸은 기본값
  door?: { color: string; chrome: string; signBg: string } // 출입문·회의실 문 색, 크롬 테두리, 양철 간판 표지판 색. 앞에 서면 주황 강조는 그대로
}


// 테마가 없을 때의 색 (바꾸기 전 BranchScene 에 박혀 있던 값 그대로)
export const DEFAULT_COLORS = {
  floor: '#e8e2d6',
  wall: '#8a8f98',
  desk: '#b98a5a',
  chair: '#6b7280',
  bar: '#7c5a3a',
  light: { ambient: 1.2, sun: 0.8, color: '#ffffff' },
}

export type SceneColors = {
  floor: string
  wall: string
  desk: string
  chair: string
  light: { ambient: number; sun: number; color: string }
}

// 테마 값이 있으면 그것, 없으면 기본값
export function colorsOf(theme?: BranchTheme): SceneColors {
  return {
    floor: DEFAULT_COLORS.floor, // 체크 무늬일 때는 텍스처를 쓰고 이 색은 안 쓴다
    wall: theme?.wall?.color ?? DEFAULT_COLORS.wall,
    desk: theme?.desk ?? DEFAULT_COLORS.desk,
    chair: theme?.chair ?? DEFAULT_COLORS.chair,
    light: { ...DEFAULT_COLORS.light, ...theme?.light }, // 칸마다 따로: ambient 만 적어도 나머지는 기본값
  }
}

export const WALL_HEIGHT = 2.5 // 벽·천장 높이 (BranchScene 의 벽 상자와 같음)
export const WALL_THICKNESS = 0.2 // 지점 JSON 벽 두께

// 액자: 테두리 상자와 안판 크기, 벽에서 띄우는 거리(벽 두께 절반 + 조금)
export const FRAME = { w: 0.9, h: 0.7, depth: 0.04, inner: { w: 0.78, h: 0.58 }, y: 1.6, gap: WALL_THICKNESS / 2 + 0.01 }

// 벽에 붙는 것(액자·메뉴판)의 위치와 회전. 앞면(+z)이 face 쪽을 보게 돌리고 그 방향으로 gap 만큼 띄웁니다.
export function wallPose(x: number, z: number, face: Frame['face'], y: number, gap = FRAME.gap): { x: number; y: number; z: number; rotY: number } {
  switch (face) {
    case 's':
      return { x, y, z: z + gap, rotY: 0 }
    case 'n':
      return { x, y, z: z - gap, rotY: Math.PI }
    case 'e':
      return { x: x + gap, y, z, rotY: Math.PI / 2 }
    case 'w':
      return { x: x - gap, y, z, rotY: -Math.PI / 2 }
    default:
      // JSON 오타로 모르는 값이 와도 장면이 깨지지 않게 남쪽을 보는 것으로 처리
      return { x, y, z: z + gap, rotY: 0 }
  }
}

export function framePose(f: Frame): { x: number; y: number; z: number; rotY: number } {
  return wallPose(f.x, f.z, f.face, FRAME.y)
}

// 메뉴판: 벽에 붙는 큰 판. items 는 [이름, 값] 줄
export type Menu = { x: number; z: number; face: Frame['face']; y: number; w: number; h: number; title: string; items: [string, string][]; bg: string; color: string }

// 천장 높이 (테마에 없으면 벽 높이)
export const ceilingHeightOf = (theme?: BranchTheme) => theme?.ceiling?.height ?? WALL_HEIGHT

// 펜던트 조명: 천장에서 줄로 내려온 크롬 돔. 돔 아랫면이 따뜻하게 빛나고 실제 빛(pointLight)도 냅니다
export const LAMP = { y: 2.35, domeR: 0.28, cordR: 0.01, intensity: 6, distance: 7 }

// 스툴: 다리 원통 + 방석 원통, 걸어서 지나가지 못하게 하는 상자
export const STOOL = { legR: 0.04, legH: 0.55, seatR: 0.18, seatH: 0.1, box: { w: 0.4, d: 0.4 } }

export function stoolBoxes(theme?: BranchTheme): { x: number; z: number; w: number; d: number }[] {
  return (theme?.counter?.stools ?? []).map((s) => ({ x: s.x, z: s.z, ...STOOL.box }))
}

// 천장 팬: 허브 원통 + 날개 상자 4개, 초당 회전 수
export const FAN = { hubR: 0.06, hubH: 0.3, bladeL: 0.7, bladeW: 0.14, bladeT: 0.03, turnsPerSec: 1.5 }

// 다이너 테이블: 상판 + 둘레 크롬 띠 + 크롬 다리 4개. 높이는 상자 책상(0.74)과 같고 충돌 범위(SEAT)도 그대로.
export const DINER_DESK = { height: 0.74, topT: 0.06, trimT: 0.04, trimOut: 0.04, legR: 0.025, legInset: 0.1 }

// 소파(부스 의자): 둥근 양끝 방석 + 둥근 등받이 + 둥근 흰 띠. 의자 자리(spot)에 두고 책상을 보게 돌립니다.
// 높은 자리(tall)면 raise 만큼 받침(plinth) 위에 올립니다.
export const SOFA = { w: 0.5, d: 0.45, seatH: 0.22, backH: 0.5, backT: 0.1, stripeH: 0.06, plinth: '#3b3b3b' }

// 바 스툴(높은 둥근 의자): 바닥 받침 + 크롬 기둥 + 둥근 방석. 방석 윗면이 0.75 (의자 0.45 + TALL_RAISE 0.3)
// 바 테이블 자리의 스툴 기둥 높이: 방석 윗면이 의자 0.45 + TALL_RAISE 0.3 = 0.75 가 되게 (STOOL.seatH 0.1 을 뺀 값)
export const TALL_STOOL_LEG = 0.65
// 높은 테이블(바 테이블)의 높이. 높은 의자 자리의 책상도 이 높이
export const TALL_DESK_HEIGHT = 1.05

// 테마 문(아치형): 문판 높이는 문 높이 - 아치 반지름, 위는 반원. 크롬 틀 두께와 창(반원) 비율
export const ARCH_DOOR = { frameR: 0.035, windowRatio: 0.78, signW: 0.7, signY: 0.9 }
