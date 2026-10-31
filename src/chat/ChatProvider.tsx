// 친구 귓속말·그룹 채팅·회의 채팅 연결 (#49, #298). App 맨 위에 하나만 둡니다.
//
// 접속 중인 친구마다 둘만의 비공개 실시간 방(whisper:{작은 번호}:{큰 번호})에 들어가 있고,
// 친구가 나가면 그 방에서도 나옵니다. 누가 들어갈 수 있는지는 DB 규칙(0019)이 확인합니다.
// 메시지는 어디에도 저장하지 않고, 로그는 이 장치의 메모리에만 있습니다.
//   로비 ↔ 지점 이동: 유지 / 새로고침·탭 닫기·접속 끊김·로그아웃: 사라짐
//
// 방해금지: 공부를 시작하면(초록·노랑 상관없이) 자동으로 켜지고, 공부 중에도 직접 끌 수 있습니다(#216).
// 공부 중에 끈 것은 그 공부 동안만이고, 다음 공부를 시작하면 다시 켜집니다. 공부가 끝나면 공부 전 설정으로.
// 친구에게는 접속 상태로 "방해금지 중"을 알립니다(보낼 때 "알림 없이 전달돼요" 안내용).
// 그동안 받은 말은 소리 없이 쌓아 두고, 공부가 끝나면 아직 안 읽은 것만 "채팅 N개"로 한 번 알립니다.
//
// 회의 초대 알림(#45)도 같은 친구 방으로 받습니다. 소리·방해금지 규칙은 귓속말과 같습니다.
//
// 그룹 채팅(#298): 오버워치 파티처럼 한 사람은 그룹 하나에만 있습니다(0029).
//   - 내 그룹의 비공개 실시간 방(group:{그룹 번호}, 멤버만)에 들어가 있습니다.
//     여러 사람이 있는 방이라 보낸 사람 계정 번호를 메시지에 적어 보내고, 받는 쪽은 그 사람이 멤버인지 확인합니다.
//   - 초대는 DB 에 저장하고(5분), 친구의 귓속말 방으로 "초대했어요" 알림을 보냅니다. 받은 쪽 채팅창에 [수락] [거절]이 뜹니다.
//   - 누가 들어오거나 나가면 그룹 방에 알려, 다른 멤버가 멤버 목록을 다시 읽게 합니다.
// 회의 채팅(#298): 회의에 있는 사람끼리는 자동으로 회의 방(meeting:회의번호)에서 이야기합니다.
//   회의 화면이 그 방에 들어가 있으므로(useParticipants) 회의 화면이 보내기·받기를 이어 줍니다(useMeetingChat).
import { useQuietLock } from './quietLock'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useSession } from '../auth/useSession'
import { useFriends } from '../friends/useFriends'
import { otherOf } from '../friends/friendsLogic'
import { useMyStudying, useOnline, useQuietFlag } from '../realtime/onlineContext'
import { ChatContext } from './chatContext'
import type { ChatLine, MeetingInvite } from './chatContext'
import {
  ARRIVED_EVENT, GROUP_CHANGED_EVENT, GROUP_EVENT, GROUP_INVITE_EVENT, GROUP_INVITE_MS, GROUP_JOINED_EVENT, INVITE_EVENT, MAX_LENGTH, SUMMON_EVENT,
  SEND_GAP_MS, WHISPER_EVENT, groupTopic, isQuiet, meetingKey, pairTopic, pickColor, recipientsOf,
} from './chatLogic'
import type { Friend, MeetingRoom } from './chatLogic'
import { playDing } from './sound'
import { useGroup } from './useGroup'

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
  colors: Record<string, string> // 받는 사람 key(친구 계정 번호·group:번호·meeting:번호) → 이번 접속에서 정한 글자 색
}

// 회의 화면이 알려 준 지금 회의 (보내기는 회의 방을 가진 회의 화면이 함)
type Meeting = MeetingRoom & { send: (text: string) => Promise<boolean> }

