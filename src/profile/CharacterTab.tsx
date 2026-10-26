// 내 프로필의 "캐릭터" 탭. 머리·상의·하의·피부색을 골라 저장합니다. (#131, 캐릭터 꾸미기 #56)
//
// 저장하면 profiles.avatar 를 고칩니다. 본인 행만 고칠 수 있게 RLS 가 막고 있고(0004),
// 값의 모양은 DB 제약이 한 번 더 확인합니다(0024).
// 지점 안에서 바꾸면 같은 지점 사람들 화면에도 바로 바뀝니다(useParticipants 의 PROFILE_EVENT).
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { CharacterPicker } from './CharacterPicker'
import { avatarKey } from '../avatar/avatarLogic'
import type { Avatar } from '../avatar/avatarLogic'
import { useMyAvatar } from './useMyAvatar'

export function CharacterTab() {
  const { avatar: saved, save } = useMyAvatar()
  // 아직 고르지 않았으면 null. 그동안에는 저장된 차림을 보여 줍니다.
  const [draft, setDraft] = useState<Avatar | null>(null)
  const chosen = draft ?? saved
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const changed = chosen !== null && (!saved || avatarKey(chosen) !== avatarKey(saved))

  async function submit() {
    if (!chosen || !changed || busy) return
    setError('')
    setNotice('')
    setBusy(true)
    const message = await save(chosen)
    setBusy(false)
    if (message) {
      setError(message)
      return
    }
    setDraft(null)
    setNotice('캐릭터를 바꿨어요. 같은 지점에 있는 사람들에게도 바로 보여요.')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <CharacterPicker
        value={chosen}
        onChange={(m) => {
          setDraft(m)
          setNotice('')
        }}
      />
      <div style={styles.row}>
        <span style={styles.hint}>
          {chosen ? (changed ? '바꾼 차림이 아직 저장되지 않았어요' : '지금 입고 있는 차림이에요') : '불러오는 중…'}
        </span>
        <button type="button" style={{ ...styles.button, ...(!changed || busy ? styles.disabled : null) }} disabled={!changed || busy} onClick={submit}>
          {busy ? '저장 중…' : '저장'}
        </button>
      </div>
      {error && <p style={styles.error}>{error}</p>}
      {notice && <p style={styles.notice}>{notice}</p>}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
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
  disabled: { opacity: 0.45, cursor: 'default' },
  hint: { color: '#9aa1ab', margin: 0, fontSize: 13 },
  error: { color: '#f87171', margin: 0, fontSize: 14 },
  notice: { color: '#4ade80', margin: 0, fontSize: 14 },
}
