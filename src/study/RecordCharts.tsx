// 기록 화면의 막대그래프. 라이브러리 없이 SVG·HTML 로 그립니다.
//
// 색은 하나만 씁니다(막대 = 집중 시간). 일 단위는 막대마다 과목 이름이 붙고,
// 월·년 단위는 과목 필터로 나눠 보므로 과목별 색이 필요 없습니다.
// 숫자·글자는 막대 색이 아니라 글자색으로 씁니다.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { formatHM } from './recordsLogic'

const CHART = {
  bar: '#3987e5', // 다크 배경(#20232a)에서 대비·밝기 검증 통과한 파랑
  barHover: '#5a9ef0',
  grid: 'rgba(255,255,255,.08)',
  text: '#ffffff',
  muted: '#aab0bb',
}

const HEIGHT = 220
const PAD = { top: 12, right: 8, bottom: 24, left: 44 }
const GAP = 2 // 막대 사이 간격(px)
const RADIUS = 4 // 막대 윗부분만 둥글게

// 눈금 간격: 최댓값에 맞춰 30분·1시간·2시간… 중에서 고릅니다.
function tickStep(maxSeconds: number) {
  const steps = [600, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 360000]
  return steps.find((s) => maxSeconds / s <= 4) ?? steps[steps.length - 1]
}

// 위쪽 모서리만 둥근 막대. 바닥은 기준선에 딱 붙습니다.
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(RADIUS, w / 2, h)
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

type ColumnProps = {
  values: number[] // 초
  tickLabel: (i: number) => string // x축 글자 (빈 글자면 생략)
  tooltipLabel: (i: number) => string // 마우스를 올렸을 때 앞부분 (예: "10월 12일")
}

// 세로 막대: 월(날짜별), 년(월별)
export function ColumnChart({ values, tickLabel, tooltipLabel }: ColumnProps) {
  const [hover, setHover] = useState<number | null>(null)
  const width = 640 // viewBox 기준 너비. 실제 화면 폭에 맞춰 늘고 줄어듭니다.
  const max = Math.max(...values, 1)
  const step = tickStep(max)
  const top = Math.ceil(max / step) * step
  const plotW = width - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const slot = plotW / values.length
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} width="100%" role="img" aria-label="공부 시간 막대그래프">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={CHART.grid} />
            <text x={PAD.left - 6} y={y(t)} fill={CHART.muted} fontSize={11} textAnchor="end" dominantBaseline="middle">
              {formatHM(t)}
            </text>
          </g>
        ))}
        {values.map((v, i) => {
          const x = PAD.left + i * slot + GAP / 2
          const w = Math.max(slot - GAP, 1)
          const h = (v / top) * plotH
          return (
            <g key={i}>
              {v > 0 && <path d={barPath(x, y(v), w, h)} fill={hover === i ? CHART.barHover : CHART.bar} />}
              {tickLabel(i) && (
                <text x={x + w / 2} y={HEIGHT - 8} fill={CHART.muted} fontSize={11} textAnchor="middle">
                  {tickLabel(i)}
                </text>
              )}
              {/* 마우스 감지 영역은 막대보다 크게: 칸 전체 높이 */}
              <rect
                x={PAD.left + i * slot}
                y={PAD.top}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <div
          style={{
            ...tooltip,
            left: `${((PAD.left + (hover + 0.5) * slot) / width) * 100}%`,
          }}
        >
          {tooltipLabel(hover)} · {formatHM(values[hover])}
        </div>
      )}
    </div>
  )
}

// 가로 막대: 일(과목별)
// id: 과목 번호(지운 과목은 null). 줄을 이름이 아니라 번호로 구분합니다. 이름은 읽는 중에 겹칠 수 있어서예요(#115).
export function SubjectBars({ items }: { items: { id?: number | null; name: string; seconds: number }[] }) {
  const max = Math.max(...items.map((i) => i.seconds), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((it) => (
        <div key={it.id !== undefined ? `id-${it.id}` : it.name} style={{ display: 'grid', gridTemplateColumns: '96px 1fr 88px', alignItems: 'center', gap: 8 }}>
          <span style={{ color: CHART.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
          <div style={{ height: 14, background: CHART.grid, borderRadius: 4 }}>
            <div
              style={{
                width: `${(it.seconds / max) * 100}%`,
                minWidth: it.seconds > 0 ? 2 : 0,
                height: '100%',
                background: CHART.bar,
                borderRadius: '0 4px 4px 0', // 기준선(왼쪽)은 직각, 끝만 둥글게
              }}
            />
          </div>
          <span style={{ color: CHART.muted, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatHM(it.seconds)}</span>
        </div>
      ))}
    </div>
  )
}

const tooltip: CSSProperties = {
  position: 'absolute', top: 0, transform: 'translate(-50%, -100%)', pointerEvents: 'none',
  padding: '4px 8px', borderRadius: 6, background: '#111318', color: CHART.text,
  font: '12px system-ui, sans-serif', whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(0,0,0,.4)',
}
