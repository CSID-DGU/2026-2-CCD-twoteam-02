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
import { EMAIL_MAX, NICKNAME_MAX, NICKNAME_MIN, PASSWORD_MAX } from './authLimits'
import { signupRedirectTo } from './authRedirect'
import { checkNickname } from './nicknameRules'
import { BirthdayInput } from '../profile/BirthdayInput'
import type { Birthday } from '../profile/useMyBirthday'


type Props = {
  onSuccess?: () => void
  onGoLogin?: () => void
}

export default function SignupPage({ onSuccess, onGoLogin }: Props) {
  const [email, setEmail] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [passwordAgain, setPasswordAgain] = useState('')
  // 생일(선택, 양력 월·일만). 광장 밤하늘에서 내 별자리를 금색으로 보여 주고 운세 창에 내 별자리 운세를 보여 줌 (#321)
  const [birthday, setBirthday] = useState<Birthday | null>(null)
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
    const bad = checkNickname(name) // 길이·금칙어 (#375, DB 0045 와 같은 규칙)
    if (bad) {
      setError(bad)
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
      // 생일은 닉네임처럼 가입 정보로 넘기고, 가입 트리거(0035)가 profiles 에 넣습니다.
      options: {
        data: { nickname: name, ...(birthday ? { birth_month: birthday.month, birth_day: birthday.day } : {}) },
        emailRedirectTo: signupRedirectTo(),
      },
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
            maxLength={EMAIL_MAX}
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
          생일 (선택)
          <BirthdayInput value={birthday} onChange={setBirthday} />
          <span style={{ fontSize: 12, opacity: 0.7 }}>캠리단길 밤하늘에서 내 별자리를 찾아 줘요. 태어난 해는 받지 않고, 나만 볼 수 있어요.</span>
        </label>

        <label style={styles.label}>
          비밀번호
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
          비밀번호 확인
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
