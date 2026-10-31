// 캠리단길 3단 분수 (참고: 대리석 3단 정원 분수).
//
//   수반      바닥의 둥근 물통 + 둥근 테두리, 물빛이 천천히 밝아졌다 어두워짐
//   기둥·접시 가운데 장식 기둥(돌림판 모양, LatheGeometry) 위에 접시 셋, 맨 위는 작은 꼭지
//   물줄기    접시 가장자리에서 아래 물까지 반쯤 비치는 물 막. 줄무늬를 아래로 흘려 흐르는 것처럼 (waterStreaks)
//   물결      물줄기가 떨어지는 자리에서 둥근 물결이 퍼지며 사라짐
//   물방울    점 DROPS 개를 한 번에 그림(Points). 가장자리에서 튀어 나와 떨어지고 물에 닿으면 한 번 튐 (fountainLogic)
// 모양 값·물방울 움직임은 fountainLogic, 부딪힘은 지금처럼 world.json 의 fountain.r 원입니다.
//   LatheGeometry(돌림판): 옆모습 선을 세로축으로 한 바퀴 돌려 만든 입체. 항아리·접시 같은 둥근 모양에 씀
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BASIN, DROPS, TIERS, makeDrops, stepDrop, waterSheets, writePositions } from './fountainLogic'
import type { Drop } from './fountainLogic'
import type { PlazaLayout } from './worldLogic'
import { COLOR, MAT } from './worldMaterials'
import { waterStreaks } from './worldTextures'

const MARBLE = '#ece6d8' // 대리석 색
const WATER_WAVE_S = 2.5 // 수반 물빛이 한 번 오가는 시간(초)
const FLOW = 0.9 // 물줄기 무늬가 흘러내리는 빠르기 (그림 한 장/초)
const SHEET_FLARE = 1.12 // 물줄기 아래쪽이 가장자리보다 벌어지는 비율
const RIPPLE = { count: 3, s: 1.6, grow: 0.35 } // 접시마다 물결 수, 한 번 퍼지는 시간(초), 퍼지는 폭(반지름 비율)
const SEG = 40 // 둥근 모양 둘레 조각 수

// 옆모습 점 [반지름, 높이] → LatheGeometry
const lathe = (pts: [number, number][]) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), SEG)

