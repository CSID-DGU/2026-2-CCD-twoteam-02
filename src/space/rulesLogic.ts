// 건물(지점)별 공부 규칙 (캠빛 대학교). React·화면과 무관한 순수 로직입니다. (Node 로 검사)
//
// 캠퍼스 건물은 모두 공부하는 곳이지만 "어떻게 공부하는가"로 성격을 나눕니다(설계 5절).
//   도서관: 다른 탭·휴대폰 허용을 끈 채로 고정, 있는 동안 방해금지 고정, 내 감정표현 끔 (조용히 혼자 몰입)
//   정보관: 다른 탭·학습기기 허용을 켠 채로 고정 (인강·코딩)
// 규칙은 지점 JSON 의 rules 에 적고, 정해진 칸만 고정합니다. 없는 칸은 사용자가 공부 시작 창에서 고릅니다.
// 공부 시작 창에서 잠그는 것만으로는 부족해서, 실제 판정(StudyRunner)에 넘기는 값도 applyRules 로 한 번 더 맞춥니다.

export type BranchRules = {
  allowOtherScreen?: boolean // 다른 탭·앱 사용함 고정 값
  allowDevices?: boolean // 휴대폰·학습기기 사용함 고정 값
  quiet?: boolean // 이 지점에 있는 동안 방해금지를 켠 채로 고정
  emotes?: boolean // false 면 내 감정표현 바퀴·단축키를 끔
  label?: string // 공부 시작 창 맨 위 안내 ("도서관은 조용히 혼자 몰입하는 곳이에요")
}

type Settings = { allowOtherScreen: boolean; allowDevices: boolean }

// 고른 설정에 고정 칸을 덮어씁니다.
export function applyRules<T extends Settings>(choice: T, rules?: BranchRules): T {
  if (!rules) return choice
  return {
    ...choice,
    ...(rules.allowOtherScreen === undefined ? {} : { allowOtherScreen: rules.allowOtherScreen }),
    ...(rules.allowDevices === undefined ? {} : { allowDevices: rules.allowDevices }),
  }
}

// 공부 시작 창에서 잠글 칸: 고정 값, 고를 수 있으면 null
export function lockedSettings(rules?: BranchRules): { allowOtherScreen: boolean | null; allowDevices: boolean | null } {
  return { allowOtherScreen: rules?.allowOtherScreen ?? null, allowDevices: rules?.allowDevices ?? null }
}

export const emotesAllowed = (rules?: BranchRules) => rules?.emotes !== false
