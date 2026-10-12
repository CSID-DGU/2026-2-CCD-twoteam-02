// 프로필 화면의 작은 계산. React 와 무관한 순수 로직입니다.

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

// "2026-10-12" → { tick: "월", full: "10월 12일 (월)" }. DB가 한국 시간 기준 날짜를 줍니다.
export function dayLabel(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  const w = WEEKDAY[new Date(y, m - 1, d).getDay()]
  return { tick: w, full: `${m}월 ${d}일 (${w})` }
}
