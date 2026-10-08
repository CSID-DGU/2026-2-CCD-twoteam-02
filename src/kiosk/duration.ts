// 이용 시간 기준값. passes 테이블의 check 제약과 같은 값이어야 한다.
// (supabase/migrations/0007_pass_duration_custom.sql)

export const STEP_MINUTES = 10 // +/- 한 번에 움직이는 단위
export const MIN_MINUTES = 10 // 최소 이용 시간
export const PRESETS = [10, 30, 60, 120] // 자주 쓰는 값
// 상한은 아직 없다. 팀에서 연장 상한과 함께 정하면 MAX_MINUTES 를 여기 두고 DB 제약도 같이 바꾼다.

export function formatMinutes(m: number): string {
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h === 0) return `${rest}분`
  if (rest === 0) return `${h}시간`
  return `${h}시간 ${rest}분`
}
