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
// 고리 테이블: 가운데(나무 등)를 둘러싼 둥근 테이블. inner~outer 반지름 사이가 상판
export type RingTable = { x: number; z: number; inner: number; outer: number }
// style: diner = 크롬 다리·소파, wood = 원목 다리·원목 의자·원목 부스(자리마다 seats[].chair 로 고름)
// accent: 소파 흰 띠·부스 쿠션 색, chrome: 다리·기둥 색, trim: 상판 테두리 색(없으면 chrome)
export type Furniture = { style: 'diner' | 'wood'; accent: string; chrome: string; trim?: string; tables?: SharedTable[]; rings?: RingTable[] }

// 자리가 공용 테이블(긴 테이블 또는 고리 테이블) 안에 있는지 (개별 책상을 그릴지 정하는 데 씀)
export function insideTable(seat: { x: number; z: number }, tables?: SharedTable[], rings?: RingTable[]): boolean {
  const inRect = (tables ?? []).some((t) => Math.abs(seat.x - t.x) <= t.w / 2 && Math.abs(seat.z - t.z) <= t.d / 2)
  const inRing = (rings ?? []).some((r) => {
    const dist = Math.hypot(seat.x - r.x, seat.z - r.z)
    return dist >= r.inner && dist <= r.outer
  })
  return inRect || inRing
}

// 고리 테이블 둘레에 count 자리를 고르게 놓습니다. 책상 자리는 상판 가운데 반지름, rot 은 가운데를 바라봄.
// (의자는 spotsOf 가 rot 반대쪽으로 0.65 떨어뜨려 놓으므로 상판 바깥에 앉게 됩니다)
export function ringSeats(ring: RingTable, count: number, startNo: number, startAngle = 0): { no: number; x: number; z: number; rot: number }[] {
  const r = (ring.inner + ring.outer) / 2
  return Array.from({ length: count }, (_, i) => {
    const a = startAngle + (i * 2 * Math.PI) / count
    const x = ring.x + Math.sin(a) * r
    const z = ring.z + Math.cos(a) * r
    return { no: startNo + i, x: round3(x), z: round3(z), rot: round3(a + Math.PI) }
  })
}
const round3 = (v: number) => Math.round(v * 1000) / 1000

// 올리브 나무: 둥근 화분 테두리 + 줄기 + 가지 + 잎 덩어리. 가운데 고리 테이블 안에 둡니다
export type Tree = { x: number; z: number; potR: number; height: number }
// 벽 선반: 원목 판 rows 줄 + 판마다 작은 그릇·꽃병. face 는 선반이 보는 쪽(벽 안쪽)
export type Shelf = { x: number; z: number; face: Frame['face']; w: number; rows: number }
// 둥근 전구 조명: 줄에 매달린 흰 구. light 면 실제 빛(pointLight)도 냄 (많으면 느려져 일부만)
// style: globe = 흰 구(기본), disc = 납작한 원반 갓 아래 작은 전구
export type Globe = { x: number; z: number; y: number; light?: boolean; style?: 'globe' | 'disc' }
// 원형 부스: 가운데 둥근 대리석 테이블을 C 모양 가죽 부스가 감쌈. open 은 부스가 비는 쪽 방향(라디안, 0 = +z 남쪽)
export type Booth = { x: number; z: number; open: number }
// 버섯 조명: 부스 등받이 위 작은 탁상 조명. light 면 실제 빛
export type Mushroom = { x: number; z: number; y: number; light?: boolean }
// 러그: 바닥에 깐 얇은 판. wobble 이 있으면 둥근 대신 물결 모양 가장자리(0~0.3 정도)
export type Rug = { x: number; z: number; r: number; color: string; wobble?: number; seed?: number }
// 화분(화단): 타일 두른 상자 + 흙 + 풀. tree 면 가운데 작은 나무
export type Planter = { x: number; z: number; w: number; d: number; tile: string; tree?: boolean }
// 물길: 바닥보다 낮은 물 + 돌 테두리. 사각형 여러 개를 이어 꺾인 물길을 만듭니다
export type Water = { x: number; z: number; w: number; d: number }
// 둥근 방 (숨 라운지): 네모난 방 안에 반지름 r 의 곡선 벽을 두르고, 벽을 따라 세로 곡선 기둥(fin) fins 개.
// gaps: 벽을 비우는 쪽(자리 각도 규칙: 0 = 남쪽 출입문, -π/2 = 서쪽 엘리베이터). 곡선 벽은 작은 상자를 이어 부딪히게 합니다
export type RoundRoom = { r: number; color: string; fin: string; fins: number; gaps: number[] }
// 천장 천창: 천장(높이 h)에 반지름 R 로 뚫린 구멍에서 위로 depth 만큼 좁아지는 깔때기, 맨 위 반지름 r 은 빛나는 판
export type Dome = { x: number; z: number; R: number; r: number; depth: number; color: string; glow: string }
// 가운데 돌 수반 + 낮게 깔리는 안개
export type Basin = { x: number; z: number; r: number; color: string; water: string }
// 곡선 바: 반지름 inner~outer, 각도 from~to(자리 각도 규칙: 0 = +z 남쪽) 인 원목 바 + 대리석 상판
export type Bar = { x: number; z: number; inner: number; outer: number; from: number; to: number; height: number }
// 바 뒤 둥근 진열장: 원통 받침 + 놋쇠 테 선반 3단 + 병
export type BackBar = { x: number; z: number; r: number }
// 원목 살 기둥 조명: 세로 살 여러 개가 빛나는 기둥을 감쌈. 바닥부터 h 높이
export type Pillar = { x: number; z: number; h: number; light?: boolean }

