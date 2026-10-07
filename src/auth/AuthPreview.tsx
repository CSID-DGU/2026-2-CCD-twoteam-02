// 로그인·회원가입 화면 미리보기.
//
// App.tsx 는 아바타·화면 파트(김현)의 파일이라, 라우터 도입을 상의하기 전까지는 건드리지 않는다.
// 그동안 이 화면들을 눈으로 확인하려고 따로 띄운다. (localhost:5173/auth-preview.html)
// react-router 가 들어오면 이 파일과 preview.tsx, auth-preview.html 은 지운다.
import { useState } from 'react'
import LoginPage from './LoginPage'
import SignupPage from './SignupPage'
import RequireAuth from './RequireAuth'
import LogoutButton from './LogoutButton'
import DbCheck from './DbCheck'
import { useSession } from './useSession'
import { styles } from './authStyles'

export default function AuthPreview() {
  const [screen, setScreen] = useState<'login' | 'signup'>('login')
  const { session } = useSession()

  const fallback =
    screen === 'login' ? (
      <LoginPage onGoSignup={() => setScreen('signup')} />
    ) : (
      <SignupPage onSuccess={() => setScreen('login')} onGoLogin={() => setScreen('login')} />
    )

  return (
    <RequireAuth fallback={fallback}>
      <div style={styles.page}>
        <div style={{ ...styles.card, width: 420 }}>
          <h1 style={styles.title}>로그인됨</h1>
          <p style={styles.hint}>{session?.user.email}</p>
          <p style={styles.hint}>
            닉네임: {String(session?.user.user_metadata?.nickname ?? '(없음)')}
          </p>
          <hr style={{ border: 0, borderTop: '1px solid #4b515c', width: '100%', margin: '4px 0' }} />
          <p style={{ ...styles.hint, color: '#fff' }}>DB 연결·권한 확인</p>
          <DbCheck />
          <hr style={{ border: 0, borderTop: '1px solid #4b515c', width: '100%', margin: '4px 0' }} />
          <LogoutButton />
        </div>
      </div>
    </RequireAuth>
  )
}
