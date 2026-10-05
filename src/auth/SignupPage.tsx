// 회원가입 화면.
//
// 닉네임은 options.data.nickname 으로 넘긴다.
// DB의 handle_new_user 트리거가 이 값을 읽어 profiles 행을 자동으로 만든다. (0001_init.sql)
// 닉네임 길이 2~12자는 profiles 테이블의 check 제약과 같은 값이다. 한쪽만 바꾸면 안 된다.
import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { toKoreanMessage } from './authErrors'
import { styles } from './authStyles'

export const NICKNAME_MIN = 2
export const NICKNAME_MAX = 12

type Props = {
  onSuccess?: () => void
  onGoLogin?: () => void
}

export default function SignupPage({ onSuccess, onGoLogin }: Props) {
  const [email, setEmail] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [passwordAgain, setPasswordAgain] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError('')
    setNotice('')

    // 서버에 보내기 전에 바로 알 수 있는 것은 먼저 걸러낸다.
    const name = nickname.trim()
    if (name.length < NICKNAME_MIN || name.length > NICKNAME_MAX) {
      setError(`닉네임은 ${NICKNAME_MIN}~${NICKNAME_MAX}자로 입력해 주세요.`)
      return
    }
    if (password !== passwordAgain) {
      setError('비밀번호가 서로 다릅니다.')
      return
    }

    setBusy(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nickname: name } },
    })
    setBusy(false)

    if (error) {
      setError(toKoreanMessage(error.message))
      return
    }

    // 가입 확인 메일을 켜 둔 경우에는 세션이 바로 생기지 않는다.
    if (!data.session) {
      setNotice('가입 확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인해 주세요.')
      return
    }
    onSuccess?.()
  }

  return (
    <div style={styles.page}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <h1 style={styles.title}>회원가입</h1>

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
          닉네임 ({NICKNAME_MIN}~{NICKNAME_MAX}자)
          <input
            style={styles.input}
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            minLength={NICKNAME_MIN}
            maxLength={NICKNAME_MAX}
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
            autoComplete="new-password"
            required
          />
        </label>

        <label style={styles.label}>
          비밀번호 확인
          <input
            style={styles.input}
            type="password"
            value={passwordAgain}
            onChange={(e) => setPasswordAgain(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>

        {error && <p style={styles.error}>{error}</p>}
        {notice && <p style={styles.notice}>{notice}</p>}

        <button style={styles.button} type="submit" disabled={busy}>
          {busy ? '가입 중…' : '가입하기'}
        </button>

        {onGoLogin && (
          <p style={styles.hint}>
            이미 계정이 있으신가요?{' '}
            <button style={styles.link} type="button" onClick={onGoLogin}>
              로그인
            </button>
          </p>
        )}
      </form>
    </div>
  )
}
