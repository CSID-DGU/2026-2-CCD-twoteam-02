// 신고하기 창 (#121). 오른쪽 위 메뉴 "신고하기"로 InfoPanel 안에 뜹니다.
// 종류를 고르고 한 줄 적어 보내면, 그때의 화면 정보와 최근 30초 판정 수치가 같이 저장됩니다.
// 영상·사진·화면 캡처는 어디에도 없습니다. 같이 보내는 정보는 보내기 전에 펼쳐 볼 수 있습니다.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../lib/supabase'
import { DETAIL_LABEL, KIND_LABEL, MESSAGE_MAX, validateDraft } from './reportLogic'
import type { Draft, JudgmentDetail, ReportKind } from './reportLogic'
import { buildInsert, sendReport } from './sendReport'
import type { ReportInsert } from './sendReport'
import { SampleTable } from './SampleTable'

const KINDS = Object.keys(KIND_LABEL) as ReportKind[]
const DETAILS = Object.keys(DETAIL_LABEL) as JudgmentDetail[]

// 지금 화면에서 신고 한 건을 만듭니다 (미리 보기와 보내기가 같은 것을 씁니다)
const draftInsert = (myId: string, draft: Draft) =>
  buildInsert({
    myId, draft, nowMs: Date.now(), page: location.pathname, search: location.search, userAgent: navigator.userAgent,
  })

export function ReportPanel({ myId }: { myId: string }) {
  const [draft, setDraft] = useState<Draft>({ kind: null, detail: null, message: '' })
  // 펼친 순간의 미리 보기 (버튼을 누를 때 만들어 둡니다. 렌더 중에 시각·버퍼를 읽지 않기 위해)
  const [preview, setPreview] = useState<{ insert: ReportInsert; at: number } | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // 미리 보기는 종류를 아직 안 골랐어도 보여야 하므로 임시 종류로 만듭니다 (종류는 context 에 안 들어감)
  const toggleInfo = () =>
    setPreview((p) => (p ? null : { insert: draftInsert(myId, { ...draft, kind: draft.kind ?? 'other' }), at: Date.now() }))

  const send = async () => {
    const problem = validateDraft(draft)
    if (problem) {
      setError(problem)
      return
    }
    setSending(true)
    setError('')
    const result = await sendReport(draftInsert(myId, draft), supabase)
    setSending(false)
    if (result) setError(result)
    else setDone(true)
  }

  if (done) {
    return (
      <div style={styles.card}>
        <div style={styles.doneText}>접수됐어요. 고맙습니다.</div>
        <div style={styles.hint}>팀이 확인하고 고칠게요. 닫으려면 ✕ 또는 Esc.</div>
      </div>
    )
  }

  return (
    <div style={styles.card}>
      <div style={styles.hint}>판정이 틀렸거나 화면이 이상하면 알려 주세요. 영상·사진은 보내지 않고 수치와 글자만 보냅니다.</div>

      <div style={styles.label}>종류</div>
      <div style={styles.chips}>
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            style={{ ...styles.chip, ...(draft.kind === k ? styles.chipOn : null) }}
            onClick={() => setDraft((d) => ({ ...d, kind: k }))}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {draft.kind === 'judgment' && (
        <div style={styles.chips}>
          {DETAILS.map((d) => (
            <button
              key={d}
              type="button"
              style={{ ...styles.chip, ...(draft.detail === d ? styles.chipOn : null) }}
              onClick={() => setDraft((x) => ({ ...x, detail: d }))}
            >
              {DETAIL_LABEL[d]}
            </button>
          ))}
        </div>
      )}

      <label htmlFor="report-message" style={styles.label}>
        설명 <span style={styles.hint}>(선택)</span>
      </label>
      <textarea
        id="report-message"
        style={styles.textarea}
        rows={3}
        maxLength={MESSAGE_MAX}
        placeholder="무엇을 하고 있었고 무엇이 이상했는지"
        value={draft.message}
        onChange={(e) => setDraft((d) => ({ ...d, message: e.target.value }))}
      />
      <div style={styles.count}>
        {draft.message.length}/{MESSAGE_MAX}
      </div>

      <button type="button" style={styles.ghost} onClick={toggleInfo}>
        {preview ? '같이 보내는 정보 접기' : '같이 보내는 정보 보기'}
      </button>
      {preview && (
        <div style={styles.info}>
          {Object.entries(preview.insert.context).map(([k, v]) => (
            <div key={k} style={styles.infoRow}>
              <span style={styles.infoKey}>{k}</span>
              <span style={styles.infoValue}>{v === null ? '-' : String(v)}</span>
            </div>
          ))}
          <div style={styles.label}>최근 30초 판정 수치</div>
          <SampleTable samples={preview.insert.samples} reportedAt={preview.at} />
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}
      <div style={styles.actions}>
        <button type="button" style={{ ...styles.primary, ...(sending ? styles.primaryOff : null) }} disabled={sending} onClick={send}>
          {sending ? '보내는 중…' : '보내기'}
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  card: { padding: 16, borderRadius: 12, background: '#20232a', display: 'flex', flexDirection: 'column', gap: 8 },
  label: { fontWeight: 600 },
  hint: { color: '#aab0bb', fontSize: 12 },
  error: { color: '#f87171', fontSize: 13 },
  doneText: { fontSize: 16, fontWeight: 600 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: {
    padding: '4px 10px', borderRadius: 999, border: '1px solid #4b5563', background: 'transparent',
    color: '#fff', cursor: 'pointer', font: 'inherit',
  },
  chipOn: { background: '#22c55e', borderColor: '#22c55e', color: '#0b1a10' },
  textarea: {
    padding: '6px 8px', borderRadius: 6, border: '1px solid #4b5563', background: '#111318',
    color: '#fff', font: 'inherit', resize: 'vertical',
  },
  count: { color: '#aab0bb', fontSize: 12, textAlign: 'right' },
  ghost: {
    alignSelf: 'flex-start', padding: '4px 10px', borderRadius: 6, border: '1px solid #4b5563', background: 'transparent',
    color: '#fff', cursor: 'pointer', font: 'inherit', fontSize: 13,
  },
  info: { display: 'flex', flexDirection: 'column', gap: 4, padding: 10, borderRadius: 8, background: '#16181d', fontSize: 13 },
  infoRow: { display: 'flex', gap: 8 },
  infoKey: { color: '#aab0bb', minWidth: 130 },
  infoValue: { wordBreak: 'break-all' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  primary: {
    padding: '6px 14px', borderRadius: 6, border: 'none', background: '#22c55e', color: '#0b1a10',
    fontWeight: 600, cursor: 'pointer', font: 'inherit',
  },
  primaryOff: { background: '#374151', color: '#9ca3af', cursor: 'default' },
}
