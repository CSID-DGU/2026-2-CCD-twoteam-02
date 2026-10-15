// 메일 링크를 눌렀을 때 돌아올 주소를 만듭니다.
//
// 개발 중에는 http://localhost:5173, 배포본에서는 https://twoteam.vercel.app 이어야 하므로
// 코드에 주소를 적지 않고 지금 열려 있는 주소(window.location.origin)에서 가져옵니다.
//
// 주의: 여기서 만든 주소는 Supabase 대시보드의 Redirect URLs 허용 목록에 있어야 합니다.
// 없으면 메일 링크를 눌러도 Site URL 로만 돌아가서 화면이 엉뚱한 곳으로 갑니다.
//   Authentication > URL Configuration > Redirect URLs
//     http://localhost:5173/**
//     https://twoteam.vercel.app/**

export const RESET_PATH = '/reset-password'
export const EMAIL_CHANGED_PATH = '/email-changed'
export const LOGIN_PATH = '/login'

export function resetRedirectTo() {
  return `${window.location.origin}${RESET_PATH}`
}

// 가입 확인 메일의 링크를 눌렀을 때 돌아올 주소.
// 확인이 끝나면 바로 로그인하면 되므로 로그인 화면으로 보냅니다.
// 지정하지 않으면 Site URL(첫 화면)로 가는데, 거기서 또 로그인 화면을 찾아가야 합니다.
export function signupRedirectTo() {
  return `${window.location.origin}${LOGIN_PATH}`
}

// 이메일 변경 확인 메일의 링크를 눌렀을 때 돌아올 주소.
// 이걸 지정하지 않으면 Site URL(첫 화면)로만 돌아가서, 사용자가 바뀐 건지 알 수 없습니다.
export function emailChangedRedirectTo() {
  return `${window.location.origin}${EMAIL_CHANGED_PATH}`
}
