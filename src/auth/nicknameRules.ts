// 닉네임 규칙 (#375). React·Supabase 와 무관한 순수 로직입니다. (Node 로 검사)
//
// 가입·게스트 입장·닉네임 변경이 모두 이 규칙으로 먼저 확인하고, DB 도 같은 규칙으로 한 번 더 막습니다
// (0001 의 길이 제약, 0045 의 금칙어 트리거). 화면에서 먼저 알려 주는 까닭은, DB 에서 막히면 가입이
// "Database error saving new user" 같은 알아보기 힘든 오류로 끝나기 때문입니다.
//
// 금칙어: 흔한 욕설·비하어·운영자 사칭. 띄어쓰기·대소문자를 무시하고, 닉네임 안에 들어 있기만 해도 걸립니다.
// 완벽히 막을 수는 없어(변형) 나머지는 신고(#121)로 처리합니다.
// ★ 이 목록을 바꾸면 supabase 의 banned_words 표에도 같이 넣거나 빼 주세요(0045 의 insert 참고).
import { NICKNAME_MAX, NICKNAME_MIN } from './authLimits'

export const BANNED_WORDS = [
  // 욕설
  '시발', '씨발', '씨바', '시팔', '씨팔', 'ㅅㅂ', 'ㅆㅂ', '병신', '븅신', 'ㅂㅅ', '좆', '존나', 'ㅈㄴ',
  '개새', '새끼', 'ㅅㄲ', '미친', '지랄', 'ㅈㄹ', '염병', '닥쳐', '꺼져', '니미', '느금', '니애미', '애미', '애비',
  // 성적·비하
  '섹스', '보지', '자지', '걸레', '창녀', '한남', '김치녀', '틀딱',
  // 영어
  'fuck', 'shit', 'bitch', 'sex', 'porn',
  // 운영자 사칭
  '관리자', '운영자', '운영진', 'admin', '두뜀',
] as const

// 비교용: 공백을 빼고 소문자로
export const normalizeNickname = (name: string) => name.replace(/\s+/g, '').toLowerCase()

// 쓸 수 있으면 '', 아니면 안내문
export function checkNickname(raw: string): string {
  const name = raw.trim()
  if (name.length < NICKNAME_MIN || name.length > NICKNAME_MAX) return `닉네임은 ${NICKNAME_MIN}~${NICKNAME_MAX}자로 정해 주세요.`
  const flat = normalizeNickname(name)
  if (BANNED_WORDS.some((w) => flat.includes(w))) return '쓸 수 없는 낱말이 들어 있어요. 다른 닉네임을 정해 주세요.'
  return ''
}
