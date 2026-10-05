// 로그아웃 버튼. 아바타 화면 한쪽에 올릴 용도라 position 은 바깥에서 정하도록 열어 둔다.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../lib/supabase'

const base: CSSProperties = {
  padding: '6px 12px',
  borderRadius: 8,
  border: 'none',
  background: '#fff',
  color: '#20232a',
  font: '14px system-ui, sans-serif',
  cursor: 'pointer',
  boxShadow: '0 1px 4px rgba(0,0,0,.3)',
}

export default function LogoutButton({ style }: { style?: CSSProperties }) {
  const [busy, setBusy] = useState(false)

  return (
    <button
      style={{ ...base, ...style }}
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        await supabase.auth.signOut()
        setBusy(false)
      }}
    >
      {busy ? '…' : '로그아웃'}
    </button>
  )
}
