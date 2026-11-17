// Supabase 연결. 화면 쪽에서는 이 파일의 supabase 하나만 가져다 쓴다.
//
// 키는 .env.local 에 둔다. 이 파일은 git에 올라가지 않는다(.gitignore 의 *.local).
// 처음 받은 사람은 .env.example 을 복사해 .env.local 을 만들고 값을 채우면 된다.
//
// 넣는 키는 Publishable key(= anon key)다. 브라우저에 그대로 노출되는 값이라
// 테이블 접근은 RLS 정책이 막는다. Secret key(service_role)는 절대 넣지 않는다.
import { createClient } from '@supabase/supabase-js'
import { choosingStorage } from '../auth/sessionStorageChoice'
import { opsFetch } from '../ops/opsFetch'
import { startTelemetry } from '../ops/telemetry'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  throw new Error(
    'Supabase 환경 변수가 없습니다. .env.example 을 복사해 .env.local 을 만들고 ' +
      'VITE_SUPABASE_URL 과 VITE_SUPABASE_PUBLISHABLE_KEY 를 채워 주세요.'
  )
}

// 메일 링크(비밀번호 재설정·게스트 가입 확인)를 눌러 들어왔는지 (#513).
// 링크는 주소 끝에 #access_token=…&type=recovery 처럼 일회용 로그인 정보를 붙여 오고, supabase-js 가 읽은 뒤 주소에서 지웁니다.
// "로그인돼 있음"만으로는 링크를 누른 사람인지 알 수 없어서(남의 PC에 남은 로그인), 지워지기 전 주소를 여기서 남겨 둡니다.
// createClient 보다 먼저 읽습니다.
export const openedFromAuthLink = new URLSearchParams(window.location.hash.slice(1)).has('access_token')

// 로그인 정보를 어디에 둘지는 choosingStorage 가 그때그때 고릅니다. (#128)
// 기본은 창을 닫으면 사라지는 곳이고, "로그인 유지"를 고른 사람만 남깁니다.
//
// autoRefreshToken 은 끄지 않습니다. 끄면 토큰이 만료되는 1시간 뒤에 로그아웃되어
// 2시간짜리 공부 중에 좌석과 기록이 끊깁니다.
//
// global.fetch: 400 이상 응답을 운영 대시보드용으로 셉니다(#590, src/ops/opsFetch.ts). 응답은 그대로 돌려줍니다.
export const supabase = createClient(url, publishableKey, {
  auth: { storage: choosingStorage },
  global: { fetch: opsFetch },
})
startTelemetry(supabase)

// 재설정 메일 링크로 들어오면 supabase-js 가 PASSWORD_RECOVERY 이벤트를 한 번 보냅니다 (#513).
// 재설정 화면이 이벤트보다 늦게 떠도 놓치지 않게 여기서 받아 둡니다. 로그아웃하면 지웁니다.
let passwordRecovery = false
const recoveryListeners = new Set<() => void>()
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') passwordRecovery = false
  if (event !== 'PASSWORD_RECOVERY') return
  passwordRecovery = true
  recoveryListeners.forEach((l) => l())
})
// 재설정 링크로 들어왔으면 cb 를 부름 (이미 들어왔으면 바로). 돌려준 함수로 그만 듣기
export function onPasswordRecovery(cb: () => void): () => void {
  if (passwordRecovery) cb()
  recoveryListeners.add(cb)
  return () => recoveryListeners.delete(cb)
}

// 보기 전용 실시간 연결: 캠리단길 지점 안 통창 너머로 광장을 걷는 사람을 볼 때만 씁니다(CafeWindows).
// 광장 화면의 연결(supabase)과 따로 두어, 지점에서 광장으로 나가는 순간 닫히는 중인 광장 방을
// 광장 화면이 이어받아 실시간이 끊기는 일을 막습니다. 공개 방을 듣기만 해서 로그인 정보는 쓰지 않습니다.
export const watchSupabase = createClient(url, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'sb-watch-only' },
})

// 결과를 기다리지 않고 보내는 요청 (접속 신호, 창을 닫을 때 반납·저장 등).
// supabase-js 의 rpc()·from() 은 await 나 then 을 붙여야 실제로 요청을 보냅니다.
// `void supabase.rpc(...)` 만 쓰면 요청이 한 번도 나가지 않습니다(#448). 그래서 이 함수가 then 을 붙여 보내고,
// 실패하면 무엇을 못 했는지(what) 콘솔에 남깁니다.
export function sendNow(request: PromiseLike<{ error: { message: string } | null }>, what: string) {
  request.then(
    ({ error }) => {
      if (error) console.error(`${what}:`, error.message)
    },
    (e: unknown) => console.error(`${what}:`, e),
  )
}
