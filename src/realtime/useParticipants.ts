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
import { HEADING_STEP, HELLO_EVENT, MOVE_EVENT, POSITION_STEP, PROFILE_EVENT, RESEND_IDLE_MS, SEND_INTERVAL_MS, STALE_MS } from './participants'
import type { ArmVector, Participant, PresenceState } from './participants'

type AvatarRow = { id: string; nickname: string; avatar: { model?: string } }
type Profile = { nickname: string; model: string }

// toFixed 로 0.30000000000000004 같은 소수 오차를 지워 메시지를 짧게 둔다.
const round = (value: number, step: number) => Number((Math.round(value / step) * step).toFixed(3))

// 보낼 값을 정한 단위로 줄인다. 아주 작은 흔들림으로 값이 바뀌어 매번 보내는 일을 막는다.
function pack(state: PresenceState): PresenceState {
  return {
    ...state,
    x: round(state.x, POSITION_STEP),
    z: round(state.z, POSITION_STEP),
    ...(state.h === undefined ? {} : { h: round(state.h, HEADING_STEP) }),
    ...(state.head === undefined ? {} : { head: state.head.map((a) => round(a, HEADING_STEP)) as [number, number, number] }),
    ...(state.arms === undefined ? {} : { arms: state.arms.map((v) => v && (v.map((a) => round(a, HEADING_STEP)) as ArmVector)) as PresenceState['arms'] }),
  }
}

// room: 실시간 방 이름. 지점은 channelName(지점 번호), 로비는 LOBBY_CHANNEL (#166)
// 빈 문자열이면 방에 들어가지 않습니다. 실험 B 조건(혼자 공부)은 남도 안 보이고 나도 안 보여야 해서
// 내 위치를 보내지도, 남의 위치를 받지도 않습니다. (#47, docs/사용자-실험-재설계.md)
export function useParticipants(room: string, me: RefObject<PresenceState | null>) {
  const [others, setOthers] = useState<Participant[]>([])
  // 한 번 읽은 닉네임·캐릭터는 들고 있는다. 사람이 들어올 때만 더 읽는다.
  const profiles = useRef(new Map<string, Profile>())

  useEffect(() => {
    if (!room) return
    let alive = true
    const channel = supabase.channel(room)

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
          model: row.avatar?.model ?? 'a',
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
    function dropGone(leftId?: string) {
      const now = Date.now()
      let changed = false
      for (const [id, last] of lastHeard) {
        if (id === leftId || now - last > STALE_MS) {
          moves.delete(id)
          lastHeard.delete(id)
          changed = true
        }
      }
      if (changed) rebuild()
    }

    let subscribed = false
    let lastSentKey = ''
    let lastSentAt = 0

    // 지금 내 상태를 한 번 보낸다. 값이 그대로여도 보낸다.
    function sendNow() {
      const state = me.current
      if (!subscribed || !state) return
      const packed = pack(state)
      lastSentKey = JSON.stringify(packed)
      lastSentAt = Date.now()
      void channel.send({ type: 'broadcast', event: MOVE_EVENT, payload: packed })
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
        const id = me.current?.userId
        // presence 는 "누가 있는지"만 담는다. 들어올 때 한 번이면 된다.
        if (id) void channel.track({ userId: id })
        sendNow()
        sayHello()
      })

    // 값이 바뀌었을 때 보내고, 그대로여도 가끔 한 번 보낸다.
    //
    // "값이 그대로면 안 보낸다" 가 트래픽을 아끼는 대신, 가만히 선 사람이
    // 남에게 늦게 보이는 원인이 된다. RESEND_IDLE_MS 가 그 최대 지연이다.
    const timer = setInterval(() => {
      const state = me.current
      if (!subscribed || !state) return
      const key = JSON.stringify(pack(state))
      if (key === lastSentKey && Date.now() - lastSentAt < RESEND_IDLE_MS) return
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
      void channel.unsubscribe()
    }
  }, [room, me])

  return others
}
