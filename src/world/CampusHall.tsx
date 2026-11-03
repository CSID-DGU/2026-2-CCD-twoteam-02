// 캠퍼스 돌 건물 (사용자 참고 사진의 구성: 줄지어 선 창, 맨 위 유리층, 얇은 금속 처마. 질감은 원통 도서관과 같은 쌓은 돌).
// 창은 도서관처럼 만듭니다: 벽에 진짜 구멍 + 안쪽으로 들어간 유리(hallGlass: 안이 흐릿하게 비침) + 회녹색 창살 + 돌 창턱.
//   CampusHall  한 지점의 건물 날개 (강의동·정보관·라운지가 나란히 이어져 큰 본관 하나로 보임, 카페는 따로).
//   MainGate    본관 가운데 시계탑: 박공 돌 앞면 + 교표·시계·학교 이름 + 세로 지느러미 + 유리, 아래는 걸어서 지나가는 아치 통로.
// 지점마다 입구는 따로이고 들어가면 원래 지점입니다. 건물 칸을 그대로 쓰므로 좌석·입구 동작은 그대로.
// 가볍게: 그림 파일·새 조명 없음. 실내를 실시간으로 그리지 않고, 면을 하나로 합쳐 건물 칸마다 그리는 횟수를 줄입니다.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { rotate } from './worldLogic'
import type { MainGateSpec, PlacedBuilding } from './worldLogic'
import { HALL_BELTS, PORCH, clockAngles, hallBays, porchColumns } from './hallLogic'
import { clockFaceTexture, emblemTexture, hallSignTexture, schoolNameTexture } from './campusSigns'
import { hallGlassMat } from './hallGlass'
import { ashlar, LIB_TILE, limestone } from '../space/libraryTextures'
import { MAT, NIGHT_UNIFORM, colorMat, shopWindowMat } from './worldMaterials'

const FRAME = '#a89e8a' // 문 테두리 (돌 그늘색)
const BRONZE = '#5a4836' // 문: 도서관 문틀과 같은 청동색
const METAL = '#b9b6ae' // 처마·난간
const EAVE_DARK = '#5d5a55' // 처마 밑
const H = 11 // 돌 벽 높이 (3층)
const TOP = { h: 3.2, in: 0.5, eave: 0.9, eaveT: 0.22 } // 맨 위 유리층: 높이, 안으로 들인 거리, 처마 길이·두께
const GLASS_IN = 0.18 // 유리가 벽 면에서 들어간 깊이 (창 구멍 안쪽 면이 보임, 도서관과 같음)
const BEHIND = 0.06 // 몸통은 유리보다 이만큼 더 안쪽 (같은 깊이면 깜빡이는 검은 줄무늬가 생김)
const BAR = { t: 0.055, d: 0.07, in: 0.12, frame: 0.08, color: '#55625e' } // 창살 굵기·깊이, 벽 면에서 들어간 길이, 틀 굵기, 색 (도서관과 같음)
const SILL = { h: 0.12, out: 0.14, side: 0.12, lintel: 0.16 } // 돌 창턱: 높이, 튀어나옴, 옆으로 더 김, 창 위 돌 높이
const TOP_MULLION = { every: 1.5, t: 0.09, d: 0.08 } // 맨 위 유리층 세로 틀
const DOOR = { h: 2.4, frame: 0.3 }

