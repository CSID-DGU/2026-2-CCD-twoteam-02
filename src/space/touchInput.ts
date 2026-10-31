// 폰 터치 조작 입력 (#377). 화면 조이스틱·버튼(TouchControls)이 쓰고, Player·WalkCamera 가 매 프레임 읽습니다.
// 키보드 입력과 같은 자리에 꽂히는 작은 저장소입니다(React 상태가 아니라 다시 그리지 않음).
//   stick      조이스틱 방향·세기 (joystickLogic)
//   look       오른쪽 화면을 끈 양(px). WalkCamera 가 읽으면 비움
//   interact   [E] 를 눌렀는지 (Player 가 읽으면 비움)
//   jump       [점프] 를 눌렀는지 (Player 가 읽으면 비움)
import type { Stick } from './joystickLogic'

const input = { stick: { x: 0, y: 0, run: false } as Stick, lookX: 0, lookY: 0, interact: false, jump: false }

export const getStick = () => input.stick
export function setStick(next: Stick) {
  input.stick = next
}

export function addLook(dx: number, dy: number) {
  input.lookX += dx
  input.lookY += dy
}
export function takeLook(): { dx: number; dy: number } {
  const out = { dx: input.lookX, dy: input.lookY }
  input.lookX = 0
  input.lookY = 0
  return out
}

export function pressInteract() {
  input.interact = true
}
export function pressJump() {
  input.jump = true
}
export function takeInteract(): boolean {
  const v = input.interact
  input.interact = false
  return v
}
export function takeJump(): boolean {
  const v = input.jump
  input.jump = false
  return v
}

// 화면을 떠날 때 남은 입력을 지웁니다 (다음 화면에서 저절로 걷지 않게)
export function resetTouch() {
  input.stick = { x: 0, y: 0, run: false }
  input.lookX = 0
  input.lookY = 0
  input.interact = false
  input.jump = false
}
