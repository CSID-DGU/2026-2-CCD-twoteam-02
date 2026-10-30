// 공부 시간 순위 창 (#59). 광장 순위 게시판 앞에서 E 를 누르면 뜹니다.
//
//   탭     오늘(서울 0시부터) · 이번 주(월요일부터). 처음은 오늘. 탭을 바꾸면 그 기간을 새로 읽습니다
//   목록   1~20위. 공개 범위가 '모두'인 사람만, 같은 분이면 같은 등수. 이름을 누르면 프로필 창
//   내 줄  맨 아래에 늘 보임. 내가 순위에 안 나오는 공개 범위면 이유를 알려 줌
// 창이 떠 있는 동안 광장은 캐릭터·시점·단축키를 멈춥니다(WorldScene). Esc·닫기·바깥 누르기로 닫습니다.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useRanking } from './useRanking'
import { PERIOD_LABEL, labelNames, minutesText, myLine } from './rankingLogic'
import type { Period } from './rankingLogic'

const PERIODS: Period[] = ['today', 'week']
const MEDAL = ['🥇', '🥈', '🥉']
const GOLD = '#ffd27a'

type Props = {
  myId: string | null
  onClose: () => void
  onOpenProfile: (userId: string) => void // 이름을 누르면 (광장이 이 창을 닫고 프로필 창을 엶)
}

export function RankingPanel({ myId, onClose, onOpenProfile }: Props) {
  const [period, setPeriod] = useState<Period>('today')
  const { ranking, error, loading } = useRanking(period)
  const names = ranking ? labelNames(ranking.top) : []
  const mine = ranking ? myLine(ranking.me) : null

  // 창을 열면 마우스 잠금을 풀어 버튼을 누를 수 있게 하고, Esc 로 닫습니다.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    if (document.pointerLockElement) document.exitPointerLock()
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>🏆 공부 시간 순위</span>
          <button type="button" style={styles.close} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div style={styles.tabs}>
          {PERIODS.map((p) => (
            <button key={p} type="button" style={{ ...styles.tab, ...(p === period ? styles.tabOn : null) }} onClick={() => setPeriod(p)}>
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={styles.note}>불러오는 중…</p>
        ) : error ? (
          <p style={styles.note}>{error}</p>
        ) : ranking && ranking.top.length === 0 ? (
          <p style={styles.note}>아직 이 기간에 공부한 사람이 없어요.</p>
        ) : (
          <ol style={styles.list}>
            {ranking?.top.map((r, i) => (
              <li key={r.id}>
                <button
                  type="button"
                  style={{ ...styles.row, ...(r.id === myId ? styles.rowMine : null) }}
                  onClick={() => onOpenProfile(r.id)}
                  title="프로필 보기"
                >
                  <span style={styles.rank}>{r.rank <= MEDAL.length ? MEDAL[r.rank - 1] : `${r.rank}위`}</span>
                  <span style={styles.name}>{names[i]}</span>
                  <span style={styles.time}>{minutesText(r.minutes)}</span>
                </button>
              </li>
            ))}
          </ol>
        )}

        {mine && (
          <div style={styles.me}>
            <div>
              <span style={styles.meLabel}>내 기록</span> {mine.text}
            </div>
            {mine.note && <div style={styles.meNote}>{mine.note}</div>}
          </div>
        )}
        <p style={styles.foot}>초록불(공부 중)인 시간만 셉니다. 공개 범위가 '모두'인 사람만 순위에 나와요.</p>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, zIndex: 30, display: 'grid', placeItems: 'center', background: 'rgba(5,10,30,.55)' },
  panel: {
    width: 'min(420px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', padding: 20, borderRadius: 14,
    background: 'rgba(20,32,26,.96)', color: '#fff', font: '14px/1.5 system-ui, sans-serif', boxShadow: '0 8px 32px rgba(0,0,0,.5)',
    border: '1px solid rgba(255,210,122,.35)',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 16, fontWeight: 700, color: GOLD },
  close: { border: 'none', background: 'transparent', color: '#cbd5e1', fontSize: 18, cursor: 'pointer' },
  tabs: { display: 'flex', gap: 6, marginBottom: 12 },
  tab: {
    flex: 1, padding: '6px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,.15)', background: 'transparent',
    color: '#cbd5e1', font: 'inherit', cursor: 'pointer',
  },
  tabOn: { background: GOLD, color: '#1a1405', fontWeight: 700, border: `1px solid ${GOLD}` },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 },
  row: {
    width: '100%', display: 'grid', gridTemplateColumns: '44px 1fr auto', gap: 8, alignItems: 'baseline', padding: '5px 6px',
    borderRadius: 6, border: 'none', background: 'transparent', color: '#fff', font: 'inherit', textAlign: 'left', cursor: 'pointer',
  },
  rowMine: { background: 'rgba(255,210,122,.2)' },
  rank: { fontWeight: 700, color: GOLD },
  name: { fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  time: { fontVariantNumeric: 'tabular-nums', color: '#e2e8f0' },
  me: { marginTop: 12, padding: 12, borderRadius: 10, background: 'rgba(255,210,122,.12)', display: 'grid', gap: 4 },
  meLabel: { fontWeight: 700, color: GOLD },
  meNote: { fontSize: 12, color: '#cbd5e1' },
  note: { margin: '8px 0', color: '#cbd5e1' },
  foot: { margin: '12px 0 0', fontSize: 12, color: '#94a3b8' },
}
