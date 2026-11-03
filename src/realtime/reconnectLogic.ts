// 실시간 연결이 끊겼을 때 언제 다시 붙을지 정하는 계산 (화면·React와 무관한 순수 로직) (#441)
//
// 한도 초과로 끊길 때는 방 사람들이 거의 동시에 끊긴다. 같은 간격으로 다시 붙으면 또 같이 몰려서 또 끊기므로,
// 사람마다 무작위로 흩어지게 하고(지터) 실패할수록 더 오래 기다린다(점증 대기).
//
//   연속 실패  기다리는 시간
//   1번째      1 ~ 5초
//   2번째      2 ~ 10초
//   3번째      4 ~ 20초
//   4번째부터  6 ~ 30초

export const RECONNECT_FIRST_MAX_MS = 5000 // 첫 재연결을 흩뿌리는 범위의 위쪽 끝
export const RECONNECT_MAX_MS = 30000 // 아무리 실패해도 이보다 오래 기다리지 않는다
const RECONNECT_MIN_RATIO = 0.2 // 범위의 아래쪽 끝 = 위쪽 끝의 이 비율 (너무 빨리 다시 붙지 않게)

// 이만큼 연결이 유지돼야 "회복됐다"고 보고 실패 횟수를 지운다.
// 붙자마자 다시 끊기는 동안(한도 초과가 이어질 때) 대기가 처음으로 돌아가면 몰림이 계속되기 때문이다.
export const RECONNECT_STABLE_MS = 30000

// subscribe 콜백 상태 중 연결이 끊긴 것들. SUBSCRIBED 외에는 다 끊김이지만 이름으로 적어 둔다.
export function isDownStatus(status: string): boolean {
  return status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED'
}

// 이번에 끊겼을 때의 연속 실패 횟수. upMs: 끊기기 전까지 연결이 유지된 시간 (연결된 적 없으면 0)
export function nextFailures(failures: number, upMs: number): number {
  return upMs >= RECONNECT_STABLE_MS ? 1 : failures + 1
}

// 다시 연결하기까지 기다릴 시간. failures 는 1부터. random 은 0~1 (Math.random)
export function reconnectDelay(failures: number, random: number): number {
  const max = Math.min(RECONNECT_FIRST_MAX_MS * 2 ** (failures - 1), RECONNECT_MAX_MS)
  const min = max * RECONNECT_MIN_RATIO
  return min + (max - min) * random
}
