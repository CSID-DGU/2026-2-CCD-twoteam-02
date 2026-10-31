// 친구 따라가기·부르기의 이동 (followLogic 참고). 버튼·채팅 줄과 광장·지점 화면을 잇습니다.
//
//   useGoToFriend  [따라가기]·[가기] → "이 친구 옆으로" 요청을 남기고(아래 저장소), 친구가 있는 장소 주소로 이동합니다.
//                  이미 같은 장소면 주소는 그대로 두고 지금 화면이 요청을 받습니다.
//   useFollowArrival  광장·지점 화면이 씁니다. 요청이 있으면 그 장소의 실시간 방에서 친구 위치를 기다렸다가(최대 3초)
//                  친구 옆 빈자리(besideSpot)로 내 캐릭터를 옮깁니다(Player 의 teleportRef). 못 찾으면 입구에 그대로 둡니다.
//
// 요청은 화면을 옮겨도 남도록 단축키 표(keymap.ts)처럼 모듈 안 저장소에 둡니다. REQUEST_TTL_MS 가 지나면 버립니다.
import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { RefObject } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ARRIVE_WAIT_MS, besideSpot, routeOfPlace } from './followLogic'
import type { Places } from './followLogic'
import { CAMPUS_PLACE, LOBBY_PLACE } from '../realtime/online'
import { useOnline } from '../realtime/onlineContext'
import { BRANCH_LAYOUTS } from '../space/branches'
import { CAMPUS_WORLD } from '../world/worldConfig'
import type { Box, Spot } from '../space/layout'
import type { Participant } from '../realtime/participants'

const REQUEST_TTL_MS = 30_000 // 이만큼 지난 요청은 버림 (도착한 화면이 늦게 떠도 엉뚱한 때 옮겨지지 않게)

export const PLACES: Places = {
  lobby: LOBBY_PLACE,
  campus: CAMPUS_PLACE,
  campusPath: CAMPUS_WORLD.path,
  isBranch: (place) => place in BRANCH_LAYOUTS,
}

export type FollowReason = 'follow' | 'summon' // 따라감 / 부름을 받고 감
export type Teleport = { x: number; z: number; heading: number }
type Request = { friendId: string; reason: FollowReason; at: number }

// ── 요청 저장소 ─────────────────────────────────────────────
let request: Request | null = null
let key = 0 // 요청할 때마다 올라감 (프로필·친구 창이 보고 닫힘)
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const take = () => {
  request = null
  emit()
}
const ask = (friendId: string, reason: FollowReason) => {
  request = { friendId, reason, at: Date.now() }
  key++
  emit()
}

// 따라가기 요청이 생기면 바뀌는 번호. 창(InfoPanel)이 바뀌면 닫힙니다.
export const useFollowKey = () => useSyncExternalStore(subscribe, () => key)

// 친구가 있는 곳으로 가기. 성공하면 '', 갈 수 없으면 안내문
export function useGoToFriend() {
  const online = useOnline()
  const navigate = useNavigate()
  const location = useLocation()
  return (friendId: string, reason: FollowReason): string => {
    const route = routeOfPlace(online.get(friendId)?.place, PLACES)
    if (!route) return '지금은 따라갈 수 없는 곳에 있어요. (회의 중이거나 공간 밖 화면)'
    ask(friendId, reason)
    if (location.pathname + location.search !== route) navigate(route)
    return ''
  }
}

// 그 사람이 갈 수 있는 곳에 있는지 (버튼을 보일지)
export function useCanReach() {
  const online = useOnline()
  return (userId: string) => routeOfPlace(online.get(userId)?.place, PLACES) !== null
}

type Arrival = {
  place: string // 이 화면의 장소. 바뀌면(지점 → 다른 지점) 그때부터 다시 기다림
  others: Participant[] // 이 장소의 다른 참여자
  spots: Spot[] // 앉은 사람의 자리 번호 → 위치
  obstacles: Box[]
  bounds: { w: number; d: number } // 공간 크기 (가운데 0, 0)
  teleportRef: RefObject<Teleport | null>
  // 옮겼으면 found=true(친구 닉네임과 함께), 못 찾아 입구에 그대로면 false
  onArrive: (friendId: string, reason: FollowReason, found: boolean, nickname?: string) => void
}

// 광장·지점 화면: 따라가기 요청이 있으면 친구 옆으로 옮깁니다.
export function useFollowArrival({ place, others, spots, obstacles, bounds, teleportRef, onArrive }: Arrival) {
  const req = useSyncExternalStore(subscribe, () => request)
  const mountedAt = useRef(0) // 이 장소에 들어온 시각 (친구 위치를 기다리는 시간은 이때부터)
  const arrive = useRef(onArrive)
  useEffect(() => {
    arrive.current = onArrive
  })
  useEffect(() => {
    mountedAt.current = Date.now()
  }, [place])

  useEffect(() => {
    if (!req) return
    const now = Date.now()
    if (now - req.at > REQUEST_TTL_MS) {
      take()
      return
    }
    const friend = others.find((p) => p.userId === req.friendId)
    if (friend) {
      const spot = friend.seat === null ? undefined : spots.find((s) => s.no === friend.seat)
      const at = spot ? { x: spot.x, z: spot.z } : { x: friend.x, z: friend.z }
      // 서 있으면 친구가 보는 쪽(앞)부터, 앉아 있으면 옆(앞은 책상)부터 빈자리를 찾음
      const to = besideSpot(at, obstacles, bounds, spot ? spot.rot + Math.PI / 2 : (friend.h ?? 0))
      take()
      if (to) teleportRef.current = to
      arrive.current(req.friendId, req.reason, to !== null, friend.nickname)
      return
    }
    // 아직 친구가 안 보이면 기다림. 이 화면이 뜬 때(또는 요청한 때)부터 ARRIVE_WAIT_MS 가 지나면 입구에 그대로
    const deadline = Math.max(req.at, mountedAt.current) + ARRIVE_WAIT_MS
    const timer = setTimeout(() => {
      take()
      arrive.current(req.friendId, req.reason, false)
    }, Math.max(0, deadline - now))
    return () => clearTimeout(timer)
  }, [req, others, spots, obstacles, bounds, teleportRef])
}