export type BranchTheme = {
  // checker: 두 색 체크(cell 은 한 칸 크기), brick: 가로로 긴 벽돌(colors = [벽돌, 줄눈], cell 은 벽돌 길이)
  // concrete: 회색 콘크리트(colors = [바탕, 얼룩], cell 은 텍스처 한 장 크기)
  floor?: { pattern: 'checker' | 'brick' | 'concrete'; colors: [string, string]; cell: number }
  wall?: {
    color: string
    neon?: string // 벽 위쪽 네온 띠 색 (없으면 안 그림)
    band?: { colors: [string, string, string]; y: number; h: number } // 벽 둘레 모자이크 타일 띠 (y 아래 끝, h 높이)
  }
  ceiling?: {
    color: string
    height?: number // 천장·벽 높이(기본 2.5)
    fans?: FanSpot[]
    lamps?: { x: number; z: number }[] // 크롬 돔 펜던트 조명
    globes?: Globe[] // 둥근 전구 조명
    grid?: { color: string; step: number; y: number } // 천장 아래 철제 격자 (step 간격, y 높이)
    coves?: { x: number; z: number; r: number }[] // 천장 둥근 간접조명 고리
  }
  tree?: Tree
  shelves?: Shelf[]
  booths?: Booth[] // 원형 부스 (흑요 라운지)
  mushrooms?: Mushroom[]
  // 부스 가죽 색, 대리석 [바탕, 결] 색. back: 등받이 바깥 색(없으면 가죽 색), gap: 열린 쪽 반각(라디안, 기본 0.9),
  // table: 가운데 테이블(marble 대리석·low 낮은 검은 테이블·none 없음), soft: 벨벳·부클레처럼 광택 없는 천
  booth?: { leather: string; marble: [string, string]; back?: string; gap?: number; table?: 'marble' | 'low' | 'none'; soft?: boolean }
  rugs?: Rug[]
  planters?: Planter[]
  water?: Water[]
  bars?: Bar[]
  backbar?: BackBar
  round?: RoundRoom // 둥근 방 (숨 라운지)
  dome?: Dome // 천장 천창 (있으면 평평한 천장에 구멍을 뚫음)
  basin?: Basin
  lounger?: { base: string; cushion: string; pillow: string } // 누워 쉬는 라운지 소파 색 (자리 chair 'lounger')
  pillars?: Pillar[]
  menu?: Menu // 메뉴판 (커피 바 뒤 벽 등)
  frames?: Frame[]
  counter?: { style: 'tile'; top: string; stools?: { x: number; z: number }[] } // 커피 바 자리를 타일 카운터로
  desk?: string
  chair?: string // 의자 기본색. 가까이·내 자리 강조색은 테마와 무관
  furniture?: Furniture
  light?: Partial<{ ambient: number; sun: number; color: string }> // 빠진 칸은 기본값
  // 출입문·회의실 문. style: arch = 아치형 크롬 틀(기본), wood = 원목 문 + 둥근 손잡이. 앞에 서면 주황 강조는 그대로
  // porthole: 아치 문 + 둥근 창 두 개 (월넛 바)
  door?: { style?: 'arch' | 'wood' | 'porthole'; color: string; chrome: string; signBg: string; knob?: string } // knob: 원목 문 손잡이 색(기본 놋쇠)
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

// 나무·고리 테이블 가운데는 걸어 들어가지 못하게: 고리 안쪽 지름만큼의 상자 (고리 상판은 자리 책상 상자가 막음)
export function decorBoxes(theme?: BranchTheme): { x: number; z: number; w: number; d: number }[] {
  const rings = (theme?.furniture?.rings ?? []).map((r) => ({ x: r.x, z: r.z, w: r.inner * 2, d: r.inner * 2 }))
  const tree = theme?.tree && !rings.length ? [{ x: theme.tree.x, z: theme.tree.z, w: theme.tree.potR * 2, d: theme.tree.potR * 2 }] : []
  // 화분·물길은 그 사각형, 기둥 조명은 지름만큼, 바 뒤 진열장은 바 안쪽 반지름만큼 막습니다 (바 상판은 자리 책상 상자가 막음)
  const planters = (theme?.planters ?? []).map((p) => ({ x: p.x, z: p.z, w: p.w, d: p.d }))
  const water = (theme?.water ?? []).map((w) => ({ x: w.x, z: w.z, w: w.w, d: w.d }))
  const pillars = (theme?.pillars ?? []).map((p) => ({ x: p.x, z: p.z, w: PILLAR.r * 2, d: PILLAR.r * 2 }))
  const bars = (theme?.bars ?? []).map((b) => ({ x: b.x, z: b.z, w: b.inner * 2, d: b.inner * 2 }))
  const basin = theme?.basin ? [{ x: theme.basin.x, z: theme.basin.z, w: theme.basin.r * 2, d: theme.basin.r * 2 }] : []
  return [...rings, ...tree, ...planters, ...water, ...pillars, ...bars, ...basin, ...roundWallBoxes(theme?.round)]
}

// 둥근 방 곡선 벽을 부딪히게 하는 작은 상자들: 벽을 따라 ROUND_ROOM.boxStep 간격, 벽 바로 바깥에. 비운 쪽(gaps)은 뺍니다
export function roundWallBoxes(round?: RoundRoom): { x: number; z: number; w: number; d: number }[] {
  if (!round) return []
  const R = ROUND_ROOM
  const n = Math.ceil((Math.PI * 2 * round.r) / R.boxStep)
  const out: { x: number; z: number; w: number; d: number }[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    if (inRoundGap(round, a)) continue
    const r = round.r + R.boxSize / 2
    out.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, w: R.boxSize, d: R.boxSize })
  }
  return out
}

