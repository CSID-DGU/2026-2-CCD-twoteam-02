// 캠빛 해변 풍경: 바다, 모래, 나무 산책로, 야자수, 옆 울타리, 나무 문.
// 바다는 -z 쪽 큰 판 하나에 셰이더로 그립니다(실시간 조명·물체 추가 없음). 시간 값 하나와 밤낮 값만 프레임마다 바꿉니다.
// 물가의 거품은 물결 따라 모래 쪽으로 밀려왔다 빠지고, 사람이 설 수 있는 곳(shoreZ 뒤)까지 살짝 올라옵니다. 부딪힘은 beachLogic.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GATE_POST, gateSpotOnGround } from './worldLogic'
import type { PlacedGate, PlazaLayout, Point } from './worldLogic'
import { nightGlow } from './worldMaterials'
import { BOARDWALK } from './beachLogic'
import { SIGN_SCALE, SIGN_SHAPE, SIGN_TEXT, avenuePalms, glyphStrokes, signLetters } from './beachSign'
import { plankTexture, sandTexture, signTexture } from './beachTextures'

const FAR = 900 // 수평선까지 이어지는 바다·모래 판 크기 (m)
const WATER_Y = 0.03 // 모래 위로 살짝
const SAND_TILE = 7 // 모래 그림 한 장이 덮는 길이 (m)
const WALK = { y: 0.05, tile: 3 } // 나무 산책로: 높이, 판자 그림 길이 (자리는 beachLogic 의 BOARDWALK)
const ROPE = { postH: 0.8, postR: 0.06, step: 4, y: 0.6 } // 옆 울타리: 나무 말뚝과 밧줄
const PALM = {
  h: 5.6, bend: 0.9, r0: 0.2, r1: 0.1, segs: 6, ringsPerM: 2.6, // 줄기 높이·휨·굵기, 1m 당 마디 수
  fronds: 11, frondLen: 2.7, frondW: 0.62, nuts: 4, nutR: 0.1, // 잎 수·길이·폭, 코코넛
  layers: [{ len: 1, w: 1, lift: 0.45, droop: 1.6, colors: ['#3f8a3c', '#2f7a3a'] }, { len: 0.72, w: 0.85, lift: 0.85, droop: 0.9, colors: ['#5aa245', '#4a9440'] }], // 처진 바깥 잎, 위로 뻗은 안쪽 잎
}
// 야자수 밑 덤불
const SHRUB = { fronds: 9, len: 0.75, w: 0.26, spots: [[4.9, 0.6], [6.2, 0.9], [7.7, 0.5], [9.3, 0.8], [11, 0.6], [12.6, 0.9]] as [number, number][], color: '#3d7f3a', stone: '#c9c0ae', stoneR: 0.2 } // 입구 양옆 덤불 (문에서 옆으로, 앞으로 떨어진 거리), 흰 돌
const INLAND = { z: [36, 44, 54], width: 110, step: 7, r: [5, 7.5] } // 해변 쪽 입구 너머 숲: 멀어지는 줄들, 폭, 간격, 크기
// 해변 나무 문: 통나무 기둥 두 개에 곡선 간판, 양옆 나무 말뚝 울타리, 앞에 나무 계단
const GATE = {
  h: 6.1, post: 0.26, // 기둥
  sign: { thick: 0.22, bevel: 0.04, y: 5.3, z: 0.6, stroke: 0.082, depth: 0.1 }, // 간판: 판 두께, 모서리 둥글기, 자리, 글자 획 굵기·튀어나온 길이 (판 모양은 beachSign)
  picket: { w: 0.11, t: 0.03, h: [1.05, 1.4], step: 0.15, rail: 0.04 }, // 울타리 말뚝: 폭, 두께, 높이 범위, 간격, 가로대 굵기
  stair: [{ d: 1.1, y: 0.09, z: 1.6 }, { d: 0.9, y: 0.19, z: 0.7 }], // 나무 계단 두 단: 깊이, 윗면 높이, 문에서 앞으로 떨어진 거리
}
const SIGN_GLOW = { letterDay: 0.12, letterNight: 1.1, faceNight: 0.42 } // 밤에도 간판이 읽히게 글자·판이 스스로 빛나는 세기
const SEA_COLOR = { day: ['#0f6f97', '#46b8c9'], night: ['#061a2e', '#12344d'], dusk: '#f0a27a' } // 먼 바다·얕은 물, 해 질 녘 빛

