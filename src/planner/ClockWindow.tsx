// 가방에서 꺼낸 시계 창: 민트 회중 스톱워치 모양(파스텔 + 도자기 같은 질감). 탭으로 스톱워치·알람.
// 상태·감시는 useClock(창을 닫아도 계속 돎), 계산은 clockLogic. 시안: 브레인스토밍 clock-layout.html
import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { FloatingWindow } from './FloatingWindow'
import { useClock, useNow } from './useClock'
import { QUICK_MINUTES, alarmAfter, alarmAt, clockText, formatRemain, formatSw, parseMinutes, remainingMs, swElapsed } from './clockLogic'
import { prepareAlarmSound } from './alarmSound'

const MINT = { light: '#d9f2e6', mid: '#a9dcc6', deep: '#8fcab2', ink: '#2f5d4c' }
const CREAM = '#fffaf0'
const PINK = 'linear-gradient(#f6c9d4, #e9a9b9)'
const NUM = '#4a4f63'
const ROUND = "ui-rounded, 'Arial Rounded MT Bold', 'Nunito', system-ui, sans-serif"
// 도자기 같은 잡티 (플래너 종이와 같은 SVG 노이즈, 조금 더 진하게)
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.45 0 0 0 0 0.38 0 0 0 0 0.35 0 0 0 0.22 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
const DEFAULT_MINUTES = 25
// 버튼을 눌러도 포커스를 가져가지 않게: 포커스가 남으면 걷다가 Space(점프)가 그 버튼을 다시 누름
const noFocus = (e: { preventDefault: () => void }) => e.preventDefault()

type Tab = 'sw' | 'alarm'

// 시계 몸통: 꼭지(위)·옆 버튼, 크림색 판에 큰 숫자·작은 숫자
function Watch({ big, small, onCrown, crownLabel, onSide, sideLabel, sideDisabled, shaking }: { big: string; small: ReactNode; onCrown: () => void; crownLabel: string; onSide: () => void; sideLabel: string; sideDisabled: boolean; shaking: boolean }) {
  return (
    <div style={{ ...styles.body, animation: shaking ? 'clock-shake 0.4s ease-in-out infinite' : undefined }}>
      <button onMouseDown={noFocus} type="button" onClick={onCrown} aria-label={crownLabel} title={crownLabel} style={styles.crown} />
      <button onMouseDown={noFocus} type="button" onClick={onSide} aria-label={sideLabel} title={sideLabel} disabled={sideDisabled} style={{ ...styles.side, opacity: sideDisabled ? 0.5 : 1, cursor: sideDisabled ? 'default' : 'pointer' }} />
      <div style={styles.grain} />
      <div style={styles.face}>
        <div style={{ ...styles.num, fontSize: big.length > 5 ? 22 : 26 }}>{big}</div>
        <div style={{ ...styles.num, fontSize: 11, opacity: 0.6, minHeight: 14 }}>{small}</div>
      </div>
    </div>
  )
}

export function ClockWindow({ onClose }: { onClose: () => void }) {
  const { state, toggleSw, resetSw, setAlarm, cancelAlarm } = useClock()
  const [tab, setTab] = useState<Tab>('sw')
  const now = useNow(tab === 'sw' ? 50 : 500)
  const [minutes, setMinutes] = useState(String(DEFAULT_MINUTES))
  const [time, setTime] = useState('')
  const [notice, setNotice] = useState('')
  const running = state.sw.startedAt !== null
  const sw = formatSw(swElapsed(state.sw, now))
  const shaking = state.ringing !== null

  const setAfter = () => {
    const m = parseMinutes(minutes)
    if (m === null) return setNotice('1~600분 사이로 적어 주세요')
    prepareAlarmSound() // 누른 순간에 소리 허용
    setAlarm(alarmAfter(m, Date.now()))
    setNotice('')
  }
  const setAt = (v: string) => {
    setTime(v)
    const a = alarmAt(v, Date.now())
    if (!a) return
    prepareAlarmSound()
    setAlarm(a)
    setNotice('')
  }

  const tabBtn = (t: Tab, label: string) => (
    <button onMouseDown={noFocus} type="button" onClick={() => setTab(t)} aria-pressed={tab === t} style={{ ...styles.tab, ...(tab === t ? styles.tabOn : null) }}>
      {label}
    </button>
  )

  return (
    <FloatingWindow
      id="clock"
      initial={{ x: 0.7, y: 0.12 }}
      width={230}
      handle={
        <div style={styles.bar}>
          <span style={{ fontWeight: 700 }}>⏱ 스톱워치</span>
          {tabBtn('sw', '스톱워치')}
          {tabBtn('alarm', '알람')}
          <button onMouseDown={noFocus} type="button" onClick={onClose} aria-label="가방에 넣기" style={styles.close}>✕</button>
        </div>
      }
    >
      <style>{'@keyframes clock-shake { 0%,100% { transform: rotate(0) } 25% { transform: rotate(-6deg) } 75% { transform: rotate(6deg) } }'}</style>
      <div style={styles.panel}>
        {tab === 'sw' ? (
          <>
            <Watch big={sw.main} small={sw.sub} onCrown={toggleSw} crownLabel={running ? '멈춤' : '시작'} onSide={resetSw} sideLabel="처음으로" sideDisabled={running} shaking={shaking} />
            <div style={styles.hint}>꼭지: 시작·멈춤 · 옆 버튼: 처음으로</div>
            {state.alarm && <div style={{ ...styles.hint, color: NUM }}>⏰ 알람 {formatRemain(remainingMs(state.alarm, now))} 남음</div>}
          </>
        ) : (
          <>
            <Watch
              big={state.alarm ? formatRemain(remainingMs(state.alarm, now)) : `${String(parseMinutes(minutes) ?? DEFAULT_MINUTES).padStart(2, '0')}:00`}
              small={state.alarm ? `${clockText(state.alarm.at)}에 울림` : '알람 없음'}
              onCrown={setAfter}
              crownLabel="몇 분 뒤 알람 맞추기"
              onSide={cancelAlarm}
              sideLabel="알람 취소"
              sideDisabled={!state.alarm}
              shaking={shaking}
            />
            <div style={styles.hint}>몇 분 뒤</div>
            <div style={styles.chips}>
              {QUICK_MINUTES.map((m) => (
                <button onMouseDown={noFocus} key={m} type="button" onClick={() => setMinutes(String(m))} aria-pressed={minutes === String(m)} style={{ ...styles.chip, ...(minutes === String(m) ? styles.chipOn : null) }}>
                  {m}
                </button>
              ))}
              <input value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" aria-label="몇 분 뒤 (직접 입력)" style={{ ...styles.input, width: 46 }} />
              <span style={styles.hint}>분</span>
            </div>
            <div style={styles.hint}>
              또는 시각 <input type="time" value={time} onChange={(e) => setAt(e.target.value)} aria-label="알람 시각" style={styles.input} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onMouseDown={noFocus} type="button" onClick={setAfter} style={styles.go}>알람 맞추기</button>
              <button onMouseDown={noFocus} type="button" onClick={cancelAlarm} disabled={!state.alarm} style={{ ...styles.input, cursor: 'pointer', opacity: state.alarm ? 1 : 0.5 }}>취소</button>
            </div>
            {notice && <div style={{ ...styles.hint, color: '#b4495f' }}>{notice}</div>}
            {running && <div style={{ ...styles.hint, color: NUM }}>⏱ {sw.main}</div>}
          </>
        )}
      </div>
    </FloatingWindow>
  )
}

