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
//  subscribe 되면 track({userId, at}) 한 번         ▼
//            │                              others 배열이 바뀌고
//            ▼                              OtherParticipants 가 그린다
//  on('presence' join) 으로 남이 들어온 걸 알면
//  내가 대표일 때만 방 전체 위치를 한 번 보낸다
//
// ── 들어올 때 서로를 바로 보는 방법 ──────────────────────────────────
//
//  예전에는 나중에 들어온 사람이 남을 최대 2초 동안 못 봤다.
//  들어온 쪽이 "네 위치 좀 보내 줘" 하고 조르지 않아서, 남이 알아서 보내 줄 때까지
//  기다려야 했기 때문이다. 가만히 선 사람은 RESEND_IDLE_MS(2초)마다만 보낸다.
//
//  그래서 들어오면서 HELLO_EVENT 를 한 번 보내고, 방에 가장 오래 있던 한 명(대표)이
//  아는 사람들의 위치를 한 메시지에 묶어 답한다(SNAPSHOT_EVENT, #441).
//
//    B 가 들어옴 ──hello──▶ 대표 A 가 받고 0.2초 묶어 스냅샷 전송
//               ◀─A·C·D 위치─  B 가 바로 모두를 본다
//
//  예전에는 받은 사람 전원이 각자 답했다. 메시지가 입장 한 번에 (사람 수)² 건 나가서,
//  30명이 차례로 들어오는 측정에서 29명이 끊겼다. "들어올 때 한 번씩이라 부담은 없다"고
//  봤던 것이 틀렸다. 지금은 스냅샷 한 번에 (1 + 사람 수) 건이다.
//
//  대표는 뽑는 절차 없이 각자 계산한다(joinLogic.ts). 대표가 나가면 다음 사람이 저절로 대표가 된다.
//  스냅샷이 유실되거나 대표의 탭이 느려도 RESEND_IDLE_MS(2초) 재전송이 받쳐 준다.
//
//  presence 의 join 에서도 같은 일을 한다. 둘 중 하나가 늦거나 유실돼도
//  나머지가 받쳐 주도록 일부러 두 군데에 둔다.
//
// ── 끊겼을 때 ────────────────────────────────────────────────────────
//
//  방 연결은 한도 초과(서버가 방을 닫음), 인터넷 끊김, 시간 초과로 끊길 수 있다.
//  라이브러리에 맡기면 서버가 닫은 방은 다시 안 붙고, 나머지는 전원이 같은 때에 다시 붙어
//  한도에 또 걸린다. 그래서 끊기면 그 채널을 버리고, 무작위로 기다렸다가 새 채널로 입장 절차를
//  처음부터 다시 한다(reconnectLogic.ts). 끊긴 동안 받은 위치(moves)는 들고 있고,
//  소식이 STALE_MS 넘게 없는 사람은 평소처럼 지운다.
//
//  끊긴 동안은 아무것도 보내지 않는다. 안 그러면 channel.send 가 알아서 HTTP 로 바꿔 보내서 메시지가 샌다.
//  끊긴 동안 화면 안내는 ConnectionNotice 가 띄운다(보기 전용 연결은 제외).
//  브라우저의 offline·online 신호도 받아, 인터넷이 끊기면 안내를 바로 띄우고 돌아오면 바로 다시 붙는다.
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
//
// ── 연결 바꿔 끼우기 (#451, #464) ────────────────────────────────────
//
//  VITE_RELAY_URL 이 있으면 공개 방의 연결만 중계 서버로 바꾼다(relayLink.ts). 없으면 위 설명 그대로 Supabase 다.
//  회의(비공개 방)는 참석자 확인을 DB 정책이 하므로 값이 있어도 Supabase 에 남는다. 음성 신호·채팅은 회의에서만 쓰므로 같이 남는다.
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { supabase } from '../lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import { onMyProfileChanged } from '../profile/characters'
import { PROFILE_RETRY_MS, CHAT_EVENT, FLICK_EVENT, HELLO_EVENT, MOVE_EVENT, PROFILE_EVENT, RESEND_IDLE_MS, SEND_INTERVAL_MS, SIGNAL_EVENT, SNAPSHOT_EVENT, SNAPSHOT_WAIT_MS, STALE_MS } from './participants'
import type { ChatPort, FlickPort, Participant, PresenceState, SignalPort } from './participants'
import { changedEnough, pack } from './sendLogic'
import { buildSnapshot, isRepresentative, unknownStates } from './joinLogic'
import { isDownStatus, nextFailures, reconnectDelay } from './reconnectLogic'
import { markDown, markUp } from './connectionStatus'
import { openSupabaseLink } from './roomLink'
import type { Presence, RoomLink } from './roomLink'
import { openRelayLink, relayUrl } from './relayLink'
import { avatarFromDb, avatarKey } from '../avatar/avatarLogic'

