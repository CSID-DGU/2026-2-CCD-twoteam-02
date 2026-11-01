// 딱밤으로 깨우기 (#304). 지점·광장 화면이 같이 씁니다. 규칙은 flickLogic.ts
//
//   보내기  조준점이 가리키는 사람이 빨간불인 채 앉아 있는 친구이고 바로 옆(1.5m)이면 target 이 채워짐.
//           딱밤 키(기본 Q)를 누르면 실시간 방에 신호를 보내고, 내 캐릭터가 딱밤 동작(감정표현 'flick')을 합니다.
//           같은 사람에게는 30초에 한 번(cooling 동안은 안내에서 빠짐)
//   받기    나에게 온 신호는 친구인지·보낸 사람이 내 둘레에 있는지·내가 빨간불인지·받기를 켰는지 다시 확인하고(acceptFlick),
//           받아들이면 hit 을 채웁니다 → 화면이 흔들리고(useFlickShake) "딱!" 소리, "○○님이 딱밤으로 깨웠어요" 문구
//   말풍선  방 안 누구든 신호를 보면 맞은 사람 머리 위에 "딱!"을 1초 띄웁니다(pops). 보낸 나도 보이게 직접 넣습니다
// 신호는 DB 에 저장하지 않습니다. 타이머·집중 판정에는 영향이 없습니다.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useFriends } from './useFriends'
import { relationOf } from './friendsLogic'
import { FLICK, acceptFlick, canFlick, shakeOffset } from './flickLogic'
import { playFlickSound } from './flickSound'
import { getFlickReceiving } from '../menu/flickSetting'
import { getKeymap } from '../menu/keymap'
import { requestEmote } from '../space/emotes'
import type { EmoteState } from '../space/emotes'
import type { AimTarget } from '../space/aimLogic'
import type { Spot } from '../space/layout'
import type { FlickPort, Participant, PresenceState } from '../realtime/participants'

type Args = {
  myId: string | undefined
  others: Participant[]
  spots: Spot[] // 앉은 사람 자리 (그 사람이 어디 있는지)
  me: RefObject<PresenceState | null> // 내 상태(빨간불인지)와 위치
  port: RefObject<FlickPort> // useParticipants 에 같이 넘긴 통로
  aim: AimTarget | null // 조준점이 가리키는 것 (사람이면 바로 옆인지 close 도)
  emoteRef: RefObject<EmoteState>
  disabled: boolean // 창이 떠 있거나 내가 앉아 있으면 보내지 않음
}

export type FlickTargetView = { id: string; name: string }

// 그 사람이 지금 있는 자리: 앉았으면 그 의자, 아니면 보내온 위치
const placeOf = (p: Pick<PresenceState, 'x' | 'z' | 'seat'>, spots: Spot[]) => {
  const s = p.seat === null ? undefined : spots.find((x) => x.no === p.seat)
  return s ? { x: s.x, z: s.z } : { x: p.x, z: p.z }
}

// 통로가 받은 신호를 넘길 곳 (화면을 떠나면 빈 함수로)
function bindReceive(port: FlickPort, receive: FlickPort['receive']) {
  port.receive = receive
}

export function useFlick({ myId, others, spots, me, port, aim, emoteRef, disabled }: Args) {
  const { list } = useFriends(myId)
  const [pops, setPops] = useState<ReadonlySet<string>>(new Set()) // 머리 위 "딱!" 말풍선을 띄울 사람
  const [hit, setHit] = useState<{ name: string; at: number } | null>(null) // 내가 맞음
  const [cooling, setCooling] = useState<ReadonlySet<string>>(new Set()) // 방금 보내서 30초 기다리는 사람
  const lastSent = useRef(new Map<string, number>())
  const lastHit = useRef(new Map<string, number>())
  const latest = useRef({ others, spots, list }) // 신호·키를 받는 함수가 읽을 최신 값 (그릴 때가 아니라 effect 에서 넣음)
  useEffect(() => {
    latest.current = { others, spots, list }
  }, [others, spots, list])

  const pop = useCallback((id: string) => {
    setPops((s) => new Set(s).add(id))
    window.setTimeout(() => setPops((s) => {
      const n = new Set(s)
      n.delete(id)
      return n
    }), FLICK.popMs)
  }, [])

  // 보낼 수 있는 상대 (조준한 사람). 대기 시간은 cooling 으로 따로 봄
  const aimed = aim?.kind === 'person' ? others.find((p) => p.userId === aim.id) : undefined
  const close = aim?.kind === 'person' && aim.close === true
  const ok =
    !!aimed && !!myId && !disabled && !cooling.has(aimed.userId) &&
    canFlick({ friend: relationOf(list, myId, aimed.userId) === 'friend', seated: aimed.seat !== null, status: aimed.status, receiving: !aimed.nf, close }, 0)
  const target: FlickTargetView | null = ok && aimed ? { id: aimed.userId, name: aimed.nickname } : null

  // 딱밤 키
  const targetRef = useRef<FlickTargetView | null>(null)
  useEffect(() => {
    targetRef.current = target
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.code !== getKeymap().flick) return
      const t = targetRef.current
      const send = port.current?.send
      if (!t || !send) return
      const now = Date.now()
      const last = lastSent.current.get(t.id)
      if (last !== undefined && now - last < FLICK.cooldownMs) return
      lastSent.current.set(t.id, now)
      send(t.id)
      if (emoteRef.current) requestEmote(emoteRef.current, 'flick')
      pop(t.id)
      setCooling((s) => new Set(s).add(t.id))
      window.setTimeout(() => setCooling((s) => {
        const n = new Set(s)
        n.delete(t.id)
        return n
      }), FLICK.cooldownMs)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [port, emoteRef, pop])

  // 받기
  useEffect(() => {
    const p = port.current
    if (!p) return
    bindReceive(p, (from, to) => {
      if (to !== myId) {
        pop(to) // 다른 사람이 맞음: 말풍선만
        return
      }
      const mine = me.current
      const { others: people, spots: places, list: friends } = latest.current
      const sender = people.find((x) => x.userId === from)
      if (!mine || !myId) return
      const at = sender ? placeOf(sender, places) : null
      const here = placeOf(mine, places)
      const now = Date.now()
      const ok = acceptFlick(
        { fromFriend: relationOf(friends, myId, from) === 'friend', dist: at ? Math.hypot(at.x - here.x, at.z - here.z) : null, myStatus: mine.status, receiving: getFlickReceiving() },
        now,
        lastHit.current.get(from),
      )
      if (!ok) return
      lastHit.current.set(from, now)
      playFlickSound()
      setHit({ name: sender?.nickname ?? '친구', at: now })
      window.setTimeout(() => setHit((h) => (h && h.at === now ? null : h)), FLICK.toastMs)
    })
    return () => bindReceive(p, () => {})
  }, [port, myId, me, pop])

  return { target, pops, hit }
}

// 맞은 화면 흔들기: 3D 화면을 감싼 상자를 shakeOffset 만큼 옮겼다가 제자리로. hitAt 이 바뀔 때마다 한 번
export function useFlickShake(hitAt: number | null) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    if (hitAt === null || !el) return
    const start = performance.now()
    let raf = 0
    const tick = () => {
      const t = performance.now() - start
      const o = shakeOffset(t)
      el.style.transform = t < FLICK.shakeMs ? `translate(${o.x}px, ${o.y}px)` : ''
      if (t < FLICK.shakeMs) raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelAnimationFrame(raf)
      el.style.transform = ''
    }
  }, [hitAt])
  return box
}
