// 광장·캠퍼스·해변 채널 계산 (#442). 화면·React 와 무관한 순수 로직입니다.
//
// 한 공간에 사람이 많이 모이면 메시지가 인원의 제곱으로 늘어 같은 공간을 채널로 나눕니다.
// 친구·기록·순위는 그대로 공유하고, 같은 채널 사람만 보입니다.
// 정원·전체 상한은 서버(relay/src/relayLogic.ts)가 정해 응답으로 알려 줍니다.

export const CHANNEL_BASES = ['lobby', 'campus', 'beach']
export const WAIT_RETRY_MS = 10000 // 전체 상한으로 기다릴 때 다시 물어보는 간격
export const WAIT_JITTER_MS = 5000 // 기다리던 사람들이 한꺼번에 묻지 않게 흩뿌리는 범위

// 채널로 나뉘는 방: 광장·캠퍼스·해변, 그리고 지점(branch:번호, #481)
export const isChannelBase = (room: string) => CHANNEL_BASES.includes(room) || /^branch:\d+$/.test(room)
// 채널 안내 주소에 쓰는 공간 이름 (branch:5 → branch)
export const channelWorldOf = (base: string) => base.split(':')[0]

// 1번 채널은 예전 방 이름 그대로, 2번부터 lobby:2 처럼 씁니다.
export const channelRoom = (base: string, no: number) => (no === 1 ? base : `${base}:${no}`)

export type ChannelInfo = { no: number; count: number }
export type ChannelReply = {
  assigned: number | null // 들어갈 채널. null 이면 전체 상한이라 기다리거나(full 이 아니면), 고른 채널이 가득 찬 것(full)
  full: boolean // 목록에서 고르거나 친구를 따라간 채널이 가득 참. 지금 방에 그대로 있습니다
  total: number
  channels: ChannelInfo[] // 서버가 정한 채널 목록 (1~6번은 늘, 다 차면 다음 번호를 더 엶)
  capacity: number // 직접 고르거나 따라갈 때 들어갈 수 있는 인원
  autoFill: number // 자동 배정이 채우는 인원. 넘으면 다음 채널로 배정합니다
  totalCapacity: number
}

// 서버 응답을 믿고 쓰기 전에 모양을 확인합니다.
export function parseReply(raw: unknown): ChannelReply | null {
  const r = raw as Partial<ChannelReply> | null
  if (!r || typeof r !== 'object') return null
  const assignedOk = r.assigned === null || (Number.isInteger(r.assigned) && (r.assigned as number) >= 1)
  if (!assignedOk || !Number.isFinite(r.capacity) || !Number.isFinite(r.totalCapacity) || !Number.isFinite(r.total) || !Array.isArray(r.channels)) return null
  // 예전 서버(full·autoFill 없음)와 섞여도 동작하게 기본값을 채웁니다
  return { ...(r as ChannelReply), full: r.full === true, autoFill: Number.isFinite(r.autoFill) ? (r.autoFill as number) : (r.capacity as number) }
}

// 채널 목록: 서버가 준 목록에 내 채널은 지금 방 인원으로 덮어씁니다(서버 현황은 창을 열 때 받은 값이라 늦을 수 있음).
export function channelList(channels: ChannelInfo[], mine: number, myRoomCount: number): ChannelInfo[] {
  const list = channels.filter((c) => c.no !== mine)
  list.push({ no: mine, count: myRoomCount })
  return list.sort((a, b) => a.no - b.no)
}

// 비어 있는 첫 번호. "빈 채널로 옮기기"에 씁니다.
export function firstEmptyChannel(channels: ChannelInfo[], mine: number): number {
  const used = new Set(channels.filter((c) => c.count > 0).map((c) => c.no))
  used.add(mine)
  let no = 1
  while (used.has(no)) no++
  return no
}

// 혼잡도: 자동 배정 인원 전이면 여유, 그 뒤 정원 전이면 혼잡(직접 고르면 들어갈 수 있음), 정원이면 가득 참
export type Crowd = 'quiet' | 'busy' | 'full'
export function crowdOf(count: number, autoFill: number, capacity: number): Crowd {
  if (count >= capacity) return 'full'
  return count >= autoFill ? 'busy' : 'quiet'
}
