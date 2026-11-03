// 캠퍼스 굽은 산책로와 축구장 (흰 선·골대·그물·코너 깃발). 모양은 fieldShapes.ts, 배치는 campus.json
import { useMemo } from 'react'
import * as THREE from 'three'
import type { Walk } from './worldLogic'
import type { Pitch } from './ballLogic'
import { BALL } from './ballLogic'
import { netTexture, pitchLines, walkGeometry } from './fieldShapes'
import { groundTextures } from './worldTextures'

const PAVER = '#c4b5a2' // 벽돌 길 색 (회갈색)
const Y = { walk: 0.02, line: 0.016 } // 땅 위로 띄우는 높이 (잔디·줄무늬와 안 깜빡이게)
const GOAL = { h: 2, post: 0.06 } // 골대 높이, 기둥 반지름
const FLAG = { h: 1.2, color: '#f2c94c' }
const white = new THREE.MeshStandardMaterial({ color: '#ffffff' })
const lineMat = new THREE.MeshBasicMaterial({ color: '#f4f4ef' })

// 산책로 벽돌 (사용자 참고 사진: 회갈색 벽돌을 깐 굽은 길). 다른 곳의 MAT.path 는 그대로
let paver: THREE.MeshStandardMaterial | null = null
function paverMat() {
  if (!paver) {
    const t = groundTextures().brick
    paver = new THREE.MeshStandardMaterial({ color: PAVER, map: t.map, bumpMap: t.bump, bumpScale: 0.8, roughness: 0.9 })
  }
  return paver
}

export function Walks({ walks }: { walks: Walk[] }) {
  const geos = useMemo(() => walks.map(walkGeometry), [walks])
  return (
    <group position-y={Y.walk}>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} material={paverMat()} />
      ))}
    </group>
  )
}

export function SoccerPitch({ pitch }: { pitch: Pitch }) {
  const lines = useMemo(() => pitchLines(pitch), [pitch])
  const net = useMemo(() => {
    const t = netTexture().clone()
    t.repeat.set(10, 5)
    t.needsUpdate = true
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false })
  }, [])
  const half = pitch.goal / 2
  const depth = BALL.netDepth
  // across: 축구장 가운데를 축으로 통째로 90도 돌림 (선·골대·그물 계산은 세로 기준 그대로)
  return (
    <group position={[pitch.x, 0, pitch.z]} rotation-y={pitch.across ? Math.PI / 2 : 0}>
    <group position={[-pitch.x, 0, -pitch.z]}>
      <mesh geometry={lines} material={lineMat} position-y={Y.line} />
      {[-1, 1].map((side) => {
        const z = pitch.z + (side * pitch.d) / 2
        return (
          <group key={side} position={[pitch.x, 0, z]}>
            {/* 기둥 둘 + 가로대 */}
            {[-half, half].map((x) => (
              <mesh key={x} position={[x, GOAL.h / 2, 0]} material={white}>
                <cylinderGeometry args={[GOAL.post, GOAL.post, GOAL.h, 10]} />
              </mesh>
            ))}
            <mesh position={[0, GOAL.h, 0]} rotation-z={Math.PI / 2} material={white}>
              <cylinderGeometry args={[GOAL.post, GOAL.post, pitch.goal + GOAL.post * 2, 10]} />
            </mesh>
            {/* 그물: 뒤·위·양옆 */}
            <mesh position={[0, GOAL.h / 2, side * depth]} material={net}>
              <planeGeometry args={[pitch.goal, GOAL.h]} />
            </mesh>
            <mesh position={[0, GOAL.h, (side * depth) / 2]} rotation-x={Math.PI / 2} material={net}>
              <planeGeometry args={[pitch.goal, depth]} />
            </mesh>
            {[-half, half].map((x) => (
              <mesh key={`s${x}`} position={[x, GOAL.h / 2, (side * depth) / 2]} rotation-y={Math.PI / 2} material={net}>
                <planeGeometry args={[depth, GOAL.h]} />
              </mesh>
            ))}
          </group>
        )
      })}
      {/* 코너 깃발 */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <group key={`${sx}${sz}`} position={[pitch.x + (sx * pitch.w) / 2, 0, pitch.z + (sz * pitch.d) / 2]}>
            <mesh position-y={FLAG.h / 2} material={white}>
              <cylinderGeometry args={[0.02, 0.02, FLAG.h, 6]} />
            </mesh>
            <mesh position={[0.12, FLAG.h - 0.1, 0]}>
              <planeGeometry args={[0.24, 0.18]} />
              <meshStandardMaterial color={FLAG.color} side={THREE.DoubleSide} />
            </mesh>
          </group>
        )),
      )}
    </group>
    </group>
  )
}
