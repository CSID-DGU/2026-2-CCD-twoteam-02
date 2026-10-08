// 이용 시간 고르기. 자주 쓰는 값은 버튼으로, 그 외에는 10분 단위로 맞춘다.
//
// 10분 단위와 하한 10분은 passes 테이블의 check 제약과 같은 값이다. 한쪽만 바꾸면 안 된다.
// 상한은 아직 없다(팀 논의 중). 생기면 MAX_MINUTES 를 두고 DB 제약도 같이 바꾼다.
import { STEP_MINUTES, MIN_MINUTES, PRESETS, formatMinutes } from './duration'

const box = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #4b515c',
  background: '#20232a',
  color: '#fff',
  font: '15px system-ui, sans-serif',
  cursor: 'pointer',
} as const

export default function DurationPicker({
  minutes,
  onChange,
}: {
  minutes: number
  onChange: (next: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PRESETS.map((m) => (
          <button
            key={m}
            type="button"
            style={{
              ...box,
              borderColor: m === minutes ? '#4ade80' : '#4b515c',
              color: m === minutes ? '#4ade80' : '#fff',
            }}
            onClick={() => onChange(m)}
          >
            {formatMinutes(m)}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          style={{ ...box, width: 44, textAlign: 'center' }}
          disabled={minutes <= MIN_MINUTES}
          onClick={() => onChange(Math.max(MIN_MINUTES, minutes - STEP_MINUTES))}
          aria-label={`${STEP_MINUTES}분 빼기`}
        >
          −
        </button>

        <div style={{ minWidth: 140, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{formatMinutes(minutes)}</div>
          <div style={{ fontSize: 12, color: '#9aa1ab' }}>{minutes}분</div>
        </div>

        <button
          type="button"
          style={{ ...box, width: 44, textAlign: 'center' }}
          onClick={() => onChange(minutes + STEP_MINUTES)}
          aria-label={`${STEP_MINUTES}분 더하기`}
        >
          +
        </button>
      </div>
    </div>
  )
}
