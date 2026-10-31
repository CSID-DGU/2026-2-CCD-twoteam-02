// 설정 창의 "내 정보" 칸. 닉네임·생일(별자리)·이메일·비밀번호를 바꿉니다.
// (예전에는 내 프로필의 "정보 변경" 탭이었고, 설정으로 옮겼습니다)
//
// 게스트(#375)면 이메일 칸이 "가입하기"가 됩니다. 이메일을 붙이면(익명 → 정식 전환) 확인 메일의 링크(/guest-linked)에서
// 비밀번호를 정하고, 계정 번호가 그대로라 기록이 이어집니다. 이미 가입된 이메일이면 로그인하러 가야 하고 게스트 기록은 이어지지 않습니다.
//
// 셋을 바꾸는 방법이 각각 다릅니다.
//
//   닉네임     → profiles 테이블을 바로 고칩니다. 본인 행만 고칠 수 있게 RLS 가 막고 있습니다(0004)
//   이메일     → 새 주소로 확인 메일이 가고, 링크를 눌러야 바뀝니다
//   비밀번호   → 여기서 바로 바꾸지 않고 재설정 메일을 보냅니다.
//                남의 컴퓨터에 로그인된 상태가 남아 있어도 비밀번호를 못 바꾸게 하려는 것입니다.
//                (비밀번호를 잊어서 로그인조차 못 하는 경우는 /forgot-password 로 갑니다)
//
// 닉네임의 원본은 profiles.nickname 입니다. 가입할 때 계정 정보(user_metadata)에도 같은 값이
// 들어가지만, 그쪽은 더 이상 쓰지 않습니다. 두 곳을 맞추려 하면 한쪽만 성공했을 때 어긋납니다.
import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from '../auth/useSession'
import { useMyNickname } from '../auth/useMyNickname'
import { toKoreanMessage } from '../auth/authErrors'
import { EMAIL_MAX, NICKNAME_MAX, NICKNAME_MIN } from '../auth/authLimits'
import { emailChangedRedirectTo, guestLinkedRedirectTo, resetRedirectTo } from '../auth/authRedirect'
import { useNavigate } from 'react-router'
import { checkNickname } from '../auth/nicknameRules'
import { announceMyProfileChanged } from '../profile/characters'
import { BirthdayInput } from '../profile/BirthdayInput'
import { useMyBirthday } from '../profile/useMyBirthday'
import type { Birthday } from '../profile/useMyBirthday'
import { SIGNS, signOfBirthday } from '../world/starLogic'

const nameOfSign = (id: string) => SIGNS.find((s) => s.id === id)?.name ?? id

