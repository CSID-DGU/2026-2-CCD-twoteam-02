// 같은 계정은 한 번에 한 탭만 쓰기 (#347). React·Supabase 와 무관한 순수 로직입니다. (Node 로 검사)
//
// 같은 계정으로 탭(또는 기기)을 여러 개 열면 탭마다 위치를 따로 보내 다른 사람 화면에서 캐릭터가 두 자리를 오가고,
// 웹캠·공부 타이머도 두 탭에서 같이 돌 수 있습니다. 그래서 장면(광장·캠퍼스·지점·회의실)은 한 탭만 쓰게 합니다.
//
// 사이트 전체 접속 상태 방(OnlineProvider)은 계정 번호를 키로 탭마다 정보를 따로 받습니다. 여기에 탭마다
//   tab   탭 번호 (탭을 열 때 정하는 무작위 글자)
//   since 장면에 들어온 순서 (클수록 나중)
//   scene 장면 안인지 (내 기록·친구·프로필 같은 일반 페이지는 false — 위치를 보내지 않으니 다른 탭을 멈추지 않음)
// 를 올리고, 같은 계정에서 장면 안에 있는 탭 중 since 가 가장 큰 탭이 "지금 쓰는 탭"입니다. 나머지 장면 탭은 양보(멈춤)합니다.
// 기기마다 시계가 조금 달라도 나중에 들어온 탭이 이기도록, 순서는 "지금 시각"과 "본 것 중 가장 큰 순서 + 1" 중 큰 값으로 잡습니다.

export type TabMeta = { tab?: string; since?: number; scene?: boolean }
type Known = { tab: string; since: number; scene: boolean }

const known = (m: TabMeta): m is Known => typeof m.tab === 'string' && typeof m.since === 'number' && m.scene === true

// a 가 b 보다 나중인지 (같은 순서면 탭 번호로 한쪽만 이기게)
const later = (a: Known, b: Known) => a.since > b.since || (a.since === b.since && a.tab > b.tab)

// 내 탭이 장면을 다른 탭에 양보해야 하는지. metas: 같은 계정의 탭들 (내 것 포함). 탭 정보가 없는 예전 화면은 무시
export function shouldYield(mine: TabMeta, metas: TabMeta[]): boolean {
  if (!known(mine)) return false
  return metas.some((m) => known(m) && m.tab !== mine.tab && later(m, mine))
}

// 장면에 들어갈 때 잡을 순서: 지금 시각과 같은 계정 탭들이 가진 가장 큰 순서 + 1 중 큰 값
export function claimSince(nowMs: number, metas: TabMeta[]): number {
  const max = Math.max(-Infinity, ...metas.map((m) => (typeof m.since === 'number' ? m.since : -Infinity)))
  return Math.max(nowMs, max + 1)
}
