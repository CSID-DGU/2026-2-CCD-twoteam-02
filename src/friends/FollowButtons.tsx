// 친구 [따라가기] [부르기] 버튼 (followLogic 참고). 친구 목록 줄과 프로필 창의 친구 버튼 옆에 붙습니다.
//
//   따라가기  친구가 갈 수 있는 곳(캠리단길·캠퍼스·지점)에 있을 때만. 바로 친구 옆으로 갑니다(수락 없음, 친구에게 알림)
//   부르기    내가 갈 수 있는 곳에 있을 때만. 친구 로그에 [부름] 줄이 가고, 친구가 [가기]를 누르면 내 옆으로 옵니다
// 친구가 접속해 있지 않으면 아무것도 보이지 않습니다. 공부 중에 따라가면 공부가 끝나므로 한 번 더 묻습니다.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useSession } from '../auth/useSession'
import { useChat } from '../chat/chatContext'
import { useOnline } from '../realtime/onlineContext'
import { useCanReach, useGoToFriend } from './useFollow'

export function FollowButtons({ friendId, onMessage }: { friendId: string; onMessage: (text: string) => void }) {
  const { session } = useSession()
  const myId = session?.user.id
  const chat = useChat()
  const online = useOnline()
  const canReach = useCanReach()
  const go = useGoToFriend()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!myId || !chat?.enabled || !online.has(friendId)) return null
  const follow = () => {
    setConfirming(false)
    onMessage(go(friendId, 'follow'))
  }
  const summon = async () => {
    setBusy(true)
    const sent = await chat.sendSummon(friendId)
    setBusy(false)
    onMessage(sent ? '' : '부르지 못했어요. 잠시 뒤 다시 해 주세요.')
  }

  if (confirming) {
    return (
      <>
        <span style={styles.muted}>공부를 끝내고 갈까요?</span>
        <button type="button" style={styles.primary} onClick={follow}>
          이동
        </button>
        <button type="button" style={styles.ghost} onClick={() => setConfirming(false)}>
          취소
        </button>
      </>
    )
  }
  return (
    <>
      {canReach(friendId) && (
        <button type="button" style={styles.ghost} onClick={() => (chat.studying ? setConfirming(true) : follow())} title="친구 옆으로 가기">
          따라가기
        </button>
      )}
      {canReach(myId) && (
        <button type="button" style={styles.ghost} disabled={busy} onClick={() => void summon()} title="내 옆으로 부르기 (친구가 [가기]를 누르면 와요)">
          부르기
        </button>
      )}
    </>
  )
}

const styles: Record<string, CSSProperties> = {
  primary: { padding: '4px 10px', borderRadius: 6, border: 'none', background: '#22c55e', color: '#0b1a10', font: 'inherit', fontWeight: 600, cursor: 'pointer' },
  ghost: { padding: '4px 10px', borderRadius: 6, border: '1px solid #4b5563', background: 'transparent', color: '#fff', font: 'inherit', cursor: 'pointer' },
  muted: { color: '#aab0bb', fontSize: 13 },
}
