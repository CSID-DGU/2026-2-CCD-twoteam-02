// 로그인한 사람만 children 을 보게 한다.
//
// 라우터가 아직 없으므로 "로그인 안 됐을 때 보여 줄 것"을 fallback 으로 받는다.
// 라우터가 들어오면 fallback 에 <Navigate to="/login" replace /> 를 넘기면 된다.
import type { ReactNode } from 'react'
import { useSession } from './useSession'
import { styles } from './authStyles'

type Props = {
  children: ReactNode
  fallback: ReactNode
}

export default function RequireAuth({ children, fallback }: Props) {
  const { session, loading } = useSession()

  // 첫 확인이 끝나기 전에 fallback 을 보여 주면, 새로고침할 때마다 로그인 화면이 깜빡인다.
  if (loading) {
    return (
      <div style={styles.page}>
        <p style={styles.hint}>로그인 상태를 확인하는 중…</p>
      </div>
    )
  }

  return <>{session ? children : fallback}</>
}
