// 과목 관리 (#369): 이름 바꾸기, 정리·꺼내기, 지우기.
// 공부 시작 창의 "과목 관리"와 설정의 [과목] 탭이 같이 씁니다.
//   쓰는 과목    공부 시작 창에 보이는 과목
//   정리한 과목  공부 시작 창에서 빠진 과목. 내 기록에는 이름 그대로 남고, [꺼내기]로 되돌림
//   지우기      공부 시간은 남고 이름만 없어짐 (내 기록에서는 "(지운 과목)"). 누르면 한 번 더 확인
import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { useSession } from '../auth/useSession'
import { useSubjects } from './useSubjects'
import type { SubjectsApi } from './useSubjects'
import { SUBJECT_MAX, activeSubjects, archivedSubjects, checkSubjectName } from './subjectLogic'
import type { Subject } from './subjectLogic'

type Props = Pick<SubjectsApi, 'subjects' | 'loading' | 'loadError' | 'renameSubject' | 'setArchived' | 'removeSubject'>

export function SubjectManager({ subjects, loading, loadError, renameSubject, setArchived, removeSubject }: Props) {
  const [editing, setEditing] = useState<number | null>(null) // 이름을 고치는 과목
  const [draft, setDraft] = useState('')
  const [confirming, setConfirming] = useState<number | null>(null) // 지우기 확인 중인 과목
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // 바꾸는 일 하나를 실행하고, 실패하면 안내문을 보여 줍니다.
  async function run(task: () => Promise<string>) {
    if (busy) return
    setBusy(true)
    setError('')
    const message = await task()
    setBusy(false)
    setError(message)
    return message
  }

  function startEdit(s: Subject) {
    setConfirming(null)
    setEditing(s.id)
    setDraft(s.name)
    setError('')
  }

  async function saveEdit(e: FormEvent, s: Subject) {
    e.preventDefault()
    if (draft.trim() === s.name) return setEditing(null) // 그대로면 닫기만
    const invalid = checkSubjectName(draft, subjects.filter((o) => o.id !== s.id))
    if (invalid) return setError(invalid)
    const message = await run(() => renameSubject(s.id, draft))
    if (message === '') setEditing(null)
  }

  async function remove(s: Subject) {
    const message = await run(() => removeSubject(s.id))
    if (message === '') setConfirming(null)
  }

  if (loading) return <div style={styles.hint}>과목을 불러오는 중…</div>
  if (loadError) return <div style={styles.error}>{loadError}</div>
  if (subjects.length === 0) return <div style={styles.hint}>아직 과목이 없어요. 공부 시작 창에서 과목을 추가할 수 있어요.</div>

  const row = (s: Subject) => {
    const archived = s.archivedAt !== null
    if (editing === s.id) {
      return (
        <form key={s.id} style={styles.row} onSubmit={(e) => void saveEdit(e, s)}>
          <input
            style={styles.input}
            value={draft}
            maxLength={SUBJECT_MAX}
            autoFocus
            aria-label="새 과목 이름"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
          />
          <button type="submit" style={styles.primary} disabled={busy || !draft.trim()}>
            저장
          </button>
          <button type="button" style={styles.small} onClick={() => setEditing(null)}>
            취소
          </button>
        </form>
      )
    }
    if (confirming === s.id) {
      return (
        <div key={s.id} style={styles.confirm}>
          <div>
            <b>{s.name}</b> 과목을 지울까요? 공부 시간은 남고 이름만 지워져요. 내 기록에는 "(지운 과목)"으로 보여요.
          </div>
          <div style={styles.actions}>
            <button type="button" style={styles.small} onClick={() => setConfirming(null)}>
              취소
            </button>
            <button type="button" style={styles.danger} disabled={busy} onClick={() => void remove(s)}>
              지우기
            </button>
          </div>
        </div>
      )
    }
    return (
      <div key={s.id} style={styles.row}>
        <span style={{ ...styles.name, ...(archived ? styles.dim : null) }}>{s.name}</span>
        <button type="button" style={styles.small} disabled={busy} onClick={() => startEdit(s)}>
          이름 바꾸기
        </button>
        <button type="button" style={styles.small} disabled={busy} onClick={() => void run(() => setArchived(s.id, !archived))}>
          {archived ? '꺼내기' : '정리'}
        </button>
        <button
          type="button"
          style={styles.small}
          disabled={busy}
          onClick={() => {
            setEditing(null)
            setConfirming(s.id)
            setError('')
          }}
        >
          지우기
        </button>
      </div>
    )
  }

  const active = activeSubjects(subjects)
  const archived = archivedSubjects(subjects)
  return (
    <div style={styles.wrap}>
      <div style={styles.label}>쓰는 과목</div>
      {active.length === 0 ? <div style={styles.hint}>모두 정리했어요.</div> : active.map(row)}
      {archived.length > 0 && (
        <>
          <div style={{ ...styles.label, marginTop: 8 }}>정리한 과목</div>
          <div style={styles.hint}>공부 시작 창에는 안 보이고, 내 기록에는 그대로 남아요.</div>
          {archived.map(row)}
        </>
      )}
      {error && <div style={styles.error}>{error}</div>}
    </div>
  )
}

// 설정의 [과목] 탭
export function SubjectSettings() {
  const { session } = useSession()
  const api = useSubjects(session?.user.id)
  return <SubjectManager {...api} />
}

const button: CSSProperties = { padding: '3px 8px', borderRadius: 6, font: 'inherit', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }
const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontWeight: 600 },
  hint: { color: '#aab0bb', fontSize: 12 },
  error: { color: '#f87171', fontSize: 13 },
  row: { display: 'flex', alignItems: 'center', gap: 4 },
  name: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  dim: { color: '#9aa1ab' },
  input: { flex: 1, minWidth: 0, padding: '4px 8px', borderRadius: 6, border: '1px solid #4b5563', background: '#111318', color: '#fff', font: 'inherit' },
  small: { ...button, border: '1px solid #4b5563', background: 'transparent', color: '#fff' },
  primary: { ...button, border: 'none', background: '#22c55e', color: '#0b1a10', fontWeight: 600 },
  danger: { ...button, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 600 },
  confirm: { display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', borderRadius: 8, background: 'rgba(239,68,68,.12)', fontSize: 13 },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 6 },
}
