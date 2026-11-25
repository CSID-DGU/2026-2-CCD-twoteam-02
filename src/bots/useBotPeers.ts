// 이 장면에 있는 봇을 실제 참여자와 같은 모양으로 내보냅니다 (#50). 계산은 botLogic.ts 에 있습니다.
//
// 돌려주는 모양은 useParticipants 와 같습니다. 목록(others)은 봇이 들고 나거나 앉고 일어날 때만 바뀌고,
// 고개·눈·걷는 위치는 live 로 봇마다 따로 알립니다(liveStates.ts). 장면은 실제 참여자 목록에 이어 붙여 씁니다.
// 그래서 접속 인원, 빈자리 계산, 프로필 창, 조준, 딱밤이 사람과 똑같이 봇에도 적용됩니다.
import { useEffect, useRef, useState } from 'react'
import { createLiveStates } from '../realtime/liveStates'
import type { LiveStates } from '../realtime/liveStates'
import type { Participant } from '../realtime/participants'
import type { Spot } from '../space/layout'
import { avatarFromDb, avatarKey } from '../avatar/avatarLogic'
import { BOT_TICK_MS, botPresenceState } from './botLogic'
import type { P2 } from './botLogic'
import { useBotPresence } from './botStore'

const NO_ONE: Participant[] = []

export function useBotPeers({
  enabled,
  slug,
  spotOf,
  exit = null,
}: {
  enabled: boolean // 이 장면에 봇을 그릴지 (공부 장소이고 1채널이고 다른 참여자가 보이는 화면)
  slug: string // 이 장면의 DB 지점 slug (광장은 plaza)
  spotOf: (seatNumber: number) => Spot | undefined // DB 좌석 번호 → 이 장면의 자리
  exit?: P2 | null // 걸어 나가고 들어오는 곳 (지점은 입구). 없으면 자리 뒤
}): { others: Participant[]; live: LiveStates } {
  const presence = useBotPresence(enabled)
  const [live] = useState(createLiveStates)
  const [others, setOthers] = useState<{ key: string; list: Participant[] }>({ key: '', list: NO_ONE })
  const input = useRef({ presence, slug, spotOf, exit })
  useEffect(() => {
    input.current = { presence, slug, spotOf, exit }
  })

  useEffect(() => {
    if (!enabled) return
    const looks = new Map<string, string>() // 봇 → 차림 키 (한 번만 만듦)
    let shown = new Set<string>()
    const tick = () => {
      const { presence, slug, spotOf, exit } = input.current
      const serverNow = Date.now() + presence.offset
      const list: Participant[] = []
      for (const row of presence.rows) {
        if (row.slug !== slug || row.seat === null) continue
        const spot = spotOf(row.seat)
        if (!spot) continue
        const state = botPresenceState(row, spot, exit, serverNow)
        if (!state) continue
        let model = looks.get(row.id)
        if (!model) {
          model = avatarKey(avatarFromDb(row.avatar))
          looks.set(row.id, model)
        }
        live.set({ ...state, sampledAt: performance.now() }) // 걷는 동안 부드럽게 이어 그리도록 표본 시각을 붙임
        list.push({ ...state, nickname: row.nickname, model })
      }
      const ids = new Set(list.map((b) => b.userId))
      shown.forEach((id) => ids.has(id) || live.delete(id))
      shown = ids
      // 목록은 봇이 들고 나거나 앉고 일어날 때만 새로 만듭니다 (화면 전체를 다시 그리지 않게)
      const key = list.map((b) => `${b.userId}:${b.seat}:${b.status}`).join(',')
      setOthers((prev) => (prev.key === key ? prev : { key, list }))
    }
    const first = setTimeout(tick, 0)
    const timer = setInterval(tick, BOT_TICK_MS)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
      live.clear()
    }
  }, [enabled, live])

  return { others: enabled ? others.list : NO_ONE, live }
}
