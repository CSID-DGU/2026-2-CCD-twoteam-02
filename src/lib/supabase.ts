// Supabase 연결. 화면 쪽에서는 이 파일의 supabase 하나만 가져다 쓴다.
//
// 키는 .env.local 에 둔다. 이 파일은 git에 올라가지 않는다(.gitignore 의 *.local).
// 처음 받은 사람은 .env.example 을 복사해 .env.local 을 만들고 값을 채우면 된다.
//
// 넣는 키는 Publishable key(= anon key)다. 브라우저에 그대로 노출되는 값이라
// 테이블 접근은 RLS 정책이 막는다. Secret key(service_role)는 절대 넣지 않는다.
import { createClient } from '@supabase/supabase-js'
import { choosingStorage } from '../auth/sessionStorageChoice'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  throw new Error(
    'Supabase 환경 변수가 없습니다. .env.example 을 복사해 .env.local 을 만들고 ' +
      'VITE_SUPABASE_URL 과 VITE_SUPABASE_PUBLISHABLE_KEY 를 채워 주세요.'
  )
}

// 로그인 정보를 어디에 둘지는 choosingStorage 가 그때그때 고릅니다. (#128)
// 기본은 창을 닫으면 사라지는 곳이고, "로그인 유지"를 고른 사람만 남깁니다.
//
// autoRefreshToken 은 끄지 않습니다. 끄면 토큰이 만료되는 1시간 뒤에 로그아웃되어
// 2시간짜리 공부 중에 좌석과 기록이 끊깁니다.
export const supabase = createClient(url, publishableKey, {
  auth: { storage: choosingStorage },
})

// 보기 전용 실시간 연결: 캠리단길 지점 안 통창 너머로 광장을 걷는 사람을 볼 때만 씁니다(CafeWindows).
// 광장 화면의 연결(supabase)과 따로 두어, 지점에서 광장으로 나가는 순간 닫히는 중인 광장 방을
// 광장 화면이 이어받아 실시간이 끊기는 일을 막습니다. 공개 방을 듣기만 해서 로그인 정보는 쓰지 않습니다.
export const watchSupabase = createClient(url, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'sb-watch-only' },
})
