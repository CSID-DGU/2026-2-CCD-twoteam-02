// 광장 밤하늘의 황도 12궁 별자리 (#321). WorldSky 안에서 그립니다.
//
//   배치    머리 위를 둘러싼 원(고도 40°)에 북쪽부터 시계 방향으로 1월~12월 별자리 (starLogic 의 ringLayout)
//   이름표  별자리마다 아래에 "물고기자리". 별자리 날짜가 달과 딱 맞지 않아(물고기자리 2/19~3/20) 달은 적지 않습니다
//   금색    내 별자리(생일로 정함)만 금색으로 반짝임. 생일이 없으면 모두 흐린 하늘색
//   고르기  마우스가 잠긴 1인칭에서 조준점이 별·선 3° 안쪽이면 onAim(별자리)로 알림 → 광장이 "물고기자리 · E 오늘의 운세"
//           안내를 띄우고 E 로 운세 창을 엶. 클릭으로는 열지 않습니다(시점을 돌리다 잘못 눌림 방지, #354).
//           건물·캐릭터가 별자리 앞을 가리면 고르지 않습니다(캐릭터는 그 사람의 프로필).
//
// 모두 #316 의 별 투명도(stars)를 따라 밤에만 보이고, 별이 절반 넘게 보일 때만 고를 수 있습니다.
// 달이 지나가는 별자리는 흐리게 합니다(#344, skyLogic 의 moonOverlapFade). 그래서 별자리를 하나씩 따로 그립니다.
// 하늘 레이어(2)와 음수 그리는 순서(#316 규칙)를 따릅니다. 위치가 고정이라 매 프레임 바꾸는 것은 투명도뿐입니다.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import { SKY_LAYER, moonOverlapFade, toDirection } from './skyLogic'
import type { SkyState } from './skyLogic'
import { SIGNS, pickRingSign, ringLayout } from './starLogic'
import { AIM_HZ } from '../space/aimLogic'
import type { AimTarget } from '../space/aimLogic'
import { LABEL_PX, labelTexture } from '../space/labelTexture'

const R = 330 // 별자리를 그리는 거리 (무작위 별 350 보다 앞)
const COLOR = { normal: '#9fc4ff', gold: '#ffd27a', labelBg: 'rgba(20,24,48,0.55)', labelText: '#dbe7ff' }
const LINE_OPACITY = 0.45 // 보통 별자리 선 투명도 (× 별 투명도)
const SIZE = { normal: 3, gold: 4.5 } // 별 크기(px)
const TWINKLE = { amount: 0.2, seconds: 2 } // 내 별자리 반짝임
const LABEL_WIDTH = 40
const AIM_STARS = 0.5 // 별 투명도가 이보다 클 때만 고를 수 있음
const NEAR_IGNORE = 1 // 이보다 가까이 맞은 것(내 캐릭터 머리 등)은 가리는 물체로 치지 않음
const BLOCK_RANGE = 400 // 이 거리 안에서 보이는 물체에 먼저 맞으면 별자리가 가려진 것
const ORDER = { lines: -2, stars: -2, label: -1 } // 구름(−3, #317) 다음에 그려 구름에 가리지 않음

// WorldSky 가 매 프레임 채우는 하늘 값 + 그 월드 시각(ms)
export type SkyFrame = SkyState & { ms: number }

const RING = ringLayout() // 배치는 바뀌지 않으므로 한 번만
const scaled = (v: { x: number; y: number; z: number }) => new THREE.Vector3(v.x * R, v.y * R, v.z * R)
// 조준 확인에 쓰는 계산용 물체 (매번 새로 만들지 않음. 한 프레임 안에서만 씀)
const probe = { caster: new THREE.Raycaster(), dir: new THREE.Vector3() }
// 부모까지 모두 보이는 물체인지 (숨은 물체에 가려졌다고 하지 않게)
const shown = (o: THREE.Object3D | null): boolean => !o || (o.visible && shown(o.parent))

// 별자리 하나의 점·선 지오메트리. 달이 지나가는 별자리만 흐리게 하려고(#344) 별자리마다 따로 그립니다(12개라 그리기 부담은 작음).
function figureOf(r: (typeof RING)[number]) {
  const points = new THREE.BufferGeometry().setFromPoints(r.stars.map(scaled))
  const sign = SIGNS.find((s) => s.id === r.id)
  const lines = new THREE.BufferGeometry().setFromPoints((sign?.lines ?? []).flatMap(([a, b]) => [scaled(r.stars[a]), scaled(r.stars[b])]))
  return { points, lines }
}

// 별자리 하나의 재질 (내 별자리면 금색·조금 큰 별)
function materialsOf(gold: boolean) {
  return {
    points: new THREE.PointsMaterial({ color: gold ? COLOR.gold : COLOR.normal, size: gold ? SIZE.gold : SIZE.normal, sizeAttenuation: false, transparent: true, depthWrite: false, toneMapped: false }),
    lines: new THREE.LineBasicMaterial({ color: gold ? COLOR.gold : COLOR.normal, transparent: true, depthWrite: false, toneMapped: false }),
  }
}

