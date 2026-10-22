// 친구 귓속말 연결 (#49). App 맨 위에 하나만 둡니다.
//
// 접속 중인 친구마다 둘만의 비공개 실시간 방(whisper:{작은 번호}:{큰 번호})에 들어가 있고,
// 친구가 나가면 그 방에서도 나옵니다. 누가 들어갈 수 있는지는 DB 규칙(0019)이 확인합니다.
// 메시지는 어디에도 저장하지 않고, 로그는 이 장치의 메모리에만 있습니다.
//   로비 ↔ 지점 이동: 유지 / 새로고침·탭 닫기·접속 끊김·로그아웃: 사라짐
//
// 방해금지: 공부를 시작하면(초록·노랑 상관없이) 자동으로 켜지고, 공부 중에도 직접 끌 수 있습니다(#216).
// 공부 중에 끈 것은 그 공부 동안만이고, 다음 공부를 시작하면 다시 켜집니다. 공부가 끝나면 공부 전 설정으로.
// 친구에게는 접속 상태로 "방해금지 중"을 알립니다(보낼 때 "알림 없이 전달돼요" 안내용).
// 그동안 받은 귓속말은 소리 없이 쌓아 두고, 공부가 끝나면 아직 안 읽은 것만 "귓속말 N개"로 한 번 알립니다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useSession } from '../auth/useSession'
import { useFriends } from '../friends/useFriends'
import { otherOf } from '../friends/friendsLogic'
import { useMyStudying, useOnline, useQuietFlag } from '../realtime/onlineContext'
import { ChatContext } from './chatContext'
import type { ChatLine } from './chatContext'
import { MAX_LENGTH, SEND_GAP_MS, WHISPER_EVENT, isQuiet, pairTopic, pickColor } from './chatLogic'
import type { Friend } from './chatLogic'
import { playDing } from './sound'

const MAX_LINES = 100 // 화면에 들고 있는 로그 줄 수
const FRIENDS_RELOAD_MS = 3000 // 접속자가 바뀐 뒤 친구 목록을 다시 읽기까지 (새로 친구가 된 사람 반영)
const MUTE_KEY = 'dooteum.chatMuted' // 소리 끄기는 이 브라우저에 기억합니다

type Log = {
  owner: string // 누구의 로그인지. 로그아웃·계정 전환이면 버립니다.
  lines: ChatLine[]
  unread: number
  quietCount: number // 방해금지 중에 받아 아직 안 읽은 수 (공부가 끝나면 알림). 채팅창을 열어 읽으면 0 (#217)
  lastFrom: string | null
  target: string | null
  colors: Record<string, string> // 친구 계정 번호 → 이번 접속에서 정한 글자 색
}

const freshLog = (owner: string): Log => ({ owner, lines: [], unread: 0, quietCount: 0, lastFrom: null, target: null, colors: {} })

// 그 친구와 처음 이야기하면 아직 안 쓴 색을 하나 정해 줍니다. random 은 밖에서 뽑아 넘깁니다(상태 계산은 순수하게).
const withColor = (l: Log, peerId: string, random: number): Log =>
  l.colors[peerId] ? l : { ...l, colors: { ...l.colors, [peerId]: pickColor(Object.values(l.colors), random) } }

