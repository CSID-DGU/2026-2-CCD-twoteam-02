// 화면에 띄워 둔 스터디 플래너. 손잡이를 끌어 옮기고, 종이 모서리를 끌어 날짜를 넘기고(NotebookStack), 크기를 줄이고 키움(배율은 이 브라우저에 기억)
import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { FloatingWindow } from './FloatingWindow'
import { PlannerSheet, SHEET_H, SHEET_W } from './PlannerSheet'
import { usePlannerPage, useDaySegments, usePlannerPeek, useWrittenDays } from './usePlanner'
import { MARKERS, dayWindow, plannerDayOf, shiftDay } from './plannerLogic'
import { PRINT } from './paperStyle'
import { NotebookStack } from './NotebookStack'
import { canGoBack, canGoForward, canMark, hasWriting, mergeSeen, stackInfo } from './notebookLogic'
import type { PlannerData } from './plannerLogic'
import { HAND_FONTS } from './handFonts'
import { useHandFont } from './useHandFont'

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

const bar: CSSProperties = { position: 'relative', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '5px 8px', background: '#3f5d73', color: '#fff', borderRadius: '8px 8px 0 0', fontFamily: PRINT, fontSize: 13 }
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
  const { font, save: saveFont } = useHandFont()
  const [fontError, setFontError] = useState('')
  const pickFont = (id: (typeof HAND_FONTS)[number]['id']) => {
    void saveFont(id).then((err) => {
      setFontError(err)
      if (err) window.setTimeout(() => setFontError(''), 3000)
    })
  }
  const { data, update, save } = usePlannerPage(day)
  const segs = useDaySegments(day)

  // 노트 더미: 쓴 날(오늘까지)과 지금 보는 장의 상태로 두 묶음·넘기기 한계 계산 (notebookLogic)
  // 이번에 본 날마다 "쓴 날인지"를 기억해(seen) 처음 읽은 목록에 덮어씀. 지금 보는 날은 쓰는 대로 바로 반영
  const loaded = useWrittenDays(today)
  const [seen, setSeen] = useState<Record<string, boolean>>({})
  const isWritten = (pd: PlannerData | null, sg: typeof segs, d: string): boolean | null =>
    pd ? hasWriting(pd) || sg.some((x) => x.kind === 'focus') || Boolean(loaded?.focusDays.has(d)) : null
  const nowWritten = isWritten(data, segs, day)
  const written = loaded ? mergeSeen(loaded.days, nowWritten === null ? seen : { ...seen, [day]: nowWritten }, today) : null
  const info = stackInfo(written ?? [], day)
  const canBack = written ? canGoBack(day, written, today) : true // 읽는 중이면 하루씩은 넘김
  const canForward = canGoForward(day, today)
  const label = !written ? '' : info.total === 0 ? '쓴 날 0장' : `쓴 날 ${info.total}장 중 ${info.index}번째`

  // 넘길 때 드러날 옆 장을 미리 읽어 둠 (넘긴 뒤 빈 종이로 깜빡이지 않게)
  const prevDay = shiftDay(day, -1)
  const nextDay = shiftDay(day, 1)
  const prevData = usePlannerPeek(canBack ? prevDay : null)
  const nextData = usePlannerPeek(canForward ? nextDay : null)
  const prevSegs = useDaySegments(prevDay)
  const nextSegs = useDaySegments(nextDay)
  // 넘긴 직후 새 장을 읽는 동안은 미리 읽어 둔 내용을 그대로 보여 줌
  const [handoff, setHandoff] = useState<{ day: string; data: PlannerData; segs: typeof segs } | null>(null)
  const go = (to: string, peek: PlannerData | null, peekSegs: typeof segs) => {
    if (nowWritten !== null) setSeen((s) => ({ ...s, [day]: nowWritten })) // 떠나는 날의 결과를 기억
    setHandoff(peek ? { day: to, data: peek, segs: peekSegs } : null)
    setDay(to)
  }
  const sheetOf = (d: string, pd: PlannerData | null, sg: typeof segs, editable: boolean): ReactNode => (
    <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', position: 'relative' }}>
      {pd ? (
        <PlannerSheet day={d} dayStart={dayWindow(d).start} data={pd} segs={sg} marker={canMark(d, today) ? marker : null} update={editable ? update : () => {}} />
      ) : (
        <div style={{ width: SHEET_W, height: SHEET_H, background: '#f1ebe6' }} />
      )}
    </div>
  )
  const shown = data ?? (handoff?.day === day ? handoff.data : null)
  const shownSegs = data || handoff?.day !== day ? segs : handoff.segs
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
          {/* 날짜는 종이 모서리를 끌어 넘김. 한참 넘긴 뒤 한 번에 돌아오는 버튼만 남김 */}
          <button style={btn} onClick={() => go(today, null, [])} disabled={day === today}>오늘</button>
          {/* 형광펜: 시간표 칸을 누르면 이 색으로 칠함. 앞날은 아직 보낸 시간이 없어 못 씀 (notebookLogic.canMark) */}
          <span style={{ marginLeft: 6, fontSize: 11, opacity: canMark(day, today) ? 0.85 : 0.4 }} title={canMark(day, today) ? undefined : '앞날에는 형광펜을 쓸 수 없어요'}>형광펜</span>
          {MARKERS.map((c, i) => (
            <button
              key={c}
              onClick={() => setMarker(i)}
              disabled={!canMark(day, today)}
              aria-label={`형광펜 ${i + 1}`}
              aria-pressed={marker === i}
              style={{ width: marker === i ? 24 : 18, height: marker === i ? 24 : 18, borderRadius: 12, border: marker === i ? '3px solid #fff' : '1px solid rgba(255,255,255,0.5)', boxShadow: marker === i ? '0 0 0 2px #3f5d73, 0 0 6px #fff' : 'none', background: c, cursor: canMark(day, today) ? 'pointer' : 'default', opacity: canMark(day, today) ? 1 : 0.35, padding: 0, fontSize: 12, lineHeight: 1, color: '#3f5d73' }}
            >
              {marker === i ? '✓' : ''}
            </button>
          ))}
          {/* 펜: 내가 쓴 글씨의 글씨체. 버튼 글자는 각 글씨체로 쓴 "가나다" 그림 (handFonts.ts) */}
          <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.85 }}>펜</span>
          {HAND_FONTS.map((f) => (
            <button
              key={f.id}
              onClick={() => pickFont(f.id)}
              title={f.label}
              aria-label={`펜 ${f.label}`}
              aria-pressed={font === f.id}
              style={{ position: 'relative', width: 46, height: 24, padding: 0, borderRadius: 6, cursor: 'pointer', background: '#f1ebe6', border: font === f.id ? '3px solid #fff' : '1px solid rgba(255,255,255,0.5)', boxShadow: font === f.id ? '0 0 0 2px #3f5d73, 0 0 6px #fff' : 'none', boxSizing: 'border-box' }}
            >
              <img src={f.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
              {font === f.id && <span style={{ position: 'absolute', right: -6, top: -6, width: 13, height: 13, borderRadius: 7, background: '#fff', color: '#3f5d73', fontSize: 9, lineHeight: '13px', fontWeight: 700 }}>✓</span>}
            </button>
          ))}
          <span style={{ flex: 1, textAlign: 'right', opacity: 0.75, fontSize: 11, whiteSpace: 'nowrap' }}>{SAVE_TEXT[save]}</span>
          <button style={btn} onClick={() => resize(-1)} aria-label="작게">－</button>
          <button style={btn} onClick={() => resize(1)} aria-label="크게">＋</button>
          <button style={btn} onClick={onClose} aria-label="가방에 넣기">✕</button>
          {fontError && <span style={{ position: 'absolute', left: 8, top: '100%', marginTop: 4, zIndex: 6, background: 'rgba(32,35,42,0.9)', color: '#fff', fontSize: 12, padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>{fontError}</span>}
        </div>
      }
    >
      <NotebookStack
        width={SHEET_W * scale}
        height={SHEET_H * scale}
        below={info.below}
        flipped={info.flipped}
        label={label}
        canBack={canBack}
        canForward={canForward}
        onBack={() => go(prevDay, prevData, prevSegs)}
        onForward={() => go(nextDay, nextData, nextSegs)}
        top={sheetOf(day, shown, shownSegs, Boolean(data))}
        prev={canBack ? sheetOf(prevDay, prevData, prevSegs, false) : null}
        next={canForward ? sheetOf(nextDay, nextData, nextSegs, false) : null}
      />
    </FloatingWindow>
  )
}
