// 지점 안에서 다른 참여자 캐릭터를 누르면 뜨는 프로필 창.
// 페이지를 옮기면 지점을 나가게 돼서(자리·타이머·실시간 연결이 끊김) 화면 위에 창으로 띄웁니다.
import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import { ProfileView } from './ProfileView'

export function ProfileModal({ userId, myId, onClose }: { userId: string; myId: string; onClose: () => void }) {
  // Esc 로도 닫습니다.
  useEffect(() => {
    const down = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [onClose])

  return (
    <div style={styles.backdrop} onClick={onClose}>
      {/* 창 안을 눌러도 닫히지 않게 합니다. */}
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <button type="button" style={styles.close} onClick={onClose} aria-label="닫기">✕</button>
        <ProfileView userId={userId} isMe={userId === myId} />
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, zIndex: 20, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.45)' },
  panel: {
    position: 'relative', width: 'min(440px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
    padding: 20, borderRadius: 12, background: '#20232a', color: '#fff', font: '14px/1.6 system-ui, sans-serif',
  },
  close: {
    position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 6, border: 'none',
    background: 'transparent', color: '#aab0bb', cursor: 'pointer', fontSize: 16,
  },
}
