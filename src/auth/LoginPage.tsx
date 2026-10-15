// 로그인 화면.
//
// 라우터가 아직 없으므로 "로그인 성공 후 어디로 갈지"는 바깥에서 콜백으로 받는다.
// 라우터가 들어오면 onSuccess 에 navigate('/') 를, onGoSignup 에 navigate('/signup') 을 넘기면 된다.
import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { toKoreanMessage } from './authErrors'
import { styles } from './authStyles'
import { EMAIL_MAX, PASSWORD_MAX } from './authLimits'
import { signupRedirectTo } from './authRedirect'
import { setKeepSignedIn } from './sessionStorageChoice'

type Props = {
  onGoForgot?: () => void
  onSuccess?: () => void
  onGoSignup?: () => void
}

export default function LoginPage({ onSuccess, onGoSignup, onGoForgot }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // 아직 가입 확인을 안 한 계정이면 "확인 메일 다시 받기"를 띄웁니다.
  // 메일이 스팸함에 묻히거나 링크가 만료되면 달리 들어올 방법이 없기 때문입니다.
  const [needsConfirm, setNeedsConfirm] = useState(false)
  // 기본은 꺼짐. 로그아웃하면 지워지므로 다시 올 때도 항상 꺼진 상태입니다. (#128)
  const [keepSignedIn, setKeep] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
    setNotice('')
    setNeedsConfirm(false)
    setBusy(true)

    // 로그인 정보를 어디에 둘지 먼저 정합니다. 로그인이 끝나면 바로 저장되므로
    // 이 줄이 signInWithPassword 보다 앞에 있어야 합니다. (#128)
    setKeepSignedIn(keepSignedIn)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setBusy(false)
    if (error) {
      setError(toKoreanMessage(error.message))
      setNeedsConfirm(/email not confirmed/i.test(error.message))
      return
    }
    onSuccess?.()
  }

  // 가입 확인 메일을 다시 보냅니다.
  async function resendConfirm() {
    if (busy) return
    setError('')
    setNotice('')
    setBusy(true)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: signupRedirectTo() },
    })
    setBusy(false)

    if (error) {
      setError(toKoreanMessage(error.message))
      return
    }
    setNeedsConfirm(false)
    setNotice('확인 메일을 다시 보냈습니다. 메일함(스팸함 포함)을 확인해 주세요.')
  }

  return (
    <div style={styles.page}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <h1 style={styles.title}>로그인</h1>

        <label style={styles.label}>
          이메일
          <input
            style={styles.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            maxLength={EMAIL_MAX}
            required
          />
        </label>

        <label style={styles.label}>
          비밀번호
          <input
            style={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            maxLength={PASSWORD_MAX}
            required
          />
        </label>

        <label style={styles.check}>
          <input type="checkbox" checked={keepSignedIn} onChange={(e) => setKeep(e.target.checked)} />
          로그인 유지
        </label>
        <p style={styles.hint}>
          켜지 않으면 브라우저를 닫을 때 로그아웃됩니다. 공용 컴퓨터에서는 끄고 쓰세요.
        </p>

        {error && <p style={styles.error}>{error}</p>}
        {notice && <p style={styles.notice}>{notice}</p>}

        {needsConfirm && (
          <p style={styles.hint}>
            메일이 오지 않았나요?{' '}
            <button style={styles.link} type="button" onClick={resendConfirm} disabled={busy}>
              확인 메일 다시 받기
            </button>
          </p>
        )}

        <button style={styles.button} type="submit" disabled={busy}>
          {busy ? '확인 중…' : '로그인'}
        </button>

        {onGoForgot && (
          <p style={styles.hint}>
            비밀번호를 잊으셨나요?{' '}
            <button style={styles.link} type="button" onClick={onGoForgot}>
              재설정하기
            </button>
          </p>
        )}

        {onGoSignup && (
          <p style={styles.hint}>
            계정이 없으신가요?{' '}
            <button style={styles.link} type="button" onClick={onGoSignup}>
              회원가입
            </button>
          </p>
        )}
      </form>
    </div>
  )
}