// ── 바다 ───────────────────────────────────────────────────
const seaUniforms = {
  uTime: { value: 0 },
  uShore: { value: 0 },
  uNight: { value: 0 },
  uDeep: { value: new THREE.Color(SEA_COLOR.day[0]) },
  uShallow: { value: new THREE.Color(SEA_COLOR.day[1]) },
  uDusk: { value: new THREE.Color(SEA_COLOR.dusk) },
}
const SEA_DEEP = { day: new THREE.Color(SEA_COLOR.day[0]), night: new THREE.Color(SEA_COLOR.night[0]) }
const SEA_SHALLOW = { day: new THREE.Color(SEA_COLOR.day[1]), night: new THREE.Color(SEA_COLOR.night[1]) }
const seaMat = new THREE.ShaderMaterial({
  uniforms: seaUniforms,
  transparent: true,
  depthWrite: false,
  vertexShader: `
    varying vec3 vWorld;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: `
    uniform float uTime, uShore, uNight;
    uniform vec3 uDeep, uShallow, uDusk;
    varying vec3 vWorld;
    float ripple(vec2 p, float t) {
      return sin(p.x * 0.9 + t * 1.1) * 0.5 + sin(p.y * 1.7 - t * 1.4 + p.x * 0.3) * 0.3
        + sin((p.x + p.y) * 3.1 + t * 2.3) * 0.13 + sin((p.x * 0.6 - p.y) * 5.7 - t * 3.1) * 0.07;
    }
    void main() {
      vec2 p = vWorld.xz;
      float t = uTime;
      // 파도 끝: 물가에서 앞뒤로 움직이는 선. x 를 따라 조금씩 어긋남
      float surge = sin(t * 0.42 + p.x * 0.09) * 0.65 + sin(t * 0.71 + p.x * 0.23) * 0.25;
      float edge = uShore + 0.2 + surge;
      float d = edge - p.y; // 물 안쪽(바다 쪽)이 양수
      float dist = max(d, 0.0);
      // 바다 색: 물가에서 멀수록 짙음. 먼 곳은 하늘과 만나는 쪽으로 옅게
      vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 26.0, dist));
      // 해 질 녘·동틀 녘에는 밤만큼은 아니어도 바닷물이 진해짐
      float dark = 4.0 * uNight * (1.0 - uNight);
      col *= 1.0 - dark * 0.46;
      float h = ripple(p, t);
      float hx = ripple(p + vec2(0.25, 0.0), t) - h;
      float hz = ripple(p + vec2(0.0, 0.25), t) - h;
      // 멀어질수록 잔물결을 줄여 수평선 근처가 지글거리지 않게
      float near = 1.0 - smoothstep(40.0, 200.0, length(vWorld.xz - cameraPosition.xz));
      vec3 n = normalize(vec3(-hx * 0.9 * near, 1.0, -hz * 0.9 * near));
      vec3 v = normalize(cameraPosition - vWorld);
      float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
      // 해 질 녘(night 가 0 과 1 사이)에는 노을빛이 비침
      float dusk = 4.0 * uNight * (1.0 - uNight);
      vec3 sky = mix(mix(vec3(0.62, 0.8, 0.93), vec3(0.05, 0.09, 0.17), uNight), uDusk * 0.72, dusk * 0.8);
      col = mix(col, sky, clamp(fres * 0.85, 0.0, 0.8));
      // 반짝임
      float spark = pow(max(n.x * 0.35 + n.z * -0.2 + n.y * 0.9, 0.0), 120.0);
      col += spark * mix(vec3(1.0, 0.97, 0.88), vec3(0.5, 0.6, 0.8), uNight) * 0.65;
      // 물가 흰 거품: 파도 끝 줄과, 그 앞 잔 줄
      float wob = sin(p.x * 2.3 + t * 0.9) * 0.1 + sin(p.x * 5.1 - t * 1.3) * 0.05;
      float foam = (1.0 - smoothstep(0.0, 0.34, abs(d + wob))) * 0.9;
      foam += (1.0 - smoothstep(0.0, 0.16, abs(d - 1.5 + wob * 2.0 - sin(t * 0.42 + p.x * 0.09) * 0.2))) * 0.32;
      vec3 foamCol = mix(vec3(1.0), vec3(0.42, 0.5, 0.6), uNight);
      col = mix(col, foamCol, clamp(foam, 0.0, 1.0));
      // 물이 빠진 자리는 어두운 젖은 모래로 (투명한 검정), 파도 끝 뒤로 금방 사라짐
      float wet = (1.0 - smoothstep(0.0, 2.2, -d)) * 0.26;
      float inWater = smoothstep(-0.05, 0.1, d);
      float alpha = max(inWater * mix(0.72, 1.0, smoothstep(0.0, 5.0, dist)), max(wet, clamp(foam, 0.0, 1.0)));
      vec3 outCol = mix(vec3(0.16, 0.12, 0.08), col, max(inWater, clamp(foam, 0.0, 1.0)));
      gl_FragColor = vec4(outCol, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
})

