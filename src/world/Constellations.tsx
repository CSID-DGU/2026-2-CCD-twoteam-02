// 광장 밤하늘의 황도 12궁 별자리 (#321). WorldSky 안에서 그립니다.
//
//   배치    머리 위를 둘러싼 원(고도 40°)에 북쪽부터 시계 방향으로 1월~12월 별자리 (starLogic 의 ringLayout)
//   이름표  별자리마다 아래에 "물고기자리". 별자리 날짜가 달과 딱 맞지 않아(물고기자리 2/19~3/20) 달은 적지 않습니다
//   금색    내 별자리(생일로 정함)만 금색으로 반짝임. 생일이 없으면 모두 흐린 하늘색
//   누르기  마우스가 잠긴 1인칭에서 조준점이 별·선 3° 안쪽일 때 클릭하면 onPick(별자리 id) → 광장이 운세 창을 엶.
//           잠기지 않은 상태의 클릭은 마우스를 잠그기만 하고 별자리는 반응하지 않습니다(잘못 눌림 방지).
//           건물·캐릭터가 별자리 앞을 가리면 무시합니다(캐릭터는 지금처럼 프로필 창).
//
// 모두 #316 의 별 투명도(stars)를 따라 밤에만 보이고, 별이 절반 넘게 보일 때만 눌립니다.
// 하늘 레이어(2)와 음수 그리는 순서(#316 규칙)를 따릅니다. 위치가 고정이라 매 프레임 바꾸는 것은 투명도뿐입니다.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import { SKY_LAYER } from './skyLogic'
import type { SkyState } from './skyLogic'
import { SIGNS, pickRingSign, ringLayout } from './starLogic'
import { LABEL_PX, labelTexture } from '../space/labelTexture'

const R = 330 // 별자리를 그리는 거리 (무작위 별 350 보다 앞)
const COLOR = { normal: '#9fc4ff', gold: '#ffd27a', labelBg: 'rgba(20,24,48,0.55)', labelText: '#dbe7ff' }
const LINE_OPACITY = 0.45 // 보통 별자리 선 투명도 (× 별 투명도)
const SIZE = { normal: 3, gold: 4.5 } // 별 크기(px)
const TWINKLE = { amount: 0.2, seconds: 2 } // 내 별자리 반짝임
const LABEL_WIDTH = 40
const CLICK_STARS = 0.5 // 별 투명도가 이보다 클 때만 눌림
const NEAR_IGNORE = 1 // 이보다 가까이 맞은 것(내 캐릭터 머리 등)은 가리는 물체로 치지 않음
const BLOCK_RANGE = 400 // 이 거리 안에서 보이는 물체에 먼저 맞으면 별자리가 가려진 것
const ORDER = { lines: -2, stars: -2, label: -1 } // 구름(−3, #317) 다음에 그려 구름에 가리지 않음

// WorldSky 가 매 프레임 채우는 하늘 값 + 그 월드 시각(ms)
export type SkyFrame = SkyState & { ms: number }

const RING = ringLayout() // 배치는 바뀌지 않으므로 한 번만
const scaled = (v: { x: number; y: number; z: number }) => new THREE.Vector3(v.x * R, v.y * R, v.z * R)

// 고른 별자리들(mine 이면 내 별자리만, 아니면 나머지)의 점·선 지오메트리
function figures(mySign: string | null, mine: boolean) {
  const ring = RING.filter((r) => (r.id === mySign) === mine)
  const points = new THREE.BufferGeometry().setFromPoints(ring.flatMap((r) => r.stars.map(scaled)))
  const lines = new THREE.BufferGeometry().setFromPoints(
    ring.flatMap((r) => {
      const sign = SIGNS.find((s) => s.id === r.id)
      return (sign?.lines ?? []).flatMap(([a, b]) => [scaled(r.stars[a]), scaled(r.stars[b])])
    }),
  )
  return { points, lines }
}

