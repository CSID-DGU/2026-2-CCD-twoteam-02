// Supabase가 돌려주는 영어 오류 메시지를 화면에 쓸 한국어 문장으로 바꾼다.
// 목록에 없는 오류는 원문을 그대로 보여 준다. (숨기면 원인을 못 찾는다)

const TABLE: [RegExp, string][] = [
  [/invalid login credentials/i, '이메일 또는 비밀번호가 올바르지 않습니다.'],
  [/email not confirmed/i, '가입 확인 메일의 링크를 먼저 눌러 주세요.'],
  [/user already registered|already been registered/i, '이미 가입된 이메일입니다.'],
  [/password should be at least (\d+)/i, '비밀번호는 $1자 이상이어야 합니다.'],
  [/unable to validate email address|invalid format/i, '이메일 형식이 올바르지 않습니다.'],
  [/for security purposes|rate limit|too many requests/i, '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.'],
  [/failed to fetch|network/i, '서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.'],
]

export function toKoreanMessage(message: string): string {
  for (const [pattern, text] of TABLE) {
    const found = message.match(pattern)
    if (found) return text.replace('$1', found[1] ?? '')
  }
  return message
}
