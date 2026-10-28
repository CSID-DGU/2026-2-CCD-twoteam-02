// 신고(#121)에 붙일 최근 수치를 1초마다 recentSamples 에 넣습니다. 영상은 없습니다.
// StudyRunner 가 공부 중에만 부릅니다. 중지 중에는 넣지 않고, 공부 맥락(허용 설정·좌석 이용 기록 id)도 같이 둡니다.
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { FocusInput, FocusState } from '../focus/focusLogic'
import type { PhoneState, PoseState } from '../tracking/useTracking'
import { workerInterval } from '../lib/workerInterval'
import { pushSample, setStudyContext } from './recentSamples'
import type { Sample } from './recentSamples'
import { round2, toDegrees } from './reportLogic'

export const SAMPLE_INTERVAL_MS = 1000 // 1초에 한 줄 (버퍼 30칸 = 30초)

export function useSampleRecorder(args: {
  face: RefObject<FocusInput>
  pose: RefObject<PoseState>
  phone: RefObject<PhoneState>
  focus: FocusState
  hold: Sample['hold']
  paused: boolean
  allowOtherScreen: boolean
  allowDevices: boolean
  sessionId: string
}): void {
  const { face, pose, phone, focus, hold, paused, allowOtherScreen, allowDevices, sessionId } = args

  // 판정은 0.1초마다 새 객체라, 틱 콜백이 옛 값을 보지 않도록 최신 것을 ref 에 둡니다.
  const latest = useRef({ focus, hold })
  useEffect(() => {
    latest.current = { focus, hold }
  }, [focus, hold])

  useEffect(() => {
    setStudyContext({ allowOtherScreen, allowDevices, sessionId })
    return () => setStudyContext(null)
  }, [allowOtherScreen, allowDevices, sessionId])

  // 다른 탭에 가 있어도 제 주기로 돌도록 워커 신호를 씁니다 (useFocusState 와 같은 방식).
  useEffect(() => {
    if (paused) return
    const stop = workerInterval(SAMPLE_INTERVAL_MS, () => {
      const { focus, hold } = latest.current
      const { found, ear, pitch } = face.current
      const poseReady = pose.current.framed !== null // Pose 준비 전이면 몸도 "모름"
      pushSample({
        at: Date.now(),
        status: focus.status,
        hold,
        face: found,
        pitch: pitch == null ? null : toDegrees(pitch),
        ear: round2(ear),
        body: poseReady ? pose.current.found : null,
        framed: pose.current.framed,
        phone: phone.current.found,
        awaySeconds: focus.awaySeconds,
        closedSeconds: focus.closedSeconds,
        phoneSeconds: focus.phoneSeconds,
      })
    })
    return stop
  }, [paused, face, pose, phone])
}
