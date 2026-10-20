// 사이트 전체 접속 상태 방에 들어가 있는 장치 (#176). App 맨 위에 하나만 둡니다.
//
// 로그인하면 접속 상태 방에 내 상태(지금 있는 곳)가 표시되고, 다른 사람들의 상태를 받아 둡니다.
// 상태는 들어올 때와 있는 곳이 바뀔 때만 바꿉니다. track 을 자주 부르면 목록에서 사라지는 문제가 있어서입니다(participants.ts).
// 같은 계정으로 탭을 여러 개 열어도 한 사람으로 세도록 계정 번호를 Presence 키로 씁니다.
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useSession } from '../auth/useSession'
import { ELSEWHERE, ONLINE_CHANNEL } from './online'
import { OnlineContext } from './onlineContext'

type Meta = { place?: string }

export function OnlineProvider({ children }: { children: ReactNode }) {
  const { session } = useSession()
  const myId = session?.user.id
  // 누구 기준으로 읽은 목록인지 같이 둡니다. 로그아웃하거나 계정이 바뀌면 이전 목록을 쓰지 않습니다.
  const [result, setResult] = useState<{ myId: string; places: Map<string, string> } | null>(null)
  const [place, setPlace] = useState(ELSEWHERE)
  const [invisible, setInvisible] = useState(false) // 실험 B 조건이면 나를 접속 상태에서 뺌 (#47)
  const placeRef = useRef(place)
  const invisibleRef = useRef(invisible)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const subscribed = useRef(false)

  useEffect(() => {
    if (!myId) return
    const channel = supabase.channel(ONLINE_CHANNEL, { config: { presence: { key: myId } } })
    channelRef.current = channel
    const read = () => {
      const places = new Map<string, string>()
      for (const [id, metas] of Object.entries(channel.presenceState<Meta>())) {
        // 같은 계정으로 탭을 여러 개 열었으면 로비·지점에 있는 탭을 우선합니다. (탭 순서는 정해져 있지 않음)
        places.set(id, metas.find((m) => m.place && m.place !== ELSEWHERE)?.place ?? ELSEWHERE)
      }
      setResult({ myId, places })
    }
    channel
      .on('presence', { event: 'sync' }, read)
      .on('presence', { event: 'join' }, read)
      .on('presence', { event: 'leave' }, read)
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        subscribed.current = true
        if (!invisibleRef.current) void channel.track({ place: placeRef.current })
      })
    return () => {
      subscribed.current = false
      channelRef.current = null
      void channel.unsubscribe()
    }
  }, [myId])

  // 있는 곳이 바뀌면 상태를 한 번 바꿉니다. 안 보이기면 접속 상태에서 나를 뺍니다(남의 상태는 계속 받음).
  useEffect(() => {
    placeRef.current = place
    invisibleRef.current = invisible
    const channel = channelRef.current
    if (!subscribed.current || !channel) return
    if (invisible) void channel.untrack()
    else void channel.track({ place })
  }, [place, invisible])

  const places = result && result.myId === myId ? result.places : EMPTY
  return <OnlineContext.Provider value={{ places, setPlace, setInvisible }}>{children}</OnlineContext.Provider>
}

const EMPTY = new Map<string, string>()
