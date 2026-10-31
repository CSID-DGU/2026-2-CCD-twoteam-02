// 공부 시간 순위 창 (#59). 광장 순위 게시판 앞에서 E 를 누르면 뜹니다.
//
//   탭     오늘(서울 0시부터) · 이번 주(월요일부터). 처음은 오늘. 탭을 바꾸면 그 기간을 새로 읽습니다
//   목록   1~20위. 공개 범위가 '모두'인 사람만, 같은 분이면 같은 등수. 이름·얼굴을 누르면 프로필 창
//          1~3위는 시상대(가운데 1등), 4위부터 줄. 얼굴은 그 사람 캐릭터 사진(usePortraits, 없으면 이니셜)
//   모양   분필 칠판(나무 테두리, 케리스 케듀체, 분필 번짐 글씨). 색·글꼴은 ranking/chalk 와 같게
//   내 줄  맨 아래에 늘 보임. 내가 순위에 안 나오는 공개 범위면 이유를 알려 줌
// 창이 떠 있는 동안 광장은 캐릭터·시점·단축키를 멈춥니다(WorldScene). Esc·닫기·바깥 누르기로 닫습니다.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useRanking } from './useRanking'
import { usePortraits } from './usePortraits'
import { PERIOD_LABEL, initialOf, labelNames, minutesText, myLine, podium } from './rankingLogic'
import type { Period, PodiumSlot } from './rankingLogic'
import { CHALK, CHALK_FONT } from './chalk'

