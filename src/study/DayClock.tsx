// 하루 시계(#235): 24시간 원 위에 그날의 공부를 과목 색의 호로 그립니다. 맨 위가 0시, 시계 방향.
// 호를 누르면 그 공부의 띠(RunBand)로 들어갑니다.
//
// 1분짜리 공부는 24시간 원에서 아주 얇아(0.25도) 누르기 어려워서, 띠와 같이
// 커서 근처(SNAP_DEG)의 호에 달라붙어 크게 강조합니다. 최소 굵기(MIN_DEG)도 둡니다.
import type { CSSProperties, MouseEvent } from 'react'
import { formatSpan } from './bandLogic'
import type { BandRun } from './bandLogic'

const SIZE = 260
const C = SIZE / 2 // 원의 중심
const R_OUT = 112 // 호의 바깥 반지름
const R_IN = 80 // 호의 안쪽 반지름
const LIFT = 9 // 강조된 호가 바깥으로 커지는 정도
const MIN_DEG = 1.5 // 아무리 짧은 공부도 이만큼은 보이게
const SNAP_DEG = 4 // 커서에서 이 각도 안의 호에 달라붙음
const DAY_MS = 24 * 3600_000

// 0시 기준 각도(도). 0 = 맨 위
const degOf = (ms: number, dayStart: number) => ((ms - dayStart) / DAY_MS) * 360

// 각도 → 좌표 (맨 위에서 시계 방향)
function point(deg: number, r: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return [C + r * Math.cos(rad), C + r * Math.sin(rad)]
}

// 도넛 조각 경로
function arcPath(from: number, to: number, rIn: number, rOut: number) {
  const large = to - from > 180 ? 1 : 0
  const [x1, y1] = point(from, rOut)
  const [x2, y2] = point(to, rOut)
  const [x3, y3] = point(to, rIn)
  const [x4, y4] = point(from, rIn)
  return `M${x1},${y1} A${rOut},${rOut} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${rIn},${rIn} 0 ${large} 0 ${x4},${y4} Z`
}

type Props = {
  runs: BandRun[]
  dayStart: number
  colorOf: (subjectId: number) => string
  focusedSeconds: number // 가운데에 보일 그날 집중 합계
  hovered: number | null // 강조할 공부(시작 시각)
  onHover: (run: number | null) => void
  onOpen: (run: number) => void
}

export function DayClock({ runs, dayStart, colorOf, focusedSeconds, hovered, onHover, onOpen }: Props) {
  // 커서 위치의 공부를 찾습니다. 링 근처에서만, 가장 가까운 호에 달라붙습니다.
  const runAt = (e: MouseEvent<SVGSVGElement>): BandRun | null => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * SIZE - C
    const y = ((e.clientY - rect.top) / rect.height) * SIZE - C
    const r = Math.hypot(x, y)
    if (r < R_IN - 20 || r > R_OUT + LIFT + 10) return null
    const deg = ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360
    let near: BandRun | null = null
    let nearDist = SNAP_DEG
    for (const run of runs) {
      const from = degOf(run.startedAt, dayStart)
      const to = Math.max(degOf(run.endedAt, dayStart), from + MIN_DEG)
      const dist = Math.max(from - deg, deg - to, 0)
      if (dist <= nearDist) {
        near = run
        nearDist = dist
      }
    }
    return near
  }

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={styles.svg}
      role="img"
      aria-label="하루 공부 시계"
      onMouseMove={(e) => onHover(runAt(e)?.startedAt ?? null)}
      onMouseLeave={() => onHover(null)}
      onClick={(e) => {
        const run = runAt(e)
        if (run) onOpen(run.startedAt)
      }}
    >
      {/* 바탕 링과 시각 눈금 (1시간마다 짧게, 6시간마다 길게 + 숫자) */}
      <path d={arcPath(0, 359.99, R_IN, R_OUT)} fill="#2b2f38" />
      {Array.from({ length: 24 }, (_, h) => {
        const deg = h * 15
        const major = h % 6 === 0
        const [x1, y1] = point(deg, R_IN - 2)
        const [x2, y2] = point(deg, R_IN - (major ? 10 : 5))
        const [tx, ty] = point(deg, R_IN - 20)
        return (
          <g key={h}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#5b616d" strokeWidth={major ? 1.5 : 1} />
            {major && (
              <text x={tx} y={ty} fill="#8b919c" fontSize="11" textAnchor="middle" dominantBaseline="central">
                {h}
              </text>
            )}
          </g>
        )
      })}

      {/* 공부: 강조된 것은 맨 나중에 그려 위로 올라오게 */}
      {[...runs]
        .sort((a, b) => Number(a.startedAt === hovered) - Number(b.startedAt === hovered))
        .map((run) => {
          const lit = run.startedAt === hovered
          const from = degOf(run.startedAt, dayStart)
          const to = Math.max(degOf(run.endedAt, dayStart), from + (lit ? MIN_DEG * 2 : MIN_DEG))
          return (
            <path
              key={run.startedAt}
              d={arcPath(from, to, R_IN, R_OUT + (lit ? LIFT : 0))}
              fill={colorOf(run.subjectId)}
              stroke={lit ? '#fff' : 'none'}
              strokeWidth={2}
              style={{ cursor: 'pointer' }}
            />
          )
        })}

      <text x={C} y={C - 10} fill="#aab0bb" fontSize="12" textAnchor="middle">
        집중
      </text>
      <text x={C} y={C + 12} fill="#fff" fontSize="20" fontWeight="700" textAnchor="middle">
        {formatSpan(focusedSeconds)}
      </text>
      <text x={C} y={C + 32} fill="#8b919c" fontSize="11" textAnchor="middle">
        공부 {runs.length}번
      </text>
    </svg>
  )
}

const styles: Record<string, CSSProperties> = {
  svg: { width: '100%', maxWidth: SIZE + 40, display: 'block', margin: '0 auto', overflow: 'visible', cursor: 'pointer' },
}
