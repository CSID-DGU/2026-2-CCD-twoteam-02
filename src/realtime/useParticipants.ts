// 같은 지점에 있는 다른 참여자 목록. 실시간으로 갱신된다.
//
// 쓰는 쪽은 내 상태를 ref 로 넘긴다. 위치가 매 프레임 바뀌는데 그때마다 다시 그리면
// 화면이 느려지므로, 값을 직접 받지 않고 ref 를 주기적으로 읽어서 보낸다.
// (src/focus/useFocusState.ts 가 얼굴 인식 결과를 받는 방식과 같다)
//
// 두 가지를 나눠 쓴다. 이유는 participants.ts 머리말 참고.
//   presence  — 누가 있는지. 들어올 때 한 번만 track 한다.
//   broadcast — 어디에 있는지. 0.25초마다 보낸다.
//
// ── 전체 흐름 ────────────────────────────────────────────────────────
//
//  내 쪽                                   남의 쪽
//  ─────                                   ─────
//  BranchScene 의 Player 가 매 프레임
//  handleMove 로 내 위치를 me.current 에 적는다
//            │
//            ▼
//  timer(0.25초) 가 me.current 를 읽어
//  sendNow() 로 broadcast 전송  ───────────▶  on('broadcast') 가 받아
//                                             moves 에 넣고 rebuild()
//                                                    │
//  subscribe 되면 track({userId}) 한 번             ▼
//            │                              others 배열이 바뀌고
//            ▼                              OtherParticipants 가 그린다
//  on('presence' join) 으로 남이 들어온 걸 알면
//  sendNow() 로 내 위치를 한 번 더 보낸다
//
// ── 들어올 때 서로를 바로 보는 방법 ──────────────────────────────────
//
//  예전에는 나중에 들어온 사람이 남을 최대 2초 동안 못 봤다.
//  들어온 쪽이 "네 위치 좀 보내 줘" 하고 조르지 않아서, 남이 알아서 보내 줄 때까지
//  기다려야 했기 때문이다. 가만히 선 사람은 RESEND_IDLE_MS(2초)마다만 보낸다.
//
//  그래서 들어오면서 HELLO_EVENT 를 한 번 보내고, 그걸 받은 사람들이 즉시
//  자기 위치로 답하게 했다. 이러면 양쪽이 대칭이 된다.
//
//    B 가 들어옴 ──hello──▶ A 가 받고 즉시 sendNow()
//               ◀──위치───  B 가 바로 A 를 본다
//
//  presence 의 join 에서도 같은 일을 한다. 둘 중 하나가 늦거나 유실돼도
//  나머지가 받쳐 주도록 일부러 두 군데에 둔다. 들어올 때 한 번씩이라 부담은 없다.
//
// ── 지연에 대해 ──────────────────────────────────────────────────────
//
//  메시지가 상대에게 닿는 데 약 100ms 가 걸린다. 이건 얼마나 자주 보내든 같다.
//  재어 보니 250ms 로 보낼 때와 16ms 로 보낼 때의 지연이 똑같았다(평균 95ms).
//  자주 보내면 위치가 촘촘해질 뿐, 더 최신이 되지는 않는다.
//
//  화면에 반영되기까지의 지연은 세 단계로 쌓인다.
//    보낼 차례 기다림 125ms(평균) + 네트워크 95ms + 보간 따라붙기 100ms ≈ 0.32초
//
//  그리고 메시지 수는 사람 수의 제곱으로 는다. Supabase 는 보낸 것 1건에
//  받은 사람마다 1건을 더 센다. 그래서 (사람 수)² × (초당 전송 횟수) 가 된다.
//  SEND_INTERVAL_MS 를 줄일 때는 이걸 먼저 계산해야 한다.
//  자세한 내용은 docs/실시간-동기화-방식-비교.md 참고.
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { supabase } from '../lib/supabase'
import { onMyProfileChanged } from '../profile/characters'
import { CHAT_EVENT, HELLO_EVENT, MOVE_EVENT, PROFILE_EVENT, RESEND_IDLE_MS, SEND_INTERVAL_MS, SIGNAL_EVENT, STALE_MS } from './participants'
import type { ChatPort, Participant, PresenceState, SignalPort } from './participants'
import { changedEnough, pack } from './sendLogic'
import { avatarFromDb, avatarKey } from '../avatar/avatarLogic'

type AvatarRow = { id: string; nickname: string; avatar: unknown }
type Profile = { nickname: string; model: string }

