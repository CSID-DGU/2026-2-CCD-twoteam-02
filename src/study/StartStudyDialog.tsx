// 공부 시작 창: 과목과 학습기기 사용 여부를 고릅니다. 내 자리에 앉으면 뜹니다.
import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { SUBJECT_MAX } from './useSubjects'
import type { Subject } from './useSubjects'
import { PHONE_SECONDS } from '../focus/focusLogic'

export type StudyChoice = { subject: Subject; allowDevices: boolean }

type Props = {
  subjects: Subject[]
  loading: boolean
  loadError: string
  addSubject: (name: string) => Promise<Subject | string>
  onStart: (choice: StudyChoice) => void
  onCancel: () => void
}

export function StartStudyDialog({ subjects, loading, loadError, addSubject, onStart, onCancel }: Props) {
  const [picked, setPicked] = useState<Subject | null>(null)
  const [newName, setNewName] = useState('')
  const [allowDevices, setAllowDevices] = useState(false) // 기본은 사용 안 함
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const result = await addSubject(newName)
    setBusy(false)
    if (typeof result === 'string') {
      setError(result)
      return
    }
    setPicked(result)
    setNewName('')
  }

  return (
    <div style={styles.backdrop}>
      <div style={styles.panel}>
        <div style={styles.title}>공부 시작</div>

        <div style={styles.label}>과목</div>
        {loading ? (
          <div style={styles.hint}>과목을 불러오는 중…</div>
        ) : loadError ? (
          <div style={styles.error}>{loadError}</div>
        ) : subjects.length === 0 ? (
          <div style={styles.hint}>아직 과목이 없어요. 아래에서 추가해 주세요.</div>
        ) : (
          <div style={styles.chips}>
            {subjects.map((s) => (
              <button
                key={s.id}
                type="button"
                style={{ ...styles.chip, ...(picked?.id === s.id ? styles.chipOn : null) }}
                onClick={() => setPicked(s)}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        <form style={styles.addRow} onSubmit={handleAdd}>
          <input
            style={styles.input}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="새 과목 이름"
            maxLength={SUBJECT_MAX}
          />
          <button type="submit" style={styles.secondary} disabled={busy || !newName.trim()}>
            추가
          </button>
        </form>
        {error && <div style={styles.error}>{error}</div>}

        <label style={styles.check}>
          <input type="checkbox" checked={allowDevices} onChange={(e) => setAllowDevices(e.target.checked)} />{' '}
          학습기기 사용함
          <div style={styles.hint}>켜면 다른 탭·다른 앱을 써도 공부로 인정합니다. 자리 이탈·졸음 판정은 그대로입니다.</div>
          {/* 사용 안 함이면 휴대폰이 3초 넘게 화면에 보일 때 빨간불이 되므로 미리 알립니다. (focusLogic PHONE_SECONDS) */}
          {!allowDevices && (
            <div style={styles.hint}>📱 휴대폰은 카메라에 보이지 않게 치워 두세요. 화면에 {PHONE_SECONDS}초 넘게 보이면 공부 시간이 멈춥니다.</div>
          )}
        </label>

        <div style={styles.actions}>
          <button type="button" style={styles.secondary} onClick={onCancel}>
            나중에
          </button>
          <button
            type="button"
            style={{ ...styles.primary, opacity: picked ? 1 : 0.5 }}
            disabled={!picked}
            onClick={() => picked && onStart({ subject: picked, allowDevices })}
          >
            {picked ? `${picked.name} 공부 시작` : '과목을 골라 주세요'}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 20, display: 'grid', placeItems: 'center',
    background: 'rgba(0,0,0,.45)',
  },
  panel: {
    width: 360, padding: 20, borderRadius: 12, background: '#20232a', color: '#fff',
    font: '14px/1.6 system-ui, sans-serif', display: 'flex', flexDirection: 'column', gap: 8,
  },
  title: { fontSize: 18, fontWeight: 600, marginBottom: 4 },
  label: { fontWeight: 600 },
  hint: { color: '#aab0bb', fontSize: 12 },
  error: { color: '#f87171', fontSize: 13 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: {
    padding: '4px 10px', borderRadius: 999, border: '1px solid #4b5563', background: 'transparent',
    color: '#fff', cursor: 'pointer', font: 'inherit',
  },
  chipOn: { background: '#22c55e', borderColor: '#22c55e', color: '#0b1a10' },
  addRow: { display: 'flex', gap: 6 },
  input: {
    flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #4b5563', background: '#111318',
    color: '#fff', font: 'inherit',
  },
  check: { cursor: 'pointer', marginTop: 4 },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  primary: {
    padding: '6px 14px', borderRadius: 6, border: 'none', background: '#22c55e', color: '#0b1a10',
    fontWeight: 600, cursor: 'pointer', font: 'inherit',
  },
  secondary: {
    padding: '6px 12px', borderRadius: 6, border: '1px solid #4b5563', background: 'transparent',
    color: '#fff', cursor: 'pointer', font: 'inherit',
  },
}
