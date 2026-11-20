// 바로 앉기 (#116)의 훅과 요청 저장소. 순수 계산은 quickSeatLogic.ts 에 있습니다.
//
//   requestQuickSeat / useGoQuickSeat  "그 공간에 도착하면 빈자리에 앉기" 요청을 남기고 주소를 옮깁니다.
//                  화면을 옮겨도 남도록 모듈 안 저장소에 둡니다(친구 따라가기 useFollow 와 같은 방식). REQUEST_TTL_MS 가 지나면 버립니다.
//   useQuickSeatArrival  광장·지점 화면이 씁니다. 요청이 이 공간 것이면 빈자리 하나를 골라 DB 에 잡고(claim),
//                  내 캐릭터를 그 자리로 옮깁니다(Player 의 teleportRef). 자리 앞에 서면 Player 가 E 없이 앉힙니다(sitRef).
//                  같은 순간 다른 사람이 앉아 거절되면 다른 자리로 몇 번 더 해 봅니다.
//   useOutsideSeated  바깥 공부 자리(벤치·캠프파이어·빈백·비치체어)에 지금 앉은 좌석 번호를 DB 에서 읽습니다. 고르는 창의 인원 표시용.
//   useFavoritePlace  내 최애 공간(profiles.favorite_place)을 읽고 바꿉니다. 한 번 읽은 값은 화면을 옮겨도 기억합니다.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { RefObject } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useSession } from '../auth/useSession'
import { MAX_SEAT_TRIES, REQUEST_TTL_MS, pickSpot } from './quickSeatLogic'
import type { QuickPlace } from './quickSeatLogic'
import type { Teleport } from '../friends/useFollow'
import { useMyChannel } from '../realtime/myChannel'

// ── 요청 저장소 ─────────────────────────────────────────────
type Request = { key: string; at: number }
let request: Request | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const requestQuickSeat = (key: string) => {
  request = { key, at: Date.now() }
  emit()
}
export const takeQuickSeat = () => {
  request = null
  emit()
}
export const useQuickSeatRequest = () => useSyncExternalStore(subscribe, () => request)

// 공간으로 가기. 이미 그 공간이면 주소는 그대로 두고 지금 화면이 요청을 받습니다.
export function useGoQuickSeat() {
  const navigate = useNavigate()
  const location = useLocation()
  return (place: QuickPlace) => {
    requestQuickSeat(place.key)
    if (location.pathname + location.search !== place.route) navigate(place.route)
  }
}

// ── 도착해서 앉기 ───────────────────────────────────────────
type SpotLike = { no: number; x: number; z: number; rot: number }
type Arrival<T extends SpotLike> = {
  // 이 화면이 받는 공간 이름 → 그 공간의 지금 비어 있는 공부 자리(Player 의 자리 번호 기준).
  // 지점은 { [slug]: 빈자리 }, 캠리단길은 { plaza: 벤치 빈자리, 'plaza-campfire': 통나무 빈자리 }
  spots: Record<string, T[]>
  ready: boolean // 자리를 잡을 수 있는 상태인지 (채널 배정 끝, 지점 번호 읽음, PC 화면)
  seatNoOf?: (spotNo: number) => number // Player 자리 번호 → DB 좌석 번호. 지점은 같고 바깥 벤치는 다릅니다
  claim: (seatNo: number, spotNo: number) => Promise<boolean> // DB 에 자리 잡기 (useCafeSeat.claim)
  teleportRef: RefObject<Teleport | null>
  onResult: (ok: boolean) => void // 앉았으면 true, 빈자리를 못 잡았으면 false (안내용)
}

export function useQuickSeatArrival<T extends SpotLike>({ spots, ready, seatNoOf, claim, teleportRef, onResult }: Arrival<T>) {
  const req = useQuickSeatRequest()
  // 매 렌더 바뀌는 값은 ref 로 들고, 요청·준비 상태가 바뀔 때만 움직입니다.
  const latest = useRef({ spots, seatNoOf, claim, onResult })
  useEffect(() => {
    latest.current = { spots, seatNoOf, claim, onResult }
  })
  const busy = useRef(false)
  const mine = req !== null && req.key in spots // 이 화면이 받는 요청인지

  useEffect(() => {
    if (!req || !mine || !ready || busy.current) return
    takeQuickSeat()
    if (Date.now() - req.at > REQUEST_TTL_MS) return
    busy.current = true
    const free = latest.current.spots[req.key] ?? []
    void (async () => {
      const tried = new Set<number>()
      for (let i = 0; i < MAX_SEAT_TRIES; i++) {
        const spot = pickSpot(free, tried)
        if (!spot) break
        tried.add(spot.no)
        const seatNo = (latest.current.seatNoOf ?? ((n: number) => n))(spot.no)
        if (await latest.current.claim(seatNo, spot.no)) {
          teleportRef.current = { x: spot.x, z: spot.z, heading: spot.rot }
          busy.current = false
          latest.current.onResult(true)
          return
        }
      }
      busy.current = false
      latest.current.onResult(false)
    })()
  }, [req, mine, ready, teleportRef])
}

