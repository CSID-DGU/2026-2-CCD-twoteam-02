// 먼 도시 스카이라인: 밤에 지평선을 두르는 빌딩 숲과 창 불빛. 위치·크기 계산은 skylineLogic.ts
//
// 광장·캠퍼스(WorldScene), 카페 통창 너머 거리(CafeWindows), 루프탑(RooftopWorld)이 같은 것을 월드 가운데 둘레에 둡니다.
// 낮에는 안 보이고 해 질 녘부터 서서히 나타납니다(skylineFade, 밤 빛남은 하늘 WorldSky 가 정함).
// 아래쪽은 안개처럼 흐려져 사라집니다(addFog). 물체를 더 만들지 않고 건물 재질의 셰이더에서 투명도만 낮추므로 부담이 거의 없습니다.
// 팀 조절판의 "먼 도시"로 내 화면에서만 숨길 수 있습니다(skyClock 의 skyline, 지울지 정하기 전 비교용).
// 하늘 부품처럼 레이어 2(SKY_LAYER)에 두어 미니맵 카메라에는 안 그립니다.
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Instance, Instances } from '@react-three/drei'
import * as THREE from 'three'
import { FOG, TALL, skylineFade, skylineTowers, towerSpan } from './skylineLogic'
import { nightGlow } from './worldMaterials'
import { useSkyline } from './skyClock'
import { SKY_LAYER } from './skyLogic'

const WINDOW_GLOW = 1.3 // 밤 빛남 1 일 때 창 불빛 세기

// 빌딩 앞면 창 질감: 어두운 벽에 창 격자, 일부 창만 불이 켜짐(빛남 지도). rows·cols 가 클수록 촘촘(높은 빌딩)
function windowMaps(rows: number, cols: number, seed: number) {
  const make = (lit: boolean) => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 128
    const ctx = canvas.getContext('2d')!
    let s = seed
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    ctx.fillStyle = lit ? '#000000' : '#3c4350'
    ctx.fillRect(0, 0, 64, 128)
    const cw = 64 / cols
    const rh = 128 / rows
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const on = rnd() < 0.42
        ctx.fillStyle = lit ? (on ? `rgba(255,${200 + Math.floor(rnd() * 40)},140,1)` : '#000000') : '#2c323c'
        ctx.fillRect(k * cw + cw * 0.2, r * rh + rh * 0.25, cw * 0.6, rh * 0.5)
      }
    }
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapT = THREE.RepeatWrapping // 땅 아래로 늘어난 부분에도 창이 이어지게 (addFog)
    return t
  }
  return { map: make(false), glow: make(true) }
}

// 안개 층들을 더한 셰이더 식 (1 다 보임 ~ 0 사라짐)
const FOG_GLSL = FOG.layers.map((l) => `${l.amount.toFixed(2)} * smoothstep(${l.bottom.toFixed(1)}, ${l.top.toFixed(1)}, vTowerY)`).join(' + ')

// 재질 셰이더에 안개를 더합니다. three.js 가 만든 셰이더 글자에 두 곳만 끼워 넣습니다(onBeforeCompile).
//   꼭짓점: 높이를 조각으로 넘기고, 벽면의 창 질감은 건물 높이(0~꼭대기)에 맞춰 늘어나지 않게 함
//   조각: 높이에 따라 투명도를 낮춰 뒤의 하늘이 비치게 함. 창 불빛은 먼저 잦아들도록 밝기도 같이 낮춤
function addFog(m: THREE.MeshStandardMaterial) {
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying float vTowerY;\n${shader.vertexShader}`.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      vTowerY = (instanceMatrix * vec4(position, 1.0)).y;
      if (abs(normal.y) < 0.5) {
        float towerTop = instanceMatrix[3].y + 0.5 * length(instanceMatrix[1].xyz);
        vMapUv.y = vTowerY / towerTop;
        vEmissiveMapUv.y = vTowerY / towerTop;
      }`,
    )
    shader.fragmentShader = `varying float vTowerY;\n${shader.fragmentShader}`
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float towerFog = ${FOG_GLSL};
        totalEmissiveRadiance *= towerFog;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `diffuseColor.a *= towerFog;
        #include <opaque_fragment>`,
      )
  }
}

// 높이에 따라 두 가지 빌딩 (창 촘촘함이 다름, [낮은, 높은]). 처음 쓸 때 한 번 만듦
function towerMaterial(rows: number, cols: number, seed: number) {
  const { map, glow } = windowMaps(rows, cols, seed)
  const m = new THREE.MeshStandardMaterial({ color: '#9aa3b0', map, emissive: '#ffcf8a', emissiveMap: glow, emissiveIntensity: 0, roughness: 1, transparent: true, opacity: 0 })
  addFog(m)
  return m
}
let towerMats: THREE.MeshStandardMaterial[] | null = null
function towerMaterials() {
  if (!towerMats) towerMats = [towerMaterial(10, 6, 7), towerMaterial(22, 8, 13)]
  return towerMats
}
// 밤 빛남 → 보이는 정도와 창 불빛. 다 안 보이면 false (그리지 않음)
function lightTowers(glow: number): boolean {
  const fade = skylineFade(glow)
  for (const m of towerMaterials()) {
    m.opacity = fade
    m.emissiveIntensity = WINDOW_GLOW * glow * fade
  }
  return fade > 0.001
}

export function CitySkyline() {
  const shown = useSkyline()
  const towers = useMemo(() => skylineTowers({ x: 0, z: 0 }), [])
  const lists = useMemo(() => [towers.filter((t) => t.h < TALL), towers.filter((t) => t.h >= TALL)], [towers])
  const group = useRef<THREE.Group>(null)
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([])
  useLayoutEffect(() => {
    for (const m of meshes.current) m?.layers.set(SKY_LAYER)
  })
  useFrame(() => {
    if (group.current) group.current.visible = lightTowers(nightGlow())
  })
  if (!shown) return null
  const mats = towerMaterials()
  return (
    <group ref={group} visible={false}>
      {lists.map((list, i) =>
        list.length === 0 ? null : (
          <Instances
            key={i}
            limit={list.length}
            material={mats[i]}
            ref={(m: THREE.InstancedMesh | null) => {
              meshes.current[i] = m
            }}
          >
            <boxGeometry args={[1, 1, 1]} />
            {list.map((t, k) => {
              const { y, height } = towerSpan(t.h)
              return <Instance key={k} position={[t.x, y, t.z]} scale={[t.w, height, t.d]} rotation-y={t.rot} />
            })}
          </Instances>
        ),
      )}
    </group>
  )
}
