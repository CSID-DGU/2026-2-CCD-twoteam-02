// 설정 창의 "단축키" 칸 (#250). 키 칸을 누르고 원하는 키를 누르면 바뀝니다. Esc 는 취소.
// 이미 다른 동작이 쓰던 키면 서로 바꾸고 알려 줍니다. 이동·채팅 등에 쓰는 키는 고를 수 없습니다(keymap.ts).
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { DEFAULT_KEYMAP, KEY_ACTIONS, assignKey, getKeymap, keyLabel, setKeymap, useKeymap } from './keymap'
import type { KeyAction } from './keymap'

const MODIFIERS = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'])
const nameOf = (action: KeyAction) => KEY_ACTIONS.find((a) => a.action === action)?.label ?? action

export function KeymapSettings() {
  const keys = useKeymap()
  const [listening, setListening] = useState<KeyAction | null>(null) // 키를 기다리는 동작
  const [message, setMessage] = useState('')

  // 키를 기다리는 동안에는 누른 키를 다른 단축키·창 닫기보다 먼저 가로챕니다(capture 단계).
  useEffect(() => {
    if (!listening) return
    const down = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.code === 'Escape') {
        setListening(null)
        setMessage('')
        return
      }
      if (MODIFIERS.has(e.code)) return // Shift 등만 누른 것은 기다림
      if (e.ctrlKey || e.metaKey || e.altKey) {
        setMessage('Ctrl·Cmd·Alt 와 함께 누르는 키는 고를 수 없어요.')
        return
      }
      const result = assignKey(getKeymap(), listening, e.code)
      if (!result.ok) {
        setMessage(result.error)
        return
      }
      setKeymap(result.keymap)
      setListening(null)
      setMessage(
        result.swapped
          ? `${nameOf(result.swapped)}은(는) ${keyLabel(result.keymap[result.swapped])} 로 바뀌었어요.`
          : `${nameOf(listening)}을(를) ${keyLabel(e.code)} 로 바꿨어요.`,
      )
    }
    window.addEventListener('keydown', down, true)
    return () => window.removeEventListener('keydown', down, true)
  }, [listening])

  const isDefault = (Object.keys(DEFAULT_KEYMAP) as KeyAction[]).every((a) => keys[a] === DEFAULT_KEYMAP[a])

  return (
    <div style={styles.card}>
      <div style={styles.head}>
        <span style={styles.label}>단축키</span>
        <button
          type="button"
          style={{ ...styles.reset, ...(isDefault ? styles.resetOff : null) }}
          disabled={isDefault}
          onClick={() => {
            setKeymap({ ...DEFAULT_KEYMAP })
            setListening(null)
            setMessage('기본 단축키로 되돌렸어요.')
          }}
        >
          기본값
        </button>
      </div>
      {KEY_ACTIONS.map(({ action, label }) => (
        <div key={action} style={styles.row}>
          <span>{label}</span>
          <button
            type="button"
            style={{ ...styles.keyButton, ...(listening === action ? styles.keyListening : null) }}
            onClick={() => {
              setListening(listening === action ? null : action)
              setMessage('')
            }}
          >
            {listening === action ? '키를 누르세요 (Esc 취소)' : keyLabel(keys[action])}
          </button>
        </div>
      ))}
      <span style={styles.help}>
        {message || '이동(WASD·방향키), 달리기(Shift), 채팅(Enter), 감정표현(1~8)은 바꿀 수 없어요. 이 브라우저에 기억돼요.'}
      </span>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  card: { padding: 16, borderRadius: 12, background: '#20232a', display: 'flex', flexDirection: 'column', gap: 6 },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontWeight: 700 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  keyButton: {
    minWidth: 44, padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,.35)', background: 'transparent',
    color: '#fff', cursor: 'pointer', font: '13px ui-monospace, monospace',
  },
  keyListening: { border: '1px solid #a78bfa', color: '#c4b5fd', font: '12px system-ui, sans-serif' },
  help: { color: '#aab0bb', fontSize: 13, marginTop: 4 },
  reset: {
    padding: '4px 10px', borderRadius: 6, border: '1px solid #4b5563', background: 'transparent', color: '#fff',
    cursor: 'pointer', font: 'inherit', fontSize: 13,
  },
  resetOff: { color: '#6b7280', border: '1px solid #374151', cursor: 'default' },
}
