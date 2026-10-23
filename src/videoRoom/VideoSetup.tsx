// 진행자용 설정 창 (#192). room A 화면에서 Shift+O 로 엽니다. 참가자에게는 보이지 않게 숨은 키로 둡니다.
// 팀원 녹화 영상 3개와 이름표를 고르면 이 컴퓨터 브라우저 안에 저장합니다(videoStore.ts).
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { savePeers } from './videoStore'
import type { PeerVideo } from './videoStore'

type Props = {
  peers: PeerVideo[]
  onSaved: (peers: PeerVideo[]) => void
  onClose: () => void
}

export function VideoSetup({ peers, onSaved, onClose }: Props) {
  const [draft, setDraft] = useState(peers)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const change = (i: number, patch: Partial<PeerVideo>) => setDraft((d) => d.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  const save = async () => {
    setBusy(true)
    setMessage('')
    try {
      await savePeers(draft)
      onSaved(draft)
      onClose()
    } catch (e) {
      setMessage(`저장하지 못했어요: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.title}>room A 영상 설정 (진행자용)</h2>
        <p style={styles.help}>영상은 이 컴퓨터 브라우저 안에만 저장돼요. 서버나 git 으로 가지 않아요.</p>
        {draft.map((p, i) => (
          <div key={i} style={styles.card}>
            <label style={styles.row}>
              <span style={styles.label}>이름표 {i + 1}</span>
              <input style={styles.input} value={p.name} maxLength={20} onChange={(e) => change(i, { name: e.target.value })} />
            </label>
            <label style={styles.row}>
              <span style={styles.label}>영상 {i + 1}</span>
              <input
                type="file"
                accept="video/*"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) change(i, { file, fileName: file.name })
                }}
              />
            </label>
            <span style={styles.help}>{p.file ? `지금: ${p.fileName || '이름 없는 파일'}` : '아직 고르지 않았어요'}</span>
          </div>
        ))}
        {message && <p style={styles.error}>{message}</p>}
        <div style={styles.buttons}>
          <button type="button" style={styles.ghost} onClick={onClose}>
            닫기
          </button>
          <button type="button" style={styles.primary} disabled={busy} onClick={() => void save()}>
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, zIndex: 30, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.6)' },
  panel: {
    width: 'min(520px, calc(100vw - 32px))', padding: 20, borderRadius: 12, background: '#16181d', color: '#fff',
    font: '14px/1.6 system-ui, sans-serif', display: 'flex', flexDirection: 'column', gap: 12,
  },
  title: { margin: 0, fontSize: 18 },
  card: { padding: 12, borderRadius: 10, background: '#20232a', display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', alignItems: 'center', gap: 10 },
  label: { width: 64, flexShrink: 0, color: '#aab0bb' },
  input: { flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid #4b5563', background: '#16181d', color: '#fff', font: 'inherit' },
  help: { margin: 0, color: '#aab0bb', fontSize: 12 },
  error: { margin: 0, color: '#fca5a5' },
  buttons: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  ghost: { padding: '6px 12px', borderRadius: 6, border: '1px solid #4b5563', background: 'transparent', color: '#fff', cursor: 'pointer', font: 'inherit' },
  primary: { padding: '6px 12px', borderRadius: 6, border: 'none', background: '#22c55e', color: '#0b1a10', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
}
