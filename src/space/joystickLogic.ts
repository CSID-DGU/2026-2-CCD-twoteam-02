// 폰 화면 조이스틱 계산 (#377, #117). React·three.js 와 무관한 순수 로직입니다. (Node 로 검사)
//
//   조이스틱  손가락이 가운데에서 떨어진 거리(px)를 방향·세기로. 가운데 작은 원(DEAD) 안은 멈춤,
//             RUN 이상 밀면 달리기. 끝(radius)보다 멀리 끌어도 끝에 붙은 것으로 셈
//   합치기    키보드(WASD)가 눌려 있으면 키보드를, 아니면 조이스틱을 씀. scale 은 걷는 빠르기 배율(조이스틱을 덜 밀면 천천히)

export const STICK = { radius: 56, dead: 0.15, run: 0.92 } // 끝까지의 거리(px), 멈춤 원·달리기 비율 (0~1)

export type Stick = { x: number; y: number; run: boolean } // x 오른쪽 +, y 앞(화면 위) +. 길이 0~1

// 손가락이 가운데에서 dx(오른쪽 +)·dy(아래 +) px 떨어졌을 때
export function stickVector(dx: number, dy: number, radius: number = STICK.radius): Stick {
  const len = Math.hypot(dx, dy)
  if (len === 0) return { x: 0, y: 0, run: false }
  const raw = Math.min(1, len / radius)
  if (raw < STICK.dead) return { x: 0, y: 0, run: false }
  const mag = (raw - STICK.dead) / (1 - STICK.dead) // 멈춤 원 밖부터 0 → 끝 1 로 다시 맞춤
  return { x: (dx / len) * mag, y: (-dy / len) * mag, run: raw >= STICK.run }
}

// 손잡이를 그릴 자리 (끝 원 밖으로 나가지 않게)
export function knobOffset(dx: number, dy: number, radius: number = STICK.radius): { x: number; y: number } {
  const len = Math.hypot(dx, dy)
  if (len <= radius) return { x: dx, y: dy }
  return { x: (dx / len) * radius, y: (dy / len) * radius }
}

// 키보드 앞뒤(f)·옆(r) (-1·0·1) 과 조이스틱을 합칩니다. 방향(f, r)과 빠르기 배율 scale(0~1)
export function combineMove(keyF: number, keyR: number, stick: Stick): { f: number; r: number; scale: number } {
  if (keyF || keyR) return { f: keyF, r: keyR, scale: 1 }
  const mag = Math.min(1, Math.hypot(stick.x, stick.y))
  if (mag === 0) return { f: 0, r: 0, scale: 0 }
  return { f: stick.y, r: stick.x, scale: mag }
}
