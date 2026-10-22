// 사이트 전체 접속 상태 방에 들어가 있는 장치 (#176). App 맨 위에 하나만 둡니다.
//
// 로그인하면 접속 상태 방에 내 상태(지금 있는 곳, 공부 중인지, 귓속말 방해금지 중인지)가 표시되고, 다른 사람들의 상태를 받아 둡니다.
// 상태는 들어올 때와 있는 곳·공부 중·방해금지 여부가 바뀔 때만 바꿉니다. track 을 자주 부르면 목록에서 사라지는 문제가 있어서입니다(participants.ts).
// 같은 계정으로 탭을 여러 개 열어도 한 사람으로 세도록 계정 번호를 Presence 키로 씁니다.
//
// 다시 들어가기 (#226): 창을 오래 열어 두면 방 연결은 살아 있는데 새로 들어온 사람이 반영되지 않는 일이 있었다
// (먼저 접속한 A 창에 나중에 들어온 B가 안 보이고, 새로고침하면 보임). 접속 상태는 처음 들어갈 때 명단을 통째로
// 받고 그 뒤로는 변화만 더하는데, 라이브러리는 명단을 아직 못 받았다고 보면 변화를 쌓아 두기만 한다.
// 그래서 아래 경우에 방에 새로 들어가 명단을 다시 받는다(새로고침이 하는 일을 자동으로).
//   - 연결 오류·시간 초과·끊김이 오면
//   - 명단을 기다리는 상태가 STUCK_MS 넘게 이어지면 (WATCH_MS 마다 확인)
//   - 창이 HIDDEN_REJOIN_MS 넘게 가려져 있다가 다시 보이거나, 인터넷이 다시 연결되면
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useSession } from '../auth/useSession'
import { ELSEWHERE, ONLINE_CHANNEL } from './online'
import { OnlineContext } from './onlineContext'
import type { OnlineEntry } from './onlineContext'

type Meta = { place?: string; studying?: boolean; quiet?: boolean }

const RETRY_MS = 2000 // 연결 오류 뒤 다시 들어가기까지
const WATCH_MS = 10000 // 방 상태를 확인하는 간격
const STUCK_MS = 15000 // 방에 못 들어가 있거나 명단을 못 받은 상태가 이만큼 이어지면 다시 들어감
const HIDDEN_REJOIN_MS = 30000 // 이만큼 넘게 가려져 있던 창이 다시 보이면 다시 들어감

// 라이브러리 안에서 "명단(presence_state)을 아직 못 받아 변화를 쌓아 두기만 하는 중"인지.
// 공개 API가 아니라서, 라이브러리가 바뀌어 함수가 없으면 false 로 둡니다(다른 다시 들어가기 조건은 그대로 동작).
function waitingForList(channel: RealtimeChannel): boolean {
  type Inner = { presence?: { presenceAdapter?: { presence?: { inPendingSyncState?: () => boolean } } } }
  const presence = (channel as unknown as Inner).presence?.presenceAdapter?.presence
  return typeof presence?.inPendingSyncState === 'function' ? presence.inPendingSyncState() : false
}

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
  const [joinCount, setJoinCount] = useState(0) // 올리면 방에 새로 들어갑니다

  useEffect(() => {
    if (!myId) return
    let closing = false // 정리 중이거나 이미 다시 들어가기로 했으면 true
    const timers: ReturnType<typeof setTimeout>[] = []
    const rejoin = (why: string) => {
      if (closing) return
      closing = true
      dbg('다시 들어감', why)
      setJoinCount((c) => c + 1)
    }
    const channel = supabase.channel(ONLINE_CHANNEL, { config: { presence: { key: myId } } })
    dbg('채널 만듦', '나', short(myId), '채널 상태', channel.state)
    channelRef.current = channel
    const read = (event: string) => {
      const people = new Map<string, OnlineEntry>()
      for (const [id, metas] of Object.entries(channel.presenceState<Meta>())) {
        // 같은 계정으로 탭을 여러 개 열었으면 로비·지점에 있는 탭을 우선합니다. (탭 순서는 정해져 있지 않음)
        people.set(id, {
          place: metas.find((m) => m.place && m.place !== ELSEWHERE)?.place ?? ELSEWHERE,
          studying: metas.some((m) => m.studying), // 어느 탭에서든 공부 중이면 공부 중
          quiet: metas.some((m) => m.quiet), // 어느 탭에서든 방해금지면 방해금지
        })
      }
      dbg('받음', event, '보이는 사람', people.size, [...people.keys()].map(short).join(','), '나 포함', people.has(myId))
      setResult({ myId, people })
    }
    channel
      .on('presence', { event: 'sync' }, () => read('sync'))
      .on('presence', { event: 'join' }, ({ key }) => read(`join ${short(key)}`))
      .on('presence', { event: 'leave' }, ({ key }) => read(`leave ${short(key)}`))
      .subscribe((status, err) => {
        dbg('연결 상태', status, err?.message ?? '')
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (closing) return // 화면이 정리하며 스스로 나간 것
          subscribed.current = false
          timers.push(setTimeout(() => rejoin(status), RETRY_MS))
          return
        }
        if (status !== 'SUBSCRIBED') return
        subscribed.current = true
        void channel.track(mine.current).then((r) => dbg('내 상태 보냄(연결 직후)', JSON.stringify(mine.current), r))
      })

    // 방에 못 들어가 있거나 명단을 못 받은 채로 오래 있으면 다시 들어갑니다.
    let stuckSince: number | null = null
    const watch = setInterval(() => {
      const stuck = channel.state !== 'joined' || waitingForList(channel)
      if (!stuck) {
        stuckSince = null
        return
      }
      stuckSince ??= Date.now()
      if (Date.now() - stuckSince >= STUCK_MS) rejoin(`명단 못 받음 (방 상태 ${channel.state})`)
    }, WATCH_MS)

    // 오래 가려져 있던 창이 다시 보이거나, 인터넷이 다시 연결되면 다시 들어갑니다.
    let hiddenAt: number | null = document.hidden ? Date.now() : null
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now()
        return
      }
      if (hiddenAt !== null && Date.now() - hiddenAt >= HIDDEN_REJOIN_MS) rejoin('오래 가려졌던 창으로 돌아옴')
      hiddenAt = null
    }
    const onOnline = () => rejoin('인터넷 다시 연결됨')
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)

    return () => {
      dbg('채널 정리', short(myId))
      closing = true
      timers.forEach(clearTimeout)
      clearInterval(watch)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
      subscribed.current = false
      channelRef.current = null
      void channel.unsubscribe()
    }
  }, [myId, joinCount])

  // 있는 곳, 공부 중·방해금지 여부가 바뀌면 상태를 한 번 바꿉니다.
  useEffect(() => {
    mine.current = { place, studying, quiet }
    if (subscribed.current) void channelRef.current?.track(mine.current).then((r) => dbg('내 상태 보냄', JSON.stringify(mine.current), r))
  }, [place, studying, quiet])

  const people = result && result.myId === myId ? result.people : EMPTY
  return <OnlineContext.Provider value={{ people, studying, setPlace, setStudying, setQuiet }}>{children}</OnlineContext.Provider>
}

const EMPTY = new Map<string, OnlineEntry>()

// [임시 진단] 접속 상태가 친구 탭에 반영되지 않는 문제를 찾기 위한 기록. 원인을 찾으면 지웁니다.
const short = (id: string) => id.slice(0, 4)
const dbg = (...args: unknown[]) => console.info('[접속진단]', new Date().toISOString().slice(11, 23), ...args)