const freshLog = (owner: string): Log => ({ owner, lines: [], unread: 0, quietCount: 0, lastFrom: null, target: null, colors: {} })

// 그 친구(방)와 처음 이야기하면 아직 안 쓴 색을 하나 정해 줍니다. random 은 밖에서 뽑아 넘깁니다(상태 계산은 순수하게).
const withColor = (l: Log, key: string, random: number): Log =>
  l.colors[key] ? l : { ...l, colors: { ...l.colors, [key]: pickColor(Object.values(l.colors), random) } }

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
  const groupApi = useGroup(myId || undefined)
  const { group, reload: reloadGroup } = groupApi
  const [meeting, setMeetingState] = useState<Meeting | null>(null)
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
  const quietLocked = useQuietLock() // 지점 규칙으로 방해금지 고정 (캠빛 대학교 도서관)
  const quiet = isQuiet(studying, manualQuiet, studyQuietOff, quietLocked)
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
  // 채팅창에서 고를 수 있는 받는 사람: 접속한 친구, 내 그룹, 지금 있는 회의 (#298)
  const recipients = useMemo(() => recipientsOf(online, group, meeting, (id) => people.has(id)), [online, group, meeting, people])

  // 접속자가 바뀌면 잠시 뒤 친구 목록과 그룹을 다시 읽습니다. (그사이 새로 친구가 된 사람, 바뀐 그룹 멤버)
  const peopleKey = [...people.keys()].sort().join(',')
  useEffect(() => {
    if (!myId || !peopleKey) return
    const id = setTimeout(() => {
      reload()
      reloadGroup()
    }, FRIENDS_RELOAD_MS)
    return () => clearTimeout(id)
  }, [myId, peopleKey, reload, reloadGroup])

  // 내 그룹 방 (아래 효과가 들어가고 나옴, #298)
  const groupChannel = useRef<{ id: number; ch: RealtimeChannel } | null>(null)

  // 받을 때 최신 값을 쓰도록 ref 에 담아 둡니다. (방 구독은 한 번 걸어 두고 계속 씀)
  const latest = useRef({ friends, group, meeting, quiet, muted })
  useEffect(() => {
    latest.current = { friends, group, meeting, quiet, muted }
  }, [friends, group, meeting, quiet, muted])

  // 받은 줄을 더합니다. 안 읽은 수를 올리고, 방해금지가 아니면 소리를 냅니다.
  // colorKey: 줄 색을 정할 받는 사람 key, from: 채팅창을 열 때 먼저 골라 둘 곳 (없으면 그대로)
  const pushIncoming = useCallback(
    (line: Omit<ChatLine, 'id' | 'at' | 'quiet'>, colorKey: string, from?: string) => {
      const { quiet: q, muted: m } = latest.current
      const random = Math.random()
      update((l) => ({
        ...withColor(l, colorKey, random),
        lines: [...l.lines, { ...line, quiet: q, id: nextLineId++, at: Date.now() }].slice(-MAX_LINES),
        unread: l.unread + 1,
        quietCount: q ? l.quietCount + 1 : l.quietCount,
        lastFrom: from ?? l.lastFrom,
      }))
      if (!q && !m) playDing()
    },
    [update],
  )

  // 그 사람의 닉네임: 친구·그룹 멤버·회의 참석자에서 찾고, 없으면 DB 에서 읽습니다.
  const nicknameOf = useCallback(async (id: string) => {
    const { friends: fr, group: g, meeting: mt } = latest.current
    const known = [...fr, ...(g?.members ?? []), ...(mt?.members ?? [])].find((p) => p.id === id)
    if (known) return known.nickname
    const { data } = await supabase.from('avatars').select('nickname').eq('id', id).maybeSingle()
    return (data as { nickname?: string } | null)?.nickname ?? '누군가'
  }, [])

  const receive = useCallback(
    (peerId: string, payload: unknown) => {
      const raw = (payload as { text?: unknown } | null)?.text
      const text = typeof raw === 'string' ? raw.trim().slice(0, MAX_LENGTH) : '' // 화면 밖에서 보낸 긴 글도 잘라 냄
      if (!text) return
      const peer = latest.current.friends.find((f) => f.id === peerId) ?? { id: peerId, nickname: '친구' }
      pushIncoming({ kind: 'in', peer, text }, peerId, peerId)
    },
    [pushIncoming],
  )
  const receiveRef = useRef(receive)
  useEffect(() => {
    receiveRef.current = receive
  }, [receive])

  // 회의 초대를 받으면 회의 번호로 DB 에서 회의를 읽어 봅니다. 초대가 저장돼 있어야 비공개 회의가 보이고(0021 RLS),
  // 끝난 회의거나 안 보이면 알리지 않습니다. 들어갈 때 join_meeting 이 초대를 한 번 더 확인합니다.
  const receiveInvite = useCallback(
    async (peerId: string, payload: unknown) => {
      const meetingId = (payload as { meetingId?: unknown } | null)?.meetingId
      if (typeof meetingId !== 'number' || !Number.isInteger(meetingId)) return
      const { data } = await supabase.from('meetings').select('id, title, ended_at, branches(slug)').eq('id', meetingId).maybeSingle()
      const branch = data?.branches as { slug?: string } | { slug?: string }[] | null | undefined
      const branchSlug = Array.isArray(branch) ? branch[0]?.slug : branch?.slug
      if (!data || data.ended_at || !branchSlug) return
      const invite: MeetingInvite = { id: data.id, title: data.title, branchSlug }
      const peer = latest.current.friends.find((f) => f.id === peerId) ?? { id: peerId, nickname: '친구' }
      pushIncoming({ kind: 'invite', peer, text: '', meeting: invite }, peerId)
    },
    [pushIncoming],
  )
  const receiveInviteRef = useRef(receiveInvite)
  useEffect(() => {
    receiveInviteRef.current = receiveInvite
  }, [receiveInvite])

  // ── 친구 부르기·따라가기 (src/friends/followLogic) ─────────────
  // 친구 방(귓속말 방)은 두 친구만 들어올 수 있어(0019) 보낸 사람이 그 친구입니다. 갈 곳은 [가기]를 누를 때 접속 상태로 정합니다.
  const receiveSummon = useCallback(
    (peerId: string) => {
      const peer = latest.current.friends.find((f) => f.id === peerId) ?? { id: peerId, nickname: '친구' }
      pushIncoming({ kind: 'summon', peer, text: '' }, peerId)
    },
    [pushIncoming],
  )
  const receiveSummonRef = useRef(receiveSummon)
  useEffect(() => {
    receiveSummonRef.current = receiveSummon
  }, [receiveSummon])
  const receiveArrived = useCallback(
    (peerId: string, payload: unknown) => {
      const how = (payload as { how?: unknown } | null)?.how
      const name = latest.current.friends.find((f) => f.id === peerId)?.nickname ?? '친구'
      addLine({ kind: 'system', text: how === 'summon' ? `${name} 님이 부름을 받고 왔어요.` : `${name} 님이 따라왔어요.` })
    },
    [addLine],
  )
  const receiveArrivedRef = useRef(receiveArrived)
  useEffect(() => {
    receiveArrivedRef.current = receiveArrived
  }, [receiveArrived])

  // ── 그룹 (#298) ──────────────────────────────────────────────

  // 그룹 채팅을 받습니다. 보낸 사람이 내 그룹 멤버일 때만 받습니다.
  // 내 화면이 아직 모르는 멤버(방금 들어온 사람)면 DB 에서 멤버인지 확인하고 그룹을 다시 읽습니다.
  const receiveGroup = useCallback(
    async (groupId: number, payload: unknown) => {
      const p = payload as { text?: unknown; from?: unknown } | null
      const text = typeof p?.text === 'string' ? p.text.trim().slice(0, MAX_LENGTH) : ''
      const from = typeof p?.from === 'string' ? p.from : ''
      if (!text || !from || from === myId || latest.current.group?.id !== groupId) return
      let peer = latest.current.group.members.find((m) => m.id === from)
      if (!peer) {
        const { data } = await supabase
          .from('chat_group_members').select('user_id').eq('group_id', groupId).eq('user_id', from).maybeSingle()
        if (!data) return
        peer = { id: from, nickname: await nicknameOf(from) }
        reloadGroup()
      }
      const key = groupTopic(groupId)
      pushIncoming({ kind: 'in', peer, room: { kind: 'group', key }, text }, key, key)
    },
    [myId, nicknameOf, pushIncoming, reloadGroup],
  )
  const receiveGroupRef = useRef(receiveGroup)
  useEffect(() => {
    receiveGroupRef.current = receiveGroup
  }, [receiveGroup])

  // 그룹 방: 누가 들어오거나 나갔다는 알림. 멤버를 다시 읽고 한 줄 남깁니다.
  const receiveGroupChanged = useCallback(
    async (payload: unknown) => {
      const p = payload as { who?: unknown; change?: unknown } | null
      if (typeof p?.who !== 'string' || p.who === myId || (p.change !== 'join' && p.change !== 'leave')) return
      reloadGroup()
      const name = await nicknameOf(p.who)
      addLine({ kind: 'system', text: p.change === 'join' ? `${name} 님이 그룹에 들어왔어요.` : `${name} 님이 그룹에서 나갔어요.` })
    },
    [addLine, myId, nicknameOf, reloadGroup],
  )
  const receiveGroupChangedRef = useRef(receiveGroupChanged)
  useEffect(() => {
    receiveGroupChangedRef.current = receiveGroupChanged
  }, [receiveGroupChanged])

  // 그룹 방(아래 groupChannel)에 "누가 들어왔다/나갔다"를 알립니다.
  const tellGroup = useCallback((who: string, change: 'join' | 'leave') => {
    void groupChannel.current?.ch.send({ type: 'broadcast', event: GROUP_CHANGED_EVENT, payload: { who, change } })
  }, [])

  // 친구가 그룹 초대를 보냈다는 알림 (귓속말 방으로 옴). DB 에 그 초대가 있을 때만 [수락] [거절] 줄을 띄웁니다.
  const receiveGroupInvite = useCallback(
    async (peerId: string) => {
      const since = new Date(Date.now() - GROUP_INVITE_MS).toISOString()
      const { data } = await supabase
        .from('chat_group_invites').select('inviter_id')
        .eq('inviter_id', peerId).eq('invitee_id', myId).gte('created_at', since).maybeSingle()
      if (!data) return
      reloadGroup() // 친구 화면의 받은 초대 목록
      const peer = latest.current.friends.find((f) => f.id === peerId) ?? { id: peerId, nickname: '친구' }
      pushIncoming({ kind: 'groupInvite', peer, text: '' }, peerId)
    },
    [myId, pushIncoming, reloadGroup],
  )
  const receiveGroupInviteRef = useRef(receiveGroupInvite)
  useEffect(() => {
    receiveGroupInviteRef.current = receiveGroupInvite
  }, [receiveGroupInvite])

  // 내 초대를 친구가 수락했다는 알림 (귓속말 방으로 옴). 그룹을 다시 읽고, 다른 멤버에게도 알립니다.
  const receiveGroupJoined = useCallback(
    (peerId: string) => {
      reloadGroup()
      tellGroup(peerId, 'join')
      const peer = latest.current.friends.find((f) => f.id === peerId)
      addLine({ kind: 'system', text: `${peer?.nickname ?? '친구'} 님이 그룹 초대를 수락했어요. Tab 으로 [그룹]을 골라 이야기할 수 있어요.` })
    },
    [addLine, reloadGroup, tellGroup],
  )
  const receiveGroupJoinedRef = useRef(receiveGroupJoined)
  useEffect(() => {
    receiveGroupJoinedRef.current = receiveGroupJoined
  }, [receiveGroupJoined])

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
      ch.on('broadcast', { event: WHISPER_EVENT }, ({ payload }) => receiveRef.current(id, payload))
        .on('broadcast', { event: INVITE_EVENT }, ({ payload }) => void receiveInviteRef.current(id, payload))
        .on('broadcast', { event: GROUP_INVITE_EVENT }, () => void receiveGroupInviteRef.current(id))
        .on('broadcast', { event: GROUP_JOINED_EVENT }, () => receiveGroupJoinedRef.current(id))
        .on('broadcast', { event: SUMMON_EVENT }, () => receiveSummonRef.current(id))
        .on('broadcast', { event: ARRIVED_EVENT }, ({ payload }) => receiveArrivedRef.current(id, payload))
        .subscribe((status, err) => {
          // 권한 규칙(0019)을 실행하지 않았거나 친구가 아니면 여기로 옵니다.
          if (status === 'CHANNEL_ERROR') console.warn('귓속말 방에 들어가지 못했습니다:', err?.message ?? '')
        })
      map.set(id, ch)
    }
  }, [myId, onlineKey])

  // 내 그룹 방에 들어가고, 그룹이 바뀌거나 없어지면 나옵니다 (#298).
  // 접속한 멤버가 없어도 들어가 둡니다(나중에 누가 접속해 보내면 바로 받게).
  const groupId = group?.id ?? null
  useEffect(() => {
    if (!myId || groupId === null) return
    const ch = supabase.channel(groupTopic(groupId), { config: { private: true, broadcast: { self: false } } })
    ch.on('broadcast', { event: GROUP_EVENT }, ({ payload }) => void receiveGroupRef.current(groupId, payload))
      .on('broadcast', { event: GROUP_CHANGED_EVENT }, ({ payload }) => void receiveGroupChangedRef.current(payload))
      .subscribe((status, err) => {
        // 권한 규칙(0029)을 실행하지 않았거나 멤버가 아니면 여기로 옵니다.
        if (status === 'CHANNEL_ERROR') console.warn('그룹 방에 들어가지 못했습니다:', err?.message ?? '')
      })
    groupChannel.current = { id: groupId, ch }
    return () => {
      void supabase.removeChannel(ch)
      if (groupChannel.current?.ch === ch) groupChannel.current = null
    }
  }, [myId, groupId])

  // 로그아웃하거나 계정이 바뀌면 방에서 모두 나옵니다. (그룹 방은 위 효과가 정리함)
  useEffect(() => {
    const map = channels.current
    return () => {
      for (const ch of map.values()) void supabase.removeChannel(ch)
      map.clear()
    }
  }, [myId])


  // 친구를 내 그룹에 초대합니다. 접속한 친구에게만 보냅니다(그 친구 채팅창에 [수락] [거절]이 뜸).
  const { invite: dbInvite, accept: dbAccept, decline: dbDecline, leave: dbLeave } = groupApi
  const inviteToGroup = useCallback(
    async (friendId: string) => {
      const ch = channels.current.get(friendId)
      const peer = latest.current.friends.find((f) => f.id === friendId)
      if (!ch || !peer) return '접속한 친구만 그룹에 초대할 수 있어요.'
      const error = await dbInvite(friendId)
      if (error) return error
      void ch.send({ type: 'broadcast', event: GROUP_INVITE_EVENT, payload: {} })
      addLine({ kind: 'system', text: `${peer.nickname} 님을 그룹에 초대했어요. 5분 안에 수락하면 들어와요.` })
      return ''
    },
    [addLine, dbInvite],
  )

  // 받은 초대를 수락합니다. 지금 그룹이 있으면 나와서 옮겨 가고, 앞 그룹에는 나갔다고 알립니다.
  const acceptGroupInvite = useCallback(
    async (inviterId: string) => {
      const wasInGroup = latest.current.group !== null
      const error = await dbAccept(inviterId)
      if (error) return error
      if (wasInGroup) tellGroup(myId, 'leave')
      void channels.current.get(inviterId)?.send({ type: 'broadcast', event: GROUP_JOINED_EVENT, payload: {} })
      addLine({ kind: 'system', text: '그룹에 들어갔어요. 채팅창에서 Tab 으로 [그룹]을 골라 이야기할 수 있어요.' })
      return ''
    },
    [addLine, dbAccept, myId, tellGroup],
  )

  const leaveGroup = useCallback(async () => {
    const error = await dbLeave()
    if (error) return error
    tellGroup(myId, 'leave')
    addLine({ kind: 'system', text: '그룹에서 나왔어요.' })
    return ''
  }, [addLine, dbLeave, myId, tellGroup])

  // ── 회의 채팅 (#298) ─────────────────────────────────────────

  // 회의 화면이 들어오면서(그리고 참석자가 바뀔 때마다) 알립니다. 새 회의에 들어오면 받는 사람을 [회의]로 골라 둡니다.
  const meetingIdRef = useRef<number | null>(null)
  const setMeeting = useCallback(
    (m: Meeting | null) => {
      setMeetingState(m)
      const id = m?.id ?? null
      if (id === meetingIdRef.current) return
      meetingIdRef.current = id
      if (id !== null) update((l) => ({ ...l, target: meetingKey(id) }))
    },
    [update],
  )

  // 회의 방에서 받은 말. 회의 방에는 참석자만 들어오므로(0021) 보낸 사람은 참석자입니다.
  const receiveMeeting = useCallback(
    (from: string, payload: unknown) => {
      const raw = (payload as { text?: unknown } | null)?.text
      const text = typeof raw === 'string' ? raw.trim().slice(0, MAX_LENGTH) : ''
      const m = latest.current.meeting
      if (!text || !m || from === myId) return
      const peer = m.members.find((p) => p.id === from) ?? { id: from, nickname: '참석자' }
      const key = meetingKey(m.id)
      pushIncoming({ kind: 'in', peer, room: { kind: 'meeting', key }, text }, key, key)
    },
    [myId, pushIncoming],
  )

  // 공부가 끝나면 그동안 받은 말을 한 번에 알립니다.
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
        lines: [...l.lines, { id: nextLineId++, at: Date.now(), kind: 'system' as const, text: `공부하는 동안 온 채팅 ${n}개를 아직 안 읽었어요.` }].slice(-MAX_LINES),
      }))
      if (!latest.current.quiet && !latest.current.muted) playDing()
    }, 0)
    return () => clearTimeout(id)
  }, [studying, update])

  // 보낸 줄을 더하고, 다음에 채팅창을 열 때 같은 곳이 골라져 있게 합니다.
  const pushOutgoing = useCallback(
    (line: Omit<ChatLine, 'id' | 'at' | 'kind'>, to: string) => {
      const random = Math.random()
      update((l) => ({
        ...withColor(l, to, random),
        target: to,
        lines: [...l.lines, { ...line, kind: 'out' as const, id: nextLineId++, at: Date.now() }].slice(-MAX_LINES),
      }))
    },
    [update],
  )

  const lastSent = useRef(0)
  const toldQuiet = useRef(new Set<string>()) // "방해금지 중이라 알림 없이 전달" 안내를 이미 한 친구
  const send = useCallback(
    async (to: string, text: string) => {
      const now = Date.now()
      if (now - lastSent.current < SEND_GAP_MS) return '조금 천천히 보내 주세요.'
      const { group: g, meeting: m } = latest.current

      // 회의에 보내기. 회의 화면이 회의 방으로 보냅니다.
      if (m && to === meetingKey(m.id)) {
        if (m.members.length === 0) return '회의에 다른 사람이 없어요.'
        lastSent.current = now
        if (!(await m.send(text))) return '보내지 못했어요. 잠시 뒤 다시 보내 주세요.'
        pushOutgoing({ room: { kind: 'meeting', key: to }, text }, to)
        return ''
      }

      // 그룹에 보내기. 보낸 사람(나)을 적어 보냅니다.
      if (g && to === groupTopic(g.id)) {
        const gch = groupChannel.current?.id === g.id ? groupChannel.current.ch : null
        if (!gch) return '그룹 방에 아직 들어가지 못했어요. 잠시 뒤 다시 보내 주세요.'
        if (!g.members.some((p) => people.has(p.id))) return '그룹에 지금 접속한 멤버가 없어요.'
        lastSent.current = now
        const result = await gch.send({ type: 'broadcast', event: GROUP_EVENT, payload: { text, from: myId } })
        if (result !== 'ok') return '보내지 못했어요. 잠시 뒤 다시 보내 주세요.'
        pushOutgoing({ room: { kind: 'group', key: to }, text }, to)
        return ''
      }

      const ch = channels.current.get(to)
      const peer = latest.current.friends.find((f) => f.id === to)
      if (!ch || !peer) return '그 친구는 지금 접속해 있지 않아요.'
      lastSent.current = now
      const result = await ch.send({ type: 'broadcast', event: WHISPER_EVENT, payload: { text } })
      if (result !== 'ok') return '보내지 못했어요. 잠시 뒤 다시 보내 주세요.'
      pushOutgoing({ peer, text }, to)
      // 상대가 방해금지 중이면 답이 늦을 수 있다고 한 번 알려 줍니다.
      const peerQuiet = people.get(to)?.quiet ?? false
      if (peerQuiet && !toldQuiet.current.has(to)) {
        toldQuiet.current.add(to)
        addLine({ kind: 'system', text: `${peer.nickname} 님은 방해금지 중이라 알림 없이 전달돼요.` })
      }
      if (!peerQuiet) toldQuiet.current.delete(to)
      return ''
    },
    [addLine, myId, people, pushOutgoing],
  )

  // 회의 초대 알림 보내기 (#45). 초대 자체는 먼저 DB(invite_to_meeting)에 저장하고, 접속한 친구에게만 이 알림이 갑니다.
  const sendInvite = useCallback(
    async (to: string, meetingId: number) => {
      const ch = channels.current.get(to)
      const peer = latest.current.friends.find((f) => f.id === to)
      if (!ch || !peer) return false
      const result = await ch.send({ type: 'broadcast', event: INVITE_EVENT, payload: { meetingId } })
      if (result !== 'ok') return false
      addLine({ kind: 'system', text: `${peer.nickname} 님을 회의에 초대했어요.` })
      return true
    },
    [addLine],
  )

  // 친구 부르기: 내가 있는 곳으로 와 달라는 [부름]을 보냅니다. 접속한 친구에게만 갑니다.
  const sendSummon = useCallback(
    async (to: string) => {
      const ch = channels.current.get(to)
      const peer = latest.current.friends.find((f) => f.id === to)
      if (!ch || !peer) return false
      const result = await ch.send({ type: 'broadcast', event: SUMMON_EVENT, payload: {} })
      if (result !== 'ok') return false
      addLine({ kind: 'system', text: `${peer.nickname} 님을 불렀어요. 친구가 [가기]를 누르면 내 옆으로 와요.` })
      return true
    },
    [addLine],
  )
  // 친구 옆에 도착했다고 알립니다 (따라감·부름을 받고 감)
  const tellArrived = useCallback((to: string, how: 'follow' | 'summon') => {
    void channels.current.get(to)?.send({ type: 'broadcast', event: ARRIVED_EVENT, payload: { how } })
  }, [])

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
    recipients,
    colors: current.colors,
    refreshFriends: () => {
      reload()
      reloadGroup()
    },
    target: current.target,
    setTarget: (key: string | null) => update((l) => ({ ...l, target: key })),
    lastFrom: current.lastFrom,
    send,
    group,
    groupInvites: groupApi.invites,
    groupError: groupApi.error,
    inviteToGroup,
    acceptGroupInvite,
    declineGroupInvite: dbDecline,
    leaveGroup,
    setMeeting,
    receiveMeeting,
    sendInvite,
    sendSummon,
    tellArrived,
    note: (text: string) => addLine({ kind: 'system', text }),
    quiet,
    studying,
    quietLocked,
    setQuiet: (on: boolean) => {
      if (quietLocked) return // 고정 중에는 바꾸지 않음
      if (studying) setStudyQuietOff(!on)
      else setManualQuiet(on)
    },
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
