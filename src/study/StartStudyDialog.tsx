// 공부 시작 창: 과목과 두 가지 허용(다른 탭·앱 사용, 휴대폰·학습기기 사용)을 고릅니다. 내 자리에 앉으면 뜹니다.
// 과목 (#369): 평소에는 과목 칩과 [+ 새 과목]만 보이고, 누르면 이름 칸이 열립니다. 정리한 과목은 빠집니다.
//   "과목 관리"를 누르면 이 창 안에서 과목 관리(이름 바꾸기·정리·지우기) 화면으로 바뀝니다.
import { lockedSettings } from '../space/rulesLogic'
import type { BranchRules } from '../space/rulesLogic'
import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { SUBJECT_MAX, activeSubjects } from './subjectLogic'
import type { Subject } from './subjectLogic'
import type { SubjectsApi } from './useSubjects'
import { SubjectManager } from './SubjectManager'
import { PHONE_SECONDS } from '../focus/focusLogic'

// allowOtherScreen: ⓐ 다른 탭·앱 사용함 (다른 화면 판정 끔), allowDevices: ⓑ 휴대폰·학습기기 사용함 (휴대폰 판정 끔). 따로 켤 수 있습니다. (#172)
export type StudyChoice = { subject: Subject; allowOtherScreen: boolean; allowDevices: boolean }

type Props = Pick<SubjectsApi, 'subjects' | 'loading' | 'loadError' | 'addSubject' | 'renameSubject' | 'setArchived' | 'removeSubject'> & {
  onStart: (choice: StudyChoice) => void
  onCancel: () => void
  rules?: BranchRules // 건물별 규칙 (캠빛 대학교 도서관·정보관). 고정된 칸은 바꿀 수 없음
}

export function StartStudyDialog({ subjects, loading, loadError, addSubject, renameSubject, setArchived, removeSubject, onStart, onCancel, rules }: Props) {
  const fixed = lockedSettings(rules) // 고정된 칸 (null 이면 고를 수 있음)
  const [pickedId, setPickedId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false) // [+ 새 과목]을 눌러 이름 칸을 연 상태
  const [managing, setManaging] = useState(false) // 과목 관리 화면
  const [newName, setNewName] = useState('')
  const [allowOtherScreen, setAllowOtherScreen] = useState(fixed.allowOtherScreen ?? false) // 기본은 둘 다 사용 안 함 (고정이면 그 값)
  const [allowDevices, setAllowDevices] = useState(fixed.allowDevices ?? false)
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
    setPickedId(result.id)
    setNewName('')
    setAdding(false)
  }

  const active = activeSubjects(subjects)
  // 고른 과목은 번호로 들고 있다가 목록에서 찾습니다. 관리에서 이름을 바꾸면 바뀐 이름으로, 정리·지우면 고른 것이 풀립니다.
  const picked: Subject | null = active.find((s) => s.id === pickedId) ?? null
  const showAdd = adding || (!loading && !loadError && active.length === 0) // 과목이 하나도 없으면 처음부터 열어 둠

  if (managing) {
    return (
      <div style={styles.backdrop}>
        <div style={styles.panel}>
          <div style={styles.title}>과목 관리</div>
          <SubjectManager
            subjects={subjects}
            loading={loading}
            loadError={loadError}
            renameSubject={renameSubject}
            setArchived={setArchived}
            removeSubject={removeSubject}
          />
          <div style={styles.actions}>
            <button type="button" style={styles.secondary} onClick={() => setManaging(false)}>
              ← 돌아가기
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.backdrop}>
      <div style={styles.panel}>
        <div style={styles.title}>공부 시작</div>

        <div style={styles.labelRow}>
          <span style={styles.label}>과목</span>
          {subjects.length > 0 && (
            <button type="button" style={styles.link} onClick={() => setManaging(true)}>
              과목 관리
            </button>
          )}
        </div>
        {loading ? (
          <div style={styles.hint}>과목을 불러오는 중…</div>
        ) : loadError ? (
          <div style={styles.error}>{loadError}</div>
        ) : (
          <div style={styles.chips}>
            {active.length === 0 && <div style={styles.hint}>{subjects.length === 0 ? '아직 과목이 없어요. 새 과목을 추가해 주세요.' : '쓰는 과목이 없어요. 새로 추가하거나 과목 관리에서 꺼내 주세요.'}</div>}
            {active.map((s) => (
              <button
                key={s.id}
                type="button"
                style={{ ...styles.chip, ...(picked?.id === s.id ? styles.chipOn : null) }}
                onClick={() => setPickedId(s.id)}
              >
                {s.name}
              </button>
            ))}
            {!showAdd && (
              <button type="button" style={{ ...styles.chip, ...styles.addChip }} onClick={() => setAdding(true)}>
                + 새 과목
              </button>
            )}
          </div>
        )}

        {showAdd && (
          <form style={styles.addRow} onSubmit={handleAdd}>
            <input
              style={styles.input}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
              placeholder="새 과목 이름"
              maxLength={SUBJECT_MAX}
              autoFocus={adding}
            />
            <button type="submit" style={styles.secondary} disabled={busy || !newName.trim()}>
              추가
            </button>
            {adding && active.length > 0 && (
              <button type="button" style={styles.secondary} onClick={() => setAdding(false)}>
                취소
              </button>
            )}
          </form>
        )}
        {error && <div style={styles.error}>{error}</div>}

        {rules?.label && <div style={styles.rule}>🏛 {rules.label}</div>}
        <label style={{ ...styles.check, ...(fixed.allowOtherScreen !== null ? styles.fixed : null) }}>
          <input type="checkbox" checked={allowOtherScreen} disabled={fixed.allowOtherScreen !== null} onChange={(e) => setAllowOtherScreen(e.target.checked)} />{' '}
          다른 탭·앱 사용함{fixed.allowOtherScreen !== null && ' (이 건물은 고정)'}
          <div style={styles.hint}>켜면 다른 탭·다른 앱을 써도 공부로 인정합니다. 자리 이탈·졸음 판정은 그대로입니다.</div>
        </label>
        <label style={{ ...styles.check, ...(fixed.allowDevices !== null ? styles.fixed : null) }}>
          <input type="checkbox" checked={allowDevices} disabled={fixed.allowDevices !== null} onChange={(e) => setAllowDevices(e.target.checked)} />{' '}
          휴대폰·학습기기 사용함{fixed.allowDevices !== null && ' (이 건물은 고정)'}
          <div style={styles.hint}>켜면 휴대폰·패드 등이 카메라에 보여도 공부로 인정합니다. 자리 이탈·졸음 판정은 그대로입니다.</div>
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
            onClick={() => picked && onStart({ subject: picked, allowOtherScreen, allowDevices })}
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
  labelRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' },
  link: { padding: 0, border: 'none', background: 'none', color: '#aab0bb', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', fontSize: 12 },
  addChip: { borderStyle: 'dashed', color: '#aab0bb' },
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
  fixed: { cursor: 'default', opacity: 0.75 }, // 건물 규칙으로 고정된 칸
  rule: { padding: '8px 10px', borderRadius: 8, background: 'rgba(212,178,90,.15)', color: '#e9d39a', fontSize: 13 }, // 건물 안내
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
