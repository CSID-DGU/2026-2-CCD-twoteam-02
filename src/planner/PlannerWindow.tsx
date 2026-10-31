// 화면에 띄워 둔 스터디 플래너. 손잡이를 끌어 옮기고, 날짜를 넘기고, 크기를 줄이고 키움(배율은 이 브라우저에 기억)
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { FloatingWindow } from './FloatingWindow'
import { PlannerSheet, SHEET_H, SHEET_W } from './PlannerSheet'
import { usePlannerPage, useDaySegments } from './usePlanner'
import { MARKERS, dayWindow, plannerDayOf, shiftDay } from './plannerLogic'
import { PRINT } from './paperStyle'

const SCALES = [0.5, 0.6, 0.7, 0.8, 0.9, 1]
const SCALE_KEY = 'dooteum.planner.scale'
const loadScale = () => {
  try {
    const v = Number(localStorage.getItem(SCALE_KEY))
    return SCALES.includes(v) ? v : 0.7
  } catch {
    return 0.7
  }
}
const saveScale = (v: number) => {
  try {
    localStorage.setItem(SCALE_KEY, String(v))
  } catch {
    // 기억 못 해도 이번엔 그 크기
  }
}

const bar: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', background: '#3f5d73', color: '#fff', borderRadius: '8px 8px 0 0', fontFamily: PRINT, fontSize: 13 }
const btn: CSSProperties = { background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: 5, padding: '2px 8px', cursor: 'pointer', fontSize: 13 }
const SAVE_TEXT = { idle: '', saving: '저장 중…', saved: '저장됨', error: '저장 실패 (서버 확인 필요)' }

export function PlannerWindow({ onClose }: { onClose: () => void }) {
  const [today, setToday] = useState(() => plannerDayOf(Date.now()))
  const [day, setDay] = useState(today)
  // 새벽 5시가 지나면 '오늘'이 바뀜 (보던 날은 그대로)
  useEffect(() => {
    const t = window.setInterval(() => setToday(plannerDayOf(Date.now())), 60_000)
    return () => window.clearInterval(t)
  }, [])
  const [scale, setScale] = useState(loadScale)
  const [marker, setMarker] = useState(0)
  const { data, update, save } = usePlannerPage(day)
  const segs = useDaySegments(day)
  const resize = (by: number) => {
    const next = SCALES[Math.min(SCALES.length - 1, Math.max(0, SCALES.indexOf(scale) + by))]
    setScale(next)
    saveScale(next)
  }

  return (
    <FloatingWindow
      id="planner"
      initial={{ x: 0.02, y: 0.08 }}
      width={SHEET_W * scale}
      handle={
        <div style={bar}>
          <span style={{ fontWeight: 700 }}>📒 플래너</span>
          <button style={btn} onClick={() => setDay((d) => shiftDay(d, -1))} aria-label="전날">◀</button>
          <button style={btn} onClick={() => setDay(today)} disabled={day === today}>오늘</button>
          <button style={btn} onClick={() => setDay((d) => shiftDay(d, 1))} aria-label="다음 날">▶</button>
          {/* 형광펜: 시간표 칸을 누르면 이 색으로 칠함 */}
          <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.85 }}>형광펜</span>
          {MARKERS.map((c, i) => (
            <button
              key={c}
              onClick={() => setMarker(i)}
              aria-label={`형광펜 ${i + 1}`}
              aria-pressed={marker === i}
              style={{ width: marker === i ? 24 : 18, height: marker === i ? 24 : 18, borderRadius: 12, border: marker === i ? '3px solid #fff' : '1px solid rgba(255,255,255,0.5)', boxShadow: marker === i ? '0 0 0 2px #3f5d73, 0 0 6px #fff' : 'none', background: c, cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1, color: '#3f5d73' }}
            >
              {marker === i ? '✓' : ''}
            </button>
          ))}
          <span style={{ flex: 1, textAlign: 'right', opacity: 0.75, fontSize: 11 }}>{SAVE_TEXT[save]}</span>
          <button style={btn} onClick={() => resize(-1)} aria-label="작게">－</button>
          <button style={btn} onClick={() => resize(1)} aria-label="크게">＋</button>
          <button style={btn} onClick={onClose} aria-label="가방에 넣기">✕</button>
        </div>
      }
    >
      <div style={{ width: SHEET_W * scale, height: SHEET_H * scale, overflow: 'hidden', borderRadius: '0 0 4px 4px' }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', position: 'relative' }}>
          {data ? (
            <PlannerSheet day={day} dayStart={dayWindow(day).start} data={data} segs={segs} marker={marker} update={update} />
          ) : (
            <div style={{ width: SHEET_W, height: SHEET_H, background: '#f1ebe6' }} />
          )}
        </div>
      </div>
    </FloatingWindow>
  )
}
