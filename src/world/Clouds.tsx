// 광장 하늘의 구름 (#317). WorldSky 안에서 그립니다.
//
//   모양   납작하게 누른 낮은 면수 구(덩어리) 5개가 구름 하나. 광장 장식처럼 단순한(로우폴리) 모양입니다
//   자리   weatherLogic 의 cloudLayout: 실제 시각만으로 정해져 같은 시각이면 모두 같은 자리, 늘 서쪽 → 동쪽으로 흐름
//   양     실제 서울 구름 양(%)만큼 구름이 하나씩 자라 나타남 (최대 40개)
//   색     cloudTint: 낮 흰색, 노을 주황빛, 밤 남회색, 비·눈이 올수록 회색. 번개가 칠 때 잠깐 흰색 쪽으로(#328)
//
// 덩어리 200개를 InstancedMesh 하나로 그립니다. 같은 모양을 자리·크기만 바꿔 한 번의 그리기 명령으로 그리는 방법이라 가볍습니다.
// 재질은 빛을 받지 않는 MeshBasicMaterial 이고, 위는 밝고 아래는 어둡게 정점 색을 미리 넣어 입체감을 냅니다.
// (빛을 받는 재질이면 밤에 구름이 새까매지고, 색은 cloudTint 가 이미 시간에 맞춰 정합니다)
// 하늘 레이어(2)라 미니맵에 안 보이고, 별자리 클릭을 가리는 물체 검사(레이어 0)에도 걸리지 않습니다.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SKY_LAYER } from './skyLogic'
import { CLOUD_COUNT, PUFFS, PUFF_STRIDE, cloudLayout, cloudTint } from './weatherLogic'
import type { WeatherFrame } from './weatherLogic'
import { flashCloudTint } from './lightningLogic'

const COUNT = CLOUD_COUNT * PUFFS
const SHADE = { top: 1, bottom: 0.78 } // 덩어리 위·아래 밝기 (정점 색)
const ORDER = -3 // 그리는 순서: 해·달·흐림 덮개 다음, 별자리 전 (WorldSky 의 ORDER 참고)

// 덩어리 모양: 낮은 면수 구에 위 → 아래로 밝기 그라데이션
function puffGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1)
  const pos = g.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const v = SHADE.bottom + ((SHADE.top - SHADE.bottom) * (pos.getY(i) + 1)) / 2
    colors.set([v, v, v], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

export function Clouds({ stateRef }: { stateRef: RefObject<WeatherFrame | null> }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => puffGeometry(), [])
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false }),
    [],
  )
  // 매 프레임 쓰는 것들. 새로 만들지 않고 이것들에 담습니다.
  const tmp = useRef({ layout: new Float32Array(COUNT * PUFF_STRIDE), m: new THREE.Matrix4(), p: new THREE.Vector3(), s: new THREE.Vector3(), q: new THREE.Quaternion(), tint: -1 })

  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    m.layers.set(SKY_LAYER)
    m.frustumCulled = false // 덩어리 자리가 매 프레임 바뀌어 화면 밖 판정용 경계를 믿을 수 없음
  }, [])
  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
    },
    [geo, mat],
  )

  useFrame(() => {
    const f = stateRef.current
    const m = mesh.current
    if (!f || !m) return
    m.visible = f.weather.cloud > 0
    if (!m.visible) return
    const t = tmp.current
    const out = cloudLayout(f.now, f.weather.cloud, t.layout) // 하늘 시각(?time)이 아니라 실제 시각
    for (let k = 0; k < COUNT; k++) {
      const o = k * PUFF_STRIDE
      t.p.set(out[o], out[o + 1], out[o + 2])
      t.s.set(out[o + 3], out[o + 4], out[o + 5]) // 크기 0 이면 안 보임
      m.setMatrixAt(k, t.m.compose(t.p, t.q, t.s))
    }
    m.instanceMatrix.needsUpdate = true
    const tint = flashCloudTint(cloudTint(f, f.weather), f.lightning.flash)
    if (tint !== t.tint) {
      ;(m.material as THREE.MeshBasicMaterial).color.setHex(tint)
      t.tint = tint
    }
  })

  return <instancedMesh ref={mesh} args={[geo, mat, COUNT]} renderOrder={ORDER} />
}
