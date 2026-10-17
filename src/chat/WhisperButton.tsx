// 친구 프로필 창의 "귓속말" 버튼 (#49)
// 누르면 프로필 창이 닫히고, 왼쪽 아래 채팅창이 이 친구를 받는 사람으로 고른 채 열립니다.
// 접속한 친구에게만 보낼 수 있어서, 접속 안 했으면 흐리게 보여 줍니다.
// 채팅창은 로비·지점에만 있으므로 그 밖의 페이지(/friends 등)에서는 버튼을 숨깁니다.
import type { CSSProperties } from 'react'
import { useChat } from './chatContext'

export function WhisperButton({ friendId }: { friendId: string }) {
  const chat = useChat()
  if (!chat?.enabled || !chat.hasOverlay) return null
  const online = chat.online.some((f) => f.id === friendId)
  return (
    <button
      type="button"
      style={{ ...style, ...(online ? null : off) }}
      disabled={!online}
      onClick={() => chat.startWhisper(friendId)}
      title={online ? '이 친구에게 귓속말 보내기' : '접속한 친구에게만 귓속말을 보낼 수 있어요'}
    >
      {online ? '💬 귓속말' : '💬 접속 안 함'}
    </button>
  )
}

const style: CSSProperties = {
  padding: '4px 10px', borderRadius: 6, border: 'none', background: '#a855f7', color: '#fff',
  font: 'inherit', fontWeight: 600, cursor: 'pointer',
}
const off: CSSProperties = { background: 'rgba(168,85,247,.25)', color: '#c4b5fd', cursor: 'default' }
