// 같은 계정은 한 번에 한 탭만 쓰기 (#347). 다른 탭(기기)에 장면을 양보한 탭은 화면 대신 이 안내만 보여 줍니다.
// 화면(광장·지점·회의실 등)을 내리므로 위치 전송·웹캠·공부 타이머가 멈춥니다. "여기서 계속하기"를 누르면 이 탭이 다시 쓰고,
// 다른 탭이 이 안내로 바뀝니다. 판단은 OnlineProvider·tabLogic 이 합니다.
import type { CSSProperties, ReactNode } from 'react'
import { useTabGate } from './onlineContext'

export function TabGate({ children }: { children: ReactNode }) {
  const { yielded, takeOver } = useTabGate()
  if (!yielded) return children
  return (
    <div style={styles.page}>
      <div style={styles.box}>
        <p style={styles.title}>다른 탭이나 기기에서 이어서 쓰고 있어요</p>
        <p style={styles.text}>
          같은 계정은 한 번에 한 곳에서만 광장·지점에 있을 수 있어요. 여기서는 위치·웹캠·공부 타이머를 멈췄어요.
        </p>
        <button type="button" style={styles.button} onClick={takeOver}>
          여기서 계속하기
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  page: { position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#16181d', color: '#fff', font: '15px/1.6 system-ui, sans-serif' },
  box: { width: 'min(420px, calc(100vw - 32px))', padding: 24, borderRadius: 12, background: '#20232a', textAlign: 'center' },
  title: { margin: '0 0 8px', fontSize: 17, fontWeight: 700 },
  text: { margin: '0 0 20px', color: '#cbd5e1', fontSize: 14 },
  button: { padding: '8px 18px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#0b1a10', fontWeight: 700, font: 'inherit', cursor: 'pointer' },
}
