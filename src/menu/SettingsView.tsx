// 설정 창 (#222). 오른쪽 위 메뉴의 "설정"(O)으로 엽니다.
// 탭 셋으로 나눠 스크롤 없이 봅니다. 처음 열면 [내 정보]입니다.
//   내 정보  닉네임·생일·이메일·비밀번호 (예전 프로필의 "정보 변경" 탭)
//   마우스   1인칭 마우스 감도
//   단축키   단축키 바꾸기 (#250)
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { SENSITIVITY, getMouseSensitivity, sensitivityLabel, setMouseSensitivity } from './lookSettings'
import { KeymapSettings } from './KeymapSettings'
import { AccountSettings } from './AccountSettings'

const TABS = [
  ['account', '내 정보'],
  ['mouse', '마우스'],
  ['keys', '단축키'],
] as const
type Tab = (typeof TABS)[number][0]

export function SettingsView() {
  const [tab, setTab] = useState<Tab>('account')
  const [sensitivity, setSensitivity] = useState(getMouseSensitivity)
  const change = (value: number) => setSensitivity(setMouseSensitivity(value))

  return (
    <div style={styles.stack}>
      {/* 프로필 창의 탭과 같은 모양 */}
      <nav style={styles.tabs} role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            style={{ ...styles.tab, ...(tab === key ? styles.tabOn : null) }}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === 'account' && (
        <div style={styles.card}>
          <AccountSettings />
        </div>
      )}
      {tab === 'mouse' && (
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
      )}
      {tab === 'keys' && <KeymapSettings />}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  stack: { display: 'flex', flexDirection: 'column', gap: 12 },
  tabs: { display: 'flex', gap: 2, padding: 3, borderRadius: 8, background: '#16181d' },
  tab: { flex: 1, padding: '6px 12px', borderRadius: 6, border: 'none', background: 'transparent', color: '#aab0bb', cursor: 'pointer', font: 'inherit' },
  tabOn: { background: '#3a3f4b', color: '#fff', fontWeight: 700 },
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