// ── 바깥 자리에 앉은 사람 ───────────────────────────────────
// 접속 상태(online)는 "어느 월드에 있는지"만 알려 줘서, 돌아다니는 사람과 앉은 사람을 구분하지 못합니다.
// 그래서 바깥 공부 자리의 인원은 DB 의 이용 중인 좌석(occupied_seat_numbers, 0067)으로 셉니다. 좌석은 채널마다 따로라 내 채널 것만 봅니다.
// slugs: DB 지점 slug (plaza·campus·beach). refresh: 값이 바뀔 때마다 다시 읽습니다(고르는 창을 열 때).
// 결과는 { slug: 이용 중인 좌석 번호 }. 아직 못 읽었거나 실패한 지점은 빠져 있습니다.
let outsideIds: Map<string, number> | null = null // slug → 지점 번호. 바뀌지 않으므로 한 번만 읽습니다

export function useOutsideSeated(slugs: string[], refresh: unknown): Record<string, number[]> {
  const channel = useMyChannel() ?? 1
  const [seated, setSeated] = useState<Record<string, number[]>>({})

  useEffect(() => {
    let alive = true
    void (async () => {
      if (!outsideIds) {
        const { data, error } = await supabase.from('branches').select('id, slug').in('slug', slugs)
        if (error) {
          console.error('바깥 자리 지점을 불러오지 못했습니다:', error.message)
          return
        }
        outsideIds = new Map((data ?? []).map((b) => [b.slug as string, b.id as number]))
      }
      const ids = outsideIds
      const rows = await Promise.all(
        slugs.map(async (slug): Promise<[string, number[]] | null> => {
          const id = ids.get(slug)
          if (id === undefined) return null
          const { data, error } = await supabase.rpc('occupied_seat_numbers', { p_branch_id: id, ...(channel > 1 ? { p_channel: channel } : {}) }) // 1채널은 예전 호출 그대로 (KioskScreen 과 같음)
          if (error) {
            console.error('바깥 자리 이용 현황을 불러오지 못했습니다:', error.message)
            return null
          }
          return [slug, (data ?? []) as number[]]
        }),
      )
      if (alive) setSeated(Object.fromEntries(rows.filter((r) => r !== null)))
    })()
    return () => {
      alive = false
    }
  }, [slugs, channel, refresh])

  return seated
}

// ── 최애 공간 ───────────────────────────────────────────────
type Mine = { userId: string; favorite: string | null }
let cached: Mine | null = null
const favListeners = new Set<() => void>()
const emitFav = () => favListeners.forEach((l) => l())
const subscribeFav = (l: () => void) => {
  favListeners.add(l)
  return () => favListeners.delete(l)
}

export function useFavoritePlace() {
  const { session } = useSession()
  const myId = session?.user.id
  const mine = useSyncExternalStore(subscribeFav, () => cached)

  useEffect(() => {
    if (!myId || (cached && cached.userId === myId)) return
    let alive = true
    supabase
      .from('profiles')
      .select('favorite_place')
      .eq('id', myId)
      .single()
      .then(({ data, error }) => {
        if (!alive) return
        // 42703: 칸이 없음(0069 실행 전). 최애 없음으로 두고 고르는 창을 띄웁니다
        if (error && error.code === '42703') console.warn('profiles.favorite_place 칸이 없어요. 0069 마이그레이션을 실행해 주세요.')
        else if (error) console.error('최애 공간을 불러오지 못했습니다:', error.message)
        const value = (data as { favorite_place?: unknown } | null)?.favorite_place
        cached = { userId: myId, favorite: typeof value === 'string' ? value : null }
        emitFav()
      })
    return () => {
      alive = false
    }
  }, [myId])

  // 저장(null 이면 지우기). 성공하면 '', 실패하면 안내문
  // 고른 값을 화면에 먼저 반영하고 DB 답을 기다립니다. 답이 늦으면 목록이 예전 값에 멈춰 있어 여러 번 누르게 되기 때문입니다.
  // 실패하면 되돌리되, 그 사이 다른 값을 또 골랐으면(cached 가 바뀜) 건드리지 않습니다.
  const save = useCallback(
    async (key: string | null) => {
      if (!myId) return '로그인이 필요합니다.'
      const before = cached
      const mine: Mine = { userId: myId, favorite: key }
      cached = mine
      emitFav()
      const { error } = await supabase.from('profiles').update({ favorite_place: key }).eq('id', myId)
      if (error) {
        if (cached === mine) {
          cached = before
          emitFav()
        }
        return `최애 공간을 저장하지 못했어요: ${error.message}`
      }
      return ''
    },
    [myId],
  )

  const ok = mine !== null && mine.userId === myId
  return { favorite: ok ? mine.favorite : null, loaded: ok, save }
}
