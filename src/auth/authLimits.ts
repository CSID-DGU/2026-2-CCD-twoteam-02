// 입력칸 길이 한도를 한곳에 모아 둡니다.
//
// 화면의 maxLength 는 보안 장치가 아닙니다. API 를 직접 부르면 그냥 지나가므로,
// 실제 방어는 Supabase Auth(이메일·비밀번호)와 DB 제약(닉네임 등)이 합니다.
// 여기서 막는 이유는 한도를 넘겼을 때 영문 오류가 뜨는 것을 막고
// 한글 안내를 먼저 보여 주기 위함입니다.
//
// Supabase 가 실제로 거부하는 메시지를 확인해 그 값에 맞췄습니다.
//   이메일 10만 자  → "An email address is too long"
//   비밀번호 73자   → "Password cannot be longer than 72 characters"

export const EMAIL_MAX = 254    // RFC 5321 의 이메일 주소 최대 길이
export const PASSWORD_MAX = 72  // Supabase(bcrypt) 한도

export const NICKNAME_MIN = 2
export const NICKNAME_MAX = 12  // profiles.nickname 의 DB 제약과 같은 값
