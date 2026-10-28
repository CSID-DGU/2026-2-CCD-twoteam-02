// 신고에 붙은 최근 30초 수치를 표로 보여 줍니다. 신고 창(보내기 전 확인)과 팀의 신고 목록이 같이 씁니다.
import type { CSSProperties } from 'react'
import type { FocusStatus } from '../focus/focusLogic'
import type { Sample } from './recentSamples'
import { relativeSeconds } from './reportLogic'

const STATUS_SHORT: Record<FocusStatus, string> = {
  focus: '공부', away: '이탈', drowsy: '졸음', offscreen: '다른 화면', outframe: '구도 이탈', phone: '휴대폰',
}
const HOLD_SHORT: Record<NonNullable<Sample['hold']>, string> = { face: '얼굴', eyes: '눈', frame: '구도', phone: '휴대폰' }

// 참/거짓/모름을 글자 하나로
const mark = (v: boolean | null) => (v === null ? '?' : v ? 'O' : 'X')

// reportedAt: 신고 시각(ms). 첫 열이 그 시각 기준 몇 초 전인지가 됩니다.
export function SampleTable({ samples, reportedAt }: { samples: Sample[]; reportedAt: number }) {
  if (samples.length === 0) return <div style={styles.empty}>판정 수치 없음(공부 중이 아님)</div>
  return (
    <div style={styles.scroll}>
      <table style={styles.table}>
        <thead>
          <tr>
            {['초', '상태', '보류', '얼굴', '고개', 'EAR', '몸', '구도', '휴대폰'].map((h) => (
              <th key={h} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {samples.map((s) => (
            <tr key={s.at}>
              <td style={styles.td}>{relativeSeconds(s, reportedAt)}</td>
              <td style={styles.td}>{STATUS_SHORT[s.status]}</td>
              <td style={styles.td}>{s.hold ? HOLD_SHORT[s.hold] : '-'}</td>
              <td style={styles.td}>{mark(s.face)}</td>
              <td style={styles.td}>{s.pitch === null ? '-' : `${s.pitch}°`}</td>
              <td style={styles.td}>{s.ear === null ? '-' : s.ear}</td>
              <td style={styles.td}>{mark(s.body)}</td>
              <td style={styles.td}>{mark(s.framed)}</td>
              <td style={styles.td}>{mark(s.phone)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  empty: { color: '#aab0bb', fontSize: 13 },
  scroll: { maxHeight: 220, overflowY: 'auto', borderRadius: 8, border: '1px solid #374151' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12, fontVariantNumeric: 'tabular-nums' },
  th: { position: 'sticky', top: 0, background: '#111318', color: '#aab0bb', fontWeight: 600, padding: '4px 6px', textAlign: 'left' },
  td: { padding: '2px 6px', borderTop: '1px solid #2a2e37', whiteSpace: 'nowrap' },
}
