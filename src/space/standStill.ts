// 서 있을 때 가만히 (#244)
//
// Kenney 캐릭터의 idle 동작은 서 있는 동안 몸을 계속 흔들어서 너무 과했습니다(팀원 피드백).
// idle 을 지우지 않고 재생 속도를 0으로 둬서 첫 장면(차렷 자세)에 멈춰 둡니다.
// 그래서 걷다가 멈추면 지금처럼 부드럽게(fadeIn) 넘어가 그 자세로 서 있고, 걷기·달리기는 그대로 움직입니다.
// 컴포넌트 안에서 동작 객체의 값을 직접 바꾸지 않도록(React 규칙) 여기서 바꿉니다.
import type { AnimationAction } from 'three'

export function holdStandingPose(idle: AnimationAction | null | undefined) {
  idle?.setEffectiveTimeScale(0)
}
