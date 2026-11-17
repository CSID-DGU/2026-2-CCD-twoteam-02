// 뒤로 가지 않는 시계. 공부 기록 조각과 상태 구간의 시각에 씁니다. 화면·DB와 무관한 순수 로직입니다.
//
// 컴퓨터 시계(Date.now)는 공부 중에 뒤로 갈 수 있습니다. macOS 의 자동 시간 맞춤이 2초를 한 번에 되돌린 일이 실제로 있었습니다.
// 타이머는 그만큼 줄지 않아서 "조각 길이 < 공부 시간"이 되고, DB 검사(check_study_log)가 조각을 거절해 5분이 사라졌습니다. (#444)
//
// 그래서 브라우저의 단조 시계(performance.now, 시계를 바꿔도 영향받지 않음)로 잰 경과 시간을 함께 봅니다.
//   컴퓨터 시계가 경과 시간보다 뒤처지면 → 경과 시간을 믿습니다.
//   컴퓨터 시계가 더 앞서면(시계를 앞으로 옮김, 절전에서 깨어남) → 컴퓨터 시계를 따릅니다.
// 절전 중에 단조 시계가 멈추는 브라우저에서도 시각이 실제보다 뒤처지지 않습니다.
//
// 돌려주는 값은 정수 ms 입니다. performance.now 는 소수 ms 라 그대로 주면 0.4ms 짜리 구간이 "길이 있음"으로 남는데,
// DB 에 넣을 때(toISOString) ms 아래가 버려져 시작=끝이 되고 study_segments 의 ended_at > started_at 검사(23514)에 걸렸습니다. (#590 대시보드에서 발견)
// 안에서는 소수까지 더해 나가므로 경과 시간은 줄지 않고, 내림해도 뒤로 가지 않습니다.
export function makeSteadyClock() {
  let lastNow = -Infinity
  let lastMono = 0
  return (wall: number, mono: number) => {
    lastNow = Math.max(wall, lastNow + (mono - lastMono))
    lastMono = mono
    return Math.floor(lastNow)
  }
}

// 탭 하나에 시계 하나. 과목을 바꿔 조각을 새로 시작해도 앞 조각의 끝보다 앞서지 않아 겹치지 않습니다.
const clock = makeSteadyClock()
export const steadyNow = () => clock(Date.now(), performance.now())