// room: 실시간 방 이름. 지점은 channelName(지점 번호), 로비는 LOBBY_CHANNEL (#166), 회의는 meeting:회의번호 (#45)
// isPrivate: 비공개 방. 들어올 수 있는 사람을 DB 정책이 정합니다(회의는 그 회의 참석자만, 0021).
// signalRef: 같은 방으로 음성 연결 신호도 주고받을 때 (회의실 음성, #46)
// chatRef: 같은 방으로 채팅도 주고받을 때 (회의 채팅, #298)
export function useParticipants(
  room: string,
  me: RefObject<PresenceState | null>,
  isPrivate = false,
  signalRef?: RefObject<SignalPort>,
  chatRef?: RefObject<ChatPort>,
) {
  const [others, setOthers] = useState<Participant[]>([])
  // 한 번 읽은 닉네임·캐릭터는 들고 있는다. 사람이 들어올 때만 더 읽는다.
  const profiles = useRef(new Map<string, Profile>())

  useEffect(() => {
    let alive = true
    const channel = supabase.channel(room, isPrivate ? { config: { private: true } } : undefined)
    const port = signalRef?.current // 음성 연결 신호 통로 (회의실만)
    const chatPort = chatRef?.current // 채팅 통로 (회의실만)

    const members = new Set<string>() // presence 로 받은 "지금 여기 있는 사람"
    const moves = new Map<string, PresenceState>() // broadcast 로 받은 위치
    const lastHeard = new Map<string, number>() // 마지막으로 소식을 들은 시각

    // 아직 모르는 사람의 닉네임·캐릭터를 한 번에 읽어 온다.
    async function fillProfiles(ids: string[]) {
      const missing = ids.filter((id) => !profiles.current.has(id))
      if (missing.length === 0) return
      const { data, error } = await supabase
        .from('avatars')
        .select('id, nickname, avatar')
        .in('id', missing)
      if (error) {
        console.error('참여자 정보를 불러오지 못했습니다:', error.message)
        return
      }
      for (const row of (data ?? []) as AvatarRow[]) {
        profiles.current.set(row.id, {
          nickname: row.nickname,
          model: avatarKey(avatarFromDb(row.avatar)), // 고른 차림 (#56). 예전 {model} 은 기본 차림
        })
      }
    }

    // 위치를 받은 사람을 그린다.
    //
    // presence 에 들어왔는지까지 따지지 않는다. 여럿이 동시에 들어오면 presence 가
    // 자리잡는 데 몇 초가 걸려서, 그동안 아무도 안 보이기 때문이다.
    // 위치는 0.25초마다 오므로 그것만으로 충분하다.
    // presence 는 나간 사람을 지우는 데만 쓴다. (아래 readMembers)
    function rebuild() {
      if (!alive) return
      const mine = me.current?.userId
      const ids = [...moves.keys()].filter((id) => id !== mine)

      void fillProfiles(ids).then(() => {
        if (!alive) return
        setOthers(
          ids.map((id) => {
            const p = profiles.current.get(id)
            return {
              ...(moves.get(id) as PresenceState),
              nickname: p?.nickname ?? '…',
              model: p?.model ?? 'a',
            }
          })
        )
      })
    }

    function readMembers() {
      members.clear()
      for (const list of Object.values(channel.presenceState<{ userId?: string }>()))
        for (const s of list) if (s.userId) members.add(s.userId)
      rebuild()
    }

    // 나간 사람을 지운다. presence 의 leave 로 알 수 있지만, 탭을 거칠게 닫는 등
    // leave 가 안 올 수도 있어 "한동안 위치가 안 온 사람"도 같이 지운다.
    // 들고 있던 닉네임·캐릭터도 버린다. 나가 있는 동안(다른 지점·프로필 화면) 캐릭터를 바꾸면
    // 그 알림(PROFILE_EVENT)은 이 방에 오지 않아서, 다시 들어왔을 때 예전 캐릭터로 보였다.
    function dropGone(leftId?: string) {
      const now = Date.now()
      let changed = false
      if (leftId) profiles.current.delete(leftId) // 위치를 한 번도 안 보내고 나간 사람도
      for (const [id, last] of lastHeard) {
        if (id === leftId || now - last > STALE_MS) {
          moves.delete(id)
          lastHeard.delete(id)
          profiles.current.delete(id)
          changed = true
        }
      }
      if (changed) rebuild()
    }

    let subscribed = false
    // 마지막으로 보낸 값. 다음에 보낼지는 이것과 비교해 정한다(sendLogic.ts).
    // 반올림 전 값을 들고 있어야 기준점이 칸 경계에 묶이지 않는다.
    let lastSent: PresenceState | null = null
    let lastSentAt = 0

    // 지금 내 상태를 한 번 보낸다. 값이 그대로여도 보낸다.
    function sendNow() {
      const state = me.current
      if (!subscribed || !state) return
      lastSent = state
      lastSentAt = Date.now()
      void channel.send({ type: 'broadcast', event: MOVE_EVENT, payload: pack(state) })
    }

    // 들어왔다고 알린다. 받은 사람들이 자기 위치로 답해 준다.
    function sayHello() {
      const id = me.current?.userId
      if (!subscribed || !id) return
      void channel.send({ type: 'broadcast', event: HELLO_EVENT, payload: { userId: id } })
    }

    channel
      .on('presence', { event: 'sync' }, readMembers)
      .on('presence', { event: 'join' }, () => {
        readMembers()
        // 새로 들어온 사람이 나를 바로 볼 수 있도록 지금 위치를 한 번 보낸다.
        sendNow()
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        for (const p of leftPresences as { userId?: string }[]) dropGone(p.userId)
        readMembers()
      })
      .on('broadcast', { event: HELLO_EVENT }, ({ payload }) => {
        // 누가 막 들어왔다. 기다리게 하지 않고 내 위치를 바로 알려 준다.
        const who = (payload as { userId?: string })?.userId
        if (!who || who === me.current?.userId) return
        sendNow()
      })
      .on('broadcast', { event: PROFILE_EVENT }, ({ payload }) => {
        // 누가 캐릭터·닉네임을 바꿨다. 들고 있던 값을 버리고 DB 에서 다시 읽는다.
        const who = (payload as { userId?: string })?.userId
        if (!who || who === me.current?.userId) return
        profiles.current.delete(who)
        rebuild()
      })
      .on('broadcast', { event: SIGNAL_EVENT }, ({ payload }) => {
        // 음성 연결 신호. 나에게 온 것만 넘긴다.
        const p = payload as { from?: string; to?: string; data?: unknown } | null
        if (!port || !p?.from || p.to !== me.current?.userId) return
        port.receive(p.from, p.data)
      })
      .on('broadcast', { event: CHAT_EVENT }, ({ payload }) => {
        // 회의 채팅. 받은 그대로 넘기고, 글자 확인은 채팅 쪽(ChatProvider)이 한다.
        const from = (payload as { from?: unknown } | null)?.from
        if (!chatPort || typeof from !== 'string' || from === me.current?.userId) return
        chatPort.receive(from, payload)
      })
      .on('broadcast', { event: MOVE_EVENT }, ({ payload }) => {
        const state = payload as PresenceState
        if (!state?.userId || state.userId === me.current?.userId) return
        moves.set(state.userId, state)
        lastHeard.set(state.userId, Date.now())
        rebuild()
      })
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        subscribed = true
        if (port) {
          port.send = (to, data) => {
            const from = me.current?.userId
            if (from) void channel.send({ type: 'broadcast', event: SIGNAL_EVENT, payload: { from, to, data } })
          }
        }
        if (chatPort) {
          chatPort.send = async (text) => {
            const from = me.current?.userId
            if (!from) return false
            return (await channel.send({ type: 'broadcast', event: CHAT_EVENT, payload: { from, text } })) === 'ok'
          }
        }
        const id = me.current?.userId
        // presence 는 "누가 있는지"만 담는다. 들어올 때 한 번이면 된다.
        if (id) void channel.track({ userId: id })
        sendNow()
        sayHello()
      })

    // 값이 충분히 바뀌었을 때 보내고, 그대로여도 가끔 한 번 보낸다.
    //
    // "값이 그대로면 안 보낸다" 가 트래픽을 아끼는 대신, 가만히 선 사람이
    // 남에게 늦게 보이는 원인이 된다. RESEND_IDLE_MS 가 그 최대 지연이다.
    // 기준값보다 작게 움직이고 멈춘 경우도 이 재전송으로 따라잡는다.
    const timer = setInterval(() => {
      const state = me.current
      if (!subscribed || !state) return
      if (!changedEnough(lastSent, state) && Date.now() - lastSentAt < RESEND_IDLE_MS) return
      sendNow()
    }, SEND_INTERVAL_MS)

    // 구독이 끝난 뒤에야 내 상태(me.current)가 채워질 수 있다.
    // 그러면 위 subscribe 안의 track 이 건너뛰어지므로, 들어갈 때까지 다시 시도한다.
    const joinTimer = setInterval(() => {
      const id = me.current?.userId
      if (!subscribed || !id || members.has(id)) return
      void channel.track({ userId: id })
      sayHello()
    }, SEND_INTERVAL_MS)

    // 소식이 끊긴 사람을 치운다.
    const sweepTimer = setInterval(() => dropGone(), STALE_MS)

    // 내 프로필(캐릭터·닉네임)을 바꾸면 같은 지점 사람들에게 다시 읽어 달라고 알린다.
    const stopProfileListen = onMyProfileChanged(() => {
      const id = me.current?.userId
      if (!subscribed || !id) return
      void channel.send({ type: 'broadcast', event: PROFILE_EVENT, payload: { userId: id } })
    })

    return () => {
      alive = false
      clearInterval(timer)
      clearInterval(joinTimer)
      clearInterval(sweepTimer)
      stopProfileListen()
      if (port) port.send = null
      if (chatPort) chatPort.send = null
      void channel.unsubscribe()
    }
  }, [room, me, isPrivate, signalRef, chatRef])

  return others
}
