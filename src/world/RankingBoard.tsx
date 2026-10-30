// 광장 순위 게시판 (#59). 나무 기둥 두 개에 판을 걸고, 앞면에 "오늘의 공부왕" 1~3위를 글씨로 그립니다.
//
// 자리는 world.json 의 board(x, z, facing), 부딪힘 상자와 앞 자리(E)는 worldLogic 의 plazaObstacles·boardSpot 입니다.
// 글씨 판은 캔버스에 그린 그림(CanvasTexture)이고, 빛을 받지 않는 재질이라 밤에도 또렷하게 읽힙니다.
// 줄(lines)이 바뀔 때만 캔버스를 다시 그립니다. (WorldScene 이 5분마다 순위를 다시 읽어 넘김)
// 판 아래쪽 E 로 여는 자세한 순위 창은 ranking/RankingPanel 입니다.
import { useEffect, useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { facingAngle } from './worldLogic'
import type { Facing, Point } from './worldLogic'
import { MAT, colorMat } from './worldMaterials'

// 크기 (m). 판 폭은 worldLogic 의 BOARD.w 와 같게
const POST = { size: 0.12, h: 2.3, x: 1.1 }
const PANEL = { w: 2.4, h: 1.5, t: 0.08, y: 1.35 } // y: 판 가운데 높이 (아래 끝 0.6m)
const ROOF = { w: 2.7, h: 0.12, d: 0.4, color: '#7a4a2a' }
const FACE = { w: 2.2, h: 1.3 } // 글씨 판 (판 앞면보다 조금 작게)
// 캔버스 (가로·세로 비율을 글씨 판과 같게)
const CANVAS = { w: 660, h: 390 }
const INK = { bg: '#22402f', frame: '#c9a46a', title: '#ffe08a', text: '#f4f1e6' }

// 캔버스에 칠판처럼 제목과 줄을 그립니다.
function draw(ctx: CanvasRenderingContext2D, lines: string[]) {
  const { w, h } = CANVAS
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = INK.bg
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = INK.frame
  ctx.lineWidth = 10
  ctx.strokeRect(5, 5, w - 10, h - 10)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = INK.title
  ctx.font = 'bold 52px system-ui, sans-serif'
  ctx.fillText('🏆 오늘의 공부왕', w / 2, 70, w - 60)
  ctx.fillStyle = INK.text
  ctx.font = 'bold 40px system-ui, sans-serif'
  lines.forEach((line, i) => ctx.fillText(line, w / 2, 160 + i * 75, w - 60)) // 길면 판 안으로 줄여 그림
}

export function RankingBoard({ board, lines }: { board: Point & { facing: Facing }; lines: string[] }) {
  const face = useRef<THREE.Mesh>(null)
  const tex = useRef<THREE.CanvasTexture | null>(null)

  // 글씨 판 캔버스를 만들어 재질에 붙입니다.
  useLayoutEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS.w
    canvas.height = CANVAS.h
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    tex.current = t
    const m = face.current?.material as THREE.MeshBasicMaterial | undefined
    if (m) {
      m.map = t
      m.needsUpdate = true
    }
    return () => {
      t.dispose()
      tex.current = null
    }
  }, [])

  // 줄이 바뀔 때만 다시 그립니다. (배열은 매번 새로 만들어지므로 글자로 비교)
  const text = lines.join('\n')
  useEffect(() => {
    const t = tex.current
    const ctx = (t?.image as HTMLCanvasElement | undefined)?.getContext('2d')
    if (!t || !ctx) return
    draw(ctx, text.split('\n'))
    t.needsUpdate = true
  }, [text])

  return (
    <group position={[board.x, 0, board.z]} rotation={[0, facingAngle(board.facing), 0]}>
      {[-POST.x, POST.x].map((x) => (
        <mesh key={x} position={[x, POST.h / 2, -PANEL.t]} material={MAT.wood}>
          <boxGeometry args={[POST.size, POST.h, POST.size]} />
        </mesh>
      ))}
      <mesh position={[0, PANEL.y, 0]} material={MAT.wood}>
        <boxGeometry args={[PANEL.w, PANEL.h, PANEL.t]} />
      </mesh>
      <mesh position={[0, PANEL.y + PANEL.h / 2 + ROOF.h / 2 + 0.05, 0]} material={colorMat(ROOF.color)}>
        <boxGeometry args={[ROOF.w, ROOF.h, ROOF.d]} />
      </mesh>
      {/* 글씨 판: 판 앞면(+Z, 판이 보는 쪽)에 살짝 띄움 */}
      <mesh ref={face} position={[0, PANEL.y, PANEL.t / 2 + 0.005]}>
        <planeGeometry args={[FACE.w, FACE.h]} />
        <meshBasicMaterial toneMapped={false} />
      </mesh>
    </group>
  )
}
