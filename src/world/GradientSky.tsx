// 광장 하늘 바탕: 노을·동틀 녘 그라데이션과 해. WorldSky 안에서 그립니다.
//
// 큰 구의 안쪽 면에 셰이더(화면의 점마다 색을 계산하는 GPU 프로그램)로 하늘을 칠합니다. 색은 skyColorLogic 이 해 고도로 정하고,
// 여기서는 매 프레임 그 색과 해 방향을 셰이더 값(uniform)에 넣기만 합니다. 색이 바뀔 때만 다시 넣습니다.
//
//   그라데이션  보는 방향의 높이로 지평선 → 중간 → 머리 위 색
//   노을빛      해가 있는 방향일수록, 지평선에 가까울수록 glow 색이 진하게 (반대쪽 하늘은 푸르스름하게 남음)
//   지평선 아래 지평선 색을 조금 어둡게 (광장 바닥 너머)
//   해          동그란 원반 + 빛번짐. 지평선 아래 부분은 가려 지평선에 걸리면 반쪽만 보임
//
// 하늘 레이어(2)라 미니맵에 안 보이고, 가장 먼저 그려(순서 −9) 별·달·구름이 그 위에 그려집니다.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SKY_LAYER, toDirection } from './skyLogic'
import { skyPalette } from './skyColorLogic'
import type { SkyPalette } from './skyColorLogic'
import type { WeatherFrame } from './weatherLogic'

const RADIUS = 400 // 별(350)·달(330)보다 바깥, 카메라가 볼 수 있는 거리(1000) 안
const ORDER = -9 // 하늘 부품 중 가장 먼저 (WorldSky 의 ORDER 참고)
const COLORS = ['zenith', 'mid', 'horizon', 'glow', 'sun'] as const

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition; // 카메라에서 이 점을 보는 방향
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 zenith;
  uniform vec3 mid;
  uniform vec3 horizon;
  uniform vec3 glow;
  uniform float glowAmount;
  uniform vec3 sunDir;
  uniform vec3 sun;
  uniform float sunSize;
  uniform float sunShow;
  uniform float halo;
  varying vec3 vDir;

  void main() {
    vec3 d = normalize(vDir);
    float up = clamp(d.y, 0.0, 1.0);
    // 지평선 → 중간 → 머리 위
    vec3 col = mix(horizon, mid, smoothstep(0.0, 0.25, up));
    col = mix(col, zenith, smoothstep(0.2, 0.9, up));
    // 노을빛: 수평 방향이 해 방위와 가까울수록(0 반대쪽 ~ 1 해 쪽), 지평선에 가까울수록
    vec2 flat_d = normalize(d.xz + vec2(1e-5));
    vec2 flat_s = normalize(sunDir.xz + vec2(1e-5));
    float face = dot(flat_d, flat_s) * 0.5 + 0.5;
    float band = 1.0 - smoothstep(0.0, 0.45, up);
    col = mix(col, glow, glowAmount * face * face * face * band);
    // 지평선 아래는 조금 어둡게
    col = mix(col, horizon * 0.6, smoothstep(0.0, -0.08, d.y));
    // 해: 빛번짐(넓게 + 테두리 가까이) 과 원반. 지평선 아래 부분은 가림
    float ang = acos(clamp(dot(d, sunDir), -1.0, 1.0));
    float above = smoothstep(-0.004, 0.004, d.y);
    col += sun * (exp(-ang * 8.0) * 0.6 + exp(-ang * 30.0) * 0.5) * halo * sunShow * above;
    float disk = 1.0 - smoothstep(sunSize * 0.9, sunSize, ang);
    col = mix(col, sun, disk * sunShow * above);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

export function GradientSky({ stateRef }: { stateRef: RefObject<WeatherFrame | null> }) {
  const mesh = useRef<THREE.Mesh>(null)
  const geo = useMemo(() => new THREE.SphereGeometry(RADIUS, 48, 24), [])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          zenith: { value: new THREE.Color() },
          mid: { value: new THREE.Color() },
          horizon: { value: new THREE.Color() },
          glow: { value: new THREE.Color() },
          glowAmount: { value: 0 },
          sunDir: { value: new THREE.Vector3(0, 1, 0) },
          sun: { value: new THREE.Color() },
          sunSize: { value: 0 },
          sunShow: { value: 0 },
          halo: { value: 0 },
        },
        vertexShader,
        fragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  )
  // 지금 셰이더에 넣어 둔 색 (바뀔 때만 다시 넣음). 매 프레임 쓰는 방향 벡터
  const tmp = useRef({ colors: {} as Partial<Record<(typeof COLORS)[number], number>>, dir: { x: 0, y: 0, z: 0 } })

  useLayoutEffect(() => {
    mesh.current?.layers.set(SKY_LAYER)
  }, [])
  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
    },
    [geo, mat],
  )

  useFrame(({ camera }) => {
    const f = stateRef.current
    const m = mesh.current
    if (!f || !m) return
    m.position.copy(camera.position) // 하늘이 늘 카메라를 둘러싸게 (넓은 월드에서 끝에 가도 하늘 안)
    const u = (m.material as THREE.ShaderMaterial).uniforms
    const p: SkyPalette = skyPalette((f.sun.altitude * 180) / Math.PI, f.weather.cloud)
    const t = tmp.current
    for (const k of COLORS) {
      if (t.colors[k] === p[k]) continue
      ;(u[k].value as THREE.Color).setHex(p[k]) // sRGB 색을 three.js 작업 색공간으로 바꿔 넣음
      t.colors[k] = p[k]
    }
    const d = toDirection(f.sun, t.dir)
    ;(u.sunDir.value as THREE.Vector3).set(d.x, d.y, d.z)
    u.glowAmount.value = p.glowAmount
    u.sunSize.value = p.sunSize
    u.sunShow.value = p.sunShow
    u.halo.value = p.halo
  })

  return <mesh ref={mesh} geometry={geo} material={mat} renderOrder={ORDER} />
}
