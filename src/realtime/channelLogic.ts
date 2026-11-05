// 광장·캠퍼스·해변 채널 계산 (#442). 화면·React 와 무관한 순수 로직입니다.
//
// 한 공간에 사람이 많이 모이면 메시지가 인원의 제곱으로 늘어 같은 공간을 채널로 나눕니다.
// 친구·기록·순위는 그대로 공유하고, 같은 채널 사람만 보입니다.
// 정원·전체 상한은 서버(relay/src/relayLogic.ts)가 정해 응답으로 알려 줍니다.

export const CHANNEL_BASES = ['lobby', 'campus', 'beach']
export const WAIT_RETRY_MS = 10000 // 전체 상한으로 기다릴 때 다시 물어보는 간격
export const WAIT_JITTER_MS = 5000 // 기다리던 사람들이 한꺼번에 묻지 않게 흩뿌리는 범위
export const CROWDED_RATIO = 0.8 // 정원의 이 비율을 넘으면 혼잡으로 표시

export const isChannelBase = (room: string) => CHANNEL_BASES.includes(room)

// 1번 채널은 예전 방 이름 그대로, 2번부터 lobby:2 처럼 씁니다.
export const channelRoom = (base: string, no: number) => (no === 1 ? base : `${base}:${no}`)

export type ChannelInfo = { no: number; count: number }
export type ChannelReply = {
  assigned: number | null // 들어갈 채널. null 이면 전체 상한이라 기다립니다
  total: number
  channels: ChannelInfo[]
  capacity: number
  totalCapacity: number
}

// 서버 응답을 믿고 쓰기 전에 모양을 확인합니다.
export function parseReply(raw: unknown): ChannelReply | null {
  const r = raw as Partial<ChannelReply> | null
  if (!r || typeof r !== 'object') return null
  const assignedOk = r.assigned === null || (Number.isInteger(r.assigned) && (r.assigned as number) >= 1)
  if (!assignedOk || !Number.isFinite(r.capacity) || !Number.isFinite(r.totalCapacity) || !Number.isFinite(r.total) || !Array.isArray(r.channels)) return null
  return r as ChannelReply
}

// 채널 목록: 사람이 있는 채널과 내 채널을 번호순으로. 빈 번호는 빼서 목록이 길어지지 않게 합니다.
export function channelList(channels: ChannelInfo[], mine: number, myRoomCount: number): ChannelInfo[] {
  const list = channels.filter((c) => c.no !== mine)
  list.push({ no: mine, count: myRoomCount })
  return list.sort((a, b) => a.no - b.no)
}

// 비어 있는 다음 번호. "새 채널로 옮기기"에 씁니다.
export function firstEmptyChannel(channels: ChannelInfo[], mine: number): number {
  const used = new Set(channels.map((c) => c.no))
  used.add(mine)
  let no = 1
  while (used.has(no)) no++
  return no
}

export type Crowd = 'quiet' | 'busy' | 'full'
export function crowdOf(count: number, capacity: number): Crowd {
  if (count >= capacity) return 'full'
  return count >= capacity * CROWDED_RATIO ? 'busy' : 'quiet'
}
