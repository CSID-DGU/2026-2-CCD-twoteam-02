// 광장에서 가게 유리창으로 보이는 실제 실내와 안의 사람 (방법은 shopGlass.ts).
// 가게마다 그 지점 실내(BranchInterior)를 건물 자리에 맞춰 놓은 따로 된 장면을 둡니다. 캠리 스퀘어는 층마다 높이를 올려 쌓음.
// 안의 사람: 지점 실시간 방을 보기만 함(watchSupabase, 내 위치는 안 보냄). 집중 상태 표시등은 밖에서 안 보이게 끔.
// 광장(캠리단길)에서만 씁니다. 지점 안 통창으로 보이는 거리(CafeWindows)에는 두지 않습니다(창 속 창이 끝없이 이어지지 않게).
import { Fragment, useEffect, useMemo, useRef } from 'react'
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
import type { PresenceState } from '../realtime/participants'
import { watchSupabase } from '../lib/supabase'
import { FLOOR_H } from './cafeWindowLogic'
import { storiesOf } from './worldLogic'
import type { PlacedBuilding } from './worldLogic'
import type { WorldConfig } from './worldConfig'
import { placeShop, renderShops, shopView } from './shopGlass'

export function ShopInteriors({ world, placed, showPeople }: { world: WorldConfig; placed: PlacedBuilding[]; showPeople: boolean }) {
  const shops = useMemo(() => placed.filter((b) => b.spec.facade), [placed])
  const slugs = useMemo(() => shops.map((b) => b.slug), [shops])

  // 가게 자리 (화면에 보이는지·가까운지 판단용): 건물 상자 전체, 출입문 자리
  useEffect(() => {
    for (const b of shops) {
      const r = b.rect
      const top = FLOOR_H * storiesOf(b).length // 지붕 위 루프탑은 유리창이 없어 빼고
      placeShop(b.slug, new THREE.Box3(new THREE.Vector3(r.x - r.w / 2, 0, r.z - r.d / 2), new THREE.Vector3(r.x + r.w / 2, top, r.z + r.d / 2)), new THREE.Vector3(b.door.x, 1.5, b.door.z))
    }
  }, [shops])
  useFrame(({ gl, camera }) => renderShops(gl, camera, slugs), -1) // 화면 그리기 전에 (음수 순서라 자동 그리기는 그대로)

  return <>{shops.map((b) => <Fragment key={b.slug}>{createPortal(<ShopScene b={b} world={world} showPeople={showPeople} />, shopView(b.slug, b.spec.facade).scene)}</Fragment>)}</>
}

// 한 건물의 실내 (층마다). 지점 좌표 → 거리 좌표: 지점 출입문이 건물 출입문 자리에 오게 옮기고 건물 방향으로 돌림
function ShopScene({ b, world, showPeople }: { b: PlacedBuilding; world: WorldConfig; showPeople: boolean }) {
  return (
    <>
      {storiesOf(b).map((f) => {
        const layout = BRANCH_LAYOUTS[f.slug]
        // 출입문이 없는 위층(Cam Study Cafe 2층, 계단으로만 오감)은 같은 건물 1층 출입문 자리에 맞춰 놓음
        const door = layout?.door ?? BRANCH_LAYOUTS[b.floors[0].slug]?.door
        if (!layout || !door) return null
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
  const others = useParticipants(channelName(id), me, false, undefined, undefined, watchSupabase)
  const spots = useMemo(() => spotsOf(layout), [layout]) // 앉은 사람 자세
  return <OtherParticipants others={others} spots={spots} showStatus={false} />
}
