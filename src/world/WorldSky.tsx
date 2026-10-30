// 광장의 하늘과 빛 (#316): 현실 시각(서울)을 따라 해·달이 뜨고 지고, 밤에는 남색 하늘·별·가로등·창문 불빛.
//
// 계산은 skyLogic.ts(순수 함수)가 하고, 여기서는 매 프레임(useFrame) 그 값을 three.js 물체에 직접 넣습니다.
// React 다시 그리기가 없어 가볍고, ?speed 로 빨리 돌려도 해가 끊기지 않고 움직입니다.
//
//   낮 하늘   drei Sky: 해 위치에 따라 하늘색·노을을 그리는 셰이더. 해 방향만 매 프레임 바꿈
//   밤 덮개   Sky 는 해가 지면 거의 새까매져서, 위에 남색 그라데이션 반구를 씌우고 투명도 = 밤 정도
//   별        drei Stars 는 바깥에서 투명도를 못 받아 직접 만든 점 2,500개 (고정 씨앗값이라 늘 같은 자리)
//   달        늘 카메라를 보는 판(Billboard). 위상에 맞춰 캔버스에 그린 그림, 위상이 1% 바뀔 때만 다시 그림.
//             밝은 쪽이 화면에서 해가 있는 쪽을 보도록 판을 돌림
//   빛        방향광(낮 해·밤 달), 주변광, world.json 에서 light 를 단 가로등의 점광원(밤에만 세기를 올림)
//
//   날씨     실제 서울 날씨(#317, useWorldWeather 가 받음)로 빛·별·달을 어둡게 하고(applyWeather) 회색 "흐림 덮개"를 씌움.
//            흩뿌린 별만 흐려지고 별자리는 그대로(stars 는 바꾸지 않고 fieldStars 를 따로 씀)
//
// 하늘 부품은 레이어 2(SKY_LAYER)에 둡니다. 화면 카메라만 레이어 2 를 켜고 미니맵 카메라는 켜지 않아서,
// 미니맵의 월드 바깥은 지금처럼 어두운 색으로 남습니다.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { ComponentRef, RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Billboard, Sky } from '@react-three/drei'
import * as THREE from 'three'
import { SKY_LAYER, moonLitAngle, parseClock, skyState, toDirection, worldTime } from './skyLogic'
import type { Clock } from './skyLogic'
import type { Point } from './worldLogic'
import { applyWeather, weatherAt } from './weatherLogic'
import type { WeatherFrame, WeatherSource } from './weatherLogic'
import { setNightGlow } from './worldMaterials'
import { Constellations } from './Constellations'
import { Clouds } from './Clouds'
import { Precipitation } from './Precipitation'

// 거리·크기 (스펙 5절). 카메라가 볼 수 있는 거리(기본 1000) 안쪽
const SKY_DISTANCE = 450
const DOME = { r: 400, top: '#0b1630', horizon: '#24365f' }
const OVERCAST_COLOR = '#8a9099' // 흐림 덮개 (비·눈·구름 많음)
const STARS = { r: 350, count: 2500, seed: 316, size: 1.6 }
const MOON = { distance: 330, size: 18, px: 128, lit: '#f4f1e6', shade: '#283152' }
// 그리는 순서: 하늘 부품은 다른 투명한 것(이름표 등, 순서 0)보다 먼저 그려야 그 위를 덮지 않습니다. 그래서 음수.
// 구름(−3, Clouds)은 해·달을 가리고 별자리(−2·−1, Constellations)는 가리지 않도록 그 사이에 둡니다. (#317)
const ORDER = { dome: -8, stars: -7, moonShade: -6, moonLit: -5, overcast: -4 }
const LIGHT_DISTANCE = 50 // 방향광을 놓는 거리 (방향만 의미 있음)
// 가로등 점광원. height 는 가로등 머리 높이(WorldDecor 의 기둥 높이), power × 밤 빛남 = 세기
const LAMP_LIGHT = { color: '#ffd28a', range: 12, power: 12, height: 3 }

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

// 덮개 반구 (머리 위부터 지평선 조금 아래까지)
const hemisphere = () => new THREE.SphereGeometry(DOME.r, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.6)

