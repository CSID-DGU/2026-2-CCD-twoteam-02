// 캠퍼스 원통 도서관 유리로 보이는 실제 실내와 안의 사람 (방법은 shopGlass.ts).
// 도서관 실내(BranchInterior)를 건물 자리에 맞춰 놓은 따로 된 장면을 둡니다.
// 안의 사람: 지점 실시간 방을 보기만 함(watchSupabase, 내 위치는 안 보냄). 집중 상태 표시등은 밖에서 안 보이게 끔.
// 광장(캠리단길) 가게 창은 밖에서 안이 보이지 않는 반사 유리(mirrorGlass)라 여기서 그리지 않습니다. 지점 안 통창으로 보이는 거리(CafeWindows·LibraryWindows)에는 두지 않습니다(창 속 창이 끝없이 이어지지 않게).
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { BranchLayout } from '../space/layout'
import { spotsOf } from '../space/layout'
import { BRANCH_LAYOUTS } from '../space/branches'
import { BranchInterior } from '../space/BranchInterior'
import { BaristaNpc } from '../space/BaristaNpc'
import { useBranchInfo } from '../space/useBranchInfo'
import { useParticipants } from '../realtime/useParticipants'
import { OtherParticipants } from '../realtime/OtherParticipants'
import { channelName } from '../realtime/participants'
import { useWatchRoom } from '../realtime/useChannel'
import type { PresenceState } from '../realtime/participants'
import { watchSupabase } from '../lib/supabase'
import { FLOOR_H } from './cafeWindowLogic'
import { storiesOf } from './worldLogic'
import type { PlacedBuilding } from './worldLogic'
import type { WorldConfig } from './worldConfig'
import { DRUM_GLASS, drumView, placeShop, renderShops } from './shopGlass'

// 밖에서 볼 때의 도서관 실내: 네모 벽·출입문은 유리를 가리므로 빼고, 둥근 벽은 안쪽 면만 + 맞은편 창은 빛나는 판으로 (창 안에 창을 그리지 않음)
// 지점마다 한 번만 만듦: 렌더마다 새 객체면 사람이 움직일 때마다 둥근 벽·위층 지오메트리를 다시 만들게 됨
const peekLayouts = new WeakMap<BranchLayout, BranchLayout>()
function peekLayout(l: BranchLayout): BranchLayout {
  let p = peekLayouts.get(l)
  if (!p) {
    p = { ...l, door: undefined, walls: [], theme: l.theme && { ...l.theme, round: l.theme.round && { ...l.theme.round, peek: true } } }
    peekLayouts.set(l, p)
  }
  return p
}

// 원통 도서관 안 사람들: 캠퍼스 어디에 있든 실시간 방을 붙들지 않게 문 가까이 있을 때만 구독 (m, 드나듦 경계에서 깜빡이지 않게 둘을 다르게)
const PEOPLE_RANGE = { enter: 35, leave: 45 }
// 문 앞을 스쳐 지나가기만 하면 구독하지 않는다. 안쪽 거리에 이만큼(초) 머물러야 구독을 시작한다. 멀어질 때는 바로 끊는다 (#442)
const NEAR_DWELL_S = 2
const NEAR_CHECK_S = 0.5
const camAt = new THREE.Vector3()
// 문 가까이 있는 가게 slug 모음. 가게 장면(createPortal) 안의 useFrame 은 처음 카메라를 들고 있어 움직여도 거리가 바뀌지 않으므로, 바깥 장면의 카메라로 잰다 (#442)
function useNearDoors(shops: PlacedBuilding[]): ReadonlySet<string> {
  const [near, setNear] = useState<ReadonlySet<string>>(() => new Set())
  const waited = useRef(Infinity) // 처음 프레임에 바로 한 번 확인
  const clock = useRef(0)
  const enteredAt = useRef(new Map<string, number>()) // 안쪽 거리에 처음 들어온 시각 (아직 구독 전인 가게만)
  useFrame(({ camera }, delta) => {
    clock.current += delta
    waited.current += delta
    if (waited.current < NEAR_CHECK_S) return
    waited.current = 0
    camera.getWorldPosition(camAt)
    const next = new Set<string>()
    for (const b of shops) {
      const range = PEOPLE_RANGE
      const d = Math.hypot(camAt.x - b.door.x, camAt.z - b.door.z) // 수평 거리 (위에서 보기 카메라 높이는 빼고)
      if (near.has(b.slug)) {
        if (d <= range.leave) next.add(b.slug)
        continue
      }
      if (d > range.enter) { enteredAt.current.delete(b.slug); continue }
      const since = enteredAt.current.get(b.slug) ?? clock.current
      enteredAt.current.set(b.slug, since)
      if (clock.current - since >= NEAR_DWELL_S) { next.add(b.slug); enteredAt.current.delete(b.slug) }
    }
    if (next.size !== near.size || [...next].some((s) => !near.has(s))) setNear(next)
  })
  return near
}

