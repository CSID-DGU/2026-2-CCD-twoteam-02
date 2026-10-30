// 점프 높이 계산. React·화면과 무관한 순수 로직입니다.
//
// 서 있거나 걸을 때 점프 키(기본 Space — 앉았을 때 "정면 보기"와 같은 키)를 누르면 제자리에서 폴짝 뜁니다.
// 걸으면서 뛰면 앞으로 가면서 뜁니다(위아래만 더하고 앞뒤 이동은 그대로).
// 높이는 포물선(위로 던진 공처럼)으로, 가운데에서 가장 높고 처음과 끝은 바닥입니다.
//   y = 4·높이·s·(1 − s),  s = 지난 시간 / 점프 시간 (0~1)
// 하늘에 떠 있는 동안에는 다시 뛰지 않습니다(두 번 점프 없음).

export const JUMP_HEIGHT = 1.2 // 가장 높이 뜨는 높이(공간 크기). 캐릭터 키(약 1.6)의 3/4쯤 (사용자 결정, 2026-10-31)
// 뛰어서 내려올 때까지 걸리는 시간(초). 높이 뛸수록 오래 떠 있어야 자연스러워서, 높이를 올리며 같이 늘렸습니다.
export const JUMP_SECONDS = 0.8

// 뛴 지 elapsed 초가 지났을 때의 높이. 아직 안 뛰었거나(음수) 이미 내려왔으면 0
export function jumpHeight(elapsed: number): number {
  if (elapsed <= 0 || elapsed >= JUMP_SECONDS) return 0
  const s = elapsed / JUMP_SECONDS
  return 4 * JUMP_HEIGHT * s * (1 - s)
}

// 뛴 지 elapsed 초가 지났을 때 아직 하늘에 떠 있는지
export const inAir = (elapsed: number) => elapsed >= 0 && elapsed < JUMP_SECONDS
