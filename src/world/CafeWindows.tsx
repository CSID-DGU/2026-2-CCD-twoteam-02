// 캠리단길 카페 안 통창: 출입문 벽(남쪽) 문 양옆과 몇 지점은 옆벽 하나(world.json sideWindow)까지 통창으로 실제 캠리단길이 보입니다.
// 지점 화면 안에 거리를 따로 된 장면으로 같이 두고(createPortal), 창 판이 그 장면을 비춥니다 (방법은 cafePortal.ts).
// 위층(캠리 스퀘어 2~4층)은 그 층 높이에서 내려다봄. 창틀은 그 건물 앞면(파사드)과 같은 모양·색.
// 광장을 걷는 사람들도 보입니다(광장 실시간 방을 보기만 함). 순위 게시판은 없고, 하늘·날씨·밤 불빛은 광장과 같습니다. 벽 구멍은 BranchScene 이 cafeWallPieces 로 냄.
import { useEffect, useMemo, useRef } from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { BranchLayout } from '../space/layout'
import { CAFE_WINDOW, FLOOR_H, paneCount } from './cafeWindowLogic'
import type { CafeWindow, CafeWindows as Windows, WindowWall } from './cafeWindowLogic'
import { cafeWindowsOf, windowLayoutOf } from './cafeWindowsOf'
import { disposePortal, portalMaterial, renderPortal, resizePortal } from './cafePortal'
import type { Portal } from './cafePortal'
import { benchSeats, buildingOf } from './worldLogic'
import type { FacadeStyle } from './worldLogic'
import { computedOf, worldOfBranch } from './worldConfig'
import { Building, Fence, Ground, Lamps } from './WorldDecor'
import { Garden, GardenBenches, LushTrees } from './Garden'
import { Fountain } from './Fountain'
import { NightFill, StringLights } from './StreetLights'
import { WorldSky } from './WorldSky'
import { CitySkyline } from './CitySkyline'
import { useWorldWeather } from './useWorldWeather'
import type { WorldConfig } from './worldConfig'
import { useParticipants } from '../realtime/useParticipants'
import { watchSupabase } from '../lib/supabase'
import { OtherParticipants } from '../realtime/OtherParticipants'
import type { PresenceState } from '../realtime/participants'

// 지점별 창틀: 색, 굵기, 유리 칸마다 세로 살에 더해 위쪽 가로 살(rows 1)
const FRAME: Record<FacadeStyle, { color: string; t: number; rows: number }> = {
  classic: { color: '#1d1d1d', t: 0.07, rows: 1 }, // 별다방 검은 격자
  diner: { color: '#d0d4dc', t: 0.09, rows: 0 }, // 레트로카페 크롬 테
  garden: { color: '#5e4330', t: 0.08, rows: 0 }, // 올리브 테라스 나무 틀
  modern: { color: '#0f0f10', t: 0.05, rows: 0 }, // 흑요 라운지 얇은 검은 틀 통유리
  woodbar: { color: '#c9a24a', t: 0.07, rows: 1 }, // 월넛 바 금테
  moss: { color: '#1d1d1d', t: 0.05, rows: 0 }, // 이끼 정원 얇은 검은 철제 틀
}
const WALL_HALF = 0.1 // 지점 벽 두께(0.2)의 반. 창 판은 벽 바깥 면에, 거리는 그 바깥만 그림
const SILL = { d: 0.14, t: 0.04 } // 창턱 깊이·두께 (방 안쪽으로)

