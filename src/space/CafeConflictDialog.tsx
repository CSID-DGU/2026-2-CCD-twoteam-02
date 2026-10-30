// 다른 자리를 이용 중일 때 뜨는 창 (#44): 반납하고 바로 이 자리에 앉을 수 있게 합니다.
// 카페 지점과 광장 벤치가 같이 씁니다(useCafeSeat 의 conflict).
import type { CSSProperties } from 'react'

export function CafeConflictDialog({ message, onClose, onReleaseAndSit }: { message: string; onClose: () => void; onReleaseAndSit: () => void }) {
  return (
    <div style={styles.backdrop}>
      <div style={styles.box}>
        <p style={{ margin: '0 0 16px' }}>{message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={styles.button} onClick={onClose}>
            닫기
          </button>
          <button type="button" style={{ ...styles.button, ...styles.primary }} onClick={onReleaseAndSit}>
            반납하고 앉기
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, zIndex: 20, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.45)' },
  box: { width: 'min(380px, calc(100vw - 32px))', padding: 20, borderRadius: 12, background: '#20232a', color: '#fff', font: '14px/1.6 system-ui, sans-serif' },
  button: { padding: '6px 12px', borderRadius: 6, border: '1px solid #4b5563', background: 'transparent', color: '#fff', cursor: 'pointer', font: 'inherit' },
  primary: { border: 'none', background: '#22c55e', color: '#0b1a10', fontWeight: 600 },
}