// aimOn: 조준점으로 별자리 고르기를 켤지 (1인칭으로 서 있고 창이 없을 때). onAim: 바뀌지 않는 함수를 넘깁니다.
type Props = { stateRef: RefObject<SkyFrame | null>; mySign: string | null; aimOn?: boolean; onAim?: (target: AimTarget | null) => void }

export function Constellations({ stateRef, mySign, aimOn = false, onAim }: Props) {
  const { gl } = useThree()
  const group = useRef<THREE.Group>(null)
  const points = useRef<(THREE.Object3D | null)[]>([])
  const lines = useRef<(THREE.Object3D | null)[]>([])
  const labels = useRef<(THREE.Mesh | null)[]>([])
  const moonDir = useRef({ x: 0, y: 0, z: 0 }) // 매 프레임 달 방향 (새로 만들지 않고 여기에 담음)

  const figures = useMemo(() => RING.map(figureOf), []) // 위치가 고정이라 한 번만
  const mats = useMemo(() => RING.map((r) => materialsOf(r.id === mySign)), [mySign])
  useEffect(
    () => () => {
      for (const f of figures) for (const o of [f.points, f.lines]) o.dispose()
    },
    [figures],
  )
  useEffect(
    () => () => {
      for (const m of mats) for (const o of [m.points, m.lines]) o.dispose()
    },
    [mats],
  )

  // 하늘 레이어 2 (미니맵에 안 보임)
  useLayoutEffect(() => {
    for (const o of [...points.current, ...lines.current, ...labels.current]) o?.layers.set(SKY_LAYER)
  }, [mySign])

  // 마우스가 잠긴 1인칭: 조준점(카메라가 보는 방향)이 가리키는 별자리를 초당 AIM_HZ 번 확인합니다.
  const nextProbe = useRef(0) // 다음에 조준을 확인할 시각(초)
  useEffect(() => {
    if (!aimOn || !onAim) return
    return () => onAim(null)
  }, [aimOn, onAim])
  useFrame(({ clock, camera, scene }) => {
    if (!aimOn || !onAim) return
    if (clock.elapsedTime < nextProbe.current) return
    nextProbe.current = clock.elapsedTime + 1 / AIM_HZ
    if (document.pointerLockElement !== gl.domElement || (stateRef.current?.stars ?? 0) <= AIM_STARS) return onAim(null)
    camera.getWorldDirection(probe.dir)
    const id = pickRingSign({ x: probe.dir.x, y: probe.dir.y, z: probe.dir.z }, RING)
    const sign = id ? RING.find((r) => r.id === id) : undefined
    if (!sign) return onAim(null)
    probe.caster.set(camera.position, probe.dir)
    probe.caster.far = BLOCK_RANGE
    const blocked = probe.caster.intersectObjects(scene.children, true).some((h) => h.distance > NEAR_IGNORE && shown(h.object))
    onAim(blocked ? null : { kind: 'sign', id: sign.id, name: sign.name })
  })

  useFrame(({ clock }) => {
    const s = stateRef.current
    if (!s || !group.current) return
    group.current.visible = s.stars > 0
    if (s.stars <= 0) return
    const twinkle = 1 + TWINKLE.amount * Math.sin((clock.elapsedTime * Math.PI * 2) / TWINKLE.seconds)
    const moon = toDirection(s.moon, moonDir.current)
    for (let i = 0; i < RING.length; i++) {
      // 달이 지나가는 별자리는 흐리게 (#344). 달이 지평선 아래면(moonShow 0) 그대로
      const fade = moonOverlapFade(moon, RING[i].center, s.moonShow)
      const gold = RING[i].id === mySign
      const p = points.current[i]
      const l = lines.current[i]
      const label = labels.current[i]
      if (p) ((p as THREE.Points).material as THREE.PointsMaterial).opacity = (gold ? s.stars * twinkle * 0.85 : s.stars) * fade
      if (l) ((l as THREE.LineSegments).material as THREE.LineBasicMaterial).opacity = (gold ? s.stars * twinkle * 0.8 : LINE_OPACITY * s.stars) * fade
      if (label) (label.material as THREE.MeshBasicMaterial).opacity = s.stars * fade
    }
  })

  return (
    <group ref={group}>
      {RING.map((r, i) => (
        <group key={r.id}>
          <points
            ref={(o) => {
              points.current[i] = o
            }}
            geometry={figures[i].points}
            material={mats[i].points}
            renderOrder={ORDER.stars}
          />
          <lineSegments
            ref={(o) => {
              lines.current[i] = o
            }}
            geometry={figures[i].lines}
            material={mats[i].lines}
            renderOrder={ORDER.lines}
          />
          <group position={scaled(r.label)}>
            <Billboard>
              <mesh
                ref={(m) => {
                  labels.current[i] = m
                }}
                renderOrder={ORDER.label}
              >
                <planeGeometry args={[LABEL_WIDTH, (LABEL_WIDTH * LABEL_PX.h) / LABEL_PX.w]} />
                <meshBasicMaterial
                  map={labelTexture(r.name, COLOR.labelBg, r.id === mySign ? COLOR.gold : COLOR.labelText)}
                  transparent
                  depthWrite={false}
                  toneMapped={false}
                />
              </mesh>
            </Billboard>
          </group>
        </group>
      ))}
    </group>
  )
}
