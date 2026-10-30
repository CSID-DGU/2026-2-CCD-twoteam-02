// 광장의 비·눈 (#317). WorldSky 안에서 그립니다.
//
// 내 위치를 가운데로 한 상자(40×25×40m) 안에서만 떨어집니다. 바닥에 닿으면 위로 돌아갑니다.
// 입자는 월드에 머물러 내가 걸으면 빗속을 지나가고, 상자 밖으로 벗어난 입자만 반대쪽 끝으로 돌아옵니다(wrapAround).
// 그래서 넓은 광장 전체에 뿌리지 않아도 어디서든 비가 오는 것처럼 보입니다.
//   비  빗줄기(선분) 최대 2,000개, 초속 12m, 구름처럼 서쪽 → 동쪽으로 살짝 기울어 떨어짐
//   눈  눈송이(둥근 점) 최대 1,500개, 초속 1m, 좌우로 살랑 흔들림
// 세기(0~1)만큼만 그립니다(drawRange: 앞에서부터 몇 개만 그리기). 세기가 0 이면 숨기고 계산도 건너뜁니다.
// 위치 계산은 매 프레임 자바스크립트 배열에서 합니다(셰이더 없음). 이 정도 개수는 부담이 적습니다.
// 하늘 레이어(2)라 미니맵에 안 보입니다.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SKY_LAYER } from './skyLogic'
import { wrapAround } from './weatherLogic'
import type { WeatherFrame } from './weatherLogic'

const BOX = { w: 40, h: 25 } // 상자 가로·세로 폭, 높이 (m)
const RAIN = { count: 2000, speed: 12, length: 0.6, slant: 0.15, color: '#b8c4d4', opacity: 0.5 } // slant: 1m 떨어질 때 동쪽으로 가는 거리
const SNOW = { count: 1500, speed: 1, size: 0.12, topPx: 3, sway: 0.3, swaySeconds: 3, texPx: 32 } // topPx: 위에서 보기의 눈송이 크기(픽셀, #344)
const MAX_DT = 0.1 // 탭을 오래 비웠다 돌아와도 한 번에 너무 멀리 움직이지 않게 (초)
const SEED = 3170

// 고정 씨앗 의사난수 (mulberry32)
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

// 입자마다 처음 자리 (x·z 는 광장 가운데 둘레 −폭/2 ~ 폭/2 의 월드 좌표, y 는 0 ~ 높이) 와 흔들림 위상
function particles(count: number, seed: number) {
  const r = seeded(seed)
  const rel = new Float32Array(count * 3)
  const phase = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    rel.set([(r() - 0.5) * BOX.w, r() * BOX.h, (r() - 0.5) * BOX.w], i * 3)
    phase[i] = r() * Math.PI * 2
  }
  return { rel, phase }
}

type Particles = ReturnType<typeof particles>

const wrap = (v: number, center: number) => wrapAround(v, center, BOX.w)

