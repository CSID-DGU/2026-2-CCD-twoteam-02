// 비밀번호 재설정 요청 화면 (/forgot-password).
//
// 비밀번호를 잊은 사람은 로그인을 못 하므로, "본인이 맞다"를 증명할 방법이 메일뿐입니다.
// 그래서 가입할 때 쓴 주소로 재설정 링크를 보내고, 그 링크를 누른 사람만
// 새 비밀번호를 정할 수 있게 합니다. (링크를 눌렀을 때 가는 곳이 ResetPasswordPage)
//
// 메일을 보냈는지 여부를 화면에 그대로 알려 주면 "이 주소가 가입돼 있는지"를
// 아무나 확인할 수 있게 됩니다. 그래서 주소가 있든 없든 같은 안내를 보여 줍니다.
import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { toKoreanMessage } from './authErrors'
import { styles } from './authStyles'
import { EMAIL_MAX } from './authLimits'
import { resetRedirectTo } from './authRedirect'

type Props = {
  onGoLogin?: () => void
}

export default function ForgotPasswordPage({ onGoLogin }: Props) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
    setNotice('')
    setBusy(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: resetRedirectTo(),
    })
    setBusy(false)

    // 요청이 너무 잦은 경우 등은 알려 줘야 사용자가 기다릴 수 있습니다.
    // 반면 "그런 주소 없음"은 알려 주지 않습니다. (위 머리말 참고)
    if (error) {
      setError(toKoreanMessage(error.message))
      return
    }
    setNotice('재설정 메일을 보냈습니다. 메일의 링크를 눌러 새 비밀번호를 정해 주세요.')
  }

  return (
    <div style={styles.page}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <h1 style={styles.title}>비밀번호 재설정</h1>

        <p style={styles.hint}>가입할 때 쓴 이메일 주소를 입력하면 재설정 링크를 보내 드립니다.</p>

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

        {error && <p style={styles.error}>{error}</p>}
        {notice && <p style={styles.notice}>{notice}</p>}

        <button style={styles.button} type="submit" disabled={busy}>
          {busy ? '보내는 중…' : '재설정 메일 보내기'}
        </button>

        {onGoLogin && (
          <p style={styles.hint}>
            비밀번호가 기억나셨나요?{' '}
            <button style={styles.link} type="button" onClick={onGoLogin}>
              로그인
            </button>
          </p>
        )}
      </form>
    </div>
  )
}
