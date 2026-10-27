// "그룹 초대" 버튼 (#298). 친구 목록 줄과 캐릭터 프로필 창에 붙습니다.
// 접속한 친구에게만 보낼 수 있고(접속 안 했으면 흐리게), 이미 같은 그룹이면 "같은 그룹"으로 보여 줍니다.
// 보내면 그 친구 채팅창에 [수락] [거절]이 뜹니다. 결과(보냄·실패 까닭)는 채팅 로그와 이 버튼 옆에 짧게 남깁니다.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useChat } from './chatContext'
import { GROUP_MAX_MEMBERS } from './chatLogic'

const SENT_SHOW_MS = 3000 // "초대 보냄"을 보여 주는 시간

export function GroupInviteButton({ friendId, onMessage }: { friendId: string; onMessage?: (text: string) => void }) {
  const chat = useChat()
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  if (!chat?.enabled) return null
  if (chat.group?.members.some((m) => m.id === friendId)) return <span style={same}>같은 그룹</span>
  const online = chat.online.some((f) => f.id === friendId)
  const full = (chat.group?.members.length ?? 0) + 1 >= GROUP_MAX_MEMBERS
  const disabled = busy || sent || !online || full

  const invite = async () => {
    setBusy(true)
    const error = await chat.inviteToGroup(friendId)
    setBusy(false)
    if (error) {
      onMessage?.(error)
      chat.note(error)
      return
    }
    setSent(true)
    setTimeout(() => setSent(false), SENT_SHOW_MS)
  }

  return (
    <button
      type="button"
      style={{ ...style, ...(disabled && !sent ? off : null) }}
      disabled={disabled}
      onClick={() => void invite()}
      title={!online ? '접속한 친구만 초대할 수 있어요' : full ? `그룹은 ${GROUP_MAX_MEMBERS}명까지예요` : '내 그룹에 초대하기 (5분 안에 수락하면 들어와요)'}
    >
      {sent ? '초대 보냄' : '👥 그룹 초대'}
    </button>
  )
}

const style: CSSProperties = {
  padding: '4px 10px', borderRadius: 6, border: 'none', background: '#0ea5e9', color: '#fff',
  fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
}
const off: CSSProperties = { background: 'rgba(14,165,233,.25)', color: '#7dd3fc', cursor: 'default' }
const same: CSSProperties = { color: '#7dd3fc', fontSize: 13, whiteSpace: 'nowrap' }