function Sea({ shoreZ }: { shoreZ: number }) {
  useFrame((_, delta) => {
    const u = seaUniforms
    const g = Math.min(1, nightGlow())
    u.uTime.value += Math.min(delta, 0.1)
    u.uShore.value = shoreZ
    u.uNight.value = g
    u.uDeep.value.lerpColors(SEA_DEEP.day, SEA_DEEP.night, g)
    u.uShallow.value.lerpColors(SEA_SHALLOW.day, SEA_SHALLOW.night, g)
  })
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, WATER_Y, shoreZ + 6 - FAR / 2]} material={seaMat} renderOrder={-0.5}>
      <planeGeometry args={[FAR, FAR]} />
    </mesh>
  )
}

// ── 야자수: 줄기 + 잎을 합친 모양 하나를 나무마다 돌려 놓음 ───────────────
// 야자 잎 하나: 가운데 줄기를 따라 처지고, 양옆이 톱니처럼 갈라짐 (a: 뻗는 방향, 밑동이 원점)
function frondGeometry(a: number, len: number, width: number, lift: number, droop: number) {
  const steps = 14
  const pos: number[] = []
  const at = (s: number) => new THREE.Vector3(Math.cos(a) * s * len, lift * Math.sin(s * Math.PI * 0.6) - droop * s * s, Math.sin(a) * s * len)
  const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a))
  for (let j = 0; j < steps; j++) {
    const s0 = j / steps
    const s1 = (j + 1) / steps
    const w = width * Math.sin(Math.min(1, s0 + 0.1) * Math.PI)
    const p0 = at(s0)
    const p1 = at(s1)
    for (const sd of [-1, 1]) {
      // 잎맥에서 바깥으로 뾰족하게 뻗는 잎 조각 (끝이 아래로 살짝 처짐)
      const tip = p1.clone().addScaledVector(side, sd * w).add(new THREE.Vector3(0, -w * 0.45, 0))
      pos.push(...p0.toArray(), ...p1.toArray(), ...tip.toArray())
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

function palmGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const trunkColor = new THREE.Color('#8a6d4c')
  const color = (g: THREE.BufferGeometry, c: THREE.Color, jitter = 0) => {
    const n = g.attributes.position.count
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const k = 1 + (jitter ? ((i * 37) % 7) / 7 - 0.5 : 0) * jitter
      col[i * 3] = c.r * k
      col[i * 3 + 1] = c.g * k
      col[i * 3 + 2] = c.b * k
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }
  const at = (t: number) => new THREE.Vector3(PALM.bend * t * t, PALM.h * t, 0) // 위로 갈수록 휘는 줄기
  const trunk = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: PALM.segs + 1 }, (_, i) => at(i / PALM.segs))), PALM.segs * 2, PALM.r0, 7, false)
  // 위로 갈수록 가늘게
  const tp = trunk.attributes.position
  for (let i = 0; i < tp.count; i++) {
    const t = tp.getY(i) / PALM.h
    const c = at(Math.max(0, Math.min(1, t)))
    const k = (PALM.r1 + (PALM.r0 - PALM.r1) * (1 - t)) / PALM.r0
    tp.setXYZ(i, c.x + (tp.getX(i) - c.x) * k, tp.getY(i), tp.getZ(i) * k)
  }
  trunk.computeVertexNormals()
  // 줄기: 마디마다 밝고 어두운 고리
  const bark = trunk.toNonIndexed()
  const bp = bark.attributes.position
  const barkCol = new Float32Array(bp.count * 3)
  for (let i = 0; i < bp.count; i++) {
    const k = 0.78 + 0.28 * Math.abs(Math.sin(bp.getY(i) * PALM.ringsPerM * Math.PI)) + ((i * 53) % 9) * 0.008
    barkCol[i * 3] = trunkColor.r * k
    barkCol[i * 3 + 1] = trunkColor.g * k
    barkCol[i * 3 + 2] = trunkColor.b * k
  }
  bark.setAttribute('color', new THREE.BufferAttribute(barkCol, 3))
  parts.push(bark)
  const top = at(1)
  PALM.layers.forEach((L, layer) => {
    const count = PALM.fronds - layer * 2
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + layer * 0.35
      const g = frondGeometry(a, PALM.frondLen * L.len, PALM.frondW * L.w, L.lift, L.droop)
      g.translate(top.x, top.y, top.z)
      parts.push(color(g, new THREE.Color(i % 2 ? L.colors[0] : L.colors[1]), 0.35))
    }
  })
  // 코코넛
  for (let i = 0; i < PALM.nuts; i++) {
    const a = (i / PALM.nuts) * Math.PI * 2
    const nut = new THREE.SphereGeometry(PALM.nutR, 7, 5).toNonIndexed()
    nut.translate(top.x + Math.cos(a) * 0.17, top.y - 0.16, top.z + Math.sin(a) * 0.17)
    parts.push(color(nut, new THREE.Color('#5a3d22'), 0.2))
  }
  for (const p of parts) for (const name of Object.keys(p.attributes)) if (!['position', 'normal', 'color'].includes(name)) p.deleteAttribute(name)
  return mergeGeometries(parts)!
}

const palmMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide })
function Palms({ trees }: { trees: Point[] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => palmGeometry(), [])
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new THREE.Object3D()
    trees.forEach((t, i) => {
      o.position.set(t.x, 0, t.z)
      o.rotation.y = ((t.x * 13 + t.z * 7) % 6.28) // 나무마다 휘는 쪽을 다르게 (값이 고정이라 늘 같은 모습)
      const s = 0.85 + (((t.x * 3 + t.z) % 5) + 5) % 5 * 0.07
      o.scale.setScalar(s)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }, [trees])
  useEffect(() => () => geo.dispose(), [geo])
  return <instancedMesh key={trees.length} ref={ref} args={[geo, palmMat, trees.length]} frustumCulled={false} />
}

// ── 모래·산책로·울타리 ────────────────────────────────────────
const sandMat = () => {
  const map = sandTexture()
  map.repeat.set(FAR / SAND_TILE, FAR / SAND_TILE)
  return new THREE.MeshStandardMaterial({ map, roughness: 0.95 })
}
let sandMaterial: THREE.MeshStandardMaterial | null = null
const woodMat = new THREE.MeshStandardMaterial({ color: '#7d5a3a', roughness: 0.85 })
const ropeMat = new THREE.MeshStandardMaterial({ color: '#c9b48a', roughness: 0.95 })

function plankPlane(w: number, d: number) {
  const g = new THREE.PlaneGeometry(w, d)
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / WALK.tile, (uv.getY(i) * d) / WALK.tile)
  return g
}
let plankMaterial: THREE.MeshStandardMaterial | null = null

