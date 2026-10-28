// 팀용 신고 목록 창 (#121). 오른쪽 위 메뉴 "신고 목록"(팀에게만 보임)으로 InfoPanel 안에 뜹니다.
// 종류·확인 여부로 걸러 보고, 한 건을 누르면 설명·화면 정보·최근 30초 수치가 펼쳐집니다. "확인함"으로 처리 표시를 합니다.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { DEFAULT_FILTER, DETAIL_LABEL, KIND_LABEL, applyFilter } from './reportLogic'
import type { Filter, ReportKind, ReportRow } from './reportLogic'
import { SampleTable } from './SampleTable'
import { useIsTeam } from './useIsTeam'
import { useReports } from './useReports'

const KINDS = Object.keys(KIND_LABEL) as ReportKind[]
const CHECKED_LABEL: Record<Filter['checked'], string> = { all: '전체', unchecked: '미확인', checked: '확인함' }
const PREVIEW_CHARS = 40 // 목록 줄에 보이는 설명 글자 수

const when = (iso: string) => new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })

export function ReportsPanel({ myId }: { myId: string }) {
  const team = useIsTeam(myId)
  const { rows, names, loading, error, setChecked } = useReports(team, myId)
  const [filter, setFilter] = useState<Filter>(DEFAULT_FILTER)
  const [openId, setOpenId] = useState<string | null>(null)
  const [rowError, setRowError] = useState('')

  if (!team) return <div style={styles.card}>팀만 볼 수 있습니다.</div>

  const shown = applyFilter(rows, filter)
  const nameOf = (r: ReportRow) => names[r.user_id] ?? r.user_id.slice(0, 8)

  const toggleChecked = async (r: ReportRow) => {
    setRowError('')
    const problem = await setChecked(r.id, r.checked_at === null)
    if (problem) setRowError(problem)
  }

  return (
    <div style={styles.stack}>
      <div style={styles.filters}>
        <label style={styles.filterLabel}>
          종류
          <select style={styles.select} value={filter.kind} onChange={(e) => setFilter((f) => ({ ...f, kind: e.target.value as Filter['kind'] }))}>
            <option value="all">전체</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>{KIND_LABEL[k]}</option>
            ))}
          </select>
        </label>
        <label style={styles.filterLabel}>
          확인
          <select style={styles.select} value={filter.checked} onChange={(e) => setFilter((f) => ({ ...f, checked: e.target.value as Filter['checked'] }))}>
            {(Object.keys(CHECKED_LABEL) as Filter['checked'][]).map((c) => (
              <option key={c} value={c}>{CHECKED_LABEL[c]}</option>
            ))}
          </select>
        </label>
        <span style={styles.count}>{shown.length}건</span>
      </div>

      {error && <div style={styles.error}>{error}</div>}
      {rowError && <div style={styles.error}>{rowError}</div>}
      {loading && !error && <div style={styles.hint}>불러오는 중…</div>}
      {!loading && shown.length === 0 && <div style={styles.hint}>신고가 없어요.</div>}

      {shown.map((r) => {
        const open = openId === r.id
        return (
          <div key={r.id} style={styles.card}>
            <button type="button" style={styles.rowButton} onClick={() => setOpenId(open ? null : r.id)}>
              <span style={styles.meta}>{when(r.created_at)}</span>
              <span style={styles.name}>{nameOf(r)}</span>
              <span style={styles.kind}>
                {KIND_LABEL[r.kind]}
                {r.detail ? ` · ${DETAIL_LABEL[r.detail]}` : ''}
              </span>
              <span style={styles.preview}>{r.message.split('\n')[0].slice(0, PREVIEW_CHARS) || '-'}</span>
              <span style={styles.meta}>
                {r.context.branch ?? '-'} · {r.context.status ?? '-'}
              </span>
              <span style={r.checked_at ? styles.checkOn : styles.checkOff}>{r.checked_at ? '✓ 확인함' : '미확인'}</span>
            </button>
            {open && (
              <div style={styles.detail}>
                <div style={styles.message}>{r.message || '(설명 없음)'}</div>
                <div style={styles.info}>
                  {Object.entries(r.context).map(([k, v]) => (
                    <div key={k} style={styles.infoRow}>
                      <span style={styles.infoKey}>{k}</span>
                      <span style={styles.infoValue}>{v === null ? '-' : String(v)}</span>
                    </div>
                  ))}
                </div>
                <SampleTable samples={r.samples} reportedAt={Date.parse(r.created_at)} />
                <div style={styles.actions}>
                  <button type="button" style={styles.ghost} onClick={() => void toggleChecked(r)}>
                    {r.checked_at ? '확인 취소' : '확인함'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  stack: { display: 'flex', flexDirection: 'column', gap: 8 },
  card: { padding: 12, borderRadius: 12, background: '#20232a', display: 'flex', flexDirection: 'column', gap: 8 },
  filters: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  filterLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#aab0bb' },
  select: { padding: '4px 8px', borderRadius: 6, border: '1px solid #4b5563', background: '#111318', color: '#fff', font: 'inherit' },
  count: { marginLeft: 'auto', color: '#aab0bb', fontSize: 13 },
  hint: { color: '#aab0bb', fontSize: 13 },
  error: { color: '#f87171', fontSize: 13 },
  rowButton: {
    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', width: '100%', padding: 0, border: 'none',
    background: 'transparent', color: '#fff', font: 'inherit', textAlign: 'left', cursor: 'pointer',
  },
  meta: { color: '#aab0bb', fontSize: 12, whiteSpace: 'nowrap' },
  name: { fontWeight: 600 },
  kind: { fontSize: 13 },
  preview: { flex: 1, minWidth: 120, color: '#d1d5db', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  checkOn: { color: '#4ade80', fontSize: 12, whiteSpace: 'nowrap' },
  checkOff: { color: '#facc15', fontSize: 12, whiteSpace: 'nowrap' },
  detail: { display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8, borderTop: '1px solid #2a2e37' },
  message: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  info: { display: 'flex', flexDirection: 'column', gap: 2, padding: 10, borderRadius: 8, background: '#16181d', fontSize: 13 },
  infoRow: { display: 'flex', gap: 8 },
  infoKey: { color: '#aab0bb', minWidth: 130 },
  infoValue: { wordBreak: 'break-all' },
  actions: { display: 'flex', justifyContent: 'flex-end' },
  ghost: {
    padding: '4px 10px', borderRadius: 6, border: '1px solid #4b5563', background: 'transparent',
    color: '#fff', cursor: 'pointer', font: 'inherit', fontSize: 13,
  },
}
