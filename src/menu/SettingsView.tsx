// 설정 창 (#222). 오른쪽 위 메뉴의 "설정"(O)으로 엽니다. 1인칭 마우스 감도와 단축키 바꾸기(#250)가 있습니다.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { SENSITIVITY, getMouseSensitivity, sensitivityLabel, setMouseSensitivity } from './lookSettings'
import { KeymapSettings } from './KeymapSettings'

export function SettingsView() {
  const [sensitivity, setSensitivity] = useState(getMouseSensitivity)
  const change = (value: number) => setSensitivity(setMouseSensitivity(value))

  return (
    <div style={styles.stack}>
      <div style={styles.card}>
        <div style={styles.row}>
          <label htmlFor="mouse-sensitivity" style={styles.label}>
            마우스 감도
          </label>
          <span style={styles.value}>{sensitivityLabel(sensitivity)}</span>
        </div>
        <input
          id="mouse-sensitivity"
          type="range"
          min={SENSITIVITY.min}
          max={SENSITIVITY.max}
          step={SENSITIVITY.step}
          value={sensitivity}
          onChange={(e) => change(Number(e.target.value))}
          style={styles.slider}
        />
        <div style={styles.row}>
          <span style={styles.help}>1인칭으로 걸을 때 마우스로 둘러보는 빠르기예요. 이 브라우저에 기억돼요.</span>
          <button
            type="button"
            style={{ ...styles.reset, ...(sensitivity === SENSITIVITY.default ? styles.resetOff : null) }}
            disabled={sensitivity === SENSITIVITY.default}
            onClick={() => change(SENSITIVITY.default)}
          >
            기본값
          </button>
        </div>
      </div>
      <KeymapSettings />
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  stack: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: { padding: 16, borderRadius: 12, background: '#20232a', display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { fontWeight: 700 },
  value: { fontVariantNumeric: 'tabular-nums', color: '#d1d5db' },
  slider: { width: '100%', accentColor: '#a78bfa' },
  help: { color: '#aab0bb', fontSize: 13 },
  reset: {
    flexShrink: 0, padding: '4px 10px', borderRadius: 6, border: '1px solid #4b5563', background: 'transparent',
    color: '#fff', cursor: 'pointer', font: 'inherit', fontSize: 13,
  },
  resetOff: { color: '#6b7280', border: '1px solid #374151', cursor: 'default' }, // 이미 기본값
}
