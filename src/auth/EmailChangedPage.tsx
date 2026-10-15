// 이메일 변경 확인 메일의 링크를 눌렀을 때 오는 화면 (/email-changed).
//
// 왜 필요한가:
//   Supabase 의 Secure email change 를 켜 두면 기존 주소와 새 주소 양쪽에 메일이 가고,
//   둘 다 링크를 눌러야 변경이 끝납니다. 그런데 링크를 눌러도 첫 화면으로만 돌아가서
//   사용자는 "바뀐 건지, 한 번 더 눌러야 하는지" 알 수가 없습니다.
//
//   그래서 돌아올 곳을 이 화면으로 지정하고, 지금 어느 단계인지 알려 줍니다.
//
// 어떻게 구분하는가:
//   변경 신청을 하면 계정에 '바꾸려는 주소'(new_email)가 함께 저장됩니다.
//   양쪽 확인이 모두 끝나면 그 값이 비워지고 email 이 새 주소로 바뀝니다.
//   그래서 new_email 이 아직 남아 있으면 한쪽이 덜 끝난 것입니다.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { styles } from './authStyles'

type Props = {
  onGoLogin?: () => void
}

type Phase = 'checking' | 'pending' | 'done' | 'unknown'

export default function EmailChangedPage({ onGoLogin }: Props) {
  const [phase, setPhase] = useState<Phase>('checking')
  const [email, setEmail] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true

    function read(user: { email?: string; new_email?: string } | undefined) {
      if (!alive) return
      if (!user) {
        setPhase('unknown')
        return
      }
      setEmail(user.email ?? '')
      setPendingEmail(user.new_email ?? '')
      setPhase(user.new_email ? 'pending' : 'done')
    }

    // 주소에 담긴 토큰을 supabase-js 가 처리하면 이 이벤트가 옵니다.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => read(session?.user))

    // 이벤트를 놓쳤을 수도 있으니 지금 상태도 한 번 확인합니다.
    supabase.auth.getUser().then(({ data: now }) => read(now.user ?? undefined))

    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])

  // 바뀐 주소로 다시 로그인하게 합니다. 지금 로그인 정보에는 예전 주소가 남아 있어서,
  // 끊고 새로 들어와야 바뀐 것이 확실히 반영됩니다.
  async function goLogin() {
    if (busy) return
    setBusy(true)
    await supabase.auth.signOut()
    setBusy(false)
    onGoLogin?.()
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>이메일 변경</h1>

        {phase === 'checking' && <p style={styles.hint}>확인하는 중입니다…</p>}

        {phase === 'pending' && (
          <>
            <p style={styles.notice}>한쪽 확인이 끝났습니다.</p>
            <p style={styles.hint}>
              남은 주소로 보낸 메일의 링크도 눌러 주세요. 양쪽을 모두 눌러야 변경이 끝납니다.
            </p>
            <p style={styles.hint}>
              지금 이메일: {email || '—'} · 바꾸려는 이메일: {pendingEmail}
            </p>
          </>
        )}

        {phase === 'done' && (
          <>
            <p style={styles.notice}>이메일이 {email} 로 바뀌었습니다.</p>
            <p style={styles.hint}>바뀐 이메일로 다시 로그인해 주세요.</p>
            {onGoLogin && (
              <button style={styles.button} type="button" onClick={goLogin} disabled={busy}>
                {busy ? '나가는 중…' : '로그인 화면으로 가기'}
              </button>
            )}
          </>
        )}

        {phase === 'unknown' && (
          <>
            <p style={styles.error}>확인 정보를 읽지 못했습니다.</p>
            <p style={styles.hint}>링크가 만료되었거나 이미 사용되었을 수 있습니다.</p>
            {onGoLogin && (
              <button style={styles.button} type="button" onClick={goLogin} disabled={busy}>
                로그인 화면으로 가기
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
