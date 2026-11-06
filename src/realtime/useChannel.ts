// 어느 채널로 들어갈지 정합니다 (#442, #481).
//
// 중계 서버를 쓸 때만 채널이 나뉩니다. VITE_RELAY_URL 이 없으면(실험 배포, 로컬) 예전 방 이름 그대로입니다.
// 채널은 장소를 모두 포함한 세계라, 내 번호(myChannel)를 지키며 장소를 옮깁니다(서버의 keep).
// 번호가 없는 새 탭이면 DB 에 남은 내 자리의 채널부터 봅니다(다른 탭에서 앉아 둔 자리로 돌아오게). 그것도 없으면 처음 입장(auto)입니다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { channelRoom, channelWorldOf, isChannelBase, parseReply, WAIT_JITTER_MS, WAIT_RETRY_MS } from './channelLogic'
import type { ChannelInfo } from './channelLogic'
import { readMyChannel, saveMyChannel, useMyChannel } from './myChannel'
import { relayUrl } from './relayLink'

// DB 에 남은 내 자리의 채널 (my_current_place, 0067). 자리가 없거나 못 읽으면 null
async function seatChannel(): Promise<number | null> {
  const { data } = await supabase.rpc('my_current_place')
  const row = (Array.isArray(data) ? data[0] : data) as { channel?: number } | null
  return typeof row?.channel === 'number' ? row.channel : null
}

// 통창처럼 보기만 하는 연결이 쓸 방. 내 채널을 물을 필요 없이 기억한 번호를 씁니다.
// 카페 안에서 채널을 바꾸면 창밖·가게 안도 그 채널로 바뀝니다 (#481)
export function useWatchRoom(base: string): string {
  const no = useMyChannel()
  if (!relayUrl() || !isChannelBase(base)) return base
  return channelRoom(base, no ?? 1)
}

export type ChannelState = {
  room: string | null // 들어갈 방. 정해지기 전이거나 기다리는 동안 null
  no: number
  waiting: boolean // 전체 상한이라 입장을 기다리는 중
  split: boolean // 채널이 나뉘는 공간인지
  channels: ChannelInfo[]
  capacity: number
  autoFill: number
  total: number
  totalCapacity: number
  rejected: { no: number; seq: number } | null // 직접 고르거나 따라간 채널이 가득 차 못 옮김. seq 는 같은 번호가 다시 거절돼도 알 수 있게
}

export function useChannel(base: string) {
  const relay = relayUrl()
  const split = !!relay && isChannelBase(base)
  const [state, setState] = useState<ChannelState>({
    room: split ? null : base, no: 1, waiting: false, split, channels: [], capacity: 0, autoFill: 0, total: 0, totalCapacity: 0, rejected: null,
  })
  // pick: 목록에서 고르기·친구 따라가기·부르기. 자동 배정 기준이 아니라 정원까지 들어가고, 가득 차면 지금 방에 그대로 있는다
  const [request, setRequest] = useState({ want: readMyChannel(), seq: 0, pick: false })

  useEffect(() => {
    if (!split || !relay) return
    const http = relay.replace(/^ws/, 'http')
    let alive = true
    let timer: ReturnType<typeof setTimeout> | null = null

    async function ask() {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) throw new Error('no session')
        const want = request.want ?? (request.seq === 0 ? await seatChannel().catch(() => null) : null)
        if (!alive) return
        const query = want ? `?want=${want}${request.pick ? '&pick=1' : ''}` : ''
        const res = await fetch(`${http}/channels/${channelWorldOf(base)}${query}`, { headers: { Authorization: `Bearer ${token}` } })
        const reply = res.ok ? parseReply(await res.json()) : null
        if (!reply) throw new Error('bad reply')
        if (!alive) return
        const { assigned, channels, capacity, autoFill, total, totalCapacity } = reply
        if (reply.full) {
          // 고른 채널이 그사이 가득 찼다. 방은 바꾸지 않고 알린다
          setState((s) => ({ ...s, channels, capacity, autoFill, total, totalCapacity, rejected: { no: request.want ?? 0, seq: request.seq } }))
          return
        }
        if (assigned === null) {
          setState((s) => ({ ...s, room: null, waiting: true, channels, capacity, autoFill, total, totalCapacity }))
          timer = setTimeout(() => void ask(), WAIT_RETRY_MS + Math.random() * WAIT_JITTER_MS)
          return
        }
        saveMyChannel(assigned)
        setState((s) => ({ ...s, room: channelRoom(base, assigned), no: assigned, waiting: false, channels, capacity, autoFill, total, totalCapacity }))
      } catch {
        // 안내를 못 받아도 공간에는 들어갑니다. 정원은 방이 다시 확인하고, 차 있으면 onFull 로 다시 묻습니다.
        if (!alive) return
        const no = request.want ?? 1
        setState((s) => ({ ...s, room: channelRoom(base, no), no, waiting: false }))
      }
    }
    void ask()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [base, split, relay, request])

  // 방이 가득 차 거절당했다. 안내와 입장 사이에 다른 사람이 먼저 들어온 경우다. 자동 배정으로 다시 묻는다.
  const no = state.no
  const fullRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    fullRef.current = () => setRequest((r) => ({ want: no + 1, seq: r.seq + 1, pick: false }))
  }, [no])

  // 다른 채널로 옮긴다 (목록에서 고르기, 친구 따라가기·부르기)
  const changeTo = useCallback((next: number) => setRequest((r) => ({ want: next, seq: r.seq + 1, pick: true })), [])

  // 채널 창을 열 때만 현황을 받는다. 인원이 바뀔 때마다 받으면 200명 기준 하루 무료 한도를 넘는다. peek 은 자리를 맡지 않고 방도 바꾸지 않는다.
  // 받은 현황을 돌려준다 (못 받으면 null)
  const refresh = useCallback(async () => {
    if (!split || !relay) return null
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) return null
      const res = await fetch(`${relay.replace(/^ws/, 'http')}/channels/${channelWorldOf(base)}?peek=1`, { headers: { Authorization: `Bearer ${token}` } })
      const reply = res.ok ? parseReply(await res.json()) : null
      if (reply) setState((s) => ({ ...s, channels: reply.channels, capacity: reply.capacity, autoFill: reply.autoFill, total: reply.total, totalCapacity: reply.totalCapacity }))
      return reply
    } catch {
      return null // 현황을 못 받아도 지금 방은 그대로다
    }
  }, [base, split, relay])

  return { ...state, fullRef, changeTo, refresh }
}
