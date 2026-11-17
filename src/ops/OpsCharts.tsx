// 운영 대시보드 그래프 (#590). 라이브러리 없이 SVG 로 그립니다.
//   ErrorBars  시간대별 에러 수, 종류별로 쌓은 막대
//   FpsLine    시간대별 평균 FPS 선과 30FPS 기준 점선 (30 미만 비율은 다른 단위라 같은 축에 그리지 않고 마우스를 올리면 보여 줌)
// 색은 opsColors.ts. 종류는 범례 글자로도 구분합니다.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { axisTicks, fillSeries, FPS_TARGET } from './opsLogic'
import type { ErrorKind } from './opsLogic'
import type { ErrorPoint, FpsPoint } from './opsApi'
import { KIND_COLOR, KIND_LABEL } from './opsColors'

const KINDS: ErrorKind[] = ['supabase', 'relay', 'realtime', 'js']

const W = 1000
const H = 170
const PAD = { l: 44, r: 8, t: 8, b: 24 }
const PLOT_W = W - PAD.l - PAD.r
const PLOT_H = H - PAD.t - PAD.b
const GAP = 2 // 쌓은 막대 사이 틈
const INK = { primary: '#f0efec', secondary: '#aab0bb', muted: '#6b7280', grid: '#2e323b' }

// 시간 눈금 글자: 묶음이 하루면 날짜만, 몇 시간이면 날짜+시, 아니면 시:분
function timeLabel(t: number, bucketSec: number): string {
  const d = new Date(t)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (bucketSec >= 86_400) return `${d.getMonth() + 1}/${d.getDate()}`
  if (bucketSec >= 10_800) return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}시`
  return hm
}

// 보기 좋은 위 끝값 (1, 2, 5 × 10ⁿ)
function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p
}

function Frame({ ticks, yMax, yFmt, n, bucketSec, times }: { ticks: number[]; yMax: number; yFmt: (v: number) => string; n: number; bucketSec: number; times: number[] }) {
  const xs = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.min(n - 1, Math.round(f * (n - 1))))
  return (
    <g>
      {ticks.map((v) => {
        const y = PAD.t + PLOT_H - (v / yMax) * PLOT_H
        return (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke={INK.grid} strokeWidth={1} />
            <text x={PAD.l - 6} y={y + 4} textAnchor="end" fontSize={11} fill={INK.muted}>
              {yFmt(v)}
            </text>
          </g>
        )
      })}
      {n > 0 &&
        [...new Set(xs)].map((i) => (
          <text key={i} x={PAD.l + ((i + 0.5) / n) * PLOT_W} y={H - 6} textAnchor="middle" fontSize={11} fill={INK.muted}>
            {timeLabel(times[i], bucketSec)}
          </text>
        ))}
    </g>
  )
}

function Tooltip({ x, lines }: { x: number; lines: string[] }) {
  // x: 0~1 (가로 위치). 오른쪽 끝에서는 왼쪽으로 띄움
  const style: CSSProperties = {
    ...styles.tip,
    ...(x > 0.7 ? { right: `${(1 - x) * 100}%` } : { left: `${x * 100}%` }),
  }
  return (
    <div style={style}>
      {lines.map((l, i) => (
        <div key={i} style={i === 0 ? { color: INK.secondary } : undefined}>
          {l}
        </div>
      ))}
    </div>
  )
}

type Range = { bucketSec: number; from: number; to: number }
type Bucket = { t: string } & Record<ErrorKind, number>

export function ErrorBars({ series, bucketSec, from, to }: { series: ErrorPoint[] } & Range) {
  const [hover, setHover] = useState<number | null>(null)
  const grouped = new Map<number, Bucket>()
  for (const p of series) {
    const key = Date.parse(p.t)
    const b = grouped.get(key) ?? { t: p.t, supabase: 0, relay: 0, realtime: 0, js: 0 }
    b[p.kind] += p.n
    grouped.set(key, b)
  }
  const buckets = fillSeries([...grouped.values()], from, to, bucketSec, (t) => ({ t, supabase: 0, relay: 0, realtime: 0, js: 0 }))
  const totals = buckets.map((b) => KINDS.reduce((s, k) => s + b[k], 0))
  const yMax = niceMax(Math.max(0, ...totals))
  const n = buckets.length
  const slot = PLOT_W / Math.max(1, n)
  const barW = Math.max(1, Math.min(24, slot - 2))
  const times = buckets.map((b) => Date.parse(b.t))
  const present = KINDS.filter((k) => buckets.some((b) => b[k] > 0))

  return (
    <div style={styles.wrap}>
      <Legend items={(present.length ? present : KINDS).map((k) => ({ color: KIND_COLOR[k], label: KIND_LABEL[k] }))} />
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={styles.svg} role="img" aria-label="시간대별 에러 수" onMouseLeave={() => setHover(null)}>
          <Frame ticks={axisTicks(yMax)} yMax={yMax} yFmt={String} n={n} bucketSec={bucketSec} times={times} />
          {buckets.map((b, i) => {
            const x = PAD.l + i * slot + (slot - barW) / 2
            let y = PAD.t + PLOT_H
            const top = [...KINDS].reverse().find((k) => b[k] > 0) // 맨 위 칸만 끝을 둥글게
            return (
              <g key={b.t}>
                {KINDS.filter((k) => b[k] > 0).map((k) => {
                  const h = Math.max(1, (b[k] / yMax) * PLOT_H)
                  y -= h
                  const r = k === top ? Math.min(4, barW / 2, h) : 0
                  const segH = Math.max(1, h - (k === top ? 0 : GAP))
                  return <path key={k} d={roundTop(x, y + (k === top ? 0 : GAP), barW, segH, r)} fill={KIND_COLOR[k]} opacity={hover === null || hover === i ? 1 : 0.5} />
                })}
                {/* 막대보다 넓은 마우스 영역 */}
                <rect x={PAD.l + i * slot} y={PAD.t} width={slot} height={PLOT_H} fill="transparent" onMouseEnter={() => setHover(i)} />
              </g>
            )
          })}
        </svg>
        {hover !== null && buckets[hover] && (
          <Tooltip
            x={(hover + 0.5) / n}
            lines={[timeLabel(times[hover], Math.min(bucketSec, 3600)), `합계 ${totals[hover]}건`, ...KINDS.filter((k) => buckets[hover][k] > 0).map((k) => `${KIND_LABEL[k]} ${buckets[hover][k]}건`)]}
          />
        )}
      </div>
    </div>
  )
}

// 위 두 모서리만 둥근 막대
function roundTop(x: number, y: number, w: number, h: number, r: number): string {
  if (r <= 0) return `M${x},${y}h${w}v${h}h${-w}z`
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}z`
}