type AvatarRow = { id: string; nickname: string; avatar: unknown }
type Profile = { nickname: string; model: string }

// room: 실시간 방 이름. 지점은 channelName(지점 번호), 로비는 LOBBY_CHANNEL (#166), 회의는 meeting:회의번호 (#45)
// isPrivate: 비공개 방. 들어올 수 있는 사람을 DB 정책이 정합니다(회의는 그 회의 참석자만, 0021).
// signalRef: 같은 방으로 음성 연결 신호도 주고받을 때 (회의실 음성, #46)
// chatRef: 같은 방으로 채팅도 주고받을 때 (회의 채팅, #298)
// client: 실시간 연결. 기본은 supabase, 지점 통창에서 광장을 보기만 할 때는 watchSupabase (닉네임·캐릭터는 늘 supabase 로 읽음)
export function useParticipants(
  room: string,
  me: RefObject<PresenceState | null>,
  isPrivate = false,
  signalRef?: RefObject<SignalPort>,
  chatRef?: RefObject<ChatPort>,
  client: SupabaseClient = supabase,
  flickRef?: RefObject<FlickPort>, // 딱밤 통로 (지점·광장, #304)
) {
  const [others, setOthers] = useState<Participant[]>([])
  // 한 번 읽은 닉네임·캐릭터는 들고 있는다. 사람이 들어올 때만 더 읽는다.
  const profiles = useRef(new Map<string, Profile>())

  useEffect(() => {
    let alive = true
    let channel: RoomLink | null = null // 지금 쓰는 채널. 끊겨서 다시 붙을 때까지는 null
    const port = signalRef?.current // 음성 연결 신호 통로 (회의실만)
    const chatPort = chatRef?.current // 채팅 통로 (회의실만)
    const flickPort = flickRef?.current // 딱밤 통로 (지점·광장)
    // 끊김 안내에 적을 표. 보기 전용 연결은 안내를 띄우지 않는다.
    const noticeToken = client === supabase ? {} : null

    const members = new Map<string, number | undefined>() // presence 로 받은 "지금 여기 있는 사람"과 들어온 시각
    const moves = new Map<string, PresenceState>() // broadcast 로 받은 위치
    const lastHeard = new Map<string, number>() // 마지막으로 소식을 들은 시각

    let profileLoad: Promise<void> | null = null // 지금 진행 중인 읽기. 위치가 올 때마다 새로 읽지 않고 이것을 기다린다.
    let profileRetryAt = 0 // 읽기에 실패하면 이때까지 다시 읽지 않는다
    const profileFailed = new Set<string>() // 못 읽은 사람. 이름 없이("…")라도 화면에 그린다.

    async function loadProfiles(ids: string[]) {
      const { data, error } = await supabase
        .from('avatars')
        .select('id, nickname, avatar')
        .in('id', ids)
      if (error) console.error('참여자 정보를 불러오지 못했습니다:', error.message)
      for (const row of (data ?? []) as AvatarRow[]) {
        profiles.current.set(row.id, {
          nickname: row.nickname,
          model: avatarKey(avatarFromDb(row.avatar)), // 고른 차림 (#56). 예전 {model} 은 기본 차림
        })
      }
      // 끊겼거나 행이 없으면 간격을 두고 다시 읽는다. 위치가 올 때마다 다시 읽으면 요청이 쏟아진다.
      const failed = ids.filter((id) => !profiles.current.has(id))
      for (const id of ids) profileFailed.delete(id)
      for (const id of failed) profileFailed.add(id)
      if (failed.length > 0) profileRetryAt = Date.now() + PROFILE_RETRY_MS
    }

    // 아직 모르는 사람의 닉네임·캐릭터를 한 번에 읽어 온다.
    function fillProfiles(ids: string[]): Promise<void> {
      if (profileLoad) return profileLoad
      if (Date.now() < profileRetryAt) return Promise.resolve()
      const missing = ids.filter((id) => !profiles.current.has(id))
      if (missing.length === 0) return Promise.resolve()
      profileLoad = loadProfiles(missing).finally(() => {
        profileLoad = null
        rebuild() // 읽는 동안 새로 온 사람이 있으면 이어서 읽는다
      })
      return profileLoad
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
        // 기다리는 사이 나간 사람은 빼고, 아직 읽는 중인 사람은 기본 캐릭터로 잠깐 보이지 않게 뺀다.
        const visible = ids.filter((id) => moves.has(id) && (profiles.current.has(id) || profileFailed.has(id)))
        setOthers(
          visible.map((id) => {
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
      if (!channel) return
      members.clear()
      for (const s of channel.members()) {
        if (!s.userId) continue
        // 같은 계정이 둘 이상이면 더 이른 시각을 쓴다.
        const seen = members.get(s.userId)
        members.set(s.userId, seen === undefined || (s.at ?? Infinity) < seen ? s.at : seen)
      }
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
    let joinedAt = 0 // 이 방에 들어온 시각. presence 에 실어 대표를 정하는 데 쓴다.
    let helloSaid = false
    let snapshotTimer: ReturnType<typeof setTimeout> | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let connectedAt = 0 // 연결된 시각. 끊겨 있으면 0
    let failures = 0 // 연속으로 끊긴 횟수

    // 지금 내 상태를 한 번 보낸다. 값이 그대로여도 보낸다.
    function sendNow() {
      const state = me.current
      if (!subscribed || !state) return
      lastSent = state
      lastSentAt = Date.now()
      void channel?.send(MOVE_EVENT, pack(state))
    }

    // 들어왔다고 알린다. 대표가 방 전체 위치로 답해 준다. 한 번만 보낸다.
    function sayHello() {
      const id = me.current?.userId
      if (!subscribed || !id || helloSaid) return
      helloSaid = true
      void channel?.send(HELLO_EVENT, { userId: id })
    }

    // 보기 전용 연결은 내 상태가 없어 대표가 되지 않는다.
    function amRepresentative() {
      const id = me.current?.userId
      return subscribed && id !== undefined && isRepresentative(id, members)
    }

    // 누가 들어왔다. 내가 대표면 잠깐 묶어서 방 전체 위치를 한 번 보낸다. 대표가 아니면 답하지 않는다.
    function replyToJoin() {
      if (snapshotTimer || !amRepresentative()) return
      snapshotTimer = setTimeout(() => {
        snapshotTimer = null
        const state = me.current
        if (!state || !amRepresentative()) return // 기다리는 동안 대표가 바뀌었으면 그쪽이 답한다
        const states = buildSnapshot(pack(state), moves, lastHeard, Date.now(), STALE_MS)
        void channel?.send(SNAPSHOT_EVENT, { states })
      }, SNAPSHOT_WAIT_MS)
    }

    // 받은 메시지를 이름별로 처리한다.
    function receive(event: string, payload: unknown) {
      if (event === HELLO_EVENT) {
        // 누가 막 들어왔다. 기다리게 하지 않고 대표가 방 전체 위치를 알려 준다.
        const who = (payload as { userId?: string })?.userId
        if (!who || who === me.current?.userId) return
        replyToJoin()
      } else if (event === SNAPSHOT_EVENT) {
        const fresh = unknownStates(payload, me.current?.userId, moves)
        if (fresh.length === 0) return
        const now = Date.now()
        for (const state of fresh) {
          moves.set(state.userId, state)
          lastHeard.set(state.userId, now)
        }
        rebuild()
      } else if (event === PROFILE_EVENT) {
        // 누가 캐릭터·닉네임을 바꿨다. 들고 있던 값을 버리고 DB 에서 다시 읽는다.
        const who = (payload as { userId?: string })?.userId
        if (!who || who === me.current?.userId) return
        profiles.current.delete(who)
        rebuild()
      } else if (event === SIGNAL_EVENT) {
        // 음성 연결 신호. 나에게 온 것만 넘긴다.
        const p = payload as { from?: string; to?: string; data?: unknown } | null
        if (!port || !p?.from || p.to !== me.current?.userId) return
        port.receive(p.from, p.data)
      } else if (event === CHAT_EVENT) {
        // 회의 채팅. 받은 그대로 넘기고, 글자 확인은 채팅 쪽(ChatProvider)이 한다.
        const from = (payload as { from?: unknown } | null)?.from
        if (!chatPort || typeof from !== 'string' || from === me.current?.userId) return
        chatPort.receive(from, payload)
      } else if (event === FLICK_EVENT) {
        // 딱밤. 누가 누구에게 보냈는지만 넘기고, 받아들일지는 딱밤 쪽(useFlick)이 확인한다.
        const p = payload as { from?: unknown; to?: unknown } | null
        if (!flickPort || typeof p?.from !== 'string' || typeof p?.to !== 'string' || p.from === me.current?.userId) return
        flickPort.receive(p.from, p.to)
      } else if (event === MOVE_EVENT) {
        const state = payload as PresenceState
        if (!state?.userId || state.userId === me.current?.userId) return
        moves.set(state.userId, state)
        lastHeard.set(state.userId, Date.now())
        rebuild()
      }
    }

    // 방에 들어간다. 끊기면 새 연결로 여기를 다시 부른다.
    function connect() {
      const events = {
        onSync: readMembers,
        onJoin(newPresences: Presence[]) {
          readMembers()
          // 내가 들어온 알림이면 답할 일이 없다.
          const mine = me.current?.userId
          if (newPresences.some((p) => p.userId && p.userId !== mine)) replyToJoin()
        },
        onLeave(leftPresences: Presence[]) {
          readMembers()
          // 다시 연결한 사람은 새 입장 뒤에 예전 연결의 leave 가 올 수 있다. 아직 목록에 있으면 나간 게 아니다.
          for (const p of leftPresences) if (!p.userId || !members.has(p.userId)) dropGone(p.userId)
        },
        onMessage: receive,
        onStatus(status: string) {
          if (!alive || ch !== channel) return // 정리했거나 이미 버린 채널의 알림
          if (status === 'SUBSCRIBED') joined(ch)
          else if (isDownStatus(status)) disconnected(ch)
        },
      }
      const relay = isPrivate ? undefined : relayUrl()
      const ch = relay ? openRelayLink(relay, room, events) : openSupabaseLink(client, room, isPrivate, events)
      channel = ch
      ch.open()
    }

    // 방에 들어왔다. 처음과 다시 연결했을 때 모두 같은 입장 절차를 밟는다.
    function joined(ch: RoomLink) {
      subscribed = true
      connectedAt = Date.now()
      if (noticeToken) markUp(noticeToken)
      helloSaid = false
      if (port) {
        port.send = (to, data) => {
          const from = me.current?.userId
          if (from) void ch.send(SIGNAL_EVENT, { from, to, data })
        }
      }
      if (flickPort) {
        flickPort.send = (to) => {
          const from = me.current?.userId
          if (from) void ch.send(FLICK_EVENT, { from, to })
        }
      }
      if (chatPort) {
        chatPort.send = async (text) => {
          const from = me.current?.userId
          if (!from) return false
          return (await ch.send(CHAT_EVENT, { from, text })) === 'ok'
        }
      }
      const id = me.current?.userId
      // 다시 연결하면 시각을 새로 잡는다. 끊긴 동안의 소식을 모르는 사람이 대표가 되지 않게 하려는 것이다.
      joinedAt = Date.now()
      // presence 는 "누가 있는지"와 들어온 시각만 담는다. 들어올 때 한 번이면 된다.
      if (id) ch.track({ userId: id, at: joinedAt })
      sendNow()
      sayHello()
    }

    // 끊겼다. 끊긴 동안은 보내지 않고, 간격을 두고 새 채널로 다시 들어간다.
    // 쓰던 채널은 바로 버린다. 그냥 두면 라이브러리가 저 혼자 다시 붙어 무작위로 기다리는 의미가 없다.
    function disconnected(ch: RoomLink) {
      failures = nextFailures(failures, connectedAt ? Date.now() - connectedAt : 0)
      connectedAt = 0
      subscribed = false
      channel = null
      members.clear()
      closePorts()
      if (noticeToken) markDown(noticeToken)
      if (snapshotTimer) clearTimeout(snapshotTimer)
      snapshotTimer = null
      ch.discard()
      retryTimer = setTimeout(connect, reconnectDelay(failures, Math.random()))
    }

    // 끊겨 있는 동안 음성 신호·채팅·딱밤을 보내지 못하게 한다. 쓰는 쪽은 null 을 "아직 방에 없음"으로 안다.
    function closePorts() {
      if (port) port.send = null
      if (chatPort) chatPort.send = null
      if (flickPort) flickPort.send = null
    }

    // 브라우저가 인터넷이 끊겼다고 알리면 안내를 바로 띄운다. 연결이 끊긴 것을 라이브러리가 아는 데는 최대 50초쯤 걸린다.
    function wentOffline() {
      if (noticeToken) markDown(noticeToken)
    }
    // 인터넷이 돌아오면 길어진 대기를 건너뛰고 첫 재시도 간격으로 다시 붙는다. 연결이 살아 있었으면 안내만 내린다.
    function cameOnline() {
      if (subscribed) {
        if (noticeToken) markUp(noticeToken)
      } else if (!channel && retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = setTimeout(connect, reconnectDelay(1, Math.random()))
      }
    }
    window.addEventListener('offline', wentOffline)
    window.addEventListener('online', cameOnline)

    connect()

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
    // 다시 시도하는 것은 track 뿐이다. hello 는 아직 못 보냈을 때 한 번만 보낸다(sayHello).
    // 반복하면 그때마다 스냅샷이 나가 메시지가 는다.
    const joinTimer = setInterval(() => {
      const id = me.current?.userId
      if (!subscribed || !id || members.has(id)) return
      channel?.track({ userId: id, at: joinedAt })
      sayHello()
    }, SEND_INTERVAL_MS)

    // 소식이 끊긴 사람을 치운다.
    const sweepTimer = setInterval(() => dropGone(), STALE_MS)

    // 내 프로필(캐릭터·닉네임)을 바꾸면 같은 지점 사람들에게 다시 읽어 달라고 알린다.
    const stopProfileListen = onMyProfileChanged(() => {
      const id = me.current?.userId
      if (!subscribed || !id) return
      void channel?.send(PROFILE_EVENT, { userId: id })
    })

    return () => {
      alive = false
      window.removeEventListener('offline', wentOffline)
      window.removeEventListener('online', cameOnline)
      clearInterval(timer)
      clearInterval(joinTimer)
      clearInterval(sweepTimer)
      if (snapshotTimer) clearTimeout(snapshotTimer)
      if (retryTimer) clearTimeout(retryTimer)
      stopProfileListen()
      closePorts()
      if (noticeToken) markUp(noticeToken)
      channel?.leave()
    }
  }, [room, me, isPrivate, signalRef, chatRef, client, flickRef])

  return others
}
