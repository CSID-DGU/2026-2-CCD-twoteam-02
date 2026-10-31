// 게스트 가입 확인 메일의 링크를 눌렀을 때 오는 화면 (/guest-linked, #375).
//
// 게스트는 설정 → 내 정보에서 이메일을 붙여 가입합니다(Supabase 익명 → 정식 전환, updateUser({ email })).
// 메일의 링크를 누르면 그 이메일이 지금 계정에 붙고, 계정 번호가 그대로라 공부 기록·캐릭터·칭호가 이어집니다.
// 게스트는 비밀번호가 없으므로 여기서 바로 정합니다(updateUser({ password })). 그다음부터는 이메일·비밀번호로 로그인합니다.
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { styles } from './authStyles'
import { toKoreanMessage } from './authErrors'
import { PASSWORD_MAX } from './authLimits'

type Phase = 'checking' | 'ready' | 'done' | 'invalid'
const WAIT_MS = 5000 // 링크의 로그인 정보를 기다리는 시간

export default function GuestLinkedPage({ onDone }: { onDone?: () => void }) {
  const [phase, setPhase] = useState<Phase>('checking')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordAgain, setPasswordAgain] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // 링크로 들어온 로그인 정보에 이메일이 붙어 있으면 비밀번호를 정할 차례
  useEffect(() => {
    let alive = true
    const read = (user: { email?: string } | null | undefined) => {
      if (!alive || !user?.email) return
      setEmail(user.email)
      setPhase((p) => (p === 'checking' ? 'ready' : p))
    }
    const { data } = supabase.auth.onAuthStateChange((_e, session) => read(session?.user))
    void supabase.auth.getUser().then(({ data: now }) => read(now.user))
    const timer = setTimeout(() => alive && setPhase((p) => (p === 'checking' ? 'invalid' : p)), WAIT_MS)
    return () => {
      alive = false
      clearTimeout(timer)
      data.subscription.unsubscribe()
    }
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
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
    setPhase('done')
  }

  return (
    <div style={styles.page}>
      <form style={styles.card} onSubmit={submit}>
        <h1 style={styles.title}>가입 마무리</h1>
        {phase === 'checking' && <p style={styles.hint}>링크를 확인하는 중입니다…</p>}
        {phase === 'invalid' && (
          <>
            <p style={styles.error}>링크가 만료되었거나 이미 쓰였어요.</p>
            <p style={styles.hint}>게스트로 들어가 설정 → 내 정보에서 확인 메일을 다시 받아 주세요.</p>
          </>
        )}
        {phase === 'ready' && (
          <>
            <p style={styles.notice}>{email} 이(가) 계정에 붙었어요. 게스트 때의 기록이 그대로 이어져요.</p>
            <p style={styles.hint}>앞으로 로그인할 비밀번호를 정해 주세요.</p>
            <label style={styles.label}>
              비밀번호
              <input style={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" maxLength={PASSWORD_MAX} required />
            </label>
            <label style={styles.label}>
              비밀번호 확인
              <input style={styles.input} type="password" value={passwordAgain} onChange={(e) => setPasswordAgain(e.target.value)} autoComplete="new-password" maxLength={PASSWORD_MAX} required />
            </label>
            {error && <p style={styles.error}>{error}</p>}
            <button style={styles.button} type="submit" disabled={busy}>
              {busy ? '저장 중…' : '비밀번호 정하고 들어가기'}
            </button>
          </>
        )}
        {phase === 'done' && (
          <>
            <p style={styles.notice}>가입이 끝났어요. 다음부터는 {email} 와 비밀번호로 로그인해요.</p>
            <button style={styles.button} type="button" onClick={onDone}>
              캠리단길로 가기
            </button>
          </>
        )}
      </form>
    </div>
  )
}
