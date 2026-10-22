// 사이트 전체 접속 상태 방에 들어가 있는 장치 (#176). App 맨 위에 하나만 둡니다.
//
// 로그인하면 접속 상태 방에 내 상태(지금 있는 곳, 공부 중인지, 귓속말 방해금지 중인지)가 표시되고, 다른 사람들의 상태를 받아 둡니다.
// 상태는 들어올 때와 있는 곳·공부 중·방해금지 여부가 바뀔 때만 바꿉니다. track 을 자주 부르면 목록에서 사라지는 문제가 있어서입니다(participants.ts).
// 같은 계정으로 탭을 여러 개 열어도 한 사람으로 세도록 계정 번호를 Presence 키로 씁니다.
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useSession } from '../auth/useSession'
import { ELSEWHERE, ONLINE_CHANNEL } from './online'
import { OnlineContext } from './onlineContext'
import type { OnlineEntry } from './onlineContext'

type Meta = { place?: string; studying?: boolean; quiet?: boolean }

export function OnlineProvider({ children }: { children: ReactNode }) {
  const { session } = useSession()
  const myId = session?.user.id
  // 누구 기준으로 읽은 목록인지 같이 둡니다. 로그아웃하거나 계정이 바뀌면 이전 목록을 쓰지 않습니다.
  const [result, setResult] = useState<{ myId: string; people: Map<string, OnlineEntry> } | null>(null)
  const [place, setPlace] = useState(ELSEWHERE)
  const [studying, setStudying] = useState(false)
  const [quiet, setQuiet] = useState(false)
  const mine = useRef<Meta>({ place, studying, quiet }) // 지금 표시할 내 상태
  const channelRef = useRef<RealtimeChannel | null>(null)
  const subscribed = useRef(false)

  useEffect(() => {
    if (!myId) return
    const channel = supabase.channel(ONLINE_CHANNEL, { config: { presence: { key: myId } } })
    channelRef.current = channel
    const read = () => {
      const people = new Map<string, OnlineEntry>()
      for (const [id, metas] of Object.entries(channel.presenceState<Meta>())) {
        // 같은 계정으로 탭을 여러 개 열었으면 로비·지점에 있는 탭을 우선합니다. (탭 순서는 정해져 있지 않음)
        people.set(id, {
          place: metas.find((m) => m.place && m.place !== ELSEWHERE)?.place ?? ELSEWHERE,
          studying: metas.some((m) => m.studying), // 어느 탭에서든 공부 중이면 공부 중
          quiet: metas.some((m) => m.quiet), // 어느 탭에서든 방해금지면 방해금지
        })
      }
      setResult({ myId, people })
    }
    channel
      .on('presence', { event: 'sync' }, read)
      .on('presence', { event: 'join' }, read)
      .on('presence', { event: 'leave' }, read)
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        subscribed.current = true
        void channel.track(mine.current)
      })
    return () => {
      subscribed.current = false
      channelRef.current = null
      void channel.unsubscribe()
    }
  }, [myId])

  // 있는 곳, 공부 중·방해금지 여부가 바뀌면 상태를 한 번 바꿉니다.
  useEffect(() => {
    mine.current = { place, studying, quiet }
    if (subscribed.current) void channelRef.current?.track(mine.current)
  }, [place, studying, quiet])

  const people = result && result.myId === myId ? result.people : EMPTY
  return <OnlineContext.Provider value={{ people, studying, setPlace, setStudying, setQuiet }}>{children}</OnlineContext.Provider>
}

const EMPTY = new Map<string, OnlineEntry>()
