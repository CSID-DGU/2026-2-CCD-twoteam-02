// 광장 월드를 그리는 부품 (#315): 땅·길, 건물 바깥, 분수, 나무, 벤치, 가로등, 울타리.
//
// 모두 상자·원기둥·원뿔·구로 코드에서 그립니다(외부 모델 없음). 배치 값은 world.json 과 worldLogic.ts 에서 받습니다.
// 성능: 그림자는 끄고, 같은 모양이 여럿인 나무·벤치·가로등은 drei 의 Instances 로 그립니다.
//   Instances(인스턴싱): 같은 모양을 위치만 바꿔 한 번의 그리기 명령으로 여러 개 그리는 방법. 나무 40그루도 그리기 횟수는 몇 번뿐입니다.
// 색·재질은 worldMaterials.ts 에서 한 번 만들어 같이 씁니다. (밤에 가로등·창문이 빛나는 것도 거기서, #316)
import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Instance, Instances } from '@react-three/drei'
import * as THREE from 'three'
import { LABEL_PX, labelTexture } from '../space/labelTexture'
import { BENCH, FENCE_T, facingAngle, rotate } from './worldLogic'
import type { PlacedBuilding, PlazaLayout, Point } from './worldLogic'
import { COLOR, MAT, colorMat } from './worldMaterials'

// 크기·높이 (m)
const BUILDING_H = 3.6 // 건물 한 층 벽 높이 (실내 천장보다 높게). 여러 층 건물은 층수만큼 쌓습니다
const FLOOR_BAND = { t: 0.18, out: 0.08 } // 층 사이 띠 (지붕 색): 두께, 벽 밖으로 나온 길이
const ROOF = { t: 0.3, overhang: 0.3 } // 지붕 판 두께, 벽 밖으로 나온 길이
const DOOR_H = 2.2 // 입구 문 높이 (지점 출입문과 같음)
const SIGN = { width: 2.4, y: 2.85 } // 입구 위 간판
const WINDOW = { w: 2, h: 1.2, y: 1.7 } // 창문 판
const FENCE_H = 0.8
const LAYER = { plaza: 0.01, path: 0.02 } // 땅 위로 띄우는 높이 (겹친 판이 깜빡이지 않게)
const FOUNTAIN = { basinH: 0.6, rim: 0.3, pillarR: 0.3, pillarH: 1.6, bowlR: 0.8, bowlH: 0.2 }
const TREE = { trunkR: 0.18, trunkH: 1.6, lowR: 1.4, lowH: 2, topR: 1.0, topH: 1.6 }
const BENCH_SHAPE = { seatY: 0.45, seatT: 0.08, backH: 0.5, backT: 0.08, legT: 0.08 }
const LAMP = { postR: 0.07, postH: 3, headR: 0.22 }
const WATER_WAVE_S = 2.5 // 분수 물빛이 한 번 오가는 시간(초)

// ── 땅 ──────────────────────────────────────────────────────────────

// 잔디(월드 전체) + 광장 돌바닥 + 길
// 가운데 바닥: 광장은 돌바닥, 캠퍼스(ground 'lawn')는 잘 깎은 잔디 쿼드(밝고 어두운 줄무늬)
const LAWN = { stripe: 2, light: '#8fca72', dark: '#7dbb63' } // 줄 폭(m), 두 잔디 색
export function Ground({ plaza }: { plaza: PlazaLayout }) {
  const lawn = plaza.ground === 'lawn'
  const stripes = lawn ? Math.ceil(plaza.plaza.w / LAWN.stripe) : 0
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} material={MAT.grass}>
        <planeGeometry args={[plaza.size.w, plaza.size.d]} />
      </mesh>
      {lawn ? (
        Array.from({ length: stripes }, (_, i) => {
          const w = Math.min(LAWN.stripe, plaza.plaza.w - i * LAWN.stripe)
          return (
            <mesh key={i} rotation-x={-Math.PI / 2} position={[-plaza.plaza.w / 2 + i * LAWN.stripe + w / 2, LAYER.plaza, 0]} material={colorMat(i % 2 ? LAWN.dark : LAWN.light)}>
              <planeGeometry args={[w, plaza.plaza.d]} />
            </mesh>
          )
        })
      ) : (
        <mesh rotation-x={-Math.PI / 2} position-y={LAYER.plaza} material={MAT.plaza}>
          <planeGeometry args={[plaza.plaza.w, plaza.plaza.d]} />
        </mesh>
      )}
      {plaza.paths.map((p, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[p.x, LAYER.path, p.z]} material={MAT.path}>
          <planeGeometry args={[p.w, p.d]} />
        </mesh>
      ))}
    </group>
  )
}