const styles: Record<string, CSSProperties> = {
  // 손잡이 줄: 플래너 남색 대신 시계 몸통에 맞춘 민트 (사용자 결정)
  bar: { display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', background: MINT.deep, color: MINT.ink, borderRadius: '10px 10px 0 0', fontFamily: ROUND, fontSize: 13 },
  tab: { border: 'none', borderRadius: 5, padding: '1px 8px', fontSize: 12, cursor: 'pointer', background: 'rgba(255,255,255,0.35)', color: MINT.ink, fontFamily: ROUND },
  tabOn: { background: CREAM, fontWeight: 700 },
  close: { marginLeft: 'auto', border: 'none', background: 'transparent', color: MINT.ink, cursor: 'pointer', fontSize: 13 },
  panel: { padding: '22px 10px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: '#f3efe8', backgroundImage: GRAIN, borderRadius: '0 0 10px 10px', boxShadow: '0 8px 20px rgba(0,0,0,0.35)' },
  body: { position: 'relative', width: 156, height: 156, borderRadius: '50%', background: `radial-gradient(circle at 35% 30%, ${MINT.light}, ${MINT.mid} 60%, ${MINT.deep})`, boxShadow: '0 8px 18px rgba(0,0,0,0.3), inset 0 -6px 12px rgba(0,0,0,0.12)' },
  grain: { position: 'absolute', inset: 0, borderRadius: '50%', pointerEvents: 'none', opacity: 0.55, mixBlendMode: 'multiply', backgroundImage: GRAIN },
  face: { position: 'absolute', inset: 14, borderRadius: '50%', background: `radial-gradient(circle at 40% 35%, ${CREAM}, #f4ead9)`, boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  num: { fontFamily: ROUND, fontWeight: 700, color: NUM, letterSpacing: 1, lineHeight: 1.15 },
  crown: { position: 'absolute', left: '50%', top: -18, transform: 'translateX(-50%)', width: 26, height: 20, border: 'none', borderRadius: '8px 8px 4px 4px', background: PINK, boxShadow: '0 2px 3px rgba(0,0,0,0.3)', cursor: 'pointer', zIndex: 2 },
  side: { position: 'absolute', right: 4, top: 12, width: 18, height: 18, border: 'none', borderRadius: '50%', background: PINK, boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.12), 0 2px 3px rgba(0,0,0,0.25)', zIndex: 2 },
  hint: { fontSize: 11, color: '#7a7f8e', textAlign: 'center', fontFamily: 'system-ui, sans-serif' },
  chips: { display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' },
  chip: { fontSize: 12, padding: '2px 8px', borderRadius: 999, background: MINT.light, color: MINT.ink, border: `1px solid ${MINT.mid}`, cursor: 'pointer' },
  chipOn: { background: MINT.deep, color: '#fff' },
  input: { fontSize: 12, padding: '3px 6px', borderRadius: 6, border: '1px solid #cfc6b8', background: '#fffdf8', color: NUM },
  go: { fontSize: 12, padding: '4px 12px', borderRadius: 8, border: 'none', background: PINK, color: '#5a2f3c', fontWeight: 700, cursor: 'pointer' },
}
