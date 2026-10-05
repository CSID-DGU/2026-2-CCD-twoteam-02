// Supabase 연결. 화면 쪽에서는 이 파일의 supabase 하나만 가져다 쓴다.
//
// 키는 .env.local 에 둔다. 이 파일은 git에 올라가지 않는다(.gitignore 의 *.local).
// 처음 받은 사람은 .env.example 을 복사해 .env.local 을 만들고 값을 채우면 된다.
//
// 넣는 키는 Publishable key(= anon key)다. 브라우저에 그대로 노출되는 값이라
// 테이블 접근은 RLS 정책이 막는다. Secret key(service_role)는 절대 넣지 않는다.
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  throw new Error(
    'Supabase 환경 변수가 없습니다. .env.example 을 복사해 .env.local 을 만들고 ' +
      'VITE_SUPABASE_URL 과 VITE_SUPABASE_PUBLISHABLE_KEY 를 채워 주세요.'
  )
}

export const supabase = createClient(url, publishableKey)