export function BeachScenery({ plaza }: { plaza: PlazaLayout }) {
  const shoreZ = plaza.beach!.shoreZ
  const { w, d } = plaza.size
  const south = d / 2
  sandMaterial ??= sandMat()
  plankMaterial ??= new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.8 })
  const crossD = BOARDWALK.z1 - BOARDWALK.z0
  const stemD = south - BOARDWALK.z1
  const walk = useMemo(() => ({ cross: plankPlane(w - BOARDWALK.sideGap * 2, crossD), stem: plankPlane(BOARDWALK.stemW, stemD) }), [w, crossD, stemD])
  useEffect(() => () => {
    walk.cross.dispose()
    walk.stem.dispose()
  }, [walk])
  const posts = useMemo(() => {
    const out: [number, number][] = []
    for (const sx of [-1, 1]) for (let z = shoreZ + 1; z < south; z += ROPE.step) out.push([(sx * w) / 2 - sx * 0.15, z])
    return out
  }, [shoreZ, south, w])
  return (
    <group>
      {/* 모래: 바다 아래까지 넓게 깔아 물이 빠져도 틈이 없음 */}
      <mesh rotation-x={-Math.PI / 2} material={sandMaterial}>
        <planeGeometry args={[FAR, FAR]} />
      </mesh>
      <Sea shoreZ={shoreZ} />
      <mesh rotation-x={-Math.PI / 2} position={[0, WALK.y, (BOARDWALK.z0 + BOARDWALK.z1) / 2]} geometry={walk.cross} material={plankMaterial} />
      <mesh rotation-x={-Math.PI / 2} position={[0, WALK.y, BOARDWALK.z1 + stemD / 2]} geometry={walk.stem} material={plankMaterial} />
      <Palms trees={plaza.trees} />
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[x, ROPE.postH / 2, z]} material={woodMat}>
          <cylinderGeometry args={[ROPE.postR, ROPE.postR, ROPE.postH, 6]} />
        </mesh>
      ))}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[(sx * w) / 2 - sx * 0.15, ROPE.y, (shoreZ + 1 + south) / 2]} rotation-x={Math.PI / 2} material={ropeMat}>
          <cylinderGeometry args={[0.018, 0.018, south - shoreZ - 1, 5]} />
        </mesh>
      ))}
    </group>
  )
}

// 곡선 간판 모양: 위아래가 활처럼 휜 판 (앞면 그림의 칸은 판 전체에 맞춤)
function signOutline() {
  const { w, top, bottom, bow } = SIGN_SHAPE
  const hw = w / 2
  const s = new THREE.Shape()
  s.moveTo(-hw, -bottom - bow)
  s.quadraticCurveTo(0, -bottom + bow, hw, -bottom - bow)
  s.lineTo(hw, top - bow * 0.9)
  s.quadraticCurveTo(0, top + bow * 0.9, -hw, top - bow * 0.9)
  s.closePath()
  return s
}
const SIGN_RANGE = { y0: -SIGN_SHAPE.bottom - SIGN_SHAPE.bow, y1: SIGN_SHAPE.top + SIGN_SHAPE.bow * 0.45 }
const signBoardMat = new THREE.MeshStandardMaterial({ color: '#a98a64', roughness: 0.9 }) // 판 옆면·뒷면은 칠하지 않은 나무
let signFaceMat: THREE.MeshStandardMaterial | null = null
const logMat = new THREE.MeshStandardMaterial({ color: '#b5926a', roughness: 0.95 }) // 껍질 벗긴 통나무
const picketMat = new THREE.MeshStandardMaterial({ color: '#8a6a4a', roughness: 0.95 })
const stairMat = new THREE.MeshStandardMaterial({ color: '#a47c52', roughness: 0.85 })
const nearMat = new THREE.MeshStandardMaterial({ color: '#f59e0b', emissive: '#f59e0b', emissiveIntensity: 0.5 })

