// 로그인 화면.
//
// 라우터가 아직 없으므로 "로그인 성공 후 어디로 갈지"는 바깥에서 콜백으로 받는다.
// 라우터가 들어오면 onSuccess 에 navigate('/') 를, onGoSignup 에 navigate('/signup') 을 넘기면 된다.
import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { toKoreanMessage } from './authErrors'
import { styles } from './authStyles'

type Props = {
  onSuccess?: () => void
  onGoSignup?: () => void
}

export default function LoginPage({ onSuccess, onGoSignup }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setBusy(false)
    if (error) {
      setError(toKoreanMessage(error.message))
      return
    }
    onSuccess?.()
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
            required
          />
        </label>

        {error && <p style={styles.error}>{error}</p>}

        <button style={styles.button} type="submit" disabled={busy}>
          {busy ? '확인 중…' : '로그인'}
        </button>

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
