// 루프탑에서 보이는 바깥 (이끼 루프탑). 지점 화면(BranchScene) 안에 캠리단길·하늘·날씨를 루프탑 높이에 맞춰 같이 그립니다.
//
// 카페 통창(CafeWindows)은 거리를 따로 된 장면으로 그려 창에만 비추지만(지점 조명과 거리 빛이 섞이지 않게),
// 루프탑은 천장이 없는 바깥이라 거리와 같은 장면에 둡니다. 그래서 해·달·노을빛·밤 채움광이 루프탑 데크에도 그대로 비칩니다.
//
// 좌표: 루프탑 지점 크기가 건물 겉 크기와 같아 "지점 좌표 = 건물 지붕 좌표"입니다.
//   거리 좌표 → 지점 좌표 = 건물 가운데를 원점으로 옮기고(지붕 높이만큼 내림) 건물 방향만큼 거꾸로 돌림.
// 루프탑 건물의 지붕 소품은 지점 화면이 직접 그리므로 거리 쪽 건물에서는 뺍니다(Building deck={false}).
// 먼 도시(CitySkyline)는 광장·캠퍼스와 같은 것을 같은 자리(월드 가운데 둘레)에 둡니다.
import { useRef } from 'react'
import { buildingOf, roofTopOf } from './worldLogic'
import { computedOf, worldOfBranch } from './worldConfig'
import { Building, Fence, Ground, Lamps } from './WorldDecor'
import { Garden, GardenBenches, LushTrees } from './Garden'
import { Fountain } from './Fountain'
import { NightFill, StringLights } from './StreetLights'
import { WorldSky } from './WorldSky'
import { useWorldWeather } from './useWorldWeather'
import { StreetPeople } from './CafeWindows'
import { CitySkyline } from './CitySkyline'

export function RooftopWorld({ slug, showPeople }: { slug: string; showPeople: boolean }) {
  const world = worldOfBranch(slug)
  const c = computedOf(world)
  const b = buildingOf(c.placed, slug)
  const weather = useWorldWeather()
  const follow = useRef({ x: b?.spec.x ?? 0, z: b?.spec.z ?? 0 }) // 비·눈이 루프탑 둘레에 내림
  if (!b) return null
  const plaza = world.layout
  return (
    <group rotation-y={-b.angle}>
      <group position={[-b.spec.x, -roofTopOf(b), -b.spec.z]}>
        <WorldSky lamps={c.litLamps} weatherRef={weather} followRef={follow} />
        <Ground plaza={plaza} buildings={c.placed} />
        <Garden plaza={plaza} buildings={c.placed} />
        <Fence plaza={plaza} />
        {plaza.fountain && <Fountain fountain={plaza.fountain} />}
        <LushTrees trees={plaza.trees} />
        <GardenBenches benches={plaza.benches} />
        <Lamps lamps={plaza.lamps} />
        <StringLights plaza={plaza} />
        <NightFill />
        {c.placed.map((p) => (
          <Building key={p.slug} b={p} open near={false} deck={p.slug !== b.slug} />
        ))}
        <CitySkyline />
        {showPeople && <StreetPeople world={world} />}
      </group>
    </group>
  )
}
