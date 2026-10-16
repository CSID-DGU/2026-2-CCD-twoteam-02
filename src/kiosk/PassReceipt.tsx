// 이용권 영수증 모양의 남은 시간 표시 (#39). 그리기만 하고, 자리 정보·연장은 SeatTimeCorner 가 맡습니다.
//
// 접힌 영수증: 지점·자리와 큰 시계만. 누르면 펼쳐집니다.
// 펼친 영수증: 이용권 시간, 입실·종료 시각까지 찍힌 전체 영수증.
// 막 발급됐을 때는 영수증이 위에서부터 "출력"되듯 나타납니다.
//
// 별다방은 남은 시간을 거꾸로 세고(지나면 "시간 초과" 도장), 솔카페는 앉은 시간을 스톱워치처럼 셉니다.
import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { formatDuration } from '../study/studyLogic'
import { formatMinutes } from './duration'
import { clockOf, receiptNo, timeState } from './receiptLogic'
import type { ReceiptMode } from './receiptLogic'

const PAPER = '#fbfaf5'
const INK = '#26241f'
const FADED = '#7d7668' // 영수증의 흐린 글씨
const SOON = '#c2410c' // 10분 이하
const OVER = '#c81e1e' // 시간 초과 도장
const PRINT_MS = 700 // 출력되듯 나타나는 시간

type Props = {
  mode: ReceiptMode
  branchName: string
  where: string // "7번 자리", "회의실 2번"
  sessionId: string | null
  startedAt: Date | null
  expiresAt: Date
  durationMinutes: number
  now: number
  expanded: boolean
  printKey: number // 올라가면 막 발급된 것이라 출력되듯 나타납니다. 0이면 효과 없음
  onToggle: () => void
  footer?: ReactNode // 펼쳤을 때 아래에 붙는 것 (연장 버튼 등)
}