// 정해진 난수 (물방울)
function random(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

type Moving = {
  water: THREE.MeshStandardMaterial
  dark: THREE.Color
  light: THREE.Color
  sheetMat: THREE.MeshStandardMaterial
  drops: Drop[]
  dropGeo: THREE.BufferGeometry
  rand: () => number
  ripples: THREE.Mesh[]
}
// 매 장면 움직임 (3D 객체를 바꾸는 일은 컴포넌트 밖에서 합니다. React 규칙 검사가 컴포넌트 안에서 값을 바꾸는 것을 막기 때문)
function animate(p: Moving, time: number, delta: number) {
  p.water.color.lerpColors(p.dark, p.light, (Math.sin((time * Math.PI * 2) / WATER_WAVE_S) + 1) / 4)
  if (p.sheetMat.map) p.sheetMat.map.offset.y = (time * FLOW) % 1
  // 물결: 떨어지는 자리 반지름에서 바깥으로 퍼지며 옅어짐
  p.ripples.forEach((m, i) => {
    if (!m) return
    const k = (time / RIPPLE.s + (i % RIPPLE.count) / RIPPLE.count) % 1
    m.scale.setScalar((m.userData.base as number) * (1 + k * RIPPLE.grow))
    ;(m.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - k)
  })
  // 물방울 (너무 긴 장면 간격은 잘라 순간이동하지 않게)
  const dt = Math.min(delta, 1 / 20)
  for (const d of p.drops) stepDrop(d, dt, p.rand)
  const attr = p.dropGeo.attributes.position as THREE.BufferAttribute
  writePositions(p.drops, attr.array as Float32Array)
  attr.needsUpdate = true
}

// 물결 판에 원래 반지름을 적어 둠 (ref 콜백)
function markRipple(m: THREE.Mesh, base: number) {
  m.userData.base = base
}

export function Fountain({ fountain }: { fountain: NonNullable<PlazaLayout['fountain']> }) {
  const { x, z, r } = fountain
  const marble = useMemo(() => new THREE.MeshStandardMaterial({ color: MARBLE, roughness: 0.55, side: THREE.DoubleSide }), [])
  const water = useMemo(() => MAT.water.clone(), []) // 물빛을 바꾸므로 공용 재질을 복사해 이 분수만 씀
  const sheetMat = useMemo(() => {
    const t = waterStreaks().clone() // 물줄기마다 같은 그림, 흐름은 이 복사본의 offset 하나로
    t.repeat.set(6, 1)
    return new THREE.MeshStandardMaterial({
      map: t, color: '#dff4ff', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide,
      emissive: '#9fd8ef', emissiveIntensity: 0.15,
    })
  }, [])
  // 물결마다 옅어지는 정도가 달라 재질을 하나씩 (접시 수 × RIPPLE.count)
  const rippleMats = useMemo(
    () => Array.from({ length: TIERS.length * RIPPLE.count }, () => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false })),
    [],
  )
  const dropMat = useMemo(() => new THREE.PointsMaterial({ color: '#e8f7ff', size: 0.06, transparent: true, opacity: 0.85, depthWrite: false }), [])

  // 모양 (한 번만)
  const shapes = useMemo(() => {
    const rimR = r - BASIN.lip
    const basin = lathe([
      [rimR - 0.02, BASIN.waterY - 0.05],
      [rimR, BASIN.h - 0.05],
      [r, BASIN.h - 0.05],
      [r + 0.04, BASIN.h * 0.5],
      [r - 0.02, 0.06],
      [r + 0.06, 0],
    ])
    const lip = new THREE.TorusGeometry(r - BASIN.lip / 2, BASIN.lip / 2, 10, SEG * 2)
    // 기둥: 바닥 → 첫 접시, 접시 사이마다 굵었다 가늘어지는 장식 기둥
    const columns = [0, ...TIERS.map((t) => t.y)].slice(0, TIERS.length).map((from, i) => {
      const to = TIERS[i].y - TIERS[i].depth
      const base = i === 0 ? 0.42 : 0.2 * (1 - i * 0.2)
      const h = to - from
      return lathe([
        [0, from],
        [base, from],
        [base * 0.75, from + h * 0.15],
        [base * 0.9, from + h * 0.35],
        [base * 0.55, from + h * 0.6],
        [base * 0.7, from + h * 0.85],
        [base * 0.5, to],
        [0, to],
      ])
    })
    const bowls = TIERS.map((t) =>
      lathe([
        [0, t.y - t.depth - 0.04],
        [t.r * 0.25, t.y - t.depth - 0.03],
        [t.r * 0.6, t.y - t.depth * 0.75],
        [t.r * 0.92, t.y - t.depth * 0.25],
        [t.r, t.y],
        [t.r * 0.97, t.y + 0.02],
      ]),
    )
    const rims = TIERS.map((t) => new THREE.TorusGeometry(t.r, 0.045, 8, SEG * 2))
    const top = TIERS[TIERS.length - 1]
    const finial = lathe([
      [0, top.y - top.lip],
      [0.12, top.y - top.lip],
      [0.07, top.y + 0.12],
      [0.11, top.y + 0.22],
      [0.04, top.y + 0.34],
      [0, top.y + 0.38],
    ])
    const sheets = waterSheets().map((s) => new THREE.CylinderGeometry(s.r, s.r * SHEET_FLARE, s.top - s.bottom, SEG, 1, true))
    const ring = new THREE.RingGeometry(0.92, 1, SEG * 2)
    return { basin, lip, columns, bowls, rims, finial, sheets, ring }
  }, [r])

  // 물방울
  const drops = useMemo(() => makeDrops(random(77)), [])
  const dropGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(DROPS * 3)
    writePositions(drops, pos)
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [drops])
  const rand = useMemo(() => random(91), [])

  // 다 쓰면 정리 (광장을 떠날 때, 들어올 때마다 쌓이지 않게)
  useEffect(
    () => () => {
      for (const m of [marble, water, sheetMat, dropMat, ...rippleMats]) m.dispose()
      sheetMat.map?.dispose()
      const { basin, lip, columns, bowls, rims, finial, sheets, ring } = shapes
      for (const g of [basin, lip, finial, ring, ...columns, ...bowls, ...rims, ...sheets]) g.dispose()
      dropGeo.dispose()
    },
    [marble, water, sheetMat, dropMat, rippleMats, shapes, dropGeo],
  )

  const dark = useMemo(() => new THREE.Color(COLOR.water), [])
  const light = useMemo(() => new THREE.Color(COLOR.waterLight), [])
  const ripples = useRef<THREE.Mesh[]>([])
  useFrame(({ clock }, delta) => {
    animate({ water, dark, light, sheetMat, drops, dropGeo, rand, ripples: ripples.current }, clock.elapsedTime, delta)
  })

  // 물결 자리: [반지름, 높이] — 물줄기가 떨어지는 곳(접시 가장자리 × 벌어짐)
  const rippleAt = waterSheets().map((s) => [s.r * SHEET_FLARE, s.bottom + 0.012] as const)

  return (
    <group position={[x, 0, z]}>
      {/* 수반 */}
      <mesh geometry={shapes.basin} material={marble} />
      <mesh geometry={shapes.lip} material={marble} position-y={BASIN.h - 0.05} rotation-x={Math.PI / 2} />
      <mesh position-y={BASIN.waterY} rotation-x={-Math.PI / 2} material={water}>
        <circleGeometry args={[r - BASIN.lip, SEG * 2]} />
      </mesh>
      {/* 기둥·접시·꼭지 */}
      {shapes.columns.map((g, i) => <mesh key={`c${i}`} geometry={g} material={marble} />)}
      {shapes.bowls.map((g, i) => <mesh key={`b${i}`} geometry={g} material={marble} />)}
      {shapes.rims.map((g, i) => <mesh key={`r${i}`} geometry={g} material={marble} position-y={TIERS[i].y} rotation-x={Math.PI / 2} />)}
      {TIERS.map((t, i) => (
        <mesh key={`w${i}`} position-y={t.y - t.lip} rotation-x={-Math.PI / 2} material={water}>
          <circleGeometry args={[t.r * 0.94, SEG]} />
        </mesh>
      ))}
      <mesh geometry={shapes.finial} material={marble} />
      {/* 물줄기 */}
      {waterSheets().map((s, i) => (
        <mesh key={`s${i}`} geometry={shapes.sheets[i]} material={sheetMat} position-y={(s.top + s.bottom) / 2} />
      ))}
      {/* 물결 */}
      {rippleAt.flatMap(([rad, y], i) =>
        Array.from({ length: RIPPLE.count }, (_, j) => (
          <mesh
            key={`p${i}-${j}`}
            ref={(m) => {
              if (m) {
                markRipple(m, rad)
                ripples.current[i * RIPPLE.count + j] = m
              }
            }}
            geometry={shapes.ring}
            material={rippleMats[i * RIPPLE.count + j]}
            position-y={y}
            rotation-x={-Math.PI / 2}
          />
        )),
      )}
      {/* 물방울 */}
      <points geometry={dropGeo} material={dropMat} />
    </group>
  )
}