// 가장자리 낮은 울타리 (부딪힘은 worldLogic 의 plazaObstacles 가 같은 자리로 만듦)
export function Fence({ size }: { size: PlazaLayout['size'] }) {
  const { w, d } = size
  const sides: [number, number, number, number][] = [
    [0, -(d / 2 - FENCE_T / 2), w, FENCE_T],
    [0, d / 2 - FENCE_T / 2, w, FENCE_T],
    [-(w / 2 - FENCE_T / 2), 0, FENCE_T, d],
    [w / 2 - FENCE_T / 2, 0, FENCE_T, d],
  ]
  return (
    <group>
      {sides.map(([x, z, sw, sd], i) => (
        <mesh key={i} position={[x, FENCE_H / 2, z]} material={MAT.fence}>
          <boxGeometry args={[sw, FENCE_H, sd]} />
        </mesh>
      ))}
    </group>
  )
}

// ── 분수 ────────────────────────────────────────────────────────────

// 둥근 수반 + 물 + 가운데 기둥과 위 접시. 물빛만 천천히 밝아졌다 어두워집니다(입자 없음).
export function Fountain({ fountain }: { fountain: NonNullable<PlazaLayout['fountain']> }) {
  const { x, z, r } = fountain
  const water = useMemo(() => MAT.water.clone(), []) // 물빛을 바꾸므로 공용 재질을 복사해 이 분수만 씀
  useEffect(() => () => water.dispose(), [water]) // 광장을 떠나면 복사한 재질을 지움 (들어올 때마다 쌓이지 않게)
  const dark = useMemo(() => new THREE.Color(COLOR.water), [])
  const light = useMemo(() => new THREE.Color(COLOR.waterLight), [])
  useFrame(({ clock }) => {
    const t = (Math.sin((clock.elapsedTime * Math.PI * 2) / WATER_WAVE_S) + 1) / 2
    water.color.lerpColors(dark, light, t * 0.5)
  })
  const f = FOUNTAIN
  return (
    <group position={[x, 0, z]}>
      <mesh position-y={f.basinH / 2} material={MAT.stone}>
        <cylinderGeometry args={[r, r, f.basinH, 32]} />
      </mesh>
      <mesh position-y={f.basinH + 0.01} material={water}>
        <cylinderGeometry args={[r - f.rim, r - f.rim, 0.02, 32]} />
      </mesh>
      <mesh position-y={f.basinH + f.pillarH / 2} material={MAT.stone}>
        <cylinderGeometry args={[f.pillarR, f.pillarR * 1.2, f.pillarH, 16]} />
      </mesh>
      <mesh position-y={f.basinH + f.pillarH} material={MAT.stone}>
        <cylinderGeometry args={[f.bowlR, f.bowlR * 0.6, f.bowlH, 24]} />
      </mesh>
    </group>
  )
}

// ── 건물 ────────────────────────────────────────────────────────────

