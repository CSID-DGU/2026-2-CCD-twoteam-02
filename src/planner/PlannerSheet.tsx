// 스터디 플래너 한 장 (종이 플래너 칸 그대로: 날짜·TOTAL·D-day / WAKE UP·GOAL / SUB·TOPIC·CHECK / MOOD / MEMO / 10분 시간표)
// 인쇄된 글자는 반듯한 글꼴(PRINT), 내가 쓴 글자는 손글씨(HAND). 시간표는 집중(초록) 기록으로 저절로 칠해지고,
// 칸을 누르면 고른 형광펜으로 직접 칠할 수 있습니다(같은 색으로 다시 누르면 지움). marker 가 null 이면(앞날) 칠하지 못함.
import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { HOURS, MARKERS, ddayText, focusCells, formatHM, subjectColor, weekdayOf } from './plannerLogic'
import type { PlannerData } from './plannerLogic'
import type { SegmentKind } from '../study/segmentLogic'
import { HAND, INK, LINE, PRINT, handInput, handSize, paperSurface, printLabel } from './paperStyle'

export const SHEET_W = 560 // 종이 크기 (화면에서는 배율로 줄이고 키움)
export const SHEET_H = 800
const B = `1.5px solid ${LINE}`
const box: CSSProperties = { border: B, position: 'relative', boxSizing: 'border-box' }
const TABLE_H = 612 // 할 일·기분·메모와 10분 시간표 높이 (종이 아래까지)
const corner: CSSProperties = { ...printLabel, position: 'absolute', left: 6, top: 3, fontSize: 12 }

type Seg = { kind: SegmentKind; subjectId: number | null; startedAt: number; endedAt: number }
type Props = { day: string; dayStart: number; data: PlannerData; segs: Seg[]; marker: number | null; update: (f: (d: PlannerData) => PlannerData) => void }

// 기분 얼굴 (0 화남 … 5 아주 좋음)
function Face({ kind, on, onPick }: { kind: number; on: boolean; onPick: () => void }) {
  const mouth = ['M9 23 Q16 17 23 23', 'M10 23 Q16 19 22 23', 'M10 22 L22 21', 'M11 21 L21 21', 'M10 20 Q16 25 22 20', 'M9 19 Q16 27 23 19'][kind]
  const brows = kind === 0 ? <path d="M9 11 L14 13 M23 11 L18 13" stroke={LINE} strokeWidth="1.6" /> : null
  return (
    <button onClick={onPick} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer' }} aria-label={`기분 ${kind + 1}`}>
      <svg width="34" height="34" viewBox="0 0 32 32">
        {on && <circle cx="16" cy="16" r="15.2" fill="#f7d26b" opacity="0.55" />}
        <circle cx="16" cy="16" r="13" fill="none" stroke={LINE} strokeWidth="1.6" />
        <circle cx="12" cy="14" r="1.4" fill={LINE} />
        <circle cx="20" cy="14" r="1.4" fill={LINE} />
        {brows}
        <path d={mouth} fill="none" stroke={LINE} strokeWidth="1.6" strokeLinecap="round" />
        {on && <circle cx="16" cy="16" r="15" fill="none" stroke={INK} strokeWidth="1.8" strokeDasharray="70 8" transform="rotate(-30 16 16)" />}
      </svg>
    </button>
  )
}

