// 캠빛 중앙도서관 안: 둥근 벽 창으로 실제 캠퍼스가 보입니다 (하늘·날씨·시간·나무·건물, 걸으면 원근이 맞게 바뀜).
// 방법은 카페 통창과 같은 포털입니다(cafePortal.ts): 캠퍼스를 따로 된 장면으로 같이 두고, 곡면 유리가 그 그림에서 "화면의 자기 자리" 픽셀을 보여 줍니다.
//
// 맞추는 법: 카페처럼 도서관 출입문 ↔ 건물 출입문을 맞춰 놓습니다(buildingOf). 실내(반지름 9.6m)가 건물(6m)보다 커서 방은 건물 자리를 덮고 뒤로 더 나갑니다.
//   - 방 안에 있는 사람의 시선은 창을 지난 뒤 다시 방으로 들어오지 않으므로(원은 볼록) 창에 비치는 것은 언제나 벽 바깥입니다. 그래서 카페와 달리 자르기 면이 없습니다.
//   - 대신 도서관 건물 자체는 장면에서 뺍니다. 방 자리에 다른 큰 물체가 없다는 것은 campus.json 기준으로 확인했습니다 (가장 가까운 나무가 방 가운데에서 12m).
//   - 도서관 뒤쪽 창은 캠퍼스 땅 끝(울타리) 너머를 보므로 BEYOND 의 넓은 잔디와 나무로 채웁니다.
// 창이 화면에 하나도 없으면 캠퍼스를 그리지 않습니다(renderPortal). 이 장면에는 ShopInteriors 를 두지 않습니다(창 속 창이 끝없이 이어지지 않게).
import { useEffect, useMemo, useRef } from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ArcBuilder, windowBars } from '../space/arcGeometry'
import { LIB_TILE, plasterBump, plasterFine } from '../space/libraryTextures'
import { ROUND_WINDOW, roundWindowHoles } from '../space/theme'
import type { RoundRoom } from '../space/theme'
import { StreetPeople } from './CafeWindows'
import { disposePortal, portalMaterial, renderPortal, resizePortal } from './cafePortal'
import { PortalCamera } from './PortalCamera'
import type { Portal } from './cafePortal'
import { Beanbags, CampusBuildingTrim, GateBackdrop, Mats, UniversityGate } from './CampusDecor'
import { CampusCourt } from './CampusCourt'
import { MainGate } from './CampusHall'
import { CampusProps, GardenOrbs } from './CampusProps'
import { orbSpots } from './walkLogic'
import { SoccerPitch, Walks } from './CampusField'
import { CitySkyline } from './CitySkyline'
import { Garden, GardenBenches, LushTrees } from './Garden'
import { CampusTrees } from './CampusTrees'
import { LanternCourtyard } from './LanternTree'
import { Building, Fence, Ground, Lamps } from './WorldDecor'
import { WorldSky } from './WorldSky'
import { useWorldWeather } from './useWorldWeather'
import { computedOf, worldOfBranch } from './worldConfig'
import { buildingOf } from './worldLogic'
import { MAT } from './worldMaterials'
import { TILE, tiledPlane } from './worldTextures'

// 캠퍼스 땅 끝 너머 (도서관 뒤쪽 창에 보임): 넓은 잔디 + 건물 뒤 나무들 (캠퍼스 좌표. 방 가운데에서 12m 넘게 떨어진 곳)
const BEYOND = {
  ground: 240,
  y: -0.05,
  trees: [[-34, -36], [-26, -41], [-20, -36], [-14, -45], [-6, -47], [2, -44], [8, -39], [15, -43], [22, -36]].map(([x, z]) => ({ x, z })),
}
const FRAME_DEPTH = 0.08 // 창살 두께 (벽 방향)
const SILL_WIDE = 0.015 // 창턱이 창 양옆으로 더 나간 각도(라디안)
const SILL_BACK = 0.02 // 창턱이 벽 면 안으로 묻힌 길이(m)

