// 내 칭호 (꽃 피는 칭호): 저장된 누적 집중 시간과 공부 기록 공개 범위를 읽습니다.
// 프로필 요약(profile_summary, 0013)을 그대로 씁니다. 내 것은 늘 허락돼 누적 시간이 옵니다.
// 화면을 열 때 한 번 읽습니다. 공부 중에 늘어나는 시간은 지점 화면이 따로 더합니다(StudyRunner 의 확정분).
// savedSeconds: 저장된 합(지점 화면이 넘김 계산의 기준으로 씀), seconds·level: 저장 전 공부까지 합친 지금 값(보여 주는 곳이 씀)
import { useProfile } from '../profile/useProfile'
import type { Visibility } from '../profile/useProfile'
import { levelOf } from './levelLogic'
import { shownSeconds, useLiveSeconds } from './liveTitle'

// withLive: 실시간 누적을 구독할지. 지점 화면은 공부 중 1초마다 다시 그려지지 않도록 끕니다(공부 중 오른 단계는 따로 들고 있음).
export function useMyTitle(
  userId: string | undefined,
  withLive = true,
): { savedSeconds: number | null; seconds: number | null; visibility: Visibility | null; level: number } {
  const { summary } = useProfile(userId)
  const live = useLiveSeconds(withLive ? userId : undefined)
  const savedSeconds = summary ? (summary.total_seconds ?? 0) : null // 못 읽었으면 null (넘김을 잡지 않음)
  const seconds = savedSeconds === null ? null : shownSeconds(savedSeconds, live)
  return { savedSeconds, seconds, visibility: summary?.visibility ?? null, level: levelOf(seconds ?? 0) }
}