export function FpsLine({ series, bucketSec, from, to }: { series: FpsPoint[] } & Range) {
  const [hover, setHover] = useState<number | null>(null)
  const points = fillSeries<{ t: string; avg: number | null; low_pct: number | null }>(series, from, to, bucketSec, (t) => ({ t, avg: null, low_pct: null }))
  const n = points.length
  const yMax = niceMax(Math.max(60, ...points.map((p) => p.avg ?? 0)))
  const slot = PLOT_W / Math.max(1, n)
  const xOf = (i: number) => PAD.l + (i + 0.5) * slot
  const yOf = (v: number) => PAD.t + PLOT_H - (v / yMax) * PLOT_H
  // 기록 없는 시간대에서 선을 끊음
  let d = ''
  let pen = false
  points.forEach((p, i) => {
    if (p.avg === null) {
      pen = false
      return
    }
    d += `${pen ? 'L' : 'M'}${xOf(i)},${yOf(p.avg)}`
    pen = true
  })
  const times = points.map((p) => Date.parse(p.t))
  const lone = points.map((p, i) => p.avg !== null && points[i - 1]?.avg == null && points[i + 1]?.avg == null) // 앞뒤가 비어 선이 안 보이는 점
  const h = hover === null ? null : points[hover]

  return (
    <div style={styles.wrap}>
      <Legend items={[{ color: KIND_COLOR.supabase, label: '평균 FPS' }, { color: INK.secondary, label: `기준 ${FPS_TARGET}FPS`, dashed: true }]} />
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={styles.svg} role="img" aria-label="시간대별 평균 FPS" onMouseLeave={() => setHover(null)}>
          <Frame ticks={axisTicks(yMax)} yMax={yMax} yFmt={String} n={n} bucketSec={bucketSec} times={times} />
          <line x1={PAD.l} x2={W - PAD.r} y1={yOf(FPS_TARGET)} y2={yOf(FPS_TARGET)} stroke={INK.secondary} strokeWidth={1.5} strokeDasharray="6 4" />
          <path d={d} fill="none" stroke={KIND_COLOR.supabase} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (p.avg !== null && lone[i] ? <circle key={p.t} cx={xOf(i)} cy={yOf(p.avg)} r={4} fill={KIND_COLOR.supabase} /> : null))}
          {h && h.avg !== null && hover !== null && (
            <g>
              <line x1={xOf(hover)} x2={xOf(hover)} y1={PAD.t} y2={PAD.t + PLOT_H} stroke={INK.muted} strokeWidth={1} />
              <circle cx={xOf(hover)} cy={yOf(h.avg)} r={5} fill={KIND_COLOR.supabase} stroke="#20232a" strokeWidth={2} />
            </g>
          )}
          {points.map((p, i) => (
            <rect key={p.t} x={PAD.l + i * slot} y={PAD.t} width={slot} height={PLOT_H} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
        {h && hover !== null && (
          <Tooltip
            x={(hover + 0.5) / n}
            lines={[timeLabel(times[hover], Math.min(bucketSec, 3600)), ...(h.avg === null ? ['기록 없음'] : [`평균 ${h.avg}FPS`, `30 미만인 분 ${h.low_pct ?? 0}%`])]}
          />
        )}
      </div>
    </div>
  )
}

function Legend({ items }: { items: { color: string; label: string; dashed?: boolean }[] }) {
  return (
    <div style={styles.legend}>
      {items.map((it) => (
        <span key={it.label} style={styles.legendItem}>
          <span style={it.dashed ? { ...styles.swatch, background: 'none', borderTop: `2px dashed ${it.color}`, height: 0 } : { ...styles.swatch, background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 6 },
  svg: { width: '100%', height: 'auto', display: 'block' },
  legend: { display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: INK.secondary },
  legendItem: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  swatch: { display: 'inline-block', width: 12, height: 12, borderRadius: 3 },
  tip: {
    position: 'absolute', top: 4, transform: 'translateX(8px)', pointerEvents: 'none', whiteSpace: 'nowrap',
    padding: '6px 10px', borderRadius: 8, background: '#0f1115', border: '1px solid #2e323b', color: INK.primary, fontSize: 12, lineHeight: 1.5,
  },
}