// 각도 a(자리 각도 규칙)가 둥근 벽을 비운 쪽(문·엘리베이터 앞)인지
export function inRoundGap(round: RoundRoom, a: number): boolean {
  const half = ROUND_ROOM.gapHalf / round.r // 비운 폭(m)을 각도로
  return round.gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < half)
}

// 천장 팬: 허브 원통 + 날개 상자 4개, 초당 회전 수
export const FAN = { hubR: 0.06, hubH: 0.3, bladeL: 0.7, bladeW: 0.14, bladeT: 0.03, turnsPerSec: 1.5 }

// 다이너 테이블: 상판 + 둘레 크롬 띠 + 크롬 다리 4개. 높이는 상자 책상(0.74)과 같고 충돌 범위(SEAT)도 그대로.
// 둥근 방: 곡선 벽 두께, 부딪힘 상자 간격·크기, 문 앞 비우는 반폭(m), 곡선 기둥 크기
export const ROUND_ROOM = { t: 0.25, boxStep: 0.45, boxSize: 0.6, gapHalf: 1.3, fin: { w: 0.7, out: 0.35 } }
// 천창: 빛 세기·거리, 깔때기 안쪽 동심원 줄 수
export const DOME = { intensity: 6, distance: 14, rings: 9 }
// 돌 수반: 높이, 아래 반지름 비율, 안개 덩이 수·높이
export const BASIN = { h: 0.45, foot: 0.75, fog: 7, fogY: 0.35 }
// 라운지 소파: 기울기(누운 각도, 라디안), 폭, 쿠션 두께, 받침 두께
//   옆모습(엉덩이 = 의자 자리 기준, 앞 = 가운데 쪽): 머리 → 등 → 엉덩이 → 무릎 → 발. 앉은 동작을 lie 만큼 뒤로 눕힌 모양에 맞춤
export const LOUNGER = {
  lie: 0.6,
  w: 0.78,
  cushionT: 0.1,
  baseT: 0.07,
  profile: [[-0.62, 1.12], [-0.05, 0.42], [0.42, 0.66], [0.98, 0.38], [1.18, 0.34]] as [number, number][],
}
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

