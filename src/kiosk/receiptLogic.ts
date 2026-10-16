// 이용권 영수증 계산 (#39). 화면·React와 무관한 순수 로직입니다.
//
// 별다방(키오스크): 이용권이 있어 남은 시간을 거꾸로 셉니다. 시간이 지나도 자리는 유지되고(#38) "초과"로 셉니다.
// 솔카페(앉으면 내 자리): 사용자에게 보이는 이용권이 없어(0014의 12시간 기록은 내부용) 앉은 시간을 스톱워치처럼 셉니다.

export const SOON_MS = 10 * 60 * 1000 // 이만큼 이하로 남으면 눈에 띄게 (10분)

export type ReceiptMode = 'pass' | 'stopwatch'
export type TimeState = 'ok' | 'soon' | 'over'

// 지점 종류로 영수증 모양을 정합니다.
export const modeOf = (branchKind: string | null | undefined): ReceiptMode =>
  branchKind === 'cafe' ? 'stopwatch' : 'pass'

// 남은 시간(ms)으로 상태를 정합니다. 0 이하면 초과입니다.
export function timeState(leftMs: number): TimeState {
  if (leftMs <= 0) return 'over'
  if (leftMs <= SOON_MS) return 'soon'
  return 'ok'
}

// 영수증에 찍는 시각 "14:05"
export function clockOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 영수증 번호처럼 보이는 짧은 글자. 이용 기록 번호(uuid) 앞 여섯 자리를 씁니다.
export const receiptNo = (sessionId: string) => sessionId.replace(/-/g, '').slice(0, 6).toUpperCase()
