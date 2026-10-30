// 내 칭호 (꽃 피는 칭호): 저장된 누적 집중 시간과 공부 기록 공개 범위를 읽습니다.
// 프로필 요약(profile_summary, 0013)을 그대로 씁니다. 내 것은 늘 허락돼 누적 시간이 옵니다.
// 화면을 열 때 한 번 읽습니다. 공부 중에 늘어나는 시간은 지점 화면이 따로 더합니다(StudyRunner 의 확정분).
import { useProfile } from '../profile/useProfile'
import type { Visibility } from '../profile/useProfile'
import { levelOf } from './levelLogic'

export function useMyTitle(userId: string | undefined): { savedSeconds: number | null; visibility: Visibility | null; level: number } {
  const { summary } = useProfile(userId)
  const savedSeconds = summary ? (summary.total_seconds ?? 0) : null // 못 읽었으면 null (넘김을 잡지 않음)
  return { savedSeconds, visibility: summary?.visibility ?? null, level: levelOf(savedSeconds ?? 0) }
}
