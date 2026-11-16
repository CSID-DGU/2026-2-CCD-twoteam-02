// 공부 중 E로 일어날 때 확인 창을 띄우는 연결 (#558). 지점(BranchScene)과 바깥 공간(WorldScene)이 같이 씁니다.
//
// Player 는 앉아서 E 를 누르면 confirmStand 를 부르고(공부 중일 때만 채워 둠), 창에서 [끝내기]를 누르면
// standRef 를 true 로 바꿔 다음 프레임에 일어납니다. 창이 떠 있는 동안은 asking 으로 캐릭터를 멈춥니다(frozen).
import { useCallback, useEffect, useRef, useState } from 'react'
import { useMyStudying } from '../realtime/onlineContext'
import { EndStudyConfirm } from './EndStudyConfirm'

export function useStandConfirm() {
  const studying = useMyStudying()
  const [asking, setAsking] = useState(false)
  const confirmStand = useRef<(() => void) | null>(null)
  const standRef = useRef(false)

  // 공부 중일 때만 묻습니다. 시작 전·쉬는 자리에서는 E 로 바로 일어납니다
  useEffect(() => {
    confirmStand.current = studying ? () => setAsking(true) : null
  }, [studying])

  const end = useCallback(() => {
    standRef.current = true
    setAsking(false)
  }, [])
  const cancel = useCallback(() => setAsking(false), [])

  const dialog = asking ? <EndStudyConfirm onEnd={end} onCancel={cancel} endLabel="끝내고 일어나기" /> : null
  return { confirmStand, standRef, asking, dialog }
}