export function LibraryWindows({ slug, round, doorX, doorZ, showPeople }: { slug: string; round: RoundRoom; doorX: number; doorZ: number; showPeople: boolean }) {
  const world = worldOfBranch(slug)
  const c = computedOf(world)
  const b = buildingOf(c.placed, slug)
  const plaza = world.layout
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const camera = useThree((s) => s.camera) // 화면 카메라 (포털 안 PortalCamera 에 넘김)
  const W = ROUND_WINDOW
  const paneR = round.r + W.reveal
  const holes = useMemo(() => roundWindowHoles(round), [round])

  // 창 하나하나의 자리: 화면에 보이는지 확인용 (곡면이라 네 귀퉁이를 다 넣은 상자)
  const portal = useMemo<Portal>(() => {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
    const windows = holes.map((h) => {
      const box = new THREE.Box3()
      for (const a of [h.a0, (h.a0 + h.a1) / 2, h.a1]) for (const r of [round.r, paneR]) for (const y of [h.y0, h.y1]) box.expandByPoint(new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r))
      return box
    })
    return { scene: new THREE.Scene(), views: [{ target, mat: portalMaterial(target.texture), windows }] }
  }, [holes, round.r, paneR])
  useEffect(() => resizePortal(portal, size.width, size.height, dpr), [portal, size, dpr])
  useEffect(() => () => disposePortal(portal), [portal])
  useFrame(({ gl, camera }) => renderPortal(gl, camera, portal), -1) // 화면 그리기 전에

  const geo = useMemo(() => {
    const pane = new ArcBuilder(1) // 유리 (안쪽을 봄)
    const plaster = new ArcBuilder(LIB_TILE.plaster) // 벽 두께 (창 구멍 안쪽 면)
    const frame = new ArcBuilder(1) // 창틀·창살·창턱
    for (const h of holes) {
      pane.band(paneR, h.a0, h.a1, h.y0, h.y1, true)
      plaster.reveal(h, round.r, paneR)
      windowBars(frame, h, paneR - W.reveal * 0.35, W.cols, W.rows, W.frame, FRAME_DEPTH)
      const inner = round.r - W.sill.out
      frame.ledge(inner, round.r + SILL_BACK, h.a0 - SILL_WIDE, h.a1 + SILL_WIDE, h.y0, true) // 방 쪽으로 나온 창턱
      frame.band(inner, h.a0 - SILL_WIDE, h.a1 + SILL_WIDE, h.y0 - W.sill.t, h.y0, true)
      frame.ledge(inner, round.r + SILL_BACK, h.a0 - SILL_WIDE, h.a1 + SILL_WIDE, h.y0 - W.sill.t, false)
    }
    return { pane: pane.build(), plaster: plaster.build(), frame: frame.build() }
  }, [holes, round.r, paneR, W])
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo])

  const weather = useWorldWeather()
  const follow = useRef({ x: b?.door.x ?? 0, z: b?.door.z ?? 0 }) // 비·눈이 따라올 자리 (창 앞)
  const others = useMemo(() => c.placed.filter((p) => p.slug !== slug), [c.placed, slug]) // 도서관 자신은 안 그림 (방이 그 자리에 있음)
  if (!b) return null

  return (
    <>
      {createPortal(
        // 캠퍼스 좌표 → 지점 좌표: 건물 출입문이 지점 출입문 자리에 오게 옮기고 돌림 (CafeWindows 와 같음)
        <group position={[doorX, 0, doorZ]} rotation-y={-b.angle}>
          <PortalCamera camera={camera} />
          <group position={[-b.door.x, 0, -b.door.z]}>
            <WorldSky lamps={c.litLamps} weatherRef={weather} followRef={follow} />
            <CitySkyline />
            <mesh rotation-x={-Math.PI / 2} position-y={BEYOND.y} material={MAT.grass} geometry={tiledPlane(BEYOND.ground, BEYOND.ground, TILE.grass)} />
            <LushTrees trees={BEYOND.trees} />
            <Ground plaza={plaza} buildings={others} />
            <Garden plaza={plaza} buildings={others} />
            <Fence plaza={plaza} />
            <CampusTrees trees={plaza.trees} />
            <GardenBenches benches={plaza.benches} />
            <Lamps lamps={plaza.lamps} />
            {plaza.walks && <Walks walks={plaza.walks} />}
            {plaza.court && <CampusCourt court={plaza.court} />}
            {plaza.mainGate && <MainGate gate={plaza.mainGate} />}
            {plaza.props && <CampusProps props={plaza.props} />}
            {plaza.walks && <GardenOrbs orbs={orbSpots(plaza)} />}
            {plaza.pitch && <SoccerPitch pitch={plaza.pitch} />}
            {plaza.rests && <Mats rests={plaza.rests} />}
            {plaza.courtyard && <LanternCourtyard courtyard={plaza.courtyard} />}
            {plaza.rests && <Beanbags rests={plaza.rests} />}
            {others.map((p) => (
              <group key={p.slug}>
                <Building b={p} open near={false} />
                {!p.spec.shape && <CampusBuildingTrim b={p} />}
              </group>
            ))}
            {c.gates.map((g) => (
              <group key={g.no}>
                <UniversityGate gate={g} near={false} />
                <GateBackdrop gate={g} />
              </group>
            ))}
            {showPeople && <StreetPeople world={world} />}
          </group>
        </group>,
        portal.scene,
      )}
      {/* 곡면 유리 (바깥 캠퍼스가 보임), 창 구멍 안쪽 벽면, 창틀·창살·창턱 */}
      <mesh geometry={geo.pane} material={portal.views[0].mat} />
      <mesh geometry={geo.plaster}>
        <meshStandardMaterial color={round.color} map={plasterFine()} bumpMap={plasterBump()} bumpScale={0.3} roughness={0.95} />
      </mesh>
      <mesh geometry={geo.frame}>
        <meshStandardMaterial color={W.frameColor} roughness={0.7} />
      </mesh>
    </>
  )
}
