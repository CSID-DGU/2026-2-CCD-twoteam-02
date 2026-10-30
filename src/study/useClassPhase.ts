// 강의실 공동 시간표를 1초마다 읽습니다 (캠빛 강의동). enabled 가 아니면 null — 시간표 없는 지점은 아무것도 하지 않습니다.
import { useEffect, useState } from 'react'
import { classPhase } from './timetableLogic'
import type { ClassPhase } from './timetableLogic'

const TICK_MS = 1000

export function useClassPhase(enabled: boolean): ClassPhase | null {
  const [phase, setPhase] = useState<ClassPhase | null>(() => (enabled ? classPhase(Date.now()) : null))
  useEffect(() => {
    if (!enabled) return
    const timer = setInterval(() => setPhase(classPhase(Date.now())), TICK_MS)
    return () => clearInterval(timer)
  }, [enabled])
  return enabled ? phase : null
}
