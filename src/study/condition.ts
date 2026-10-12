// 사용자 실험 조건: 다른 참여자 캐릭터가 보이는지(visible) / 숨기는지(hidden).
//
// 실험 진행자가 참가자에게 "…/?condition=hidden" 링크를 주면 그 브라우저가 조건을 기억합니다.
// "?condition=visible" 링크로 되돌립니다. 로비를 거쳐 지점에 들어가거나 새로고침해도 유지됩니다.
// 참가자 화면에는 조건을 글자로 띄우지 않습니다(조건을 알면 결과에 영향을 줄 수 있어서).
// 진행자는 지점에 들어갈 때 브라우저 콘솔에 찍히는 "[실험 조건]" 줄로 확인합니다.

export type StudyCondition = 'visible' | 'hidden'

const STORAGE_KEY = 'dooteum.condition'
const PARAM = 'condition'

// 주소의 ?condition= 값. 없거나 모르는 값이면 null
export function conditionFromSearch(search: string): StudyCondition | null {
  const value = new URLSearchParams(search).get(PARAM)
  return value === 'visible' || value === 'hidden' ? value : null
}

// 주소에 조건이 있으면 기억합니다. 저장소를 못 쓰는 브라우저(사생활 보호 모드 등)면 조용히 넘어갑니다.
export function rememberCondition(search: string) {
  const value = conditionFromSearch(search)
  if (!value) return
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // 저장 못 해도 이번 주소에서는 conditionFromSearch 로 읽으므로 괜찮습니다.
  }
}

// 지금 조건: 주소에 있으면 그것, 없으면 기억해 둔 것, 둘 다 없으면 보이는 모드
export function currentCondition(search: string): StudyCondition {
  const fromUrl = conditionFromSearch(search)
  if (fromUrl) return fromUrl
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'visible' || saved === 'hidden') return saved
  } catch {
    // 저장소를 못 쓰면 기본값
  }
  return 'visible'
}
