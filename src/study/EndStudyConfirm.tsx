// 공부 중에 자리를 떠나려 할 때 한 번 더 묻는 창 (#558).
// E로 일어나기, 메뉴의 "캠리단길로"·"트래킹 검증", 로그아웃이 같은 창을 씁니다.
// (부름 가기·회의 참가·따라가기는 채팅 로그 줄 안에서 같은 문구로 묻습니다)
// Esc 는 "계속 공부하기"입니다. 브라우저 확인 창(confirm)은 화면을 멈추므로 쓰지 않습니다.
import { useEffect } from 'react'
import type { CSSProperties } from 'react'

export const END_STUDY_QUESTION = '공부를 끝낼까요?'

export function EndStudyConfirm({ onEnd, onCancel, endLabel = '끝내기' }: { onEnd: () => void; onCancel: () => void; endLabel?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      e.preventDefault()
      onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div style={styles.backdrop} onClick={onCancel}>
      <div style={styles.box} role="dialog" aria-label={END_STUDY_QUESTION} onClick={(e) => e.stopPropagation()}>
        <p style={styles.title}>{END_STUDY_QUESTION}</p>
        <p style={styles.sub}>지금까지 공부한 시간은 기록에 남아요.</p>
        <div style={styles.row}>
          <button type="button" style={{ ...styles.ghost, flex: 1 }} onClick={onCancel}>
            계속 공부하기
          </button>
          <button type="button" style={{ ...styles.primary, flex: 1 }} onClick={onEnd}>
            {endLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, zIndex: 30, display: 'grid', placeItems: 'center', background: 'rgba(16,18,22,.6)' },
  box: {
    width: 'min(340px, calc(100vw - 32px))', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10,
    padding: 22, borderRadius: 12, background: '#2b2f38', color: '#fff', font: '15px/1.6 system-ui, sans-serif', textAlign: 'center',
  },
  title: { margin: 0, fontSize: 18, fontWeight: 600 },
  sub: { margin: 0, fontSize: 13, color: '#9aa1ab' },
  row: { display: 'flex', gap: 8, marginTop: 4 },
  primary: { padding: '10px 14px', borderRadius: 8, border: 'none', background: '#4ade80', color: '#20232a', font: 'inherit', fontWeight: 600, cursor: 'pointer' },
  ghost: { padding: '10px 14px', borderRadius: 8, border: '1px solid #4b515c', background: 'transparent', color: '#fff', font: 'inherit', cursor: 'pointer' },
}
