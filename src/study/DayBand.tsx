// 공부 흐름(#235): 처음에는 하루 시계(DayClock)로 그날의 공부들을 보여 주고(DayBand),
// 하나를 고르면 내 기록 전체가 그 공부만을 위한 화면(RunDetail)으로 바뀝니다. 왼쪽 위 ←로 돌아옵니다.
//
// 띠: 공부 한 번("공부 시작" ~ 일어나기·과목 바꾸기)을 한 줄로 그립니다.
// 띠의 가로는 그 공부의 시작~끝이라 짧은 공부도 꽉 차게 보입니다. 초록 = 집중, 빨강 = 타이머가 멈춘 시간.
//
// 몇 초짜리 빨강은 선처럼 얇아 누르기 어려워서:
//   - 커서 근처(SNAP_PX)에 빨강이 있으면 그 칸에 달라붙어 크게 강조합니다. 그 상태로 누르면 그 칸이 골라집니다.
//   - 띠 아래에 빨강 목록을 두어 띠를 정확히 누르지 않아도 볼 수 있게 합니다.
import { useRef, useState } from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import { LIGHT_COLOR } from '../space/status'
import { KIND_LABEL, SUBJECT_COLORS, clock, formatSpan, isGreen, toRuns, totalsByKind } from './bandLogic'
import { DayClock } from './DayClock'
import type { BandCell, BandRun } from './bandLogic'

const SNAP_PX = 8 // 커서에서 이 거리 안의 빨강에 달라붙습니다.
const MIN_WIDTH_PX = 2 // 몇 초짜리 빨강도 보이도록 최소 굵기
const HOVER_MIN_WIDTH_PX = 10 // 강조된 칸은 이만큼은 넓게

const colorOf = (cell: BandCell) => (isGreen(cell.kind) ? LIGHT_COLOR.green : LIGHT_COLOR.red)
const seconds = (c: { startedAt: number; endedAt: number }) => (c.endedAt - c.startedAt) / 1000
const keyOf = (c: BandCell) => c.ids[0] // 칸의 첫 구간 번호. 다시 그려도 같은 칸을 가리킵니다.

type DayProps = {
  cells: BandCell[]
  nameOf: (subjectId: number) => string
  dayStart: number
  onOpen: (run: number) => void // 공부 하나를 골라 그 공부의 화면(RunDetail)으로 (시작 시각)
}

