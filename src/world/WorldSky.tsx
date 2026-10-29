// 광장의 하늘과 빛 (#316): 현실 시각(서울)을 따라 해·달이 뜨고 지고, 밤에는 남색 하늘·별·가로등·창문 불빛.
//
// 계산은 skyLogic.ts(순수 함수)가 하고, 여기서는 매 프레임(useFrame) 그 값을 three.js 물체에 직접 넣습니다.
// React 다시 그리기가 없어 가볍고, ?speed 로 빨리 돌려도 해가 끊기지 않고 움직입니다.
//
//   낮 하늘   drei Sky: 해 위치에 따라 하늘색·노을을 그리는 셰이더. 해 방향만 매 프레임 바꿈
//   밤 덮개   Sky 는 해가 지면 거의 새까매져서, 위에 남색 그라데이션 반구를 씌우고 투명도 = 밤 정도
//   별        drei Stars 는 바깥에서 투명도를 못 받아 직접 만든 점 2,500개 (고정 씨앗값이라 늘 같은 자리)
//   달        늘 카메라를 보는 판(Billboard). 위상에 맞춰 캔버스에 그린 그림, 위상이 1% 바뀔 때만 다시 그림
//   빛        방향광(낮 해·밤 달), 주변광, 광장 네 모서리 가로등의 점광원 4개(밤에만)
//
// 하늘 부품은 레이어 2(SKY_LAYER)에 둡니다. 화면 카메라만 레이어 2 를 켜고 미니맵 카메라는 켜지 않아서,
// 미니맵의 월드 바깥은 지금처럼 어두운 색으로 남습니다.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { ComponentRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Billboard, Sky } from '@react-three/drei'
import * as THREE from 'three'
import { SKY_LAYER, parseClock, skyState, toDirection, worldTime } from './skyLogic'
import type { Clock } from './skyLogic'
import { setNightGlow } from './worldMaterials'

// 거리·크기 (스펙 5절). 카메라가 볼 수 있는 거리(기본 1000) 안쪽
const SKY_DISTANCE = 450
const DOME = { r: 400, top: '#0b1630', horizon: '#24365f' }
const STARS = { r: 350, count: 2500, seed: 316, size: 1.6 }
const MOON = { distance: 330, size: 18, px: 128, lit: '#f4f1e6', shade: '#283152', hideBelow: -0.05 }
// 그리는 순서: 하늘 부품은 다른 투명한 것(이름표 등, 순서 0)보다 먼저 그려야 그 위를 덮지 않습니다. 그래서 음수.
const ORDER = { dome: -4, stars: -3, moonShade: -2, moonLit: -1 }
const LIGHT_DISTANCE = 50 // 방향광을 놓는 거리 (방향만 의미 있음)
// 광장 네 모서리 가로등 자리 (world.json 의 lamps 앞 4개와 같은 자리)
const LAMP_LIGHTS: [number, number, number][] = [[-9, 3, -9], [9, 3, -9], [9, 3, 9], [-9, 3, 9]]
const LAMP_LIGHT = { color: '#ffd28a', range: 12, power: 12 } // power × 밤 빛남 = 세기

// 고정 씨앗 의사난수 (mulberry32). 열 때마다 같은 별자리
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 반구 위 별 위치 (지평선 위만)
function starPositions(): Float32Array {
  const rand = seeded(STARS.seed)
  const out = new Float32Array(STARS.count * 3)
  for (let i = 0; i < STARS.count; i++) {
    const y = 0.05 + rand() * 0.95
    const t = rand() * Math.PI * 2
    const r = Math.sqrt(1 - y * y)
    out.set([Math.cos(t) * r * STARS.r, y * STARS.r, Math.sin(t) * r * STARS.r], i * 3)
  }
  return out
}

