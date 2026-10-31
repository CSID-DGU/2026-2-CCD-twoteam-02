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
  // 비밀번호 재설정·이메일 변경에서 나오는 것들
  [/new password should be different|should be different from the old/i, '지금 쓰는 비밀번호와 다른 비밀번호를 입력해 주세요.'],
  [/email address .* is invalid|email_address_invalid/i, '이메일 형식이 올바르지 않습니다.'],
  [/a user with this email address has already been registered|email_exists/i, '이미 다른 계정이 쓰는 이메일입니다.'],
  [/token has expired or is invalid|otp_expired/i, '링크가 만료되었거나 이미 사용되었습니다. 재설정 메일을 다시 받아 주세요.'],
  [/auth session missing|session_not_found/i, '로그인 정보가 없습니다. 메일의 링크를 다시 눌러 주세요.'],
  [/same as the existing|email address is the same/i, '지금 쓰는 이메일과 같습니다.'],
  // 게스트 입장 (#375)
  [/anonymous sign-ins are disabled|anonymous_provider_disabled/i, '게스트 입장이 아직 꺼져 있어요. 가입하거나 잠시 뒤 다시 해 주세요.'],
  [/database error saving new user/i, '계정을 만들지 못했어요. 닉네임을 바꿔 다시 해 주세요.'],
  [/쓸 수 없는 낱말/, '쓸 수 없는 낱말이 들어 있어요. 다른 닉네임을 정해 주세요.'],
]

export function toKoreanMessage(message: string): string {
  for (const [pattern, text] of TABLE) {
    const found = message.match(pattern)
    if (found) return text.replace('$1', found[1] ?? '')
  }
  return message
}