// 건물 바깥: 벽 상자 + 지붕 판 + 창문 + 입구 문 + 간판. (겉모습 크기는 world.json, 회의실 별관은 두지 않음)
// 건물 가운데에 입구 방향만큼 돌린 무리(group)를 두고, 그 안에서는 실내와 같은 좌표(입구가 +Z 쪽)로 그립니다.
// open: 열린 지점인지(아니면 회색 문), near: 입구 앞에 서 있는지(주황 문)
// 여러 층 건물(b.floors)은 층마다 벽 높이만큼 쌓고, 위층은 창 색을 그 지점 분위기로, 앞면 가운데에 "2F 이름" 간판을 답니다.
export function Building({ b, open, near }: { b: PlacedBuilding; open: boolean; near: boolean }) {
  const sideways = b.spec.facing === 'east' || b.spec.facing === 'west'
  const w = sideways ? b.rect.d : b.rect.w // 실내 기준 가로·세로
  const d = sideways ? b.rect.w : b.rect.d
  const doorX = rotate(b.door.x - b.spec.x, b.door.z - b.spec.z, -b.angle).x // 실내 기준 입구 x
  const doorW = sideways ? b.door.d : b.door.w
  const wall = colorMat(b.spec.wall)
  const roof = colorMat(b.spec.roof)
  const multi = b.floors.length > 1
  const height = BUILDING_H * b.floors.length
  const signBg = open ? '#14532d' : '#374151'
  const sign = useMemo(() => labelTexture(multi ? `1F ${b.name}` : b.name, signBg), [b.name, multi, signBg])
  const floorSigns = useMemo(() => b.floors.slice(1).map((f) => labelTexture(`${f.level}F ${f.name}`, signBg)), [b.floors, signBg])
  const doorMat = near ? MAT.near : open ? MAT.doorOpen : MAT.doorSoon
  // 창문 자리: [x, z, 돌림] (실내 기준). 앞면은 입구 양옆, 옆면·뒷면은 둘씩
  const windows: [number, number, number][] = [
    [-w / 4 - 1, d / 2, 0],
    [w / 4 + 1, d / 2, 0],
    [-w / 4, -d / 2, Math.PI],
    [w / 4, -d / 2, Math.PI],
    [w / 2, -d / 4, Math.PI / 2],
    [w / 2, d / 4, Math.PI / 2],
    [-w / 2, -d / 4, -Math.PI / 2],
    [-w / 2, d / 4, -Math.PI / 2],
  ]
  const OUT = 0.01 // 벽면에서 띄우는 거리
  return (
    <group>
      <group position={[b.spec.x, 0, b.spec.z]} rotation-y={b.angle}>
        <mesh position-y={height / 2} material={wall}>
          <boxGeometry args={[w, height, d]} />
        </mesh>
        <mesh position-y={height + ROOF.t / 2} material={roof}>
          <boxGeometry args={[w + ROOF.overhang * 2, ROOF.t, d + ROOF.overhang * 2]} />
        </mesh>
        {b.floors.map((f, level) =>
          windows.map(([x, z, rot], i) => (
            <mesh
              key={`${level}-${i}`}
              position={[x + Math.sin(rot) * OUT, WINDOW.y + level * BUILDING_H, z + Math.cos(rot) * OUT]}
              rotation-y={rot}
              material={f.window ? colorMat(f.window) : MAT.window}
            >
              <planeGeometry args={[WINDOW.w, WINDOW.h]} />
            </mesh>
          )),
        )}
        {/* 층 사이 띠와 위층 간판 */}
        {b.floors.slice(1).map((f, i) => (
          <group key={f.slug} position-y={(i + 1) * BUILDING_H}>
            <mesh material={roof}>
              <boxGeometry args={[w + FLOOR_BAND.out * 2, FLOOR_BAND.t, d + FLOOR_BAND.out * 2]} />
            </mesh>
            <mesh position={[doorX, WINDOW.y, d / 2 + OUT]}>
              <planeGeometry args={[SIGN.width, (SIGN.width * LABEL_PX.h) / LABEL_PX.w]} />
              <meshBasicMaterial map={floorSigns[i]} transparent />
            </mesh>
          </group>
        ))}
        {/* 입구 문: 벽 밖으로 조금 나오게 */}
        <mesh position={[doorX, DOOR_H / 2, d / 2 + 0.08]} material={doorMat}>
          <boxGeometry args={[doorW, DOOR_H, 0.16]} />
        </mesh>
        <mesh position={[doorX, SIGN.y, d / 2 + OUT]}>
          <planeGeometry args={[SIGN.width, (SIGN.width * LABEL_PX.h) / LABEL_PX.w]} />
          <meshBasicMaterial map={sign} transparent />
        </mesh>
      </group>
    </group>
  )
}

