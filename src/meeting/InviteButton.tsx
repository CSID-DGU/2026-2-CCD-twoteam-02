// 친구 창의 "회의에 초대" 버튼 (#45). 회의 중에 연 친구 창에서만 보입니다.
//
// 1. 초대를 DB 에 저장합니다(invite_to_meeting, 0021). 친구인지, 내가 그 회의에 들어 있는지는 DB 가 확인합니다.
//    저장된 초대 덕분에 비공개 회의도 그 친구의 회의 목록에 "초대받음"으로 보이고 들어올 수 있습니다.
// 2. 친구가 접속해 있으면 채팅창으로 초대 알림을 보냅니다(ChatProvider.sendInvite). 접속해 있지 않으면 저장만 됩니다.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../lib/supabase'
import { useChat } from '../chat/chatContext'

type Props = {
  meetingId: number
  friendId: string
  onMessage: (text: string) => void // 실패했을 때 친구 창 위쪽에 띄울 안내
}

export function InviteButton({ meetingId, friendId, onMessage }: Props) {
  const chat = useChat()
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')

  const invite = async () => {
    setState('busy')
    const { error } = await supabase.rpc('invite_to_meeting', { p_meeting_id: meetingId, p_friend: friendId })
    if (error) {
      setState('idle')
      onMessage(`초대하지 못했어요: ${error.message}`)
      return
    }
    const told = (await chat?.sendInvite(friendId, meetingId)) ?? false
    setState('done')
    if (!told) onMessage('접속하지 않은 친구라 알림은 가지 않았어요. 그 지점 회의 목록에 "초대받음"으로 보여요.')
  }

  return (
    <button type="button" style={state === 'done' ? styles.done : styles.invite} disabled={state !== 'idle'} onClick={() => void invite()}>
      {state === 'done' ? '초대함' : '회의에 초대'}
    </button>
  )
}

const styles: Record<string, CSSProperties> = {
  invite: {
    padding: '4px 10px', borderRadius: 6, border: 'none', background: '#22c55e', color: '#0b1a10',
    font: 'inherit', fontWeight: 600, cursor: 'pointer',
  },
  done: { padding: '4px 10px', borderRadius: 6, border: '1px solid #374151', background: 'transparent', color: '#9ca3af', font: 'inherit' },
}
