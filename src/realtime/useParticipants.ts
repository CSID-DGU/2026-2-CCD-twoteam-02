// 같은 지점에 있는 다른 참여자 목록. 실시간으로 갱신된다.
//
// 쓰는 쪽은 내 상태를 ref 로 넘긴다. 위치가 매 프레임 바뀌는데 그때마다 다시 그리면
// 화면이 느려지므로, 값을 직접 받지 않고 ref 를 주기적으로 읽어서 보낸다.
// (src/focus/useFocusState.ts 가 얼굴 인식 결과를 받는 방식과 같다)
//
// 두 가지를 나눠 쓴다. 이유는 participants.ts 머리말 참고.
//   presence  — 누가 있는지. 들어올 때 한 번만 track 한다.
//   broadcast — 어디에 있는지. 0.25초마다 보낸다.
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { supabase } from '../lib/supabase'
import { MOVE_EVENT, RESEND_IDLE_MS, SEND_INTERVAL_MS, STALE_MS, channelName } from './participants'
import type { Participant, PresenceState } from './participants'

type AvatarRow = { id: string; nickname: string; avatar: { model?: string } }
type Profile = { nickname: string; model: string }

export function useParticipants(branchId: number, me: RefObject<PresenceState | null>) {
  const [others, setOthers] = useState<Participant[]>([])
  // 한 번 읽은 닉네임·캐릭터는 들고 있는다. 사람이 들어올 때만 더 읽는다.
  const profiles = useRef(new Map<string, Profile>())

  useEffect(() => {
    let alive = true
    const channel = supabase.channel(channelName(branchId))

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
      // 위치는 소수점 둘째 자리까지면 충분하다. 쓸데없는 전송을 줄인다.
      const packed: PresenceState = {
        ...state,
        x: Math.round(state.x * 100) / 100,
        z: Math.round(state.z * 100) / 100,
      }
      lastSentKey = JSON.stringify(packed)
      lastSentAt = Date.now()
      void channel.send({ type: 'broadcast', event: MOVE_EVENT, payload: packed })
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
      })

    // 값이 바뀌었을 때 보내고, 그대로여도 가끔 한 번 보낸다.
    const timer = setInterval(() => {
      const state = me.current
      if (!subscribed || !state) return
      const packed = {
        ...state,
        x: Math.round(state.x * 100) / 100,
        z: Math.round(state.z * 100) / 100,
      }
      const key = JSON.stringify(packed)
      if (key === lastSentKey && Date.now() - lastSentAt < RESEND_IDLE_MS) return
      sendNow()
    }, SEND_INTERVAL_MS)

    // 구독이 끝난 뒤에야 내 상태(me.current)가 채워질 수 있다.
    // 그러면 위 subscribe 안의 track 이 건너뛰어지므로, 들어갈 때까지 다시 시도한다.
    const joinTimer = setInterval(() => {
      const id = me.current?.userId
      if (!subscribed || !id || members.has(id)) return
      void channel.track({ userId: id })
    }, SEND_INTERVAL_MS)

    // 소식이 끊긴 사람을 치운다.
    const sweepTimer = setInterval(() => dropGone(), STALE_MS)

    return () => {
      alive = false
      clearInterval(timer)
      clearInterval(joinTimer)
      clearInterval(sweepTimer)
      void channel.unsubscribe()
    }
  }, [branchId, me])

  return others
}
