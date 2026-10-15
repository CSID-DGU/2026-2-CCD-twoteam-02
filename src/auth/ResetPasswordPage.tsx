// 새 비밀번호 입력 화면 (/reset-password).
//
// 재설정 메일의 링크를 누르면 여기로 옵니다. 그 링크에는 일회용 토큰이 들어 있고,
// supabase-js 가 주소를 읽어 임시 로그인 상태(복구 세션)를 만들어 줍니다.
// 그래서 이 화면에서는 "지금 비밀번호"를 묻지 않습니다. 메일을 받은 사람 = 본인이기 때문입니다.
//
// 토큰 처리는 supabase-js 가 알아서 하지만 즉시 끝나지는 않습니다. 그래서 화면을 바로
// 보여 주지 않고, PASSWORD_RECOVERY 이벤트나 세션이 확인될 때까지 기다립니다.
// (createClient 의 detectSessionInUrl 기본값이 true 라 따로 켤 것은 없습니다)
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { toKoreanMessage } from './authErrors'
import { styles } from './authStyles'
import { PASSWORD_MAX } from './authLimits'

type Props = {
  onDone?: () => void
  onGoForgot?: () => void
}

// 링크를 확인하는 동안 / 확인됨 / 링크가 잘못됨
type Phase = 'checking' | 'ready' | 'invalid'

export default function ResetPasswordPage({ onDone, onGoForgot }: Props) {
  const [phase, setPhase] = useState<Phase>('checking')
  const [password, setPassword] = useState('')
  const [passwordAgain, setPasswordAgain] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true

    // 메일 링크를 눌러 들어오면 이 이벤트가 옵니다.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return
      if (event === 'PASSWORD_RECOVERY' || session) setPhase('ready')
    })

    // 이벤트를 놓쳤을 수도 있으니 지금 세션도 한 번 확인합니다.
    supabase.auth.getSession().then(({ data: now }) => {
      if (!alive) return
      setPhase(now.session ? 'ready' : 'invalid')
    })

    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
    setNotice('')

    if (password !== passwordAgain) {
      setError('비밀번호가 서로 다릅니다.')
      return
    }

    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)

    if (error) {
      setError(toKoreanMessage(error.message))
      return
    }

    // 비밀번호를 바꾼 뒤에는 복구 세션을 끊고 새 비밀번호로 다시 로그인하게 합니다.
    // 그래야 "바뀐 비밀번호로 들어가진다"를 사용자가 직접 확인하게 됩니다.
    await supabase.auth.signOut()
    setNotice('비밀번호를 바꿨습니다. 새 비밀번호로 로그인해 주세요.')
    onDone?.()
  }

  if (phase === 'checking') {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>비밀번호 재설정</h1>
          <p style={styles.hint}>링크를 확인하는 중입니다…</p>
        </div>
      </div>
    )
  }

  if (phase === 'invalid') {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>비밀번호 재설정</h1>
          <p style={styles.error}>링크가 만료되었거나 올바르지 않습니다.</p>
          <p style={styles.hint}>재설정 메일을 다시 받아 주세요. 링크는 한 번만 쓸 수 있습니다.</p>
          {onGoForgot && (
            <button style={styles.button} type="button" onClick={onGoForgot}>
              재설정 메일 다시 받기
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <h1 style={styles.title}>새 비밀번호</h1>

        <label style={styles.label}>
          새 비밀번호
          <input
            style={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            required
          />
        </label>

        <label style={styles.label}>
          새 비밀번호 확인
          <input
            style={styles.input}
            type="password"
            value={passwordAgain}
            onChange={(e) => setPasswordAgain(e.target.value)}
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            required
          />
        </label>

        {error && <p style={styles.error}>{error}</p>}
        {notice && <p style={styles.notice}>{notice}</p>}

        <button style={styles.button} type="submit" disabled={busy}>
          {busy ? '바꾸는 중…' : '비밀번호 바꾸기'}
        </button>
      </form>
    </div>
  )
}
