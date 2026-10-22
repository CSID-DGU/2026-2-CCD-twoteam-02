// 사용자 실험 조건 (docs/사용자-실험-재설계.md)
//   visible = 다른 참여자가 보이고 나도 보입니다. (C 아바타, 일반 지점)
//   hidden  = B(혼자 공부): 다른 참여자·표시등·접속 인원 수를 모두 숨기고, 나도 남에게 보이지 않습니다. (#47)
//
// 조건은 지점마다 정해져 있습니다(#198). 지점 JSON 에 "hideOthers": true 가 있으면 hidden 입니다.
// 참가자 화면에는 조건을 글자로 띄우지 않습니다(조건을 알면 결과에 영향을 줄 수 있어서).
// 진행자는 지점에 들어갈 때 브라우저 콘솔에 찍히는 "[실험 조건]" 줄로 확인합니다.
// 공부 기록(study_logs.condition, 0011)에도 같이 남깁니다.
import type { BranchLayout } from '../space/layout'

export type StudyCondition = 'visible' | 'hidden'

export function conditionOf(branch: BranchLayout): StudyCondition {
  return branch.hideOthers ? 'hidden' : 'visible'
}
