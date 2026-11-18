// 과목 색 고르기: 정해진 색 동그라미를 두 줄(윗줄 연한 색, 아랫줄 진한 색)로 보여 주고, 누르면 그 색을 알립니다.
// 같은 세로줄은 같은 계열이라, 비슷해 보이는 색은 위아래로 붙어 있고 밝기로 구분됩니다(subjectLogic.SUBJECT_TONES).
// 다른 과목이 이미 쓰는 색(used)은 가운데에 작은 점을 찍고, 아래에 그 뜻을 한 줄로 적습니다. 고르는 것은 막지 않습니다(과목이 색보다 많을 수 있음).
// 지금 고른 색을 다른 과목도 쓰고 있으면 고른 색에도 점이 찍혀 겹친 것을 알 수 있습니다.
// 과목 관리에서 씁니다. 새 과목은 겹치지 않는 색이 자동으로 붙어(subjectLogic.nextSubjectColor) 만들 때는 고르지 않습니다.
import type { CSSProperties } from 'react'
import { SUBJECT_TONES } from './subjectLogic'

type Props = {
  value: string
  onPick: (color: string) => void
  used?: Set<string>
  disabled?: boolean
}

const ROWS = [
  { label: '연한', colors: SUBJECT_TONES.light },
  { label: '진한', colors: SUBJECT_TONES.deep },
]

export function SubjectColorDots({ value, onPick, used, disabled }: Props) {
  const anyTaken = [...SUBJECT_TONES.light, ...SUBJECT_TONES.deep].some((c) => used?.has(c))
  return (
    <div style={styles.wrap}>
      <div style={styles.grid} role="radiogroup" aria-label="과목 색">
        {ROWS.map((row) =>
          row.colors.map((c, i) => {
            const taken = used?.has(c) ?? false
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === value}
                aria-label={`${row.label} 색 ${i + 1}${taken ? ' (다른 과목이 쓰는 색)' : ''}`}
                title={taken ? '다른 과목이 쓰는 색' : undefined}
                disabled={disabled}
                style={{
                  ...styles.dot,
                  background: c,
                  ...(c === value ? styles.on : null),
                }}
                onClick={() => onPick(c)}
              >
                {taken && <span style={styles.taken} />}
              </button>
            )
          }),
        )}
      </div>
      {anyTaken && (
        <div style={styles.legend}>
          <span style={styles.legendDot} /> 다른 과목이 쓰는 색
        </div>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    alignItems: 'flex-start',
  },
  legend: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    color: '#aab0bb',
    fontSize: 11,
  },
  legendDot: { width: 6, height: 6, borderRadius: 3, background: '#aab0bb' },
  grid: {
    display: 'grid',
    gridTemplateColumns: `repeat(${SUBJECT_TONES.light.length}, 20px)`,
    gap: 6,
  },
  dot: {
    width: 20,
    height: 20,
    padding: 0,
    borderRadius: 10,
    border: '2px solid transparent',
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
  },
  on: { borderColor: '#fff', boxShadow: '0 0 0 2px #16181d inset' }, // 고른 색: 흰 테두리와 안쪽 어두운 띠
  taken: {
    width: 6,
    height: 6,
    borderRadius: 3,
    background: 'rgba(22,24,29,.75)',
  }, // 다른 과목이 쓰는 색
}