// 눈송이 그림: 가운데가 진한 흰 원
function snowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = SNOW.texPx
  const ctx = c.getContext('2d')
  if (ctx) {
    const h = SNOW.texPx / 2
    const g = ctx.createRadialGradient(h, h, 0, h, h, h)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.6, 'rgba(255,255,255,0.8)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, SNOW.texPx, SNOW.texPx)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function Precipitation({ stateRef, followRef }: { stateRef: RefObject<WeatherFrame | null>; followRef: RefObject<{ x: number; z: number }> }) {
  const rainRef = useRef<THREE.LineSegments>(null)
  const snowRef = useRef<THREE.Points>(null)
  // 입자 자리 (매 프레임 y 를 내리고 바닥에 닿으면 위로). 처음 쓸 때 한 번 만듭니다.
  const parts = useRef<{ rain: Particles; snow: Particles } | null>(null)
  const rainGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN.count * 2 * 3), 3)) // 줄마다 위 끝·아래 끝
    return g
  }, [])
  const snowGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SNOW.count * 3), 3))
    return g
  }, [])
  const rainMat = useMemo(
    () => new THREE.LineBasicMaterial({ color: RAIN.color, transparent: true, opacity: RAIN.opacity, depthWrite: false }),
    [],
  )
  const snowMat = useMemo(() => new THREE.PointsMaterial({ size: SNOW.size, transparent: true, depthWrite: false }), [])

  // 눈송이 그림을 만들어 재질에 붙입니다.
  useLayoutEffect(() => {
    const tex = snowTexture()
    const m = snowRef.current?.material as THREE.PointsMaterial | undefined
    if (m) {
      m.map = tex
      m.needsUpdate = true
    }
    return () => tex.dispose()
  }, [])
  useLayoutEffect(() => {
    for (const o of [rainRef.current, snowRef.current]) {
      if (!o) continue
      o.layers.set(SKY_LAYER)
      o.frustumCulled = false // 자리가 매 프레임 바뀌어 화면 밖 판정용 경계를 믿을 수 없음
    }
  }, [])
  useEffect(
    () => () => {
      for (const o of [rainGeo, snowGeo, rainMat, snowMat]) o.dispose()
    },
    [rainGeo, snowGeo, rainMat, snowMat],
  )

  const snowTopView = useRef(false) // 눈송이를 위에서 보기(정사영) 크기로 그리는 중인지 (#344)
  useFrame(({ clock, camera }, delta) => {
    const f = stateRef.current
    const me = followRef.current
    const rain = rainRef.current
    const snow = snowRef.current
    if (!f || !rain || !snow) return
    const dt = Math.min(delta, MAX_DT)
    parts.current ??= { rain: particles(RAIN.count, SEED), snow: particles(SNOW.count, SEED + 1) }

    const rainN = Math.round(RAIN.count * f.weather.rain)
    rain.visible = rainN > 0
    if (rainN > 0) {
      const { rel } = parts.current.rain
      const pos = rain.geometry.getAttribute('position') as THREE.BufferAttribute
      const a = pos.array as Float32Array
      for (let i = 0; i < rainN; i++) {
        let y = rel[i * 3 + 1] - RAIN.speed * dt
        if (y < 0) y += BOX.h
        rel[i * 3 + 1] = y
        // 떨어지며 동쪽(+x)으로 가므로 높을수록 서쪽에 둠. 줄의 위 끝은 아래 끝보다 서쪽
        const x = wrap(rel[i * 3] - y * RAIN.slant, me.x)
        const z = wrap(rel[i * 3 + 2], me.z)
        const o = i * 6
        a[o] = x - RAIN.length * RAIN.slant
        a[o + 1] = y + RAIN.length
        a[o + 2] = z
        a[o + 3] = x
        a[o + 4] = y
        a[o + 5] = z
      }
      pos.needsUpdate = true
      rain.geometry.setDrawRange(0, rainN * 2)
    }

    const snowN = Math.round(SNOW.count * f.weather.snow)
    snow.visible = snowN > 0
    // 위에서 보기(정사영 카메라)에서는 거리에 맞춘 크기(0.12m)가 0.12 픽셀이 되어 눈이 안 보입니다(#344).
    // 그래서 위에서 볼 때는 픽셀 크기로 바꿉니다. 바뀔 때만 재질을 다시 만듭니다(셰이더 설정이 달라짐).
    const top = (camera as THREE.OrthographicCamera).isOrthographicCamera === true
    if (top !== snowTopView.current) {
      const m = snow.material as THREE.PointsMaterial
      m.sizeAttenuation = !top
      m.size = top ? SNOW.topPx : SNOW.size
      m.needsUpdate = true
      snowTopView.current = top
    }
    if (snowN > 0) {
      const { rel, phase } = parts.current.snow
      const pos = snow.geometry.getAttribute('position') as THREE.BufferAttribute
      const a = pos.array as Float32Array
      const t = (clock.elapsedTime * Math.PI * 2) / SNOW.swaySeconds
      for (let i = 0; i < snowN; i++) {
        let y = rel[i * 3 + 1] - SNOW.speed * dt
        if (y < 0) y += BOX.h
        rel[i * 3 + 1] = y
        const x = wrap(rel[i * 3] + SNOW.sway * Math.sin(t + phase[i]), me.x)
        const z = wrap(rel[i * 3 + 2] + SNOW.sway * Math.cos(t * 0.7 + phase[i]), me.z)
        a[i * 3] = x
        a[i * 3 + 1] = y
        a[i * 3 + 2] = z
      }
      pos.needsUpdate = true
      snow.geometry.setDrawRange(0, snowN)
    }
  })

  return (
    <>
      <lineSegments ref={rainRef} geometry={rainGeo} material={rainMat} />
      <points ref={snowRef} geometry={snowGeo} material={snowMat} />
    </>
  )
}