let nextLineId = 1

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { session } = useSession()
  const myId = session?.user.id ?? ''
  const people = useOnline()
  const studying = useMyStudying()
  const { list, names, reload } = useFriends(myId || undefined)
  const [log, setLog] = useState<Log>(() => freshLog(myId))
  const current = log.owner === myId ? log : freshLog(myId)
  const [manualQuiet, setManualQuiet] = useState(false) // 공부 중이 아닐 때 직접 켰는지
  const [studyQuietOff, setStudyQuietOff] = useState(false) // 이번 공부 동안 직접 껐는지
  // 공부를 새로 시작하면 다시 켜지게 합니다. (렌더 중에 이전 값과 비교해 고치는 React 권장 방식)
  const [seenStudying, setSeenStudying] = useState(studying)
  if (studying !== seenStudying) {
    setSeenStudying(studying)
    if (studying) setStudyQuietOff(false)
  }
  const [muted, setMutedState] = useState(readMuted)
  const [openKey, setOpenKey] = useState(0)
  const [hasOverlay, setHasOverlay] = useState(false)
  const quiet = isQuiet(studying, manualQuiet, studyQuietOff)
  useQuietFlag(Boolean(myId) && quiet) // 친구에게 "방해금지 중" 알리기

  // 로그를 바꿉니다. 다른 계정의 로그였으면 새로 시작합니다.
  const update = useCallback(
    (fn: (log: Log) => Log) => setLog((prev) => fn(prev.owner === myId ? prev : freshLog(myId))),
    [myId],
  )
  const addLine = useCallback(
    (line: Omit<ChatLine, 'id' | 'at'>, extra?: Partial<Log>) =>
      update((l) => ({ ...l, ...extra, lines: [...l.lines, { ...line, id: nextLineId++, at: Date.now() }].slice(-MAX_LINES) })),
    [update],
  )

  // 친구 중 지금 접속한 사람 = 귓속말을 받을 수 있는 사람
  const friends: Friend[] = useMemo(
    () =>
      myId
        ? list
            .filter((f) => f.status === 'accepted')
            .map((f) => {
              const id = otherOf(f, myId)
              return { id, nickname: names.get(id) ?? '친구' }
            })
        : [],
    [list, names, myId],
  )
  const online = useMemo(() => friends.filter((f) => people.has(f.id)), [friends, people])
  const onlineKey = online.map((f) => f.id).sort().join(',')

  // 접속자가 바뀌면 잠시 뒤 친구 목록을 다시 읽습니다. (그사이 새로 친구가 된 사람)
  const peopleKey = [...people.keys()].sort().join(',')
  useEffect(() => {
    if (!myId || !peopleKey) return
    const id = setTimeout(reload, FRIENDS_RELOAD_MS)
    return () => clearTimeout(id)
  }, [myId, peopleKey, reload])

  // 받을 때 최신 값을 쓰도록 ref 에 담아 둡니다. (방 구독은 한 번 걸어 두고 계속 씀)
  const latest = useRef({ friends, quiet, muted })
  useEffect(() => {
    latest.current = { friends, quiet, muted }
  }, [friends, quiet, muted])

  const receive = useCallback(
    (peerId: string, payload: unknown) => {
      const raw = (payload as { text?: unknown } | null)?.text
      const text = typeof raw === 'string' ? raw.trim().slice(0, MAX_LENGTH) : '' // 화면 밖에서 보낸 긴 글도 잘라 냄
      if (!text) return
      const { friends: fr, quiet: q, muted: m } = latest.current
      const peer = fr.find((f) => f.id === peerId) ?? { id: peerId, nickname: '친구' }
      const random = Math.random()
      update((l) => ({
        ...withColor(l, peerId, random),
        lines: [...l.lines, { id: nextLineId++, at: Date.now(), kind: 'in' as const, peer, text, quiet: q }].slice(-MAX_LINES),
        unread: l.unread + 1,
        quietCount: q ? l.quietCount + 1 : l.quietCount,
        lastFrom: peerId,
      }))
      if (!q && !m) playDing()
    },
    [update],
  )
  const receiveRef = useRef(receive)
  useEffect(() => {
    receiveRef.current = receive
  }, [receive])

  // 접속 중인 친구마다 둘만의 비공개 방에 들어가고, 나간 친구의 방에서는 나옵니다.
  const channels = useRef(new Map<string, RealtimeChannel>())
  useEffect(() => {
    if (!myId) return
    const map = channels.current
    const want = new Set(onlineKey ? onlineKey.split(',') : [])
    for (const [id, ch] of map) {
      if (want.has(id)) continue
      void supabase.removeChannel(ch)
      map.delete(id)
    }
    for (const id of want) {
      if (map.has(id)) continue
      const ch = supabase.channel(pairTopic(myId, id), { config: { private: true, broadcast: { self: false } } })
      ch.on('broadcast', { event: WHISPER_EVENT }, ({ payload }) => receiveRef.current(id, payload)).subscribe((status, err) => {
        // 권한 규칙(0019)을 실행하지 않았거나 친구가 아니면 여기로 옵니다.
        if (status === 'CHANNEL_ERROR') console.warn('귓속말 방에 들어가지 못했습니다:', err?.message ?? '')
      })
      map.set(id, ch)
    }
  }, [myId, onlineKey])
  // 로그아웃하거나 계정이 바뀌면 방에서 모두 나옵니다.
  useEffect(() => {
    const map = channels.current
    return () => {
      for (const ch of map.values()) void supabase.removeChannel(ch)
      map.clear()
    }
  }, [myId])

  // 공부가 끝나면 그동안 받은 귓속말을 한 번에 알립니다.
  const logRef = useRef(current)
  useEffect(() => {
    logRef.current = current
  })
  const wasStudying = useRef(studying)
  useEffect(() => {
    const was = wasStudying.current
    wasStudying.current = studying
    if (!was || studying) return
    // 상태 변경은 효과 본문이 아니라 잠깐 뒤(타이머)에 합니다. (React 규칙: 효과에서 바로 setState 하지 않기)
    const id = setTimeout(() => {
      const n = logRef.current.quietCount
      if (n === 0) return
      update((l) => ({
        ...l,
        quietCount: 0,
        lines: [...l.lines, { id: nextLineId++, at: Date.now(), kind: 'system' as const, text: `공부하는 동안 온 귓속말 ${n}개를 아직 안 읽었어요.` }].slice(-MAX_LINES),
      }))
      if (!latest.current.quiet && !latest.current.muted) playDing()
    }, 0)
    return () => clearTimeout(id)
  }, [studying, update])

  const lastSent = useRef(0)
  const toldQuiet = useRef(new Set<string>()) // "방해금지 중이라 알림 없이 전달" 안내를 이미 한 친구
  const send = useCallback(
    async (to: string, text: string) => {
      const now = Date.now()
      if (now - lastSent.current < SEND_GAP_MS) return '조금 천천히 보내 주세요.'
      const ch = channels.current.get(to)
      const peer = latest.current.friends.find((f) => f.id === to)
      if (!ch || !peer) return '그 친구는 지금 접속해 있지 않아요.'
      lastSent.current = now
      const result = await ch.send({ type: 'broadcast', event: WHISPER_EVENT, payload: { text } })
      if (result !== 'ok') return '보내지 못했어요. 잠시 뒤 다시 보내 주세요.'
      const random = Math.random()
      update((l) => ({
        ...withColor(l, to, random),
        target: to,
        lines: [...l.lines, { id: nextLineId++, at: Date.now(), kind: 'out' as const, peer, text }].slice(-MAX_LINES),
      }))
      // 상대가 방해금지 중이면 답이 늦을 수 있다고 한 번 알려 줍니다.
      const peerQuiet = people.get(to)?.quiet ?? false
      if (peerQuiet && !toldQuiet.current.has(to)) {
        toldQuiet.current.add(to)
        addLine({ kind: 'system', text: `${peer.nickname} 님은 방해금지 중이라 알림 없이 전달돼요.` })
      }
      if (!peerQuiet) toldQuiet.current.delete(to)
      return ''
    },
    [addLine, people, update],
  )

  const setMuted = useCallback((on: boolean) => {
    setMutedState(on)
    try {
      localStorage.setItem(MUTE_KEY, on ? '1' : '0')
    } catch {
      // 기억하지 못해도 이번 접속에서는 그대로 씁니다.
    }
  }, [])

  const value = {
    enabled: Boolean(myId),
    lines: current.lines,
    unread: current.unread,
    // 읽으면 방해금지 중에 받은 수도 0으로. 이미 읽고 답장한 것을 공부가 끝날 때 다시 알리지 않게 (#217)
    markRead: () => update((l) => (l.unread === 0 && l.quietCount === 0 ? l : { ...l, unread: 0, quietCount: 0 })),
    online,
    colors: current.colors,
    refreshFriends: reload,
    target: current.target,
    setTarget: (id: string | null) => update((l) => ({ ...l, target: id })),
    lastFrom: current.lastFrom,
    send,
    note: (text: string) => addLine({ kind: 'system', text }),
    quiet,
    studying,
    setQuiet: (on: boolean) => (studying ? setStudyQuietOff(!on) : setManualQuiet(on)),
    muted,
    setMuted,
    startWhisper: (friendId: string) => {
      update((l) => ({ ...l, target: friendId }))
      setOpenKey((k) => k + 1)
    },
    openKey,
    hasOverlay,
    setHasOverlay,
  }
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}