export function DayBand({ cells, nameOf, dayStart, onOpen }: DayProps) {
  const [hovered, setHovered] = useState<number | null>(null) // 강조할 공부(시작 시각)
  const runs = toRuns(cells)
  const totals = totalsByKind(cells)
  const focused = totals.find((t) => isGreen(t.kind))?.seconds ?? 0
  // 과목 색: 그날 처음 나온 순서대로
  const subjectIds = [...new Set(runs.map((r) => r.subjectId))]
  const subjectColor = (id: number) => SUBJECT_COLORS[subjectIds.indexOf(id) % SUBJECT_COLORS.length]
  return (
    <div style={styles.wrap}>
      <DayClock
        runs={runs}
        dayStart={dayStart}
        colorOf={subjectColor}
        focusedSeconds={focused}
        hovered={hovered}
        onHover={setHovered}
        onOpen={onOpen}
      />
      {/* 하루 전체의 초록 대 빨강 */}
      <RatioBand cells={cells} />
      {/* 공부 목록: 시계의 호가 얇아도 여기서 바로 고를 수 있게 */}
      <ul style={styles.list}>
        {runs.map((r) => {
          const focusedInRun = r.cells.filter((c) => isGreen(c.kind)).reduce((sum, c) => sum + seconds(c), 0)
          return (
            <li key={r.startedAt}>
              <button
                type="button"
                style={{ ...styles.item, ...(r.startedAt === hovered ? styles.itemOn : null) }}
                onMouseEnter={() => setHovered(r.startedAt)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onOpen(r.startedAt)}
              >
                <span style={{ ...styles.dot, background: subjectColor(r.subjectId) }} />
                <span style={styles.kind}>{nameOf(r.subjectId)}</span>
                <span style={styles.time}>
                  {clock(r.startedAt)} ~ {clock(r.endedAt)}
                </span>
                <span style={styles.muted}>
                  {formatSpan(seconds(r))} 중 집중 {formatSpan(focusedInRun)}
                </span>
                <span style={styles.chevron}>›</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// 공부 하나만을 위한 화면: 맨 위 "← 뒤로 + 과목 · 시작 ~ 끝", 아래에 띠와 빨강 목록
export function RunDetail({ run, subject, onBack }: { run: BandRun; subject: string; onBack: () => void }) {
  const [hovered, setHovered] = useState<number | null>(null) // 강조할 칸(첫 구간 번호)
  const [picked, setPicked] = useState<number | null>(null)
  const [view, setView] = useState<'time' | 'ratio'>('time') // 시간순(기본) / 초록·빨강 비율
  const focused = run.cells.filter((c) => isGreen(c.kind)).reduce((sum, c) => sum + seconds(c), 0)
  return (
    <div style={styles.wrap}>
      <div style={styles.detailHead}>
        <button type="button" style={styles.back} onClick={onBack} aria-label="하루 전체로 돌아가기">
          ←
        </button>
        <div>
          <h2 style={styles.detailTitle}>
            {subject} {clock(run.startedAt)} ~ {clock(run.endedAt)}
          </h2>
          <div style={styles.muted}>
            {formatSpan(seconds(run))} 중 집중 {formatSpan(focused)}
          </div>
        </div>
      </div>
      <div style={styles.tabs} role="tablist">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={view === v.key}
            style={{ ...styles.tab, ...(view === v.key ? styles.tabOn : null) }}
            onClick={() => setView(v.key)}
          >
            {v.label}
          </button>
        ))}
      </div>
      <section style={styles.card}>
        {view === 'time' ? (
          <RunBand run={run} hovered={hovered} picked={picked} onHover={setHovered} onPick={(id) => setPicked(picked === id ? null : id)} />
        ) : (
          <RatioBand cells={run.cells} />
        )}
      </section>
    </div>
  )
}

const VIEWS: { key: 'time' | 'ratio'; label: string }[] = [
  { key: 'time', label: '시간순' },
  { key: 'ratio', label: '비율' },
]

// 비율 띠: 초록(집중)을 모두 합친 것과 빨강(집중 외)을 모두 합친 것을 한 줄로. 아래에 빨강의 사유별 합계를 둡니다.
function RatioBand({ cells }: { cells: BandCell[] }) {
  const [lit, setLit] = useState<'green' | 'red' | null>(null)
  const totals = totalsByKind(cells)
  const green = totals.filter((t) => isGreen(t.kind)).reduce((sum, t) => sum + t.seconds, 0)
  const reds = totals.filter((t) => !isGreen(t.kind))
  const red = reds.reduce((sum, t) => sum + t.seconds, 0)
  const all = green + red || 1
  const parts = [
    { key: 'green' as const, label: '집중', seconds: green, color: LIGHT_COLOR.green },
    { key: 'red' as const, label: '집중 외', seconds: red, color: LIGHT_COLOR.red },
  ].filter((p) => p.seconds > 0)
  const pctOf = (sec: number) => Math.round((sec / all) * 100)

  return (
    <div style={styles.run}>
      <div style={{ ...styles.band, display: 'flex', cursor: 'default' }} onMouseLeave={() => setLit(null)}>
        {parts.map((p) => (
          <div
            key={p.key}
            onMouseEnter={() => setLit(p.key)}
            style={{
              ...styles.ratioPart,
              flexGrow: p.seconds,
              background: p.color,
              margin: lit === p.key ? '-4px 0' : 0, // 띠와 같은 강조: 위아래로 커지고 테두리
              boxShadow: lit === p.key ? '0 0 0 2px #fff' : 'none',
              zIndex: lit === p.key ? 1 : 0,
            }}
          >
            {pctOf(p.seconds) >= 12 && `${pctOf(p.seconds)}%`}
          </div>
        ))}
      </div>
      <div style={styles.totals}>
        {parts.map((p) => (
          <span key={p.key} style={{ ...styles.total, fontWeight: lit === p.key ? 700 : 400 }}>
            <span style={{ ...styles.dot, background: p.color }} />
            {p.label} {formatSpan(p.seconds)} ({pctOf(p.seconds)}%)
          </span>
        ))}
      </div>
      {reds.length > 0 && (
        <ul style={styles.list}>
          {reds.map((t) => (
            <li key={t.kind} style={{ ...styles.item, cursor: 'default' }}>
              <span style={{ ...styles.dot, background: LIGHT_COLOR.red }} />
              <span style={styles.kind}>{KIND_LABEL[t.kind]}</span>
              <span style={styles.muted}>
                {formatSpan(t.seconds)} · 집중 외의 {Math.round((t.seconds / (red || 1)) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type RunProps = {
  run: BandRun
  hovered: number | null
  picked: number | null
  onHover: (id: number | null) => void
  onPick: (id: number) => void
}

function RunBand({ run, hovered, picked, onHover, onPick }: RunProps) {
  const bandRef = useRef<HTMLDivElement>(null)
  const span = run.endedAt - run.startedAt
  const pct = (ms: number) => ((ms - run.startedAt) / span) * 100
  const reds = run.cells.filter((c) => !isGreen(c.kind))
  // 이 줄에서 보여 줄 칸: 커서가 올라간 칸이 우선, 없으면 고른 칸
  const shown = run.cells.find((c) => keyOf(c) === hovered) ?? run.cells.find((c) => keyOf(c) === picked) ?? null

  // 커서 위치의 칸을 찾습니다. 근처에 빨강이 있으면 그쪽에 달라붙습니다.
  const cellAt = (e: MouseEvent<HTMLDivElement>): BandCell | null => {
    const rect = bandRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return null
    const x = e.clientX - rect.left
    const px = (ms: number) => ((ms - run.startedAt) / span) * rect.width
    let near: BandCell | null = null
    let nearDist = SNAP_PX
    for (const c of reds) {
      const dist = Math.max(px(c.startedAt) - x, x - px(c.endedAt), 0) // 칸 안이면 0
      if (dist <= nearDist) {
        near = c
        nearDist = dist
      }
    }
    if (near) return near
    const t = run.startedAt + (x / rect.width) * span
    return run.cells.find((c) => c.startedAt <= t && t <= c.endedAt) ?? null
  }

  return (
    <div style={styles.run}>
      <div
        ref={bandRef}
        style={styles.band}
        onMouseMove={(e) => {
          const c = cellAt(e)
          onHover(c ? keyOf(c) : null)
        }}
        onMouseLeave={() => onHover(null)}
        onClick={(e) => {
          const c = cellAt(e)
          if (c) onPick(keyOf(c))
        }}
      >
        {run.cells.map((c) => {
          const lit = keyOf(c) === hovered || keyOf(c) === picked
          return (
            <div
              key={keyOf(c)}
              style={{
                ...styles.cell,
                left: `${pct(c.startedAt)}%`,
                width: `${pct(c.endedAt) - pct(c.startedAt)}%`,
                minWidth: lit ? HOVER_MIN_WIDTH_PX : isGreen(c.kind) ? 0 : MIN_WIDTH_PX,
                background: colorOf(c),
                // 강조: 위아래로 커지고 테두리. 얇은 칸은 최소 폭까지 넓어집니다.
                top: lit ? -4 : 0,
                bottom: lit ? -4 : 0,
                boxShadow: lit ? '0 0 0 2px #fff' : 'none',
                zIndex: lit ? 3 : isGreen(c.kind) ? 1 : 2, // 얇은 빨강이 초록에 가려지지 않게
              }}
            />
          )
        })}
      </div>

      <div style={styles.detail}>
        {shown ? (
          <>
            <span style={{ ...styles.dot, background: colorOf(shown) }} />
            <b>{KIND_LABEL[shown.kind]}</b>
            <span>
              {clock(shown.startedAt, true)} ~ {clock(shown.endedAt, true)}
            </span>
            <span style={styles.muted}>{formatSpan(seconds(shown))}</span>
          </>
        ) : (
          <span style={styles.muted}>띠에 커서를 올리거나 누르면 그 구간이 보여요.</span>
        )}
      </div>

      {reds.length > 0 && (
        <ul style={styles.list}>
          {reds.map((c) => (
            <li key={keyOf(c)}>
              <button
                type="button"
                style={{ ...styles.item, ...(keyOf(c) === picked || keyOf(c) === hovered ? styles.itemOn : null) }}
                onMouseEnter={() => onHover(keyOf(c))}
                onMouseLeave={() => onHover(null)}
                onClick={() => onPick(keyOf(c))}
              >
                <span style={{ ...styles.dot, background: LIGHT_COLOR.red }} />
                <span style={styles.kind}>{KIND_LABEL[c.kind]}</span>
                <span style={styles.time}>
                  {clock(c.startedAt, true)} ~ {clock(c.endedAt, true)}
                </span>
                <span style={styles.muted}>{formatSpan(seconds(c))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 16 },
  totals: { display: 'flex', flexWrap: 'wrap', gap: '4px 14px', color: '#cfd3da', fontSize: 13 },
  total: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  run: { display: 'flex', flexDirection: 'column', gap: 6 },
  band: { position: 'relative', height: 28, margin: '4px 0', borderRadius: 6, background: '#2b2f38', cursor: 'pointer' },
  cell: { position: 'absolute', borderRadius: 2, pointerEvents: 'none', transition: 'top .08s, bottom .08s' },
  detail: {
    display: 'flex', alignItems: 'center', gap: 8, minHeight: 30, padding: '4px 10px', borderRadius: 8,
    background: 'rgba(255,255,255,.06)', fontVariantNumeric: 'tabular-nums',
  },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  item: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px', borderRadius: 6,
    border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', font: 'inherit', textAlign: 'left',
  },
  itemOn: { background: 'rgba(255,255,255,.1)' },
  detailHead: { display: 'flex', alignItems: 'center', gap: 12 },
  tabs: { alignSelf: 'flex-start', display: 'flex', gap: 4, padding: 3, borderRadius: 8, background: '#20232a' },
  tab: { padding: '4px 14px', borderRadius: 6, border: 'none', background: 'transparent', color: '#aab0bb', cursor: 'pointer', font: 'inherit' },
  tabOn: { background: '#3a3f4b', color: '#fff' },
  ratioPart: {
    position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4,
    color: '#0b0d10', fontSize: 12, fontWeight: 700, transition: 'margin .08s', overflow: 'hidden',
  },
  detailTitle: { margin: 0, fontSize: 20, color: '#fff', fontVariantNumeric: 'tabular-nums' }, // 전역 h2 색이 라이트 모드에서 검정
  card: { padding: 16, borderRadius: 12, background: '#20232a' },
  back: {
    flex: 'none', width: 36, height: 36, borderRadius: 8, border: '1px solid #4b5563', fontSize: 18,
    background: 'transparent', color: '#fff', cursor: 'pointer', font: 'inherit',
  },
  chevron: { marginLeft: 'auto', color: '#8b919c' },
  kind: { minWidth: 96 },
  time: { fontVariantNumeric: 'tabular-nums' },
  dot: { width: 10, height: 10, borderRadius: 3, display: 'inline-block', flex: 'none' },
  muted: { color: '#aab0bb' },
}