type Layout = Pick<BranchLayout, 'id' | 'size' | 'door' | 'theme' | 'meetingDoor' | 'elevator'>
const WALLS: WindowWall[] = ['front', 'back', 'west', 'east']
// 벽마다 창 판을 놓을 바깥 면과 방 쪽을 보게 돌리는 각도 (판·틀은 창 가운데 기준, 방 쪽이 +z 가 되게 돌림)
const TURN: Record<WindowWall, number> = { front: Math.PI, back: 0, west: Math.PI / 2, east: -Math.PI / 2 }
const alongX = (wall: WindowWall) => wall === 'front' || wall === 'back' // 앞·뒷벽은 x 를 따라감
function outerCenter(s: CafeWindow, y: number): [number, number, number] {
  if (s.wall === 'front') return [s.x, y, s.z + WALL_HALF]
  if (s.wall === 'back') return [s.x, y, s.z - WALL_HALF]
  return [s.x + (s.wall === 'west' ? -WALL_HALF : WALL_HALF), y, s.z]
}
// 그 벽 바깥만 남기는 자르기 면 (지점 안쪽 거리는 그리지 않음)
function clipOf(wall: WindowWall, at: number) {
  if (wall === 'front') return new THREE.Plane(new THREE.Vector3(0, 0, 1), -(at + WALL_HALF))
  if (wall === 'back') return new THREE.Plane(new THREE.Vector3(0, 0, -1), at - WALL_HALF)
  return wall === 'west' ? new THREE.Plane(new THREE.Vector3(-1, 0, 0), at - WALL_HALF) : new THREE.Plane(new THREE.Vector3(1, 0, 0), -(at + WALL_HALF))
}

// showPeople: 거리의 사람을 그릴지 (캐릭터 숨김 실험 모드면 false)
export function CafeWindows({ layout: raw, showPeople }: { layout: Layout; showPeople: boolean }) {
  const layout = useMemo(() => windowLayoutOf(raw), [raw]) // 위층은 1층 출입문 자리를 빌려 씀
  const windows = useMemo(() => cafeWindowsOf(layout), [layout])
  if (!windows || !layout.door || windows.spots.length === 0) return null
  return <CafePortal slug={layout.id} doorZ={layout.door.z} doorX={layout.door.x} depth={layout.size.d} windows={windows} showPeople={showPeople} />
}

