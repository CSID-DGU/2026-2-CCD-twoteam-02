// 같은 지점에 있는 다른 참여자 목록. 실시간으로 갱신된다.
//
// 쓰는 쪽은 내 상태를 ref 로 넘긴다. 위치가 매 프레임 바뀌는데 그때마다 다시 그리면
// 화면이 느려지므로, 값을 직접 받지 않고 ref 를 0.1초마다 읽어서 보낸다.
// (src/focus/useFocusState.ts 가 얼굴 인식 결과를 받는 방식과 같다)
//
// 닉네임과 캐릭터는 Presence 가 아니라 DB(avatars 뷰)에서 읽는다. 이유는 participants.ts 참고.
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { supabase } from '../lib/supabase'
import { SEND_INTERVAL_MS, channelName } from './participants'
import type { Participant, PresenceState } from './participants'

type AvatarRow = { id: string; nickname: string; avatar: { model?: string } }

export function useParticipants(branchId: number, me: RefObject<PresenceState | null>) {
  const [others, setOthers] = useState<Participant[]>([])
  // 한 번 읽은 닉네임·캐릭터는 들고 있는다. 사람이 들어올 때만 더 읽는다.
  const profiles = useRef(new Map<string, { nickname: string; model: string }>())

  useEffect(() => {
    let alive = true
    const channel = supabase.channel(channelName(branchId), {
      config: { presence: { key: '' } }, // 키는 아래 track 에서 userId 로 정한다
    })

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

    // Presence 에 올라온 사람들을 모아 화면에 쓸 목록으로 만든다.
    function rebuild() {
      if (!alive) return
      const mine = me.current?.userId
      const states = Object.values(channel.presenceState<PresenceState>()).flat()
      const list = states.filter((s) => s.userId && s.userId !== mine)

      void fillProfiles(list.map((s) => s.userId)).then(() => {
        if (!alive) return
        setOthers(
          list.map((s) => {
            const p = profiles.current.get(s.userId)
            return { ...s, nickname: p?.nickname ?? '…', model: p?.model ?? 'a' }
          })
        )
      })
    }

    channel
      .on('presence', { event: 'sync' }, rebuild)
      .on('presence', { event: 'join' }, rebuild)
      .on('presence', { event: 'leave' }, rebuild)
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        const first = me.current
        if (first) void channel.track(first)
      })

    // 내 상태를 주기적으로 보낸다. 값이 그대로면 보내지 않는다.
    let last = ''
    const timer = setInterval(() => {
      const state = me.current
      if (!state) return
      // 위치는 소수점 둘째 자리까지면 충분하다. 쓸데없는 전송을 줄인다.
      const packed: PresenceState = {
        ...state,
        x: Math.round(state.x * 100) / 100,
        z: Math.round(state.z * 100) / 100,
      }
      const key = JSON.stringify(packed)
      if (key === last) return
      last = key
      void channel.track(packed)
    }, SEND_INTERVAL_MS)

    return () => {
      alive = false
      clearInterval(timer)
      void channel.unsubscribe()
    }
  }, [branchId, me])

  return others
}
