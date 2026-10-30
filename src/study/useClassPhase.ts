// 강의실 공동 시간표를 1초마다 읽습니다 (캠빛 강의동). enabled 가 아니면 null — 시간표 없는 지점은 아무것도 하지 않습니다.
import { useEffect, useState } from 'react'
import { workerInterval } from '../lib/workerInterval'
import { classPhase } from './timetableLogic'
import type { ClassPhase } from './timetableLogic'

const TICK_MS = 1000

export function useClassPhase(enabled: boolean): ClassPhase | null {
  const [phase, setPhase] = useState<ClassPhase | null>(() => (enabled ? classPhase(Date.now()) : null))
  useEffect(() => {
    if (!enabled) return
    // 다른 탭에 있으면 일반 타이머는 브라우저가 1분에 한 번까지 늦춰, 쉬는 시간이 늦게 잡혀 공부 시간으로 쌓였습니다.
    // 판정(useFocusState)과 같은 워커 타이머를 씁니다.
    return workerInterval(TICK_MS, () => setPhase(classPhase(Date.now())))
  }, [enabled])
  return enabled ? phase : null
}
