// 꽃 피는 칭호 (레벨업) 단계 계산. React·화면과 무관한 순수 로직입니다. (Node 로 검사)
//
// 누적 집중(초록불) 시간으로 8단계 칭호를 얻습니다. 칭호는 오르기만 하고 떨어지지 않습니다.
// 처음엔 빨리(1·5시간), 갈수록 길게(1000시간까지) 올라, 처음 온 사람도 첫날 첫 칭호를 받습니다.
// 1시간 전(0단계)은 칭호가 없습니다. (설계: docs/superpowers/specs/2026-10-31-level-titles-design.md)

export type Title = { level: number; hours: number; name: string; emoji: string; color: string }

// 단계표 (사용자 결정, 2026-10-31). color: 리본 바탕색 — 위로 갈수록 눈에 띄게 (흙빛 → 초록 → 분홍 → 보라 → 금색)
export const TITLES: Title[] = [
  { level: 1, hours: 1, name: '씨앗', emoji: '🌰', color: '#8b6a4e' },
  { level: 2, hours: 5, name: '새싹', emoji: '🌱', color: '#8cc152' },
  { level: 3, hours: 10, name: '떡잎', emoji: '🌿', color: '#4caf50' },
  { level: 4, hours: 30, name: '줄기', emoji: '🪴', color: '#2e7d4f' },
  { level: 5, hours: 50, name: '꽃봉오리', emoji: '🌷', color: '#e58fb4' },
  { level: 6, hours: 100, name: '첫 꽃', emoji: '🌸', color: '#d9578f' },
  { level: 7, hours: 300, name: '만개', emoji: '🌺', color: '#9b59b6' },
  { level: 8, hours: 1000, name: '꽃밭', emoji: '💐', color: '#d9a53a' },
]
export const MAX_LEVEL = TITLES.length

export const DAILY_HOURS_GUESS = 2 // 남은 기간 어림("하루 2시간이면 약 N일")에 쓰는 하루 공부 시간

const HOUR = 3600

// 누적 초 → 단계 (0~8)
export function levelOf(seconds: number): number {
  let level = 0
  for (const t of TITLES) if (seconds >= t.hours * HOUR) level = t.level
  return level
}

// 단계 → 칭호. 0단계면 null
export const titleOf = (level: number): Title | null => TITLES.find((t) => t.level === level) ?? null

// 지금 단계, 다음 칭호, 다음까지 남은 초, 지금 단계 안에서 얼마나 왔는지(0~1). 마지막 단계면 next null, ratio 1
export function progressOf(seconds: number): { level: number; next: Title | null; leftSeconds: number; ratio: number } {
  const level = levelOf(seconds)
  const next = titleOf(level + 1)
  if (!next) return { level, next: null, leftSeconds: 0, ratio: 1 }
  const from = (titleOf(level)?.hours ?? 0) * HOUR
  const to = next.hours * HOUR
  return { level, next, leftSeconds: to - seconds, ratio: (seconds - from) / (to - from) }
}

// before → now 사이에 새로 넘은 가장 높은 단계. 없으면 null (한 번에 여러 단계를 넘어도 축하는 하나)
export function levelCrossed(beforeSeconds: number, nowSeconds: number): number | null {
  const before = levelOf(beforeSeconds)
  const now = levelOf(nowSeconds)
  return now > before ? now : null
}

// 남은 초를 하루 DAILY_HOURS_GUESS 시간씩 공부하면 며칠인지 (올림)
export const daysLeft = (leftSeconds: number) => Math.ceil(leftSeconds / (DAILY_HOURS_GUESS * HOUR))