// ── 같은 모양 여럿 (인스턴싱) ─────────────────────────────────────────

// 나무: 줄기 원기둥 + 잎 원뿔 두 단
export function Trees({ trees }: { trees: Point[] }) {
  const t = TREE
  const n = trees.length
  return (
    <group>
      <Instances limit={n} material={MAT.trunk}>
        <cylinderGeometry args={[t.trunkR, t.trunkR * 1.2, t.trunkH, 8]} />
        {trees.map((p, i) => (
          <Instance key={i} position={[p.x, t.trunkH / 2, p.z]} />
        ))}
      </Instances>
      <Instances limit={n} material={MAT.leaves}>
        <coneGeometry args={[t.lowR, t.lowH, 8]} />
        {trees.map((p, i) => (
          <Instance key={i} position={[p.x, t.trunkH + t.lowH / 2 - 0.4, p.z]} />
        ))}
      </Instances>
      <Instances limit={n} material={MAT.leavesTop}>
        <coneGeometry args={[t.topR, t.topH, 8]} />
        {trees.map((p, i) => (
          <Instance key={i} position={[p.x, t.trunkH + t.lowH + t.topH / 2 - 0.9, p.z]} />
        ))}
      </Instances>
    </group>
  )
}

// 벤치: 앉는 판 + 등받이(앉은 사람 뒤쪽) + 다리 둘. facing 은 앉은 사람이 보는 쪽
export function Benches({ benches }: { benches: PlazaLayout['benches'] }) {
  const s = BENCH_SHAPE
  const placed = benches.map((b) => {
    const angle = facingAngle(b.facing)
    const at = (lx: number, lz: number) => {
      const r = rotate(lx, lz, angle)
      return [b.x + r.x, b.z + r.z] as const
    }
    return { angle, back: at(0, -BENCH.d / 2 + s.backT / 2), legs: [at(-BENCH.w / 2 + 0.15, 0), at(BENCH.w / 2 - 0.15, 0)] }
  })
  const n = benches.length
  return (
    <group>
      <Instances limit={n} material={MAT.wood}>
        <boxGeometry args={[BENCH.w, s.seatT, BENCH.d]} />
        {benches.map((b, i) => (
          <Instance key={i} position={[b.x, s.seatY, b.z]} rotation-y={placed[i].angle} />
        ))}
      </Instances>
      <Instances limit={n} material={MAT.wood}>
        <boxGeometry args={[BENCH.w, s.backH, s.backT]} />
        {placed.map((p, i) => (
          <Instance key={i} position={[p.back[0], s.seatY + s.backH / 2, p.back[1]]} rotation-y={p.angle} />
        ))}
      </Instances>
      <Instances limit={n * 2} material={MAT.iron}>
        <boxGeometry args={[s.legT, s.seatY, BENCH.d]} />
        {placed.flatMap((p, i) =>
          p.legs.map(([x, z], j) => <Instance key={`${i}-${j}`} position={[x, s.seatY / 2, z]} rotation-y={p.angle} />),
        )}
      </Instances>
    </group>
  )
}

// 가로등: 기둥 + 등. 밤에 켜지는 빛은 #316 에서 붙입니다.
export function Lamps({ lamps }: { lamps: Point[] }) {
  const l = LAMP
  const n = lamps.length
  return (
    <group>
      <Instances limit={n} material={MAT.iron}>
        <cylinderGeometry args={[l.postR, l.postR * 1.3, l.postH, 8]} />
        {lamps.map((p, i) => (
          <Instance key={i} position={[p.x, l.postH / 2, p.z]} />
        ))}
      </Instances>
      <Instances limit={n} material={MAT.lampGlow}>
        <sphereGeometry args={[l.headR, 12, 8]} />
        {lamps.map((p, i) => (
          <Instance key={i} position={[p.x, l.postH + l.headR * 0.6, p.z]} />
        ))}
      </Instances>
    </group>
  )
}

