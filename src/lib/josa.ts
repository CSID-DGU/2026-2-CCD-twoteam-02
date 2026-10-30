// 이름 뒤에 붙는 조사를 받침에 맞게 고릅니다. ("학생회관 카페는", "캠빛 중앙도서관은", "광장으로")
// 화면 안내에 지점·건물 이름을 넣을 때 씁니다. 마지막 글자가 한글이 아니면 둘 다 적습니다("Cafe은(는)").
const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3
const JONG_COUNT = 28 // 받침 종류 수 (없음 포함)
const RIEUL = 8 // ㄹ 받침 번호 ("로"를 씀)

// 마지막 글자의 받침 번호. 0 이면 받침 없음, 한글이 아니면 null
function lastJong(word: string): number | null {
  const code = word.trim().charCodeAt(word.trim().length - 1)
  if (code < HANGUL_START || code > HANGUL_END) return null
  return (code - HANGUL_START) % JONG_COUNT
}

// 은/는
export function topic(word: string): string {
  const j = lastJong(word)
  return word + (j === null ? '은(는)' : j ? '은' : '는')
}

// 으로/로 (받침이 없거나 ㄹ 받침이면 로)
export function toward(word: string): string {
  const j = lastJong(word)
  return word + (j === null ? '(으)로' : j && j !== RIEUL ? '으로' : '로')
}