export function Constellations({ stateRef, mySign, onPick }: { stateRef: RefObject<SkyFrame | null>; mySign: string | null; onPick?: (id: string) => void }) {
  const { scene, camera, gl } = useThree()
  const group = useRef<THREE.Group>(null)
  const normalPoints = useRef<THREE.Points>(null)
  const normalLines = useRef<THREE.LineSegments>(null)
  const goldPoints = useRef<THREE.Points>(null)
  const goldLines = useRef<THREE.LineSegments>(null)
  const labels = useRef<(THREE.Mesh | null)[]>([])

  const normal = useMemo(() => figures(mySign, false), [mySign])
  const gold = useMemo(() => figures(mySign, true), [mySign])
  const mats = useMemo(
    () => ({
      normalPoints: new THREE.PointsMaterial({ color: COLOR.normal, size: SIZE.normal, sizeAttenuation: false, transparent: true, depthWrite: false, toneMapped: false }),
      normalLines: new THREE.LineBasicMaterial({ color: COLOR.normal, transparent: true, depthWrite: false, toneMapped: false }),
      goldPoints: new THREE.PointsMaterial({ color: COLOR.gold, size: SIZE.gold, sizeAttenuation: false, transparent: true, depthWrite: false, toneMapped: false }),
      goldLines: new THREE.LineBasicMaterial({ color: COLOR.gold, transparent: true, depthWrite: false, toneMapped: false }),
    }),
    [],
  )
  useEffect(
    () => () => {
      for (const o of [normal.points, normal.lines, gold.points, gold.lines]) o.dispose()
    },
    [normal, gold],
  )
  useEffect(
    () => () => {
      for (const m of Object.values(mats)) m.dispose()
    },
    [mats],
  )

  // 하늘 레이어 2 (미니맵에 안 보임)
  useLayoutEffect(() => {
    for (const o of [normalPoints.current, normalLines.current, goldPoints.current, goldLines.current, ...labels.current]) o?.layers.set(SKY_LAYER)
  }, [mySign])

  // 마우스가 잠긴 1인칭의 클릭: 조준점(카메라가 보는 방향)으로 별자리 고르기
  const onPickRef = useRef(onPick)
  useEffect(() => {
    onPickRef.current = onPick
  })
  useEffect(() => {
    const raycaster = new THREE.Raycaster()
    const dir = new THREE.Vector3()
    const shown = (o: THREE.Object3D | null): boolean => !o || (o.visible && shown(o.parent))
    const click = () => {
      if (document.pointerLockElement !== gl.domElement) return // 잠그는 클릭에는 반응하지 않음
      if ((stateRef.current?.stars ?? 0) <= CLICK_STARS) return
      camera.getWorldDirection(dir)
      const id = pickRingSign({ x: dir.x, y: dir.y, z: dir.z }, RING)
      if (!id) return
      raycaster.set(camera.position, dir)
      raycaster.far = BLOCK_RANGE
      const blocked = raycaster.intersectObjects(scene.children, true).some((h) => h.distance > NEAR_IGNORE && shown(h.object))
      if (!blocked) onPickRef.current?.(id)
    }
    window.addEventListener('click', click)
    return () => window.removeEventListener('click', click)
  }, [camera, gl, scene, stateRef])

  useFrame(({ clock }) => {
    const s = stateRef.current
    if (!s || !group.current) return
    group.current.visible = s.stars > 0
    if (s.stars <= 0) return
    const twinkle = 1 + TWINKLE.amount * Math.sin((clock.elapsedTime * Math.PI * 2) / TWINKLE.seconds)
    if (normalPoints.current) (normalPoints.current.material as THREE.PointsMaterial).opacity = s.stars
    if (normalLines.current) (normalLines.current.material as THREE.LineBasicMaterial).opacity = LINE_OPACITY * s.stars
    if (goldPoints.current) (goldPoints.current.material as THREE.PointsMaterial).opacity = s.stars * twinkle * 0.85
    if (goldLines.current) (goldLines.current.material as THREE.LineBasicMaterial).opacity = s.stars * twinkle * 0.8
    for (let i = 0; i < labels.current.length; i++) {
      if (labels.current[i]) (labels.current[i]!.material as THREE.MeshBasicMaterial).opacity = s.stars
    }
  })

  return (
    <group ref={group}>
      <points ref={normalPoints} geometry={normal.points} material={mats.normalPoints} renderOrder={ORDER.stars} />
      <lineSegments ref={normalLines} geometry={normal.lines} material={mats.normalLines} renderOrder={ORDER.lines} />
      <points ref={goldPoints} geometry={gold.points} material={mats.goldPoints} renderOrder={ORDER.stars} />
      <lineSegments ref={goldLines} geometry={gold.lines} material={mats.goldLines} renderOrder={ORDER.lines} />
      {RING.map((r, i) => (
        <group key={r.id} position={scaled(r.label)}>
          <Billboard>
            <mesh
              ref={(m) => {
                labels.current[i] = m
              }}
              renderOrder={ORDER.label}
            >
              <planeGeometry args={[LABEL_WIDTH, (LABEL_WIDTH * LABEL_PX.h) / LABEL_PX.w]} />
              <meshBasicMaterial
                map={labelTexture(r.name,COLOR.labelBg, r.id === mySign ? COLOR.gold : COLOR.labelText)}
                transparent
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          </Billboard>
        </group>
      ))}
    </group>
  )
}