export function PassReceipt(props: Props) {
  const { mode, branchName, where, sessionId, startedAt, expiresAt, durationMinutes, now, expanded, printKey, onToggle, footer } = props
  const paper = useRef<HTMLDivElement>(null)

  // 출력 효과: 위에서부터 종이가 밀려 나오듯 드러냅니다. 움직임 줄이기 설정이면 건너뜁니다.
  useEffect(() => {
    const el = paper.current
    if (printKey === 0 || !el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    el.animate(
      [
        { clipPath: 'inset(0 0 100% 0)', transform: 'translateY(-12px)' },
        { clipPath: 'inset(0 0 0 0)', transform: 'translateY(0)' },
      ],
      { duration: PRINT_MS, easing: 'steps(14, end)' },
    )
  }, [printKey])

  const leftMs = expiresAt.getTime() - now
  const state = mode === 'pass' ? timeState(leftMs) : 'ok'
  // 별다방: 남은 시간(지나면 지난 시간), 솔카페: 앉은 지 얼마나 됐는지
  const shownMs = mode === 'pass' ? Math.abs(leftMs) : startedAt ? now - startedAt.getTime() : 0
  const clock = formatDuration(shownMs)
  const clockColor = state === 'over' ? OVER : state === 'soon' ? SOON : INK
  const label = mode === 'stopwatch' ? '앉은 시간' : state === 'over' ? '초과 시간' : '남은 시간'
  const title = [branchName, where].filter(Boolean).join(' · ')

  if (!expanded) {
    return (
      <button
        type="button"
        style={styles.slip}
        onClick={onToggle}
        aria-expanded={false}
        title={mode === 'pass' ? '눌러서 영수증 펼치기 (시간 연장)' : '눌러서 영수증 펼치기'}
      >
        <div ref={paper} style={styles.paper}>
          <div style={styles.small}>{title}</div>
          <div style={{ ...styles.bigClock, fontSize: 22, color: clockColor }}>
            {state === 'over' ? '+' : ''}
            {clock}
          </div>
          <div style={{ ...styles.small, color: state === 'over' ? OVER : FADED }}>{state === 'over' ? '시간 초과 · 연장하기' : label}</div>
        </div>
        <Torn />
      </button>
    )
  }

  return (
    <div style={styles.wide}>
      <div ref={paper} style={{ ...styles.paper, padding: '16px 18px 10px', gap: 8 }}>
        <div style={styles.center}>
          <div style={styles.shop}>{branchName || '두뜀'}</div>
          <div style={styles.small}>{mode === 'pass' ? '좌석 이용권' : '카페 좌석'}</div>
          {sessionId && <div style={styles.small}>No. {receiptNo(sessionId)}</div>}
        </div>
        <Dashed />
        <Row name="자리" value={where} />
        {mode === 'pass' && <Row name="이용권" value={formatMinutes(durationMinutes)} />}
        {startedAt && <Row name="입실" value={clockOf(startedAt)} />}
        {mode === 'pass' && <Row name="종료 예정" value={clockOf(expiresAt)} />}
        <Dashed />
        <div style={styles.totalRow}>
          <span style={styles.small}>{label}</span>
          <span style={{ ...styles.bigClock, color: clockColor }}>
            {state === 'over' ? '+' : ''}
            {clock}
          </span>
        </div>
        {state === 'over' && (
          <div style={styles.stampWrap} aria-label="이용 시간 초과">
            <span style={styles.stamp}>시간 초과</span>
          </div>
        )}
        <Dashed />
        <p style={{ ...styles.small, textAlign: 'center', margin: 0 }}>
          {mode === 'pass'
            ? state === 'over'
              ? '자리는 그대로 두었어요. 연장해 주세요.'
              : '시간이 지나도 자리는 유지돼요.'
            : '일어나면 자리를 놓아요.'}
        </p>
        <div style={styles.actions}>
          {footer}
          <button type="button" style={styles.fold} onClick={onToggle} aria-expanded>
            접기
          </button>
        </div>
      </div>
      <Torn />
    </div>
  )
}

function Row({ name, value }: { name: string; value: string }) {
  return (
    <div style={styles.row}>
      <span style={{ color: FADED }}>{name}</span>
      <span>{value}</span>
    </div>
  )
}

const Dashed = () => <div style={styles.dashed} />

// 영수증 아래쪽의 찢긴 톱니 모양
const Torn = () => <div style={styles.torn} aria-hidden="true" />

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "D2Coding", monospace'

const styles: Record<string, CSSProperties> = {
  slip: {
    width: 176,
    padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left',
    filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.35))',
  },
  wide: {
    width: 'min(260px, calc(100vw - 32px))',
    filter: 'drop-shadow(0 4px 10px rgba(0,0,0,.4))',
  },
  paper: {
    background: PAPER, color: INK, padding: '10px 12px 6px', display: 'flex', flexDirection: 'column', gap: 2,
    font: `13px/1.5 ${MONO}`, borderRadius: '4px 4px 0 0',
  },
  small: { fontSize: 11, color: FADED, letterSpacing: '0.02em' },
  bigClock: { fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 },
  shop: { fontSize: 16, fontWeight: 700, letterSpacing: '0.12em' },
  row: { display: 'flex', justifyContent: 'space-between', gap: 12 },
  totalRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  dashed: { borderTop: `1px dashed ${FADED}`, opacity: 0.6, margin: '2px 0' },
  stampWrap: { display: 'flex', justifyContent: 'center', padding: '2px 0' },
  stamp: {
    color: OVER, border: `2px solid ${OVER}`, borderRadius: 6, padding: '2px 10px',
    fontWeight: 800, letterSpacing: '0.15em', transform: 'rotate(-8deg)', opacity: 0.85,
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 },
  fold: {
    padding: '5px 10px', borderRadius: 6, border: `1px solid ${FADED}`, background: 'transparent',
    color: INK, font: 'inherit', fontSize: 12, cursor: 'pointer',
  },
  torn: {
    height: 8,
    background: `linear-gradient(135deg, ${PAPER} 33.33%, transparent 33.33%) 0 0 / 12px 8px repeat-x,`
      + ` linear-gradient(225deg, ${PAPER} 33.33%, transparent 33.33%) 0 0 / 12px 8px repeat-x`,
  },
}