const PERIODS: Period[] = ['today', 'week']
const GOLD = CHALK.gold
const FACE_PX = { 1: 88, 2: 48, 3: 48 } as const // 시상대 얼굴 지름
const ROW_FACE_PX = 30 // 4위부터 줄의 얼굴 지름
// 분필 번짐 (글씨 그림자)
const CHALK_SHADOW = '0 0 2px rgba(255,255,255,.55), 1px 1px 0 rgba(255,255,255,.12)'

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
  const photos = usePortraits(ranking?.top.map((r) => r.id) ?? [])
  const stand = podium(ranking?.top ?? [])

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
          <span style={styles.title}>☆ {PERIOD_LABEL[period]}의 공부왕 ☆</span>
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
          <>
            <div style={styles.podium}>
              {stand.map((slot, i) =>
                slot ? <PodiumCell key={slot.row.id} slot={slot} photo={photos[slot.row.id]} mine={slot.row.id === myId} onOpen={onOpenProfile} /> : <span key={i} style={styles.emptyCell} />,
              )}
            </div>
            <ol style={styles.list}>
              {ranking?.top.slice(3).map((r, j) => (
                <li key={r.id}>
                  <button
                    type="button"
                    style={{ ...styles.row, ...(r.id === myId ? styles.rowMine : null) }}
                    onClick={() => onOpenProfile(r.id)}
                    title="프로필 보기"
                  >
                    <span style={styles.rank}>{r.rank}</span>
                    <Face photo={photos[r.id]} name={names[j + 3]} size={ROW_FACE_PX} />
                    <span style={styles.name}>{names[j + 3]}</span>
                    <span style={styles.time}>{minutesText(r.minutes)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </>
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

// 얼굴 동그라미: 캐릭터 사진, 없으면 이니셜 (분필 점선 테두리)
function Face({ photo, name, size, gold = false }: { photo?: string; name: string; size: number; gold?: boolean }) {
  const ring: CSSProperties = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box', overflow: 'hidden',
    border: `${size > 40 ? 3 : 2}px dashed ${gold ? GOLD : 'rgba(255,255,255,.8)'}`, background: 'rgba(255,255,255,.08)',
    display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: size * 0.42, textShadow: CHALK_SHADOW,
  }
  return <span style={ring}>{photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initialOf(name)}</span>
}

// 시상대 한 칸 (1등은 가운데, 왕관·금색·크게)
function PodiumCell({ slot, photo, mine, onOpen }: { slot: PodiumSlot; photo?: string; mine: boolean; onOpen: (id: string) => void }) {
  const first = slot.place === 1
  return (
    <button type="button" style={{ ...styles.cell, ...(mine ? styles.rowMine : null) }} onClick={() => onOpen(slot.row.id)} title="프로필 보기">
      {first && <span style={styles.crown}>♛</span>}
      <Face photo={photo} name={slot.name} size={FACE_PX[slot.place]} gold={first} />
      <span style={{ ...styles.cellRank, ...(first ? { color: GOLD, fontSize: 24 } : null) }}>{slot.row.rank}</span>
      <span style={{ ...styles.cellName, fontSize: first ? 19 : 15 }}>{slot.name}</span>
      <span style={styles.cellTime}>{minutesText(slot.row.minutes)}</span>
    </button>
  )
}

const styles: Record<string, CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, zIndex: 30, display: 'grid', placeItems: 'center', background: 'rgba(5,10,30,.55)' },
  panel: {
    width: 'min(420px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', padding: 18, borderRadius: 10,
    background: `radial-gradient(ellipse at 30% 20%, ${CHALK.boardLight} 0%, ${CHALK.board} 45%, ${CHALK.boardDark} 100%)`,
    color: CHALK.white, font: `15px/1.5 ${CHALK_FONT}`, boxShadow: '0 8px 32px rgba(0,0,0,.5), inset 0 0 30px rgba(0,0,0,.4)',
    border: `12px solid ${CHALK.wood}`, boxSizing: 'border-box',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: 700, color: CHALK.yellow, textShadow: CHALK_SHADOW },
  close: { border: 'none', background: 'transparent', color: '#cbd5e1', fontSize: 18, cursor: 'pointer' },
  tabs: { display: 'flex', gap: 6, marginBottom: 12 },
  tab: {
    flex: 1, padding: '6px 0', borderRadius: 8, border: '1px dashed rgba(255,255,255,.35)', background: 'transparent',
    color: CHALK.white, font: 'inherit', cursor: 'pointer',
  },
  tabOn: { background: 'rgba(255,233,168,.16)', color: CHALK.yellow, fontWeight: 700, border: `1px solid ${CHALK.yellow}` },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 },
  row: {
    width: '100%', display: 'grid', gridTemplateColumns: '28px auto 1fr auto', gap: 10, alignItems: 'center', padding: '6px 8px',
    borderRadius: 6, border: 'none', borderBottom: '1px dashed rgba(255,255,255,.2)', background: 'transparent', color: CHALK.white,
    font: 'inherit', textAlign: 'left', cursor: 'pointer', textShadow: CHALK_SHADOW,
  },
  podium: { display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', alignItems: 'end', gap: 6, margin: '4px 0 12px' },
  cell: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 2px', borderRadius: 8, border: 'none',
    background: 'transparent', color: CHALK.white, font: 'inherit', cursor: 'pointer', textShadow: CHALK_SHADOW, minWidth: 0,
  },
  emptyCell: {},
  crown: { color: GOLD, fontSize: 30, lineHeight: 1 },
  cellRank: { fontWeight: 700, fontSize: 17, marginTop: 2 },
  cellName: { fontWeight: 700, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cellTime: { fontSize: 13, opacity: 0.85 },
  rowMine: { background: 'rgba(255,233,168,.12)' },
  rank: { fontWeight: 700, color: GOLD },
  name: { fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  time: { opacity: 0.85 },
  me: { marginTop: 12, padding: 12, borderRadius: 10, border: `1px dashed ${CHALK.yellow}`, background: 'rgba(255,233,168,.1)', display: 'grid', gap: 4, textShadow: CHALK_SHADOW },
  meLabel: { fontWeight: 700, color: CHALK.yellow },
  meNote: { fontSize: 12, opacity: 0.8 },
  note: { margin: '8px 0', opacity: 0.85 },
  foot: { margin: '12px 0 0', fontSize: 12, opacity: 0.6 },
}