// 밤 덮개: 반구 안쪽 면에 지평선 → 머리 위 남색 그라데이션 (정점 색)
function domeGeometry(): THREE.SphereGeometry {
  const g = new THREE.SphereGeometry(DOME.r, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.6)
  const pos = g.getAttribute('position')
  const top = new THREE.Color(DOME.top)
  const horizon = new THREE.Color(DOME.horizon)
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const t = Math.sqrt(Math.min(1, Math.max(0, pos.getY(i) / DOME.r)))
    c.copy(horizon).lerp(top, t)
    colors.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

// 달 그림: 밝은 부분만. 위상에 맞춘 그림자 경계(타원). 북반구에서 보듯 차는 달은 오른쪽이 밝음
// 어두운 부분은 따로 원판(아래 moonShade)으로 그려 밤에만 보이게 합니다.
function drawMoon(ctx: CanvasRenderingContext2D, phase: number) {
  const c = MOON.px / 2
  const r = c - 2
  ctx.clearRect(0, 0, MOON.px, MOON.px)
  const k = Math.cos(2 * Math.PI * phase) // 1 그믐 · 0 반달 · −1 보름
  const waxing = phase < 0.5
  const crescent = k > 0
  ctx.fillStyle = MOON.lit
  ctx.beginPath()
  ctx.arc(c, c, r, -Math.PI / 2, Math.PI / 2, !waxing) // 밝은 쪽 가장자리 (위 → 아래)
  ctx.ellipse(c, c, r * Math.abs(k), r, 0, Math.PI / 2, -Math.PI / 2, waxing === crescent) // 그림자 경계 (아래 → 위)
  ctx.fill()
}

export function WorldSky() {
  const camera = useThree((s) => s.camera)
  const clock = useRef<Clock | null>(null)
  const sky = useRef<ComponentRef<typeof Sky>>(null)
  const dome = useRef<THREE.Mesh>(null)
  const stars = useRef<THREE.Points>(null)
  const moon = useRef<THREE.Group>(null)
  const moonMesh = useRef<THREE.Mesh>(null)
  const moonShade = useRef<THREE.Mesh>(null) // 달의 어두운 부분 (밤에만)
  const sun = useRef<THREE.DirectionalLight>(null)
  const ambient = useRef<THREE.AmbientLight>(null)
  const lamps = useRef<(THREE.PointLight | null)[]>([])
  const moonPhaseDrawn = useRef(-1)

  const domeGeo = useMemo(() => domeGeometry(), [])
  const domeMat = useMemo(
    () => new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, transparent: true, depthWrite: false, toneMapped: false }),
    [],
  )
  const starGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(starPositions(), 3))
    return g
  }, [])
  const starMat = useMemo(
    () => new THREE.PointsMaterial({ color: '#ffffff', size: STARS.size, sizeAttenuation: false, transparent: true, depthWrite: false, toneMapped: false }),
    [],
  )
  const moonMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }), [])
  const shadeMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: MOON.shade, transparent: true, depthWrite: false, toneMapped: false }),
    [],
  )
  const moonTex = useRef<THREE.CanvasTexture | null>(null) // 달 그림 (캔버스). 아래 effect 에서 만들어 재질에 붙임

  // 달 그림용 캔버스와 텍스처를 만들어 달 판 재질에 붙입니다.
  useLayoutEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = MOON.px
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    moonTex.current = tex
    const m = moonMesh.current?.material as THREE.MeshBasicMaterial | undefined
    if (m) {
      m.map = tex
      m.needsUpdate = true
    }
    moonPhaseDrawn.current = -1
    return () => {
      tex.dispose()
      moonTex.current = null
    }
  }, [])

  // 화면을 떠나면 직접 만든 것들을 지웁니다.
  useEffect(
    () => () => {
      for (const o of [domeGeo, domeMat, starGeo, starMat, moonMat, shadeMat]) o.dispose()
    },
    [domeGeo, domeMat, starGeo, starMat, moonMat, shadeMat],
  )

  // 하늘 부품은 레이어 2. 화면 카메라(1인칭·위에서 보기가 바뀔 때마다)만 레이어 2 를 봅니다.
  useLayoutEffect(() => {
    for (const o of [sky.current, dome.current, stars.current, moonMesh.current, moonShade.current]) o?.layers.set(SKY_LAYER)
  }, [])
  useEffect(() => {
    camera.layers.enable(SKY_LAYER)
  }, [camera])

  useFrame(() => {
    const now = Date.now()
    // 주소(?time, ?speed)는 처음 한 번 읽습니다.
    if (!clock.current) clock.current = parseClock(window.location.search, now)
    const s = skyState(worldTime(clock.current, now))

    const sunDir = toDirection(s.sun)
    const skyMat = sky.current?.material as THREE.ShaderMaterial | undefined
    skyMat?.uniforms.sunPosition.value.set(sunDir.x * SKY_DISTANCE, sunDir.y * SKY_DISTANCE, sunDir.z * SKY_DISTANCE)

    // 만든 재질·그림은 물체(ref)를 거쳐 바꿉니다. (렌더 중에 만든 값을 직접 바꾸면 React 규칙 위반)
    if (dome.current) {
      ;(dome.current.material as THREE.MeshBasicMaterial).opacity = s.night
      dome.current.visible = s.night > 0
    }
    if (stars.current) {
      ;(stars.current.material as THREE.PointsMaterial).opacity = s.stars
      stars.current.visible = s.stars > 0
    }

    if (moon.current) {
      const d = toDirection(s.moon)
      moon.current.position.set(d.x * MOON.distance, d.y * MOON.distance, d.z * MOON.distance)
      moon.current.visible = s.moon.altitude > MOON.hideBelow
    }
    if (moonShade.current) {
      ;(moonShade.current.material as THREE.MeshBasicMaterial).opacity = s.moonShade
      moonShade.current.visible = s.moonShade > 0
    }
    const phase = Math.round(s.moon.phase * 100) / 100
    const tex = moonTex.current
    if (tex && phase !== moonPhaseDrawn.current) {
      const ctx = (tex.image as HTMLCanvasElement).getContext('2d')
      if (ctx) drawMoon(ctx, phase)
      tex.needsUpdate = true
      moonPhaseDrawn.current = phase
    }

    if (sun.current) {
      const d = s.light.dir
      sun.current.position.set(d.x * LIGHT_DISTANCE, d.y * LIGHT_DISTANCE, d.z * LIGHT_DISTANCE)
      sun.current.intensity = s.light.intensity
      sun.current.color.set(s.light.color)
    }
    if (ambient.current) {
      ambient.current.intensity = s.ambient.intensity
      ambient.current.color.set(s.ambient.color)
    }
    for (const l of lamps.current) {
      if (!l) continue
      l.visible = s.glow > 0 // 낮에는 꺼서 계산하지 않게
      l.intensity = LAMP_LIGHT.power * s.glow
    }
    setNightGlow(s.glow)
  })

  return (
    <>
      <Sky ref={sky} distance={SKY_DISTANCE} />
      <mesh ref={dome} geometry={domeGeo} material={domeMat} renderOrder={ORDER.dome} />
      <points ref={stars} geometry={starGeo} material={starMat} renderOrder={ORDER.stars} />
      <group ref={moon}>
        <Billboard>
          {/* 어두운 부분: 밤에는 불투명해 달 뒤의 별을 가리고, 낮에는 안 보임 */}
          <mesh ref={moonShade} material={shadeMat} renderOrder={ORDER.moonShade}>
            <circleGeometry args={[(MOON.size / 2) * ((MOON.px / 2 - 2) / (MOON.px / 2)), 48]} />
          </mesh>
          <mesh ref={moonMesh} material={moonMat} renderOrder={ORDER.moonLit}>
            <planeGeometry args={[MOON.size, MOON.size]} />
          </mesh>
        </Billboard>
      </group>
      <directionalLight ref={sun} />
      <ambientLight ref={ambient} />
      {LAMP_LIGHTS.map((p, i) => (
        <pointLight
          key={i}
          ref={(l) => {
            lamps.current[i] = l
          }}
          position={p}
          color={LAMP_LIGHT.color}
          distance={LAMP_LIGHT.range}
          intensity={0}
        />
      ))}
    </>
  )
}
