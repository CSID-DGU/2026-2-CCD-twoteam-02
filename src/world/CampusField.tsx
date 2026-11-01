// 캠퍼스 굽은 산책로와 축구장 (흰 선·골대·그물·코너 깃발). 모양은 fieldShapes.ts, 배치는 campus.json
import { useMemo } from 'react'
import * as THREE from 'three'
import type { Walk } from './worldLogic'
import type { Pitch } from './ballLogic'
import { BALL } from './ballLogic'
import { netTexture, pitchLines, walkGeometry } from './fieldShapes'
import { MAT } from './worldMaterials'

const Y = { walk: 0.02, line: 0.016 } // 땅 위로 띄우는 높이 (잔디·줄무늬와 안 깜빡이게)
const GOAL = { h: 2, post: 0.06 } // 골대 높이, 기둥 반지름
const FLAG = { h: 1.2, color: '#f2c94c' }
const white = new THREE.MeshStandardMaterial({ color: '#ffffff' })
const lineMat = new THREE.MeshBasicMaterial({ color: '#f4f4ef' })

export function Walks({ walks }: { walks: Walk[] }) {
  const geos = useMemo(() => walks.map(walkGeometry), [walks])
  return (
    <group position-y={Y.walk}>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} material={MAT.path} />
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
  return (
    <group>
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
  )
}