// 밤 덮개: 반구 안쪽 면에 지평선 → 머리 위 남색 그라데이션 (정점 색)
function domeGeometry(): THREE.SphereGeometry {
  const g = hemisphere()
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

// 달 그림: 밝은 부분만. 위상에 맞춘 그림자 경계(타원). 밝은 쪽은 늘 오른쪽으로 그리고,
// 판을 돌려(moonLitAngle) 해 쪽을 보게 합니다. 그래서 차는 달·기우는 달은 밝은 넓이(0~0.5 위상)로만 구분합니다.
// 어두운 부분은 따로 원판(아래 moonShade)으로 그려 밤에만 보이게 합니다.
function drawMoon(ctx: CanvasRenderingContext2D, phase: number) {
  const c = MOON.px / 2
  const r = c - 2
  ctx.clearRect(0, 0, MOON.px, MOON.px)
  const k = Math.cos(2 * Math.PI * phase) // 1 그믐 · 0 반달 · −1 보름
  ctx.fillStyle = MOON.lit
  ctx.beginPath()
  ctx.arc(c, c, r, -Math.PI / 2, Math.PI / 2) // 밝은 쪽 가장자리 (위 → 오른쪽 → 아래)
  ctx.ellipse(c, c, r * Math.abs(k), r, 0, Math.PI / 2, -Math.PI / 2, k > 0) // 그림자 경계 (아래 → 위). 초승·그믐달은 안쪽으로 패임
  ctx.fill()
}

// lamps: 점광원을 켤 가로등 자리 (world.json 의 lamps 중 light 를 단 것)
// onPickSign: 밤에 별자리를 누르면 그 별자리 id 로 불림 (오늘의 운세 창, #321)
// mySign: 내 별자리 id (생일로 정함, 없으면 null). 하늘에서 금색으로 보임
// weatherRef: 받은 날씨 예보(useWorldWeather, #317). followRef: 내 위치 (비·눈이 내 둘레에 내림)
type Props = {
  lamps: Point[]
  onPickSign?: (id: string) => void
  mySign?: string | null
  weatherRef: RefObject<WeatherSource>
  followRef: RefObject<{ x: number; z: number }>
}

export function WorldSky({ lamps: lampSpots, onPickSign, mySign = null, weatherRef, followRef }: Props) {
  const frame = useRef<WeatherFrame | null>(null) // 이번 프레임 하늘·날씨 값. 별자리·구름·비가 같이 씀
  const camera = useThree((s) => s.camera)
  const clock = useRef<Clock | null>(null)
  const sky = useRef<ComponentRef<typeof Sky>>(null)
  const dome = useRef<THREE.Mesh>(null)
  const overcast = useRef<THREE.Mesh>(null) // 흐림 덮개 (#317)
  const stars = useRef<THREE.Points>(null)
  const moon = useRef<THREE.Group>(null)
  const moonMesh = useRef<THREE.Mesh>(null)
  const moonShade = useRef<THREE.Mesh>(null) // 달의 어두운 부분 (밤에만)
  const sun = useRef<THREE.DirectionalLight>(null)
  const ambient = useRef<THREE.AmbientLight>(null)
  const lamps = useRef<(THREE.PointLight | null)[]>([])
  const moonPhaseDrawn = useRef(-1)
  const litAngle = useRef(0) // 달 판을 돌린 각도. 그믐·보름 무렵 방향이 안 정해지면 이 값을 그대로 씀
  // 매 프레임 쓰는 방향 벡터들. 새로 만들지 않고 이것들에 담습니다.
  const tmp = useRef({ sun: new THREE.Vector3(), moon: new THREE.Vector3(), sunView: new THREE.Vector3(), moonView: new THREE.Vector3() })

  const domeGeo = useMemo(() => domeGeometry(), [])
  const domeMat = useMemo(
    () => new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, transparent: true, depthWrite: false, toneMapped: false }),
    [],
  )
  const overcastGeo = useMemo(() => hemisphere(), [])
  const overcastMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: OVERCAST_COLOR, side: THREE.BackSide, transparent: true, depthWrite: false, toneMapped: false }),
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
      for (const o of [domeGeo, domeMat, overcastGeo, overcastMat, starGeo, starMat, moonMat, shadeMat]) o.dispose()
    },
    [domeGeo, domeMat, overcastGeo, overcastMat, starGeo, starMat, moonMat, shadeMat],
  )

  // 하늘 부품은 레이어 2. 화면 카메라(1인칭·위에서 보기가 바뀔 때마다)만 레이어 2 를 봅니다.
  useLayoutEffect(() => {
    for (const o of [sky.current, dome.current, overcast.current, stars.current, moonMesh.current, moonShade.current]) o?.layers.set(SKY_LAYER)
  }, [])
  useEffect(() => {
    camera.layers.enable(SKY_LAYER)
  }, [camera])

  useFrame((state) => {
    const now = Date.now()
    // 주소(?time, ?speed)는 처음 한 번 읽습니다.
    if (!clock.current) clock.current = parseClock(window.location.search, now)
    const ms = worldTime(clock.current, now)
    // 날씨는 실제 시각으로 고릅니다(예보가 지금 앞뒤 하루치뿐). 확인용 주소가 있으면 그 날씨
    const src = weatherRef.current
    const weather = src.override ?? weatherAt(src.hours, now)
    const s = applyWeather(skyState(ms), weather)
    frame.current = { ...s, ms, now, weather }
    const v = tmp.current

    const sunDir = toDirection(s.sun, v.sun)
    const skyMat = sky.current?.material as THREE.ShaderMaterial | undefined
    skyMat?.uniforms.sunPosition.value.copy(sunDir).multiplyScalar(SKY_DISTANCE)

    // 만든 재질·그림은 물체(ref)를 거쳐 바꿉니다. (렌더 중에 만든 값을 직접 바꾸면 React 규칙 위반)
    if (dome.current) {
      ;(dome.current.material as THREE.MeshBasicMaterial).opacity = s.night
      dome.current.visible = s.night > 0
    }
    if (overcast.current) {
      ;(overcast.current.material as THREE.MeshBasicMaterial).opacity = s.overcast
      overcast.current.visible = s.overcast > 0
    }
    if (stars.current) {
      ;(stars.current.material as THREE.PointsMaterial).opacity = s.fieldStars
      stars.current.visible = s.fieldStars > 0
    }

    const moonDir = toDirection(s.moon, v.moon)
    if (moon.current) {
      moon.current.position.copy(moonDir).multiplyScalar(MOON.distance)
      moon.current.visible = s.moonShow > 0 // 지평선 아래로 내려가면 숨김
    }
    if (moonMesh.current) {
      ;(moonMesh.current.material as THREE.MeshBasicMaterial).opacity = s.moonShow
      // 해·달 방향을 카메라 기준으로 바꿔 화면에서 해가 있는 쪽으로 달 판을 돌립니다. (Billboard 안이라 판의 x·y 가 화면의 x·y)
      v.sunView.copy(sunDir).transformDirection(state.camera.matrixWorldInverse)
      v.moonView.copy(moonDir).transformDirection(state.camera.matrixWorldInverse)
      litAngle.current = moonLitAngle(v.sunView, v.moonView, litAngle.current)
      moonMesh.current.rotation.z = litAngle.current
    }
    if (moonShade.current) {
      ;(moonShade.current.material as THREE.MeshBasicMaterial).opacity = s.moonShade
      moonShade.current.visible = s.moonShade > 0
    }
    // 밝은 쪽은 늘 오른쪽에 그리므로 기우는 달(0.5~1)은 같은 넓이의 차는 달(0~0.5)로 바꿔 그립니다.
    const folded = s.moon.phase < 0.5 ? s.moon.phase : 1 - s.moon.phase
    const phase = Math.round(folded * 100) / 100
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
      sun.current.color.setHex(s.light.color)
    }
    if (ambient.current) {
      ambient.current.intensity = s.ambient.intensity
      ambient.current.color.setHex(s.ambient.color)
    }
    // 점광원은 낮에도 켜 두고 세기만 0 으로 둡니다. 켜고 끄면 빛 개수가 바뀌어 모든 재질의 셰이더를 다시 만들어서 한 번 끊깁니다.
    for (const l of lamps.current) {
      if (l) l.intensity = LAMP_LIGHT.power * s.glow
    }
    setNightGlow(s.glow)
  })

  return (
    <>
      <Sky ref={sky} distance={SKY_DISTANCE} />
      <Constellations stateRef={frame} mySign={mySign} onPick={onPickSign} />
      <Clouds stateRef={frame} />
      <Precipitation stateRef={frame} followRef={followRef} />
      <mesh ref={dome} geometry={domeGeo} material={domeMat} renderOrder={ORDER.dome} />
      <mesh ref={overcast} geometry={overcastGeo} material={overcastMat} renderOrder={ORDER.overcast} />
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
      {lampSpots.map((p, i) => (
        <pointLight
          key={i}
          ref={(l) => {
            lamps.current[i] = l
          }}
          position={[p.x, LAMP_LIGHT.height, p.z]}
          color={LAMP_LIGHT.color}
          distance={LAMP_LIGHT.range}
          intensity={0}
        />
      ))}
    </>
  )
}
