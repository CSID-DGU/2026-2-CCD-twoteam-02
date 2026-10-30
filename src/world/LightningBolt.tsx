// 광장 먼 하늘의 번개 줄기 (#328). WorldSky 안에서 그립니다.
//
//   언제   lightningLogic 의 lightningAt: 뇌우일 때 실제 시각으로 정해, 같은 순간이면 모두 같은 때·같은 방향에 보임.
//          1·2번째 깜빡임 때만 보이고(bolt), 평소에는 visible = false 라 그리지 않습니다.
//   모양   boltShape: 지그재그 줄기 + 곁가지를 얇은 띠(삼각형)로. 6가지를 처음에 한 번 만들고 칠 때마다 골라 끼움
//   자리   광장 가운데에서 그 방향으로 340m(하늘 반구 400m 안쪽), 구름 높이(110m)에서 땅까지.
//          매 프레임 세로축으로만 돌려(boltFacing) 늘 나를 보되 줄기는 똑바로 섭니다.
//
// 빛을 받지 않는 MeshBasicMaterial(밤에도 밝게), 깊이를 쓰지 않아 뒤 물체를 가리지 않습니다.
// 그리는 순서 −3.5: 흐림 덮개(−4) 위에 보이고, 위쪽은 구름(−3)에 살짝 묻힙니다.
// 하늘 레이어(2)라 미니맵에 안 보입니다.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SKY_LAYER } from './skyLogic'
import { BOLT_SHAPES, boltFacing, boltShape } from './lightningLogic'
import type { WeatherFrame } from './weatherLogic'

const DISTANCE = 340 // 광장 가운데에서 줄기까지 (m)
const COLOR = '#e8eeff'
const ORDER = -3.5 // 그리는 순서 (WorldSky 의 ORDER 참고)

export function LightningBolt({ stateRef }: { stateRef: RefObject<WeatherFrame | null> }) {
  const group = useRef<THREE.Group>(null)
  const mesh = useRef<THREE.Mesh>(null)
  const geos = useMemo(
    () =>
      Array.from({ length: BOLT_SHAPES }, (_, n) => {
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(boltShape(n), 3))
        return g
      }),
    [],
  )
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide }),
    [],
  )

  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    m.layers.set(SKY_LAYER)
    m.frustumCulled = false // 모양을 바꿔 끼워서 경계를 믿지 않음 (삼각형이 적어 그냥 그림)
  }, [])
  useEffect(
    () => () => {
      for (const g of geos) g.dispose()
      mat.dispose()
    },
    [geos, mat],
  )

  useFrame(({ camera }) => {
    const f = stateRef.current
    const g = group.current
    const m = mesh.current
    if (!f || !g || !m) return
    const { bolt, azimuth, shape } = f.lightning
    g.visible = bolt > 0
    if (!g.visible) return
    // 방위: 북 0·동 +π/2 (skyLogic 의 toDirection 과 같음)
    g.position.set(Math.sin(azimuth) * DISTANCE, 0, -Math.cos(azimuth) * DISTANCE)
    g.rotation.y = boltFacing(g.position.x, g.position.z, camera.position.x, camera.position.z)
    m.geometry = geos[shape % BOLT_SHAPES]
    ;(m.material as THREE.MeshBasicMaterial).opacity = bolt
  })

  return (
    <group ref={group} visible={false}>
      <mesh ref={mesh} geometry={geos[0]} material={mat} renderOrder={ORDER} />
    </group>
  )
}
