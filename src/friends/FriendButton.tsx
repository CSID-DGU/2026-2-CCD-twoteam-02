// 남의 프로필 창에 붙는 친구 버튼 (#153)
//
// 지점에서 캐릭터를 눌러 프로필을 열었을 때, 닉네임#태그를 복사해 친구 화면에서 다시 찾지 않고
// 그 자리에서 바로 요청을 보낼 수 있게 합니다. 관계에 따라 보이는 것이 다릅니다.
//   관계 없음 → 친구 추가 / 내가 요청함 → 요청 보냄 + 취소 / 상대가 요청함 → 수락 / 친구 → 친구
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useSession } from '../auth/useSession'
import { otherOf, relationOf } from './friendsLogic'
import { useFriends } from './useFriends'

export function FriendButton({ otherId }: { otherId: string }) {
  const { session } = useSession()
  const myId = session?.user.id
  const { list, loading, request, accept, remove } = useFriends(myId)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  if (!myId || myId === otherId || loading) return null
  const relation = relationOf(list, myId, otherId)
  const friendship = list.find((f) => otherOf(f, myId) === otherId)

  // 요청·수락·취소를 실행하고, 실패하면 안내문을 보여 줍니다.
  async function run(action: () => Promise<string>) {
    setBusy(true)
    setMessage(await action())
    setBusy(false)
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.row}>
        {relation === 'none' && (
          <button type="button" style={styles.primary} disabled={busy} onClick={() => run(() => request(otherId))}>
            친구 추가
          </button>
        )}
        {relation === 'sent' && friendship && (
          <>
            <span style={styles.muted}>요청 보냄</span>
            <button type="button" style={styles.ghost} disabled={busy} onClick={() => run(() => remove(friendship.id))}>
              취소
            </button>
          </>
        )}
        {relation === 'received' && friendship && (
          <>
            <span style={styles.muted}>나에게 친구 요청</span>
            <button type="button" style={styles.primary} disabled={busy} onClick={() => run(() => accept(friendship.id))}>
              수락
            </button>
          </>
        )}
        {relation === 'friend' && <span style={styles.friend}>✓ 친구</span>}
      </div>
      {message && <p style={styles.error}>{message}</p>}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 },
  row: { display: 'flex', alignItems: 'center', gap: 6 },
  primary: { padding: '4px 12px', borderRadius: 6, border: 'none', background: '#22c55e', color: '#0b1a10', font: 'inherit', fontWeight: 600, cursor: 'pointer' },
  ghost: { padding: '4px 10px', borderRadius: 6, border: '1px solid #4b5563', background: 'transparent', color: '#fff', font: 'inherit', cursor: 'pointer' },
  muted: { color: '#aab0bb', fontSize: 13 },
  friend: { color: '#4ade80', fontSize: 13, fontWeight: 600 },
  error: { color: '#f87171', margin: 0, fontSize: 13 },
}