// 글자를 한 모양으로 합침: 획마다 네모 막대를 앞으로 뽑고, 판 곡선을 따라 놓음
const letterMat = new THREE.MeshStandardMaterial({ color: '#17a2ad', roughness: 0.5, emissive: '#17a2ad', emissiveIntensity: SIGN_GLOW.letterDay })
function letterGeometry() {
  const { stroke, depth } = GATE.sign
  const parts: THREE.BufferGeometry[] = []
  for (const l of signLetters(SIGN_TEXT)) {
    const place = new THREE.Matrix4().makeRotationZ(l.rot).setPosition(l.x, l.y, 0)
    const local = new THREE.Matrix4().makeTranslation(-l.w / 2, -l.h / 2, 0)
    for (const line of glyphStrokes(l.ch)) {
      for (let i = 1; i < line.length; i++) {
        const [x0, y0] = line[i - 1]
        const [x1, y1] = line[i]
        const ax = x0 * l.h
        const ay = y0 * l.h
        const bx = x1 * l.h
        const by = y1 * l.h
        const len = Math.hypot(bx - ax, by - ay)
        if (len < 1e-5) continue
        // 꺾이는 곳이 벌어지지 않게 획 굵기만큼 양쪽으로 조금 늘림
        const g = new THREE.BoxGeometry(len + stroke, stroke, depth)
        const m = new THREE.Matrix4().makeRotationZ(Math.atan2(by - ay, bx - ax)).setPosition((ax + bx) / 2, (ay + by) / 2, depth / 2)
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(place, new THREE.Matrix4().multiplyMatrices(local, m)))
        parts.push(g)
      }
    }
  }
  return mergeGeometries(parts)!
}

const shrubMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide })
const stoneMat = new THREE.MeshStandardMaterial({ color: SHRUB.stone, roughness: 0.95 })
function shrubGeometry() {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < SHRUB.fronds; i++) {
    const g = frondGeometry((i / SHRUB.fronds) * Math.PI * 2, SHRUB.len * (0.8 + (i % 3) * 0.15), SHRUB.w, 0.6, 0.7)
    const c = new THREE.Color(SHRUB.color).multiplyScalar(0.85 + (i % 4) * 0.12)
    const n = g.attributes.position.count
    const col = new Float32Array(n * 3)
    for (let k = 0; k < n; k++) c.toArray(col, k * 3)
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.translate(0, 0.05, 0)
    parts.push(g)
  }
  return mergeGeometries(parts)!
}
// 입구 양옆 덤불과 돌 (문 기준)
function GateShrubs({ onGround }: { onGround: (x: number, z: number) => boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const stones = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => shrubGeometry(), [])
  useEffect(() => () => geo.dispose(), [geo])
  // 땅 밖으로 나가는 자리는 뺍니다 (양옆 [sx, 자리] 목록)
  const spots = useMemo(() => [-1, 1].flatMap((sx) => SHRUB.spots.filter(([x, z]) => onGround(sx * x, z)).map((spot) => [sx, spot] as const)), [onGround])
  const count = spots.length
  useLayoutEffect(() => {
    const o = new THREE.Object3D()
    spots.forEach(([sx, [x, z]], i) => {
        o.position.set(sx * x, 0, z)
        o.rotation.y = x * 2.1 + sx
        o.scale.setScalar(0.9 + ((x * 7) % 3) * 0.22)
        o.updateMatrix()
        ref.current?.setMatrixAt(i, o.matrix)
        o.position.set(sx * (x + 0.55), SHRUB.stoneR * 0.5, z + 0.35)
        o.scale.set(1.25, 0.72, 1)
        o.updateMatrix()
        stones.current?.setMatrixAt(i, o.matrix)
    })
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true
    if (stones.current) stones.current.instanceMatrix.needsUpdate = true
  }, [spots])
  return (
    <>
      <instancedMesh ref={ref} args={[geo, shrubMat, count]} frustumCulled={false} />
      <instancedMesh ref={stones} args={[undefined, stoneMat, count]} frustumCulled={false}>
        <dodecahedronGeometry args={[SHRUB.stoneR, 0]} />
      </instancedMesh>
    </>
  )
}