export function PlannerSheet({ day, dayStart, data, segs, marker, update }: Props) {
  const cells = useMemo(() => focusCells(segs, dayStart), [segs, dayStart])
  const total = cells.reduce((a, c) => a + c.ms, 0)
  const set = (patch: Partial<PlannerData>) => update((d) => ({ ...d, ...patch }))
  const [y, m, dd] = day.split('-')

  return (
    <div style={{ ...paperSurface(), width: SHEET_W, height: SHEET_H, padding: '18px 16px', boxSizing: 'border-box', fontFamily: PRINT }}>
      <div style={{ ...printLabel, fontSize: 28, letterSpacing: 4, textAlign: 'center', marginBottom: 12 }}>STUDY PLANNER</div>

      {/* 날짜 · TOTAL · D-day */}
      <div style={{ display: 'flex', gap: 8, height: 44 }}>
        <div style={{ flex: 1.3, borderBottom: B, display: 'flex', alignItems: 'flex-end', paddingBottom: 3, gap: 10 }}>
          <span style={{ fontFamily: HAND, color: INK, fontSize: handSize(26) }}>
            {y.slice(2)} / {m} / {dd}
          </span>
          <span style={{ ...printLabel, fontSize: 18 }}>(</span>
          <span style={{ fontFamily: HAND, color: INK, fontSize: handSize(24) }}>{weekdayOf(day)}</span>
          <span style={{ ...printLabel, fontSize: 18 }}>)</span>
        </div>
        <div style={{ ...box, flex: 1 }}>
          <span style={corner}>TOTAL</span>
          <span style={{ position: 'absolute', right: 12, bottom: 2, fontFamily: HAND, color: INK, fontSize: handSize(28) }}>{formatHM(total)}</span>
        </div>
        <div style={{ ...box, flex: 0.62, padding: '2px 6px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontFamily: HAND, color: INK, fontSize: handSize(24), minWidth: 64 }}>{ddayText(data.dday.date, day) || <span style={{ ...printLabel, fontSize: 22, fontWeight: 400 }}>D-</span>}</span>
          </div>
          <div style={{ display: 'flex', gap: 2, position: 'absolute', left: 4, right: 4, bottom: 1 }}>
            <input value={data.dday.label} maxLength={20} placeholder="시험" onChange={(e) => set({ dday: { ...data.dday, label: e.target.value } })} style={{ ...handInput, fontSize: handSize(13), width: '45%' }} />
            <input type="date" value={data.dday.date} onChange={(e) => set({ dday: { ...data.dday, date: e.target.value } })} style={{ ...handInput, fontSize: handSize(9), width: '55%', color: LINE }} title="D-day 날짜" />
          </div>
        </div>
      </div>

      {/* WAKE UP · GOAL */}
      <div style={{ display: 'flex', gap: 8, height: 44, marginTop: 10 }}>
        <div style={{ ...box, flex: 1.3 }}>
          <span style={corner}>WAKE UP</span>
          <input value={data.wake} maxLength={5} placeholder="" onChange={(e) => set({ wake: e.target.value })} style={{ ...handInput, position: 'absolute', left: 90, bottom: 6, width: 120, fontSize: handSize(26) }} />
        </div>
        <div style={{ ...box, flex: 1.62 }}>
          <span style={corner}>GOAL</span>
          <input value={data.goal} maxLength={200} onChange={(e) => set({ goal: e.target.value })} style={{ ...handInput, position: 'absolute', left: 54, right: 8, bottom: 6, width: 'auto', fontSize: handSize(24) }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, height: TABLE_H }}>
        {/* 왼쪽: 할 일 · 기분 · 메모 */}
        <div style={{ flex: 1.3, display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
          <div style={{ ...box }}>
            <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr 52px', height: 32, borderBottom: B, alignItems: 'center', textAlign: 'center' }}>
              <span style={printLabel}>SUB</span>
              <span style={{ ...printLabel, borderLeft: B, borderRight: B, lineHeight: '30px' }}>TOPIC/PAGE</span>
              <span style={printLabel}>CHECK</span>
            </div>
            {data.rows.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 52px', height: 34, borderBottom: i < data.rows.length - 1 ? B : 'none' }}>
                <input value={r.sub} maxLength={20} onChange={(e) => update((d) => ({ ...d, rows: d.rows.map((x, j) => (j === i ? { ...x, sub: e.target.value } : x)) }))} style={{ ...handInput, padding: '0 4px', fontSize: handSize(19) }} />
                <input
                  value={r.topic}
                  maxLength={200}
                  onChange={(e) => update((d) => ({ ...d, rows: d.rows.map((x, j) => (j === i ? { ...x, topic: e.target.value } : x)) }))}
                  style={{ ...handInput, padding: '0 6px', borderLeft: B, borderRight: B, fontSize: handSize(19), textDecoration: r.done ? `line-through ${INK}` : 'none' }}
                />
                <button
                  onClick={() => update((d) => ({ ...d, rows: d.rows.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) }))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: HAND, color: INK, fontSize: handSize(26), lineHeight: 1 }}
                  aria-label="다 했어요"
                >
                  {r.done ? 'V' : ''}
                </button>
              </div>
            ))}
          </div>

          <div style={{ ...box, height: 70 }}>
            <span style={corner}>MOOD</span>
            <div style={{ display: 'flex', justifyContent: 'space-around', paddingTop: 22 }}>
              {Array.from({ length: 6 }, (_, k) => (
                <Face key={k} kind={k} on={data.mood === k} onPick={() => set({ mood: data.mood === k ? null : k })} />
              ))}
            </div>
          </div>

          <div style={{ ...box, flex: 1, minHeight: 150 }}>
            <span style={corner}>MEMO</span>
            <textarea
              value={data.memo}
              maxLength={1000}
              onChange={(e) => set({ memo: e.target.value })}
              style={{ ...handInput, position: 'absolute', inset: '22px 8px 6px 8px', width: 'auto', resize: 'none', fontSize: handSize(20), lineHeight: 1.35 }}
            />
          </div>
        </div>

        {/* 오른쪽: 10분 시간표 (5시 ~ 다음 날 4시) */}
        <div style={{ ...box, flex: 1, display: 'grid', gridTemplateColumns: '30px repeat(6, 1fr)', gridAutoRows: 'minmax(0, 1fr)', height: '100%' }}>
          <span style={{ borderBottom: B, borderRight: B }} />
          {[10, 20, 30, 40, 50, 60].map((n) => (
            <span key={n} style={{ ...printLabel, fontSize: 12, textAlign: 'center', borderBottom: B, borderRight: n < 60 ? B : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {n}
            </span>
          ))}
          {HOURS.map((h, row) => [
            <span key={`h${h}`} style={{ ...printLabel, fontSize: 13, textAlign: 'center', borderRight: B, borderBottom: row < 23 ? B : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {h}
            </span>,
            ...Array.from({ length: 6 }, (_, c) => {
              const i = row * 6 + c
              const f = cells[i]
              const mark = data.marks[i]
              return (
                <button
                  key={i}
                  disabled={marker === null}
                  onClick={() =>
                    marker !== null &&
                    update((d) => {
                      const marks = { ...d.marks }
                      if (marks[i] === marker) delete marks[i]
                      else marks[i] = marker
                      return { ...d, marks }
                    })
                  }
                  title={f.ms > 0 ? `집중 ${Math.round(f.ms / 60000)}분` : undefined}
                  style={{ position: 'relative', padding: 0, border: 'none', borderRight: c < 5 ? B : 'none', borderBottom: row < 23 ? B : 'none', background: 'transparent', cursor: marker === null ? 'default' : 'pointer' }}
                >
                  {f.ms > 0 && (
                    <span style={{ position: 'absolute', left: 1, top: 2, bottom: 2, width: `calc(${Math.min(1, f.ms / 600000) * 100}% - 2px)`, background: subjectColor(f.subjectId), opacity: 0.85, borderRadius: 2 }} />
                  )}
                  {mark !== undefined && <span style={{ position: 'absolute', inset: '3px 1px', background: MARKERS[mark], opacity: 0.6, transform: 'skewX(-8deg)', borderRadius: 3 }} />}
                </button>
              )
            }),
          ])}
        </div>
      </div>
    </div>
  )
}
