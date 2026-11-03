// 실시간 방 연결이 끊겼을 때 화면 위쪽에 잠깐 뜨는 안내 (#441). 누를 것이 없고 다시 연결되면 사라집니다.
// 끊겨도 트래킹과 공부 타이머는 이 브라우저 안에서 그대로 돌아가므로, 놀라서 새로고침하지 않도록 그 사실을 같이 알립니다.
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import { getDownSince, SLOW_NOTICE_MS, subscribeNotice } from './connectionStatus'

export function ConnectionNotice() {
  const downSince = useSyncExternalStore(subscribeNotice, getDownSince)
  // "오래 걸림"으로 넘어간 끊김의 시각. 다시 끊기면 시각이 달라져 저절로 처음 안내로 돌아갑니다.
  const [slowFor, setSlowFor] = useState<number | null>(null)

  useEffect(() => {
    if (downSince === null) return
    const t = setTimeout(() => setSlowFor(downSince), downSince + SLOW_NOTICE_MS - Date.now())
    return () => clearTimeout(t)
  }, [downSince])

  if (downSince === null) return null
  return (
    <div style={style} role="status" aria-live="polite">
      {slowFor === downSince ? (
        <strong>연결이 원활하지 않아요. 잠시 뒤 다시 시도할게요.</strong>
      ) : (
        <>
          <strong>다시 연결하는 중이에요</strong>
          <br />
          다른 사람이 잠시 안 보일 수 있어요. 타이머와 집중 판정은 그대로 돌아가요.
        </>
      )}
    </div>
  )
}

// 타이머(top 16)·종 알림(top 64) 아래. 뒤의 화면을 가리지 않게 눌림은 통과시킵니다.
const style: CSSProperties = {
  position: 'fixed', top: 112, left: '50%', transform: 'translateX(-50%)', zIndex: 26,
  width: 'max-content', maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box', padding: '8px 14px',
  borderRadius: 8, background: 'rgba(32,35,42,.92)', color: '#fff', font: '13px/1.5 system-ui, sans-serif',
  textAlign: 'center', pointerEvents: 'none',
}