// 해변 쪽 입구 너머: 멀리 둥근 숲이 이어져 수평선을 가림 (모래 → 숲)
const forestMat = new THREE.MeshStandardMaterial({ color: '#2f6b3a', roughness: 1, flatShading: true })
function InlandForest() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const spots = useMemo(() => {
    const out: { x: number; z: number; r: number }[] = []
    INLAND.z.forEach((z, row) => {
      for (let x = -INLAND.width / 2; x <= INLAND.width / 2; x += INLAND.step) {
        const k = ((x * 13 + row * 7) % 5 + 5) % 5
        out.push({ x: x + row * 2.4, z, r: INLAND.r[0] + (k / 5) * (INLAND.r[1] - INLAND.r[0]) })
      }
    })
    return out
  }, [])
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new THREE.Object3D()
    spots.forEach((p, i) => {
      o.position.set(p.x, p.r * 0.45, -p.z)
      o.scale.set(p.r, p.r * 0.85, p.r)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }, [spots])
  return (
    <instancedMesh key={spots.length} ref={ref} args={[undefined, forestMat, spots.length]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 1]} />
    </instancedMesh>
  )
}

// 말뚝 높이는 자리로 정해 늘 같은 모습 (들쭉날쭉한 손 울타리)
function Pickets({ side, from, len }: { side: number; from: number; len: number }) {
  const P = GATE.picket
  const ref = useRef<THREE.InstancedMesh>(null)
  const count = Math.floor(len / P.step)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new THREE.Object3D()
    for (let i = 0; i < count; i++) {
      const h = P.h[0] + ((i * 37) % 11) / 10 * (P.h[1] - P.h[0])
      o.position.set(side * (from + i * P.step), h / 2, 0)
      o.scale.set(1, h, 1)
      o.rotation.z = (((i * 13) % 7) / 7 - 0.5) * 0.05
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  }, [count, from, side, P])
  return (
    <>
      <instancedMesh key={count} ref={ref} args={[undefined, picketMat, count]} frustumCulled={false}>
        <boxGeometry args={[P.w, 1, P.t]} />
      </instancedMesh>
      {[0.3, 0.85].map((y) => (
        <mesh key={y} position={[side * (from + len / 2), y, -0.03]} material={picketMat}>
          <boxGeometry args={[len, P.rail, P.rail]} />
        </mesh>
      ))}
    </>
  )
}

