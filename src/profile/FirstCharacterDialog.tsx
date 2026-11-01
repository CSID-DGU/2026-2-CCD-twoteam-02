// 처음 캐릭터 고르기 (#146). 캐릭터를 한 번도 저장하지 않은 사람(새 가입자·아직 안 꾸민 기존 사용자·게스트)이
// 광장·캠퍼스에 처음 들어오면 한 번 뜹니다(WorldScene). "한 번도 안 저장함"은 DB 값으로 압니다(avatarChosen).
//
// 사람마다 모습이 다르도록 무작위 차림으로 시작합니다. 내 프로필의 꾸미기 창(CharacterPicker)을 그대로 씁니다.
// [이 캐릭터로 시작]과 [나중에 고를게요] 둘 다 지금 보이는 차림을 저장하고 닫습니다. 저장하면 다시 뜨지 않습니다(어느 기기에서도).
// 나중에는 내 프로필 → 캐릭터에서 바꿀 수 있습니다.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { CharacterPicker } from './CharacterPicker'
import { fitLayout, randomAvatar } from '../avatar/avatarLogic'
import type { Avatar } from '../avatar/avatarLogic'

const firstLook = () => fitLayout(randomAvatar()) // 처음 보여 줄 무작위 차림

export function FirstCharacterDialog({ save }: { save: (a: Avatar) => Promise<string> }) {
  const [look, setLook] = useState<Avatar>(firstLook)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function done() {
    if (busy) return
    setBusy(true)
    setError('')
    const message = await save(look) // 성공하면 useMyAvatar 의 chosen 이 true 가 되어 이 창이 닫힘
    setBusy(false)
    if (message) setError(message)
  }

  return (
    <div style={styles.backdrop}>
      <div style={styles.panel} role="dialog" aria-label="캐릭터 고르기">
        <div style={styles.title}>나를 대신할 캐릭터를 골라 주세요</div>
        <p style={styles.text}>지점에서 다른 사람들에게 이 모습으로 보여요. 🎲를 누르면 새로 섞어 줘요.</p>
        <CharacterPicker value={look} onChange={setLook} />
        {error && <p style={styles.error}>{error}</p>}
        <div style={styles.actions}>
          <span style={styles.hint}>내 프로필 → 캐릭터에서 언제든 바꿀 수 있어요</span>
          <button type="button" style={styles.ghost} disabled={busy} onClick={done}>
            나중에 고를게요
          </button>
          <button type="button" style={styles.primary} disabled={busy} onClick={done}>
            {busy ? '저장 중…' : '이 캐릭터로 시작'}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, zIndex: 30, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.5)', padding: 16 },
  panel: {
    width: 'min(720px, 100%)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', padding: 20, borderRadius: 14,
    background: '#1b1e24', color: '#fff', font: '14px/1.6 system-ui, sans-serif', display: 'flex', flexDirection: 'column', gap: 10,
  },
  title: { fontSize: 20, fontWeight: 700 },
  text: { margin: 0, color: '#cbd5e1' },
  error: { margin: 0, color: '#f87171' },
  actions: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 },
  hint: { marginRight: 'auto', color: '#9aa1ab', fontSize: 13 },
  primary: { padding: '10px 16px', borderRadius: 8, border: 'none', background: '#4ade80', color: '#0b0d10', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  ghost: { padding: '10px 14px', borderRadius: 8, border: '1px solid #4b5563', background: 'transparent', color: '#fff', cursor: 'pointer', font: 'inherit' },
}