// 원목 의자: 방석 + 다리 4개 + 등받이(세로 판 두 개와 가로 판). 원목 부스: 받침 상자 + 높은 등받이 + 쿠션 2개
export const WOOD_CHAIR = { w: 0.44, d: 0.42, seatH: 0.45, seatT: 0.05, legR: 0.02, backH: 0.42, backT: 0.04 }
export const WOOD_BOOTH = { w: 0.6, d: 0.5, seatH: 0.45, backH: 0.65, backT: 0.12, cushion: { w: 0.24, h: 0.24, t: 0.08 } }
// 원목 문: 문판 + 문틀 + 둥근 손잡이
export const WOOD_DOOR = { frameT: 0.08, knobR: 0.05, knobY: 1.0, signW: 0.7, signY: 1.6 }
// 엘리베이터 문: 크롬 틀 + 스테인리스 문짝 두 장, 위에 층 표시판, 옆에 부름 버튼 (여러 층 건물의 지점)
export const ELEVATOR = { frameW: 0.08, gap: 0.015, panelT: 0.04, indicator: { w: 0.5, y: 0.25 }, button: { out: 0.22, y: 1.1, r: 0.035 } }
// 둥근 전구: 반지름, 빛 세기·거리
export const GLOBE = { r: 0.2, cordR: 0.008, intensity: 4, distance: 6 }

// 원형 부스: 방석(안쪽 반지름 seatIn ~ seatOut) + 등받이(seatOut ~ backOut). 열린 쪽 반각 gap
export const BOOTH = { seatIn: 0.55, seatOut: 1.0, backOut: 1.15, seatH: 0.45, backH: 1.0, gap: 0.9 }
export const boothGap = (theme?: BranchTheme) => theme?.booth?.gap ?? BOOTH.gap
// 대리석 테이블: 상판 반지름·두께, 받침 기둥
export const MARBLE_TABLE = { r: 0.45, topT: 0.05, height: 0.74, stemR: 0.08, baseR: 0.3 }
// 버섯 조명: 기둥 + 반구 갓
export const MUSHROOM = { stemR: 0.015, stemH: 0.18, capR: 0.12, intensity: 1.6, distance: 3 }
// 부스 한 개의 자리 4개: 열린 쪽에 의자 1개(chair), 부스 안 3개(none — 의자 대신 방석). 책상 점은 테이블 가운데에서 조금 떨어진 곳
const BOOTH_SEAT_ANGLES = [0, Math.PI - 1.25, Math.PI, Math.PI + 1.25] // open 기준
export function boothSeats(b: Booth, startNo: number): { no: number; x: number; z: number; rot: number; chair: 'chair' | 'none' }[] {
  return BOOTH_SEAT_ANGLES.map((d, i) => {
    const a = b.open + d
    const ux = Math.sin(a)
    const uz = Math.cos(a)
    // 의자는 책상 점에서 rot 반대로 0.65 → 테이블 가운데에서 0.8 떨어진 곳(부스 방석 위)
    return { no: startNo + i, x: round3(b.x + ux * 0.15), z: round3(b.z + uz * 0.15), rot: round3(a + Math.PI), chair: i === 0 ? 'chair' : 'none' }
  })
}

// 낮은 테이블(이끼 정원·물결 라운지): 둥근 검은 상판, 높이 0.45
export const LOW_TABLE = { r: 0.42, height: 0.45 }
// 1인석 둥근 작은 테이블(대리석 또는 원목): 반지름·높이
export const ROUND_TABLE = { r: 0.32, height: 0.74 }
// 둥근 1인 소파(통 의자): 앉는 원통 + 뒤쪽을 감싼 등받이
export const TUB = { r: 0.32, seatH: 0.42, backH: 0.72 }
// 원목 살 기둥 조명: 반지름, 살 개수
export const PILLAR = { r: 0.28, slats: 14, intensity: 3, distance: 6 }
// 곡선 바: 상판 두께·튀어나옴, 발 받침 높이
export const BAR_TOP = { t: 0.05, over: 0.08 }

// 곡선 바 둘레에 count 자리를 고르게: 책상 점은 상판 가운데 반지름, 바 가운데를 바라봄(높은 자리 tall)
export function barSeats(bar: Bar, count: number, startNo: number): { no: number; x: number; z: number; rot: number; tall: true; chair: 'stool' }[] {
  const r = (bar.inner + bar.outer) / 2
  return Array.from({ length: count }, (_, i) => {
    const a = bar.from + ((i + 0.5) * (bar.to - bar.from)) / count
    return { no: startNo + i, x: round3(bar.x + Math.sin(a) * r), z: round3(bar.z + Math.cos(a) * r), rot: round3(a + Math.PI), tall: true, chair: 'stool' }
  })
}