// 문 너머로 보이는 풍경: 모래와 나무 길 뒤로, 광장 쪽 문은 바다, 해변 쪽 문은 숲 (캠퍼스 문의 길·소나무 대신)
const OVER_GATE = { w: 90, sand: 46, sea: 160, walk: 3.4 }
const overSeaMat = new THREE.MeshStandardMaterial({ color: SEA_COLOR.day[0], roughness: 0.35 })
// limit: 옆 문 풍경과 겹치지 않는 가로 범위 (gateViewSpan). 모래판은 원래 폭 안에서 이 범위까지만
export function BeachGateView({ gate, inland, limit = [-Infinity, Infinity] }: { gate: PlacedGate; inland: boolean; limit?: [number, number] }) {
  const span = [Math.max(limit[0], -OVER_GATE.w / 2), Math.min(limit[1], OVER_GATE.w / 2)]
  sandMaterial ??= sandMat()
  plankMaterial ??= new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.8 })
  const walk = useMemo(() => plankPlane(OVER_GATE.walk, OVER_GATE.sand), [])
  useEffect(() => () => walk.dispose(), [walk])
  return (
    <group position={[gate.spec.x, 0, gate.spec.z]} rotation-y={gate.angle}>
      <mesh rotation-x={-Math.PI / 2} position={[(span[0] + span[1]) / 2, -0.02, -OVER_GATE.sand / 2 - 1]} material={sandMaterial}>
        <planeGeometry args={[span[1] - span[0], OVER_GATE.sand]} />
      </mesh>
      {/* 문 너머로 이어지는 나무 길 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, -OVER_GATE.sand / 2]} geometry={walk} material={plankMaterial} />
      {inland ? (
        <InlandForest />
      ) : (
        <mesh rotation-x={-Math.PI / 2} position={[0, -0.03, -OVER_GATE.sand - 1 - OVER_GATE.sea / 2]} material={overSeaMat}>
          <planeGeometry args={[OVER_GATE.w * 3, OVER_GATE.sea]} />
        </mesh>
      )}
    </group>
  )
}

// 해변으로 이어지는 입구 (광장 쪽 문, 해변 쪽 문이 같음). 부딪힘은 placeGates 의 기둥·울타리 그대로. 글자는 간판 그림 (signTexture)
// size: 넘기면 앞쪽 야자수·덤불 중 그 땅 밖으로 나가는 것은 그리지 않음 (광장 모퉁이 가까이 선 문)
export function BeachGate({ gate, near, size }: { gate: PlacedGate; near: boolean; size?: { w: number; d: number } }) {
  useFrame(() => {
    const g = Math.min(1, nightGlow())
    letterMat.emissiveIntensity = SIGN_GLOW.letterDay + (SIGN_GLOW.letterNight - SIGN_GLOW.letterDay) * g
    if (signFaceMat) signFaceMat.emissiveIntensity = SIGN_GLOW.faceNight * g
  })
  const postX = gate.spec.w / 2 + GATE_POST / 2
  const S = GATE.sign
  const shapes = useMemo(() => {
    const out = signOutline()
    const board = new THREE.ExtrudeGeometry(out, { depth: S.thick, bevelEnabled: true, bevelSize: S.bevel, bevelThickness: S.bevel, bevelSegments: 2, curveSegments: 16 })
    const face = new THREE.ShapeGeometry(out, 16)
    const pos = face.attributes.position
    const uv = face.attributes.uv
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / SIGN_SHAPE.w + 0.5, (pos.getY(i) - SIGN_RANGE.y0) / (SIGN_RANGE.y1 - SIGN_RANGE.y0))
    return { board, face, letters: letterGeometry() }
  }, [S])
  useEffect(() => () => {
    shapes.board.dispose()
    shapes.face.dispose()
    shapes.letters.dispose()
  }, [shapes])
  signFaceMat ??= new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.88, emissive: '#ffffff', emissiveMap: signTexture(), emissiveIntensity: 0 })
  const onGround = useCallback((x: number, z: number) => !size || gateSpotOnGround(gate, x, z, size), [gate, size])
  // 뒤쪽 줄(z < 0)은 원래 땅 밖 풍경이므로 앞쪽만 거릅니다
  const avenue = useMemo(() => avenuePalms(gate.spec.to === 'beach').filter((p) => p.z < 0 || onGround(p.x, p.z)), [gate.spec.to, onGround])
  return (
    <group position={[gate.spec.x, 0, gate.spec.z]} rotation-y={gate.angle}>
      {[-postX, postX].map((x) => (
        <mesh key={x} position={[x, GATE.h / 2, 0]} material={logMat}>
          <cylinderGeometry args={[GATE.post, GATE.post * 1.2, GATE.h, 9]} />
        </mesh>
      ))}
      <group position={[0, S.y, S.z]} scale={SIGN_SCALE}>
        {/* 뒤판(판 옆면·뒤는 나무) → 앞면 그림 → 앞으로 튀어나온 글자 */}
        <mesh geometry={shapes.board} material={near ? nearMat : signBoardMat} position-z={-S.thick - S.bevel} />
        <mesh geometry={shapes.face} material={signFaceMat} position-z={S.bevel + 0.002} />
        <mesh geometry={shapes.letters} material={letterMat} position-z={S.bevel} />
      </group>
      <Pickets side={-1} from={postX + GATE.post} len={gate.fenceLen + GATE_POST} />
      <Pickets side={1} from={postX + GATE.post} len={gate.fenceLen + GATE_POST} />
      {GATE.stair.map((st) => (
        <mesh key={st.z} position={[0, st.y / 2, st.z]} material={stairMat}>
          <boxGeometry args={[gate.spec.w - 0.5, st.y, st.d]} />
        </mesh>
      ))}
      <Palms trees={avenue} />
      <GateShrubs onGround={onGround} />
    </group>
  )
}