export function AccountSettings() {
  const { session, loading } = useSession()
  const myId = session?.user.id
  const current = session?.user.email ?? ''
  // 이메일 변경을 신청해 두고 아직 링크를 안 누른 상태면 여기에 새 주소가 들어 있습니다.
  const pending = session?.user.new_email ?? ''
  const guest = session?.user.is_anonymous === true // 게스트면 이메일 칸이 "가입하기" (#375)
  const [taken, setTaken] = useState(false) // 게스트가 넣은 이메일이 이미 가입된 이메일
  const navigate = useNavigate()

  const { nickname: savedNickname, reload: reloadNickname } = useMyNickname()
  // 아직 고치지 않았으면 null. 그동안에는 읽어 온 값을 그대로 보여 줍니다.
  // effect 로 맞추면 읽어 오는 사이에 입력칸이 비었다가 채워져 깜빡입니다.
  const [draft, setDraft] = useState<string | null>(null)
  const nickname = draft ?? savedNickname
  // 생일: 고치는 중이면 그 값(undefined 면 저장된 값). 닉네임과 같은 방식으로 깜빡임을 피함
  const { birthday: savedBirthday, save: saveBirthday } = useMyBirthday(myId)
  const [birthdayDraft, setBirthdayDraft] = useState<Birthday | null | undefined>(undefined)
  const birthday = birthdayDraft === undefined ? savedBirthday : birthdayDraft
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  function start() {
    setError('')
    setNotice('')
    setBusy(true)
  }

  async function changeNickname(e: FormEvent) {
    e.preventDefault()
    if (busy || !myId) return

    const name = nickname.trim()
    const bad = checkNickname(name) // 길이·금칙어 (#375, DB 0045 와 같은 규칙)
    if (bad) {
      setError(bad)
      return
    }
    if (name === savedNickname) {
      setError('지금 닉네임과 같습니다.')
      return
    }

    start()
    const { error } = await supabase.from('profiles').update({ nickname: name }).eq('id', myId)
    setBusy(false)

    if (error) {
      setError(toKoreanMessage(error.message))
      return
    }
    setDraft(null) // 다시 읽어 온 값을 쓰도록 되돌립니다
    reloadNickname()
    announceMyProfileChanged() // 지점 안에 있으면 다른 사람 화면의 이름표도 바로 바뀝니다 (#131)
    setNotice('닉네임을 바꿨습니다.')
  }

  // 생일 저장 (월·일, 비우면 지우기) (#321)
  async function changeBirthday(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    start()
    const message = await saveBirthday(birthday)
    setBusy(false)
    if (message) {
      setError(message)
      return
    }
    setBirthdayDraft(undefined)
    setNotice(birthday ? '생일을 저장했습니다.' : '생일을 지웠습니다.')
  }

  async function changeEmail(e: FormEvent) {
    e.preventDefault()
    if (busy) return

    const next = email.trim()
    if (next.toLowerCase() === current.toLowerCase()) {
      setError('지금 쓰는 이메일과 같습니다.')
      return
    }

    start()
    setTaken(false)
    const { error } = await supabase.auth.updateUser(
      { email: next },
      { emailRedirectTo: guest ? guestLinkedRedirectTo() : emailChangedRedirectTo() }
    )
    setBusy(false)

    if (error) {
      // 게스트가 이미 가입된 이메일을 넣음: 그 계정으로 로그인해야 하고, 게스트 기록은 합치지 않음
      if (guest && /already been registered|email_exists|already registered/i.test(error.message)) {
        setTaken(true)
        return
      }
      setError(toKoreanMessage(error.message))
      return
    }
    if (guest) {
      setNotice(`${next} 로 확인 메일을 보냈어요. 메일의 링크를 누르면 비밀번호를 정하는 화면이 떠요.`)
      setEmail('')
      return
    }
    setNotice(
      `${next} 로 확인 메일을 보냈습니다. 기존 주소에도 메일이 갔다면 ` +
        '양쪽 모두 링크를 눌러야 변경이 끝납니다.'
    )
    setEmail('')
  }

  async function sendPasswordReset() {
    if (busy || !current) return
    start()
    const { error } = await supabase.auth.resetPasswordForEmail(current, {
      redirectTo: resetRedirectTo(),
    })
    setBusy(false)

    if (error) {
      setError(toKoreanMessage(error.message))
      return
    }
    setNotice(`${current} 로 재설정 메일을 보냈습니다. 메일의 링크에서 새 비밀번호를 정해 주세요.`)
  }

  if (loading) return <p style={styles.hint}>불러오는 중…</p>

  return (
    <div style={styles.wrap}>
      {error && <p style={styles.error}>{error}</p>}
      {notice && <p style={styles.notice}>{notice}</p>}

      <form style={styles.block} onSubmit={changeNickname}>
        <h2 style={styles.heading}>닉네임</h2>
        <div style={styles.row}>
          <input
            style={styles.input}
            type="text"
            value={nickname}
            onChange={(e) => setDraft(e.target.value)}
            minLength={NICKNAME_MIN}
            maxLength={NICKNAME_MAX}
            required
          />
          <button style={styles.button} type="submit" disabled={busy}>
            {busy ? '…' : '바꾸기'}
          </button>
        </div>
        <p style={styles.hint}>{NICKNAME_MIN}~{NICKNAME_MAX}자. 캐릭터 이름표와 친구 목록에 보입니다.</p>
      </form>

      <form style={styles.block} onSubmit={changeBirthday}>
        <h2 style={styles.heading}>생일</h2>
        <div style={styles.row}>
          <BirthdayInput value={birthday} onChange={setBirthdayDraft} />
          <button style={styles.button} type="submit" disabled={busy}>
            {busy ? '…' : '저장'}
          </button>
        </div>
        <p style={styles.hint}>
          {birthday ? `내 별자리: ${nameOfSign(signOfBirthday(birthday.month, birthday.day))}. ` : ''}
          광장 밤하늘에서 내 별자리를 금색으로 보여 주고 오늘의 운세 맨 위에 보여 줘요. 태어난 해는 받지 않고, 나만 볼 수 있어요.
        </p>
      </form>

      <form style={styles.block} onSubmit={changeEmail}>
        <h2 style={styles.heading}>{guest ? '가입하기' : '이메일'}</h2>
        {guest ? (
          <p style={styles.hint}>이메일을 붙이면 정식 계정이 되고, 지금까지의 공부 기록·캐릭터·닉네임이 그대로 이어져요.</p>
        ) : (
          <p style={styles.hint}>지금 이메일: {current}</p>
        )}
        {pending && <p style={styles.notice}>{pending} 로 변경 신청됨. 메일의 링크를 눌러 주세요.</p>}
        <div style={styles.row}>
          <input
            style={styles.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={guest ? '이메일' : '새 이메일'}
            autoComplete="email"
            maxLength={EMAIL_MAX}
            required
          />
          <button style={styles.button} type="submit" disabled={busy}>
            {busy ? '…' : '확인 메일'}
          </button>
        </div>
        {taken && (
          <p style={styles.error}>
            이미 가입된 이메일이에요. 그 계정으로 로그인하면 게스트 기록은 이어지지 않아요.{' '}
            <button
              type="button"
              style={styles.link}
              onClick={async () => {
                await supabase.auth.signOut()
                navigate('/login')
              }}
            >
              로그인하러 가기
            </button>
          </p>
        )}
        {!guest && (
          <p style={styles.hint}>
            새 주소로 확인 메일이 갑니다. 보안 설정에 따라 기존 주소에도 함께 가며,
            그때는 양쪽 링크를 모두 눌러야 바뀝니다.
          </p>
        )}
      </form>

      {/* 비밀번호: 게스트는 아직 없음 (가입 확인 링크에서 정함) */}
      {!guest && (
        <div style={styles.block}>
          <h2 style={styles.heading}>비밀번호</h2>
          <button style={styles.button} type="button" onClick={sendPasswordReset} disabled={busy}>
            {busy ? '…' : '재설정 메일 보내기'}
          </button>
          <p style={styles.hint}>
            지금 쓰는 이메일로 재설정 메일을 보냅니다. 메일의 링크에서 새 비밀번호를 정해 주세요.
          </p>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'grid', gap: 24 },
  block: { display: 'grid', gap: 8 },
  heading: { margin: 0, fontSize: 15, color: '#e5e7eb' },
  row: { display: 'flex', gap: 8 },
  input: {
    flex: 1,
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #3f4650',
    background: '#1b1f24',
    color: '#e5e7eb',
    fontSize: 14,
  },
  button: {
    padding: '10px 16px',
    borderRadius: 8,
    border: 'none',
    background: '#4ade80',
    color: '#0b0d10',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
  },
  hint: { color: '#9aa1ab', margin: 0, fontSize: 13 },
  error: { color: '#f87171', margin: 0, fontSize: 14 },
  notice: { color: '#4ade80', margin: 0, fontSize: 14 },
  link: { padding: 0, border: 'none', background: 'none', color: '#9ec1ff', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' },
}