function CafePortal({ slug, doorX, doorZ, depth, windows, showPeople }: { slug: string; doorX: number; doorZ: number; depth: number; windows: Windows; showPeople: boolean }) {
  const world = worldOfBranch(slug)
  const c = computedOf(world)
  const b = buildingOf(c.placed, slug)!
  const plaza = world.layout
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const { sill, top } = CAFE_WINDOW
  const buildingDepth = b.spec.d // 광장 건물 깊이 (실내보다 얕을 수 있음)
  const h = top - sill
  const y = (sill + top) / 2
  // 창이 난 벽마다 따로 그림 (자르는 방향이 달라서)
  const portal = useMemo<Portal>(() => {
    const views = WALLS.flatMap((wall) => {
      const spots = windows.spots.filter((s) => s.wall === wall)
      if (spots.length === 0) return []
      const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
      return [
        {
          target,
          mat: portalMaterial(target.texture),
          clip: clipOf(wall, alongX(wall) ? spots[0].z : spots[0].x),
          // 뒷벽: 실내(depth)가 건물(spec.d)보다 깊으면 그만큼 거리를 뒤로 밀어, 건물 실제 뒷면 바로 바깥이 창 밖에 오게
          ...(wall === 'back' && depth > buildingDepth ? { shift: new THREE.Vector3(0, 0, buildingDepth - depth) } : {}),
          windows: spots.map((s) => {
            const [cx, , cz] = outerCenter(s, y)
            const half = alongX(wall) ? new THREE.Vector3(s.w / 2, h / 2, 0.01) : new THREE.Vector3(0.01, h / 2, s.w / 2)
            const center = new THREE.Vector3(cx, y, cz)
            return new THREE.Box3(center.clone().sub(half), center.clone().add(half))
          }),
        },
      ]
    })
    return { scene: new THREE.Scene(), views }
  }, [windows, y, h, depth, buildingDepth])
  useEffect(() => resizePortal(portal, size.width * dpr, size.height * dpr), [portal, size, dpr])
  useEffect(() => () => disposePortal(portal), [portal])
  useFrame(({ gl, camera }) => renderPortal(gl, camera, portal), -1) // 화면 그리기 전에 (음수 순서라 자동 그리기는 그대로)

  const weather = useWorldWeather()
  const follow = useRef({ x: b.door.x, z: b.door.z }) // 비·눈이 따라올 자리 (창 앞 거리)
  const f = FRAME[windows.style]
  const frame = useMemo(() => new THREE.MeshStandardMaterial({ color: f.color }), [f.color]) // 거리 장면과 같이 쓰지 않는 지점 쪽 재질
  const matOf = (wall: WindowWall) => portal.views[WALLS.filter((w) => windows.spots.some((s) => s.wall === w)).indexOf(wall)].mat
  const roomSide = WALL_HALF * 2 // 판(바깥 면)에서 방 쪽 벽 면까지

  return (
    <>
      {createPortal(
        // 거리 좌표 → 지점 좌표: 건물 출입문이 지점 출입문 자리에 오게 옮기고 돌림 (위층은 층 높이만큼 아래로)
        <group position={[doorX, -(windows.level - 1) * FLOOR_H, doorZ]} rotation-y={-b.angle}>
          <group position={[-b.door.x, 0, -b.door.z]}>
            <WorldSky lamps={c.litLamps} weatherRef={weather} followRef={follow} />
            <CitySkyline />
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
              <Building key={p.slug} b={p} open near={false} />
            ))}
            {showPeople && <StreetPeople world={world} />}
          </group>
        </group>,
        portal.scene,
      )}
      {windows.spots.map((s, i) => {
        const panes = paneCount(s.w)
        // 창틀 막대: [가운데(벽을 따라), 높이(창 가운데 기준), 폭, 높이] — 방 쪽 벽 면에
        const bars = [
          [0, h / 2, s.w + f.t, f.t],
          [0, -h / 2, s.w + f.t, f.t],
          ...Array.from({ length: panes + 1 }, (_, k) => [-s.w / 2 + (k * s.w) / panes, 0, f.t, h]),
          ...(f.rows > 0 ? [[0, h * 0.22, s.w, f.t * 0.6]] : []), // 위쪽 가로 살 (격자·금테 창)
        ]
        return (
          <group key={i} position={outerCenter(s, y)} rotation-y={TURN[s.wall]}>
            {/* 거리가 비치는 판 (벽 바깥 면, 방 쪽을 봄) */}
            <mesh position-z={0.002} material={matOf(s.wall)}>
              <planeGeometry args={[s.w, h]} />
            </mesh>
            {bars.map(([x, yy, bw, bh], k) => (
              <mesh key={k} position={[x, yy, roomSide + 0.02]} material={frame}>
                <boxGeometry args={[bw, bh, 0.05]} />
              </mesh>
            ))}
            <mesh position={[0, -h / 2 + SILL.t / 2, roomSide + SILL.d / 2]} material={frame}>
              <boxGeometry args={[s.w + 0.1, SILL.t, SILL.d]} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}

// 광장을 걷는 사람들. 광장 실시간 방을 보기만 합니다: 내 상태(me)를 비워 두어 내 위치는 보내지 않고 접속자로 들어가지도 않음
// 루프탑(RooftopWorld)에서 내려다보는 거리에도 씁니다
export function StreetPeople({ world }: { world: WorldConfig }) {
  const me = useRef<PresenceState | null>(null)
  const others = useParticipants(world.channel, me, false, undefined, undefined, watchSupabase) // 광장 화면과 따로 된 보기 전용 연결
  const spots = useMemo(() => [...computedOf(world).rests, ...(world.id === 'plaza' ? benchSeats(world.layout) : [])], [world]) // 앉은 사람 자세
  return <OtherParticipants others={others} spots={spots} />
}