export function ShopInteriors({ world, placed, showPeople }: { world: WorldConfig; placed: PlacedBuilding[]; showPeople: boolean }) {
  const shops = useMemo(() => placed.filter((b) => b.spec.shape === 'drum'), [placed]) // 원통 도서관만 (광장 가게 창은 반사 유리)
  const slugs = useMemo(() => shops.map((b) => b.slug), [shops])

  // 도서관 자리 (화면에 보이는지·가까운지 판단용): 건물 상자 전체, 출입문 자리
  useEffect(() => {
    for (const b of shops) {
      const r = b.rect
      const facing = new THREE.Vector3(b.door.x - b.spec.x, 0, b.door.z - b.spec.z).normalize()
      const center = new THREE.Vector3(b.spec.x, 1.5, b.spec.z)
      placeShop(b.slug, new THREE.Box3(new THREE.Vector3(r.x - r.w / 2, 0, r.z - r.d / 2), new THREE.Vector3(r.x + r.w / 2, DRUM_GLASS.top, r.z + r.d / 2)), new THREE.Vector3(b.door.x, 1.5, b.door.z), facing, center)
    }
  }, [shops])
  useFrame(({ gl, camera }) => renderShops(gl, camera, slugs), -1) // 화면 그리기 전에 (음수 순서라 자동 그리기는 그대로)
  const near = useNearDoors(shops)

  return <>{shops.map((b) => <Fragment key={b.slug}>{createPortal(<ShopScene b={b} world={world} showPeople={showPeople && near.has(b.slug)} />, drumView(b.slug).scene)}</Fragment>)}</>
}

// 한 건물의 실내 (층마다). 지점 좌표 → 거리 좌표: 지점 출입문이 건물 출입문 자리에 오게 옮기고 건물 방향으로 돌림
// showPeople: 사람 보기를 켰고 문 가까이 있을 때만 참 (그때만 실시간 방을 구독)
function ShopScene({ b, world, showPeople }: { b: PlacedBuilding; world: WorldConfig; showPeople: boolean }) {
  return (
    <>
      {storiesOf(b).map((f) => {
        const real = BRANCH_LAYOUTS[f.slug]
        // 출입문이 없는 위층(Cam Study Cafe 2층, 계단으로만 오감)은 같은 건물 1층 출입문 자리에 맞춰 놓음
        const door = real?.door ?? BRANCH_LAYOUTS[b.floors[0].slug]?.door
        if (!real || !door) return null
        const drum = b.spec.shape === 'drum'
        const layout = drum ? peekLayout(real) : real
        return (
          <group key={f.slug} position={[b.door.x, (f.level - 1) * FLOOR_H, b.door.z]} rotation-y={b.angle}>
            <group position={[-door.x, 0, -door.z]}>
              <BranchInterior
                branch={layout}
                exitLabel={world.title}
                elevatorLabel={b.floors.length > 1 && layout.elevator ? `${f.level}F` : null}
                lights={f.level === 1} // 조명은 한 번만 (층마다 넣으면 겹쳐서 너무 밝음)
              />
              {showPeople && <ShopPeople slug={f.slug} layout={layout} />}
              {layout.barista && <BaristaNpc barista={layout.barista} />}
            </group>
          </group>
        )
      })}
    </>
  )
}

// 그 지점 안의 사람들 (DB 지점 번호로 실시간 방을 찾음)
function ShopPeople({ slug, layout }: { slug: string; layout: BranchLayout }) {
  const { info } = useBranchInfo(slug)
  return info ? <ShopPeopleIn id={info.id} layout={layout} /> : null
}
function ShopPeopleIn({ id, layout }: { id: number; layout: BranchLayout }) {
  const me = useRef<PresenceState | null>(null)
  const room = useWatchRoom(channelName(id)) // 내 채널의 가게 안을 본다 (#481)
  const { others, live } = useParticipants(room, me, false, undefined, undefined, watchSupabase)
  const spots = useMemo(() => spotsOf(layout), [layout]) // 앉은 사람 자세
  return <OtherParticipants others={others} live={live} spots={spots} showStatus={false} />
}
