// 어느 채널로 들어갈지 정합니다 (#442).
//
// 중계 서버를 쓸 때만 채널이 나뉩니다. VITE_RELAY_URL 이 없으면(실험 배포, 로컬) 예전 방 이름 그대로입니다.
// 내 번호는 탭마다 기억해 장소를 옮겨도 같은 번호로 갑니다. 가득 찼으면 서버가 다음 번호를 줍니다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { channelRoom, isChannelBase, parseReply, WAIT_JITTER_MS, WAIT_RETRY_MS } from './channelLogic'
import type { ChannelInfo } from './channelLogic'
import { relayUrl } from './relayLink'

const STORAGE_KEY = 'twoteam-channel'

function readMyChannel(): number | null {
  try {
    const no = Number(sessionStorage.getItem(STORAGE_KEY))
    return Number.isInteger(no) && no >= 1 ? no : null
  } catch {
    return null // 저장소를 못 쓰는 환경. 서버가 1번부터 찾아 줍니다
  }
}

function saveMyChannel(no: number) {
  try {
    sessionStorage.setItem(STORAGE_KEY, String(no))
  } catch {
    // 못 적어도 이번 화면에서는 동작합니다
  }
}

// 통창처럼 보기만 하는 연결이 쓸 방. 내 채널을 물을 필요 없이 기억한 번호를 씁니다.
export function watchRoomOf(base: string): string {
  if (!relayUrl() || !isChannelBase(base)) return base
  return channelRoom(base, readMyChannel() ?? 1)
}

export type ChannelState = {
  room: string | null // 들어갈 방. 정해지기 전이거나 기다리는 동안 null
  no: number
  waiting: boolean // 전체 상한이라 입장을 기다리는 중
  split: boolean // 채널이 나뉘는 공간인지
  channels: ChannelInfo[]
  capacity: number
  total: number
  totalCapacity: number
}

export function useChannel(base: string) {
  const relay = relayUrl()
  const split = !!relay && isChannelBase(base)
  const [state, setState] = useState<ChannelState>({
    room: split ? null : base, no: 1, waiting: false, split, channels: [], capacity: 0, total: 0, totalCapacity: 0,
  })
  const [request, setRequest] = useState({ want: readMyChannel(), seq: 0 })

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
        const query = request.want ? `?want=${request.want}` : ''
        const res = await fetch(`${http}/channels/${base}${query}`, { headers: { Authorization: `Bearer ${token}` } })
        const reply = res.ok ? parseReply(await res.json()) : null
        if (!reply) throw new Error('bad reply')
        if (!alive) return
        const { assigned, channels, capacity, total, totalCapacity } = reply
        if (assigned === null) {
          setState((s) => ({ ...s, room: null, waiting: true, channels, capacity, total, totalCapacity }))
          timer = setTimeout(() => void ask(), WAIT_RETRY_MS + Math.random() * WAIT_JITTER_MS)
          return
        }
        saveMyChannel(assigned)
        setState((s) => ({ ...s, room: channelRoom(base, assigned), no: assigned, waiting: false, channels, capacity, total, totalCapacity }))
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

  // 방이 가득 차 거절당했다. 안내와 입장 사이에 다른 사람이 먼저 들어온 경우다. 다음 번호부터 다시 묻는다.
  const no = state.no
  const fullRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    fullRef.current = () => setRequest((r) => ({ want: no + 1, seq: r.seq + 1 }))
  }, [no])

  // 다른 채널로 옮긴다
  const changeTo = useCallback((next: number) => setRequest((r) => ({ want: next, seq: r.seq + 1 })), [])

  // 채널 창을 열 때만 현황을 받는다. 인원이 바뀔 때마다 받으면 200명 기준 하루 무료 한도를 넘는다. peek 은 자리를 맡지 않고 방도 바꾸지 않는다.
  const refresh = useCallback(async () => {
    if (!split || !relay) return
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) return
      const res = await fetch(`${relay.replace(/^ws/, 'http')}/channels/${base}?peek=1`, { headers: { Authorization: `Bearer ${token}` } })
      const reply = res.ok ? parseReply(await res.json()) : null
      if (reply) setState((s) => ({ ...s, channels: reply.channels, capacity: reply.capacity, total: reply.total, totalCapacity: reply.totalCapacity }))
    } catch {
      // 현황을 못 받아도 지금 방은 그대로다
    }
  }, [base, split, relay])

  return { ...state, fullRef, changeTo, refresh }
}
