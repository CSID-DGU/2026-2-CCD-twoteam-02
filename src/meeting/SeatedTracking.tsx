// 회의실 의자에 앉아 있는 동안만 켜는 웹캠 트래킹과 오른쪽 아래 내 모습 화면 (#45)
//
// 지점의 SeatedStudy 에서 공부 시작 창·타이머·집중 판정·휴대폰 감지를 뺀 것입니다.
// 트래킹 결과(고개·눈·팔)는 onTracking 으로 알려, 회의 화면이 다른 참석자에게 보냅니다. 일어나면 null 로 알립니다.
// 웹캠 영상은 화면에 나오지 않고 이 브라우저 밖으로 보내지도 않습니다. 보내는 것은 각도 숫자뿐입니다.
import { useEffect, useRef } from 'react'
import { useTracking } from '../tracking/useTracking'
import { useArmDirections } from '../tracking/useArmDirections'
import { CameraGuideNotice } from '../tracking/CameraGuideNotice'
import { SelfView } from '../space/SelfView'
import type { MyTracking } from '../study/SeatedStudy'

export function SeatedTracking({ onTracking }: { onTracking: (tracking: MyTracking | null) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { face, pose, status, message } = useTracking(videoRef)
  const arms = useArmDirections(pose) // 떨림을 걸러낸 팔 방향

  useEffect(() => {
    onTracking({ face, arms })
    return () => onTracking(null)
  }, [face, arms, onTracking])

  return (
    <>
      <SelfView videoRef={videoRef} face={face} pose={pose} status={status} message={message} />
      <CameraGuideNotice pose={pose} />
    </>
  )
}