// 밤에 돌이 스스로 빛남 (도서관 washMaterial 과 같은 방법, 새 조명 없음). 낮에는 0.
// fill 전체 채움광, up 바닥에서 위로 번지는 빛(창 사이 간격으로 줄무늬), upFall 위로 줄어드는 길이(m), eave 맨 위 처마 밑 빛
const WASH = { color: [1.0, 0.76, 0.48], fill: 0.2, up: 0.75, upFall: 5.5, spacing: 2.6, eave: 0.32, eaveY: 10.6, eaveFall: 1.1 }
function nightWash(m: THREE.MeshStandardMaterial) {
  const W = WASH
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uHallNight = NIGHT_UNIFORM
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHall;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHall = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uHallNight;\nvarying vec3 vHall;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (uHallNight > 0.001) {
          float h = vHall.y;
          float along = vHall.x + vHall.z;
          float beam = 0.6 + 0.4 * cos(along * ${((Math.PI * 2) / W.spacing).toFixed(3)});
          float e = (h - ${W.eaveY.toFixed(2)}) / ${W.eaveFall.toFixed(2)};
          float k = ${W.fill.toFixed(2)} + ${W.up.toFixed(2)} * beam * exp(-h / ${W.upFall.toFixed(2)}) + ${W.eave.toFixed(2)} * exp(-e * e);
          totalEmissiveRadiance += diffuseColor.rgb * vec3(${W.color.map((v) => v.toFixed(2)).join(',')}) * k * uHallNight;
        }`,
      )
  }
  return m
}

// 쌓은 돌 재질 (도서관 ashlar 그림). 돌 크기가 어디서나 같게 면마다 실제 크기로 UV 를 맞춤
let wallMatCached: THREE.MeshStandardMaterial | null = null
function wallMat() {
  if (!wallMatCached) {
    const t = ashlar()
    wallMatCached = nightWash(new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 1.2, roughness: 0.92 }))
  }
  return wallMatCached
}
let smoothCached: THREE.MeshStandardMaterial | null = null
const smoothMat = () => (smoothCached ??= nightWash(new THREE.MeshStandardMaterial({ map: limestone(), roughness: 0.85 })))
function stoneBox(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d)
  const uv = g.attributes.uv
  const sizes: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]] // 면 순서: +x -x +y -y +z -z
  for (let i = 0; i < uv.count; i++) {
    const [a, b] = sizes[Math.floor(i / 4)]
    uv.setXY(i, (uv.getX(i) * a) / LIB_TILE.ashlar, (uv.getY(i) * b) / LIB_TILE.ashlar)
  }
  return g
}

const GATE = { h: 14.6, gable: 3.2, archH: 4.6, fins: 6, finT: 0.42, finD: 0.7, glassFrom: 6.9, glassTo: 13.4, canopyY: 4.95, canopyD: 1.1 }
const CLOCK = { y: 15.35, r: 1.15, hour: 0.62, minute: 0.92, second: 1.0, out: 0.06 } // 시계: 높이, 반지름, 바늘 길이, 벽에서 띄움
const NAME = { y: 5.9, w: 6.6, h: 1.03 } // 학교 이름 (창 아래 돌 벽)
const EMBLEM = { y: 16.95, r: 0.34 } // 교표 (박공 꼭대기)
const SIGN = { w: 2.5 } // 현관 간판 폭
const TUNNEL_IN = 0.03 // 아치 통로 벽을 양옆 건물 벽보다 안쪽으로 (같은 자리면 면이 겹쳐 지직거림)
const STEP = [{ h: 0.08, pad: 1.3, out: 2.2 }, { h: 0.16, pad: 0.9, out: 1.75 }] // 현관 앞 낮은 돌 계단 (걸어 지나감): 높이, 문 옆 폭, 벽에서 나온 거리

const barMat = () => colorMat(BAR.color)
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed()
const T = GLASS_IN + BEHIND // 창이 있는 벽판 두께

// 벽판 하나: width 폭의 면을 at 만큼 앞에 세움(+z 방향). 호출한 쪽이 돌려서 네 면 중 하나로 씀
function windowFace(width: number, at: number, doorX: number, doorW: number) {
  const panes: THREE.BufferGeometry[] = []
  const bars: THREE.BufferGeometry[] = []
  const trim: THREE.BufferGeometry[] = []
  const face = new THREE.Shape([new THREE.Vector2(-width / 2, 0), new THREE.Vector2(width / 2, 0), new THREE.Vector2(width / 2, H), new THREE.Vector2(-width / 2, H)])
  const bays = hallBays(width, doorX, doorW)
  const z = at - BAR.in
  const F = BAR.frame
  const holes: THREE.Path[] = bays.map((b, i) => {
    const x0 = b.x - b.w / 2
    const y0 = b.y - b.h / 2
    const r = b.w / 2
    const spring = y0 + b.h - r // 아치가 시작되는 높이
    const hole = new THREE.Path()
    const outline = new THREE.Shape()
    for (const path of [hole, outline]) {
      path.moveTo(x0, y0)
      if (b.arch) {
        path.lineTo(x0 + b.w, y0)
        path.lineTo(x0 + b.w, spring)
        path.absarc(b.x, spring, r, 0, Math.PI, false)
      } else {
        path.lineTo(x0 + b.w, y0)
        path.lineTo(x0 + b.w, y0 + b.h)
        path.lineTo(x0, y0 + b.h)
      }
      path.closePath()
    }
    // 유리: 실내 그림의 다른 부분을 보여 창마다 조금씩 다르게
    const pane = new THREE.ShapeGeometry(outline, 12)
    const u0 = ((i * 37) % 50) / 100
    const v0 = ((i * 53) % 30) / 100
    const uv = pane.attributes.uv
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + ((uv.getX(k) - x0) / b.w) * 0.5, v0 + ((uv.getY(k) - y0) / b.h) * 0.7)
    panes.push(pane.translate(0, 0, at - GLASS_IN).toNonIndexed())
    // 창살: 도서관처럼 격자
    const top = b.arch ? spring : y0 + b.h
    const tall = top - y0
    bars.push(box(b.w, F, BAR.d, b.x, y0 + F / 2, z), box(F, tall, BAR.d, x0 + F / 2, y0 + tall / 2, z), box(F, tall, BAR.d, x0 + b.w - F / 2, y0 + tall / 2, z))
    bars.push(box(BAR.t, b.h, BAR.d, b.x, b.y, z))
    if (b.arch) {
      bars.push(box(b.w, BAR.t, BAR.d, b.x, spring, z), box(b.w, BAR.t, BAR.d, b.x, y0 + tall / 2, z))
      bars.push(new THREE.TorusGeometry(r - F / 2, F / 2, 6, 14, Math.PI).translate(b.x, spring, z).toNonIndexed())
      trim.push(box(0.34, 0.36, 0.08, b.x, y0 + b.h + 0.08, at + 0.03)) // 아치 꼭대기 돌
    } else {
      bars.push(box(b.w, F, BAR.d, b.x, y0 + b.h - F / 2, z))
      for (const f of [1 / 3, 2 / 3]) bars.push(box(b.w, BAR.t, BAR.d, b.x, y0 + b.h * f, z))
      trim.push(box(b.w + SILL.side, SILL.lintel, 0.06, b.x, y0 + b.h + SILL.lintel / 2, at + 0.02))
    }
    trim.push(box(b.w + SILL.side * 2, SILL.h, SILL.out + 0.02, b.x, y0 - SILL.h / 2, at + SILL.out / 2 - 0.01))
    return hole
  })
  face.holes = holes
  const slab = new THREE.ExtrudeGeometry(face, { depth: T, bevelEnabled: false, curveSegments: 12 })
  const uv = slab.attributes.uv
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) / LIB_TILE.ashlar, uv.getY(k) / LIB_TILE.ashlar) // 밀어 만든 도형의 UV 는 실제 길이(m)
  slab.translate(0, 0, at - T)
  return { stone: [slab as THREE.BufferGeometry], panes, bars, trim }
}

// 현관: 돌기둥 둘 + 윗돌 + 작은 박공 + 낮은 계단 + 맨 위 유리층 세로 틀까지 한 건물 칸의 도형을 모두 합침
function hallWalls(w: number, d: number, doorX: number, doorW: number, ends: number[]) {
  const left = ends.includes(-1) ? T : 0
  const right = ends.includes(1) ? T : 0
  const stone: THREE.BufferGeometry[] = [stoneBox(w - left - right, H, d - T * 2).translate((left - right) / 2, H / 2, 0).toNonIndexed()]
  const panes: THREE.BufferGeometry[] = []
  const bars: THREE.BufferGeometry[] = []
  const trim: THREE.BufferGeometry[] = []
  const faces: [number, number, number, number, number][] = [
    [w, d / 2, doorX, doorW, 0],
    [w, d / 2, 999, 0, Math.PI],
    ...ends.map((e): [number, number, number, number, number] => [d - T * 2, w / 2, 999, 0, (e * Math.PI) / 2]),
  ]
  for (const [width, at, dx, dw, turn] of faces) {
    const f = windowFace(width, at, dx, dw)
    const m = new THREE.Matrix4().makeRotationY(turn)
    const put = (list: THREE.BufferGeometry[], to: THREE.BufferGeometry[]) => to.push(...list.map((g) => g.applyMatrix4(m)))
    put(f.stone, stone)
    put(f.panes, panes)
    put(f.bars, bars)
    put(f.trim, trim)
  }
  // 층을 나누는 돌 띠 (건물을 한 바퀴)
  for (const y of HALL_BELTS) trim.push(box(w + 0.14, 0.18, d + 0.14, 0, y, 0))
  // 현관
  const front = d / 2
  const roofW = doorW + PORCH.pad * 2 + 0.9
  const roofD = PORCH.depth + 0.3
  for (const c of porchColumns(doorX, doorW, d)) {
    trim.push(new THREE.CylinderGeometry(PORCH.r * 0.9, PORCH.r, 3.1, 14).translate(c.x, 1.55, c.z).toNonIndexed())
    trim.push(box(0.52, 0.16, 0.52, c.x, 0.08, c.z), box(0.52, 0.14, 0.52, c.x, 3.07, c.z))
  }
  trim.push(box(roofW, 0.42, roofD, doorX, 3.35, front + roofD / 2))
  const pedShape = new THREE.Shape([new THREE.Vector2(-roofW / 2, 0), new THREE.Vector2(roofW / 2, 0), new THREE.Vector2(0, 0.75)])
  const ped = new THREE.ExtrudeGeometry(pedShape, { depth: roofD, bevelEnabled: false }).translate(doorX, 3.56, front)
  const pedUv = ped.attributes.uv
  for (let k = 0; k < pedUv.count; k++) pedUv.setXY(k, pedUv.getX(k) / LIB_TILE.limestone, pedUv.getY(k) / LIB_TILE.limestone)
  trim.push(ped)
  for (const s of STEP) trim.push(box(doorW + s.pad * 2 + PORCH.pad * 2, s.h, s.out, doorX, s.h / 2, front + s.out / 2))
  // 맨 위 유리층 세로 틀 (네 면)
  const tw = w - TOP.in * 2
  const td = d - TOP.in * 2
  const my = H + TOP.h / 2
  for (let x = -tw / 2; x <= tw / 2 + 0.01; x += tw / Math.round(tw / TOP_MULLION.every)) for (const s of [1, -1]) bars.push(box(TOP_MULLION.t, TOP.h, TOP_MULLION.d, x, my, (s * td) / 2))
  for (let z = -td / 2; z <= td / 2 + 0.01; z += td / Math.round(td / TOP_MULLION.every)) for (const s of [1, -1]) bars.push(box(TOP_MULLION.d, TOP.h, TOP_MULLION.t, (s * tw) / 2, my, z))
  return { stone: mergeGeometries(stone)!, panes: mergeGeometries(panes)!, bars: mergeGeometries(bars)!, trim: mergeGeometries(trim)! }
}

// 맨 위 유리층 + 금속 처마 (벽돌 상자 위)
function GlassTop({ w, d }: { w: number; d: number }) {
  const A = TOP
  return (
    <group position-y={H}>
      <mesh position-y={0.04} material={colorMat(METAL)}>
        <boxGeometry args={[w + 0.1, 0.08, d + 0.1]} />
      </mesh>
      <mesh position-y={A.h / 2} material={hallGlassMat()}>
        <boxGeometry args={[w - A.in * 2, A.h, d - A.in * 2]} />
      </mesh>
      <mesh position-y={A.h + A.eaveT / 2} material={colorMat(METAL)}>
        <boxGeometry args={[w + A.eave * 2, A.eaveT, d + A.eave * 2]} />
      </mesh>
      <mesh position-y={A.h - 0.02} material={colorMat(EAVE_DARK)}>
        <boxGeometry args={[w + A.eave * 2 - 0.1, 0.04, d + A.eave * 2 - 0.1]} />
      </mesh>
    </group>
  )
}

export function CampusHall({ b, open, near }: { b: PlacedBuilding; open: boolean; near: boolean }) {
  const sideways = b.spec.facing === 'east' || b.spec.facing === 'west'
  const w = sideways ? b.rect.d : b.rect.w
  const d = sideways ? b.rect.w : b.rect.d
  const doorX = rotate(b.door.x - b.spec.x, b.door.z - b.spec.z, -b.angle).x
  const doorW = sideways ? b.door.d : b.door.w
  const ends = b.spec.ends
  const walls = useMemo(() => hallWalls(w, d, doorX, doorW, ends ?? []), [w, d, doorX, doorW, ends])
  useEffect(() => () => Object.values(walls).forEach((g) => g.dispose()), [walls])
  const sign = hallSignTexture(b.name, open)
  const doorMat = near ? MAT.near : colorMat(BRONZE) // 앞에 서면 강조색, 평소에는 청동색 (초록 문 아님)
  return (
    <group position={[b.spec.x, 0, b.spec.z]} rotation-y={b.angle}>
      <mesh geometry={walls.stone} material={wallMat()} />
      <mesh geometry={walls.panes} material={hallGlassMat()} />
      <mesh geometry={walls.bars} material={barMat()} />
      <mesh geometry={walls.trim} material={smoothMat()} />
      <GlassTop w={w} d={d} />
      {/* 입구: 돌 그늘색 테두리 + 청동 문 + 현관 윗돌의 이름판 */}
      <mesh position={[doorX, (DOOR.h + DOOR.frame) / 2, d / 2 + 0.06]} material={colorMat(FRAME)}>
        <boxGeometry args={[doorW + DOOR.frame * 2, DOOR.h + DOOR.frame, 0.1]} />
      </mesh>
      <mesh position={[doorX, DOOR.h / 2, d / 2 + 0.12]} material={doorMat}>
        <planeGeometry args={[doorW, DOOR.h]} />
      </mesh>
      <mesh position={[doorX, 3.42, d / 2 + PORCH.depth + 0.32]}>
        <planeGeometry args={[SIGN.w, SIGN.w * (150 / 640)]} />
        <meshBasicMaterial map={sign} />
      </mesh>
    </group>
  )
}

// 본관 가운데 탑. 앞면 모양을 깊이만큼 밀어 만들어 아치 구멍이 그대로 통로가 됩니다 (좌우 날개 사이 pass 만큼 걸어서 지나감)
export function MainGate({ gate }: { gate: MainGateSpec }) {
  const G = GATE
  const geo = useMemo(() => {
    const hw = gate.w / 2
    const s = new THREE.Shape()
    s.moveTo(-hw, 0)
    s.lineTo(-hw, G.h)
    s.lineTo(0, G.h + G.gable)
    s.lineTo(hw, G.h)
    s.lineTo(hw, 0)
    const pass = gate.pass / 2 - TUNNEL_IN
    s.lineTo(pass, 0)
    s.lineTo(pass, G.archH - pass)
    s.absarc(0, G.archH - pass, pass, 0, Math.PI, false)
    s.lineTo(-pass, 0)
    s.closePath()
    const g = new THREE.ExtrudeGeometry(s, { depth: gate.d, bevelEnabled: false, curveSegments: 20 })
    g.translate(0, 0, -gate.d / 2)
    // 밀어 만든 도형의 UV 는 실제 길이(m)라 돌 크기에 맞게 나눔
    const uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / LIB_TILE.ashlar, uv.getY(i) / LIB_TILE.ashlar)
    return g
  }, [gate.w, gate.d, gate.pass, G.h, G.gable, G.archH])
  const front = gate.d / 2
  const inner = gate.w - 1.2
  const fins = Array.from({ length: G.fins + 1 }, (_, i) => -inner / 2 + (i * inner) / G.fins)
  return (
    <group position={[gate.x, 0, gate.z]}>
      <mesh geometry={geo} material={wallMat()} />
      {[1, -1].map((side) => (
        <group key={side} rotation-y={side > 0 ? 0 : Math.PI}>
          {/* 유리와 세로 지느러미 (앞뒤 모두) */}
          <mesh position={[0, (G.glassFrom + G.glassTo) / 2, front + 0.02]} material={hallGlassMat()}>
            <planeGeometry args={[inner, G.glassTo - G.glassFrom]} />
          </mesh>
          {fins.map((x) => (
            <mesh key={x} position={[x, (G.glassFrom + G.glassTo) / 2, front + G.finD / 2]} material={smoothMat()}>
              <boxGeometry args={[G.finT, G.glassTo - G.glassFrom, G.finD]} />
            </mesh>
          ))}
          <mesh position={[0, G.glassTo + 0.25, front + G.finD / 2]} material={smoothMat()}>
            <boxGeometry args={[inner + G.finT, 0.5, G.finD]} />
          </mesh>
          <TowerClock z={front} />
          {/* 교표·학교 이름 (밤에도 읽히게 빛을 받지 않는 재질) */}
          <mesh position={[0, EMBLEM.y, front + 0.04]}>
            <planeGeometry args={[EMBLEM.r * 2, EMBLEM.r * 2.3]} />
            <meshBasicMaterial map={emblemTexture()} transparent />
          </mesh>
          <mesh position={[0, NAME.y, front + 0.04]}>
            <planeGeometry args={[NAME.w, NAME.h]} />
            <meshBasicMaterial map={schoolNameTexture()} transparent />
          </mesh>
          {/* 작은 처마 */}
          <mesh position={[0, G.canopyY, front + G.canopyD / 2]} material={colorMat(METAL)}>
            <boxGeometry args={[inner * 0.45, 0.16, G.canopyD]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// 탑 시계: 실제 시각(이 컴퓨터 시계). 초가 바뀔 때만 바늘을 돌립니다
function TowerClock({ z }: { z: number }) {
  const C = CLOCK
  const hour = useRef<THREE.Group>(null)
  const minute = useRef<THREE.Group>(null)
  const second = useRef<THREE.Group>(null)
  const last = useRef(-1)
  useFrame(() => {
    const now = new Date()
    const s = now.getSeconds()
    if (s === last.current) return
    last.current = s
    const a = clockAngles(now.getHours(), now.getMinutes(), s)
    // 앞에서 볼 때 시계 방향 = z 축 음의 방향
    if (hour.current) hour.current.rotation.z = -a.hour
    if (minute.current) minute.current.rotation.z = -a.minute
    if (second.current) second.current.rotation.z = -a.second
  })
  const hand = (len: number, t: number, depth: number) => (
    <mesh position={[0, len / 2 - 0.08, depth]} material={colorMat(BRONZE)}>
      <boxGeometry args={[t, len + 0.16, 0.03]} />
    </mesh>
  )
  return (
    <group position={[0, C.y, z + C.out]}>
      <mesh material={shopWindowMat(clockFaceTexture())}>
        <circleGeometry args={[C.r, 40]} />
      </mesh>
      <mesh material={colorMat(BRONZE)}>
        <torusGeometry args={[C.r, 0.07, 8, 40]} />
      </mesh>
      <group ref={hour}>{hand(C.hour, 0.09, 0.03)}</group>
      <group ref={minute}>{hand(C.minute, 0.06, 0.06)}</group>
      <group ref={second}>
        <mesh position={[0, C.second / 2 - 0.1, 0.09]} material={colorMat('#b5402f')}>
          <boxGeometry args={[0.02, C.second + 0.2, 0.02]} />
        </mesh>
      </group>
      <mesh position-z={0.1} rotation-x={Math.PI / 2} material={colorMat(BRONZE)}>
        <cylinderGeometry args={[0.07, 0.07, 0.04, 12]} />
      </mesh>
    </group>
  )
}
