// 길 안내 표지판 (처음 온 사람용): 나무 기둥에 화살표 판 여러 장. 판은 가리키는 곳(다른 월드로 가는 문·큰 건물) 쪽으로 돌아 있고,
// 앞뒤 양면에 이름·작은 영문·거리("30m")를 씁니다. 어디를 가리킬지는 월드 JSON 의 signposts, 방향·거리 계산은 worldLogic 의 signArrows.
// 밤에도 읽히게 글자 판이 조금 스스로 빛납니다.
import { useMemo } from 'react'
import * as THREE from 'three'
import { woodTexture } from '../space/studyCafeTextures'
import { signArrows } from './worldLogic'
import type { GateSpec, Signpost } from './worldLogic'

const POST = { h: 2.7, r: 0.07 } // 기둥 높이·반지름
const BOARD = { len: 1.7, h: 0.34, t: 0.05, tip: 0.24, gap: 0.42, top: 2.35 } // 화살표 판 (길이·높이·두께·뾰족한 끝·판 사이·맨 위 판 높이)
const WOOD = '#c9a172'
const INK = '#3a2412'

// 판 모양: 가리키는 쪽(+x)이 뾰족한 오각형. 기둥에서 조금 앞으로 나오게 기둥 쪽 끝이 x = -0.12
function arrowShape() {
  const B = BOARD
  const s = new THREE.Shape()
  const x0 = -0.12
  const x1 = x0 + B.len - B.tip
  s.moveTo(x0, -B.h / 2)
  s.lineTo(x1, -B.h / 2)
  s.lineTo(x1 + B.tip, 0)
  s.lineTo(x1, B.h / 2)
  s.lineTo(x0, B.h / 2)
  s.closePath()
  return s
}

// 글자 판: 밝은 나무색 바탕에 나뭇결 몇 줄 + 이름(굵게) + 작은 영문 + 거리
const texCache = new Map<string, THREE.CanvasTexture>()
function labelTexture(label: string, sub: string | undefined, dist: number) {
  const key = `${label}|${sub ?? ''}|${dist}`
  let t = texCache.get(key)
  if (!t) {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 112
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = WOOD
    ctx.fillRect(0, 0, 512, 112)
    ctx.strokeStyle = 'rgba(90,55,25,0.18)'
    for (let i = 0; i < 9; i++) {
      ctx.lineWidth = 1 + (i % 3)
      ctx.beginPath()
      ctx.moveTo(0, 8 + i * 12)
      ctx.bezierCurveTo(170, 2 + i * 12, 340, 16 + i * 12, 512, 6 + i * 12)
      ctx.stroke()
    }
    ctx.fillStyle = INK
    ctx.textBaseline = 'middle'
    ctx.font = '800 50px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif'
    ctx.fillText(label, 22, sub ? 44 : 58)
    if (sub) {
      ctx.font = '600 22px "Noto Sans KR", sans-serif'
      ctx.globalAlpha = 0.75
      ctx.fillText(sub, 24, 90)
      ctx.globalAlpha = 1
    }
    ctx.font = '700 30px "Noto Sans KR", sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(`${dist}m`, 490, 58)
    t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    texCache.set(key, t)
  }
  return t
}

export function Signposts({ posts, gates }: { posts: Signpost[]; gates: GateSpec[] }) {
  const shape = useMemo(() => arrowShape(), [])
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ map: woodTexture('#9a7048'), roughness: 0.8 }), [])
  const rim = useMemo(() => new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.75 }), [])
  return (
    <>
      {posts.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          {/* 기둥 + 위 뚜껑 */}
          <mesh position-y={POST.h / 2} material={wood}>
            <cylinderGeometry args={[POST.r, POST.r * 1.15, POST.h, 10]} />
          </mesh>
          <mesh position-y={POST.h + 0.05} material={wood}>
            <coneGeometry args={[POST.r * 1.6, 0.14, 10]} />
          </mesh>
          {signArrows(p, gates).map((a, k) => {
            const tex = labelTexture(a.label, a.sub, a.dist)
            const w = BOARD.len - BOARD.tip - 0.04 // 글자 판은 네모 부분에만
            const cx = -0.12 + 0.02 + w / 2
            return (
              // 판의 +x(뾰족한 끝)가 가리키는 쪽을 보게: y 축으로 (각도 - 90°) 돌림
              <group key={k} position-y={BOARD.top - k * BOARD.gap} rotation-y={a.angle - Math.PI / 2}>
                <mesh position-z={-BOARD.t / 2} material={rim}>
                  <extrudeGeometry args={[shape, { depth: BOARD.t, bevelEnabled: false }]} />
                </mesh>
                {[1, -1].map((side) => (
                  // 앞뒤 양면 글자 (뒷면은 반 바퀴 돌려 뒤에서도 바로 읽힘)
                  <mesh key={side} position={[cx, 0, (side * BOARD.t) / 2 + side * 0.002]} rotation-y={side === 1 ? 0 : Math.PI}>
                    <planeGeometry args={[w, BOARD.h - 0.04]} />
                    <meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.28} roughness={0.85} />
                  </mesh>
                ))}
              </group>
            )
          })}
        </group>
      ))}
    </>
  )
}
