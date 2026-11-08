// 뒤로 가지 않는 시계. 공부 기록 조각의 시각에 씁니다. 화면·DB와 무관한 순수 로직입니다.
//
// 컴퓨터 시계(Date.now)는 공부 중에 뒤로 갈 수 있습니다. macOS 의 자동 시간 맞춤이 2초를 한 번에 되돌린 일이 실제로 있었습니다.
// 타이머는 그만큼 줄지 않아서 "조각 길이 < 공부 시간"이 되어 기록이 부풀거나(검사가 있는 DB 에서는 조각이 거절됨) 조각이 겹칩니다. (#444)
//
// 그래서 브라우저의 단조 시계(performance.now, 시계를 바꿔도 영향받지 않음)로 잰 경과 시간을 함께 봅니다.
//   컴퓨터 시계가 경과 시간보다 뒤처지면 → 경과 시간을 믿습니다.
//   컴퓨터 시계가 더 앞서면(시계를 앞으로 옮김, 절전에서 깨어남) → 컴퓨터 시계를 따릅니다.
// 절전 중에 단조 시계가 멈추는 브라우저에서도 시각이 실제보다 뒤처지지 않습니다.
export function makeSteadyClock() {
  let lastNow = -Infinity
  let lastMono = 0
  return (wall: number, mono: number) => {
    lastNow = Math.max(wall, lastNow + (mono - lastMono))
    lastMono = mono
    return lastNow
  }
}

// 탭 하나에 시계 하나. 과목을 바꿔 조각을 새로 시작해도 앞 조각의 끝보다 앞서지 않아 겹치지 않습니다.
const clock = makeSteadyClock()
export const steadyNow = () => clock(Date.now(), performance.now())
