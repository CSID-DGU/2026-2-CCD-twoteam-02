// 광장 순위 게시판 (#59). 나무 기둥 두 개에 판을 걸고, 앞면 칠판에 "오늘의 공부왕" 1~3위를 분필로 그립니다.
//
// 자리는 world.json 의 board(x, z, facing), 부딪힘 상자와 앞 자리(E)는 worldLogic 의 plazaObstacles·boardSpot 입니다.
// 글씨 판은 캔버스에 그린 그림(CanvasTexture)이고, 빛을 받지 않는 재질이라 밤에도 또렷하게 읽힙니다.
// 칠판 모양(분필 글씨·낙서·케리스 케듀체)은 ranking/chalk 의 도우미로 그립니다.
//   위쪽 띠   ☆ 오늘의 공부왕 ☆ 과 점선 (얼굴과 겹치지 않게 띠 안에만)
//   아래      시상대: 가운데 1등(왕관·크게), 왼쪽 2등, 오른쪽 3등. 얼굴 = 그 사람 캐릭터 사진(없으면 이니셜)
// 순위·얼굴·글꼴이 바뀔 때만 캔버스를 다시 그립니다. (WorldScene 이 5분마다 순위를 다시 읽어 넘김)
// 판 아래쪽 E 로 여는 자세한 순위 창은 ranking/RankingPanel 입니다.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { BOARD_SCALE, facingAngle } from './worldLogic'
import type { Facing, Point } from './worldLogic'
import { MAT, colorMat } from './worldMaterials'
import { EMPTY_BOARD, initialOf, minutesText, podium } from '../ranking/rankingLogic'
import type { Ranking } from '../ranking/rankingLogic'
import { CHALK, chalkCircle, chalkStar, chalkText, doodles, drawBoard, loadChalkFont } from '../ranking/chalk'

// 크기 (m, BOARD_SCALE 곱하기 전). 판 폭 × BOARD_SCALE 이 worldLogic 의 BOARD.w 와 같게
const POST = { size: 0.12, h: 2.3, x: 1.1 }
const PANEL = { w: 2.4, h: 1.5, t: 0.08, y: 1.35 } // y: 판 가운데 높이 (아래 끝 0.6m)
const ROOF = { w: 2.7, h: 0.12, d: 0.4, color: '#7a4a2a' }
const FACE = { w: 2.2, h: 1.3 } // 글씨 판 (판 앞면보다 조금 작게)
// 캔버스 (가로·세로 비율을 글씨 판과 같게, 분필 질감이 보이게 넉넉히)
const CANVAS = { w: 1320, h: 780 }
const TITLE_Y = 0.12 // 제목 띠 가운데 (판 높이 비율)
const RULE_Y = 0.22 // 제목 아래 점선
const SLOT_X = [0.25, 0.5, 0.75] // 시상대 칸 가운데 (2등, 1등, 3등)
const FACE_R = { 1: 150, 2: 94, 3: 94 } as const // 얼굴 동그라미 반지름(px)
// 칸 안 줄 배치: 위에서부터 [왕관] 등수 → 얼굴 → 이름 → 시간. 아래 끝을 맞춰 1등 칸이 더 높이 솟음
const BOTTOM = { min: 744, name: 686 } // 시간·이름 줄 높이(px)
const GAP = { name: 66, rank: 46, crown: 46 } // 얼굴 아래 끝→이름, 얼굴 위 끝→등수, 등수→왕관 간격(px)

// 칸 하나: [자리, 등수, 이름, 분, 사진 주소]
type Slot = [1 | 2 | 3, number, string, number, string] | null

// 분필 왕관 (1등 얼굴 위)
function crown(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save()
  ctx.strokeStyle = CHALK.gold
  ctx.lineWidth = 5
  ctx.lineJoin = 'round'
  ctx.globalAlpha = 0.95
  ctx.beginPath()
  ctx.moveTo(x - s, y)
  ctx.lineTo(x - s, y - s * 0.9)
  ctx.lineTo(x - s * 0.5, y - s * 0.4)
  ctx.lineTo(x, y - s * 1.1)
  ctx.lineTo(x + s * 0.5, y - s * 0.4)
  ctx.lineTo(x + s, y - s * 0.9)
  ctx.lineTo(x + s, y)
  ctx.closePath()
  ctx.stroke()
  ctx.restore()
}

// 캔버스에 칠판을 그립니다. photos: 사진 주소 → 다 불러온 그림
function draw(ctx: CanvasRenderingContext2D, slots: Slot[], photos: Map<string, HTMLImageElement>) {
  const { w, h } = CANVAS
  ctx.clearRect(0, 0, w, h)
  drawBoard(ctx, w, h)
  doodles(ctx, w, h, 2)

  // 제목 띠
  chalkText(ctx, '오늘의 공부왕', w / 2, h * TITLE_Y, { size: 84, bold: true, color: CHALK.yellow })
  ctx.save()
  ctx.strokeStyle = CHALK.yellow
  ctx.lineWidth = 4
  ctx.globalAlpha = 0.85
  for (const side of [-1, 1]) chalkStar(ctx, w / 2 + side * 330, h * TITLE_Y, 26)
  ctx.restore()
  ctx.save()
  ctx.strokeStyle = CHALK.white
  ctx.globalAlpha = 0.35
  ctx.lineWidth = 3
  ctx.setLineDash([14, 10])
  ctx.beginPath()
  ctx.moveTo(w * 0.12, h * RULE_Y)
  ctx.lineTo(w * 0.88, h * RULE_Y)
  ctx.stroke()
  ctx.restore()

  if (slots.every((s) => s === null)) {
    chalkText(ctx, EMPTY_BOARD, w / 2, h * 0.6, { size: 60 })
    return
  }

  slots.forEach((slot, i) => {
    if (!slot) return
    const [place, rank, name, minutes, url] = slot
    const x = w * SLOT_X[i]
    const r = FACE_R[place]
    const cy = BOTTOM.name - GAP.name - r
    const rankY = cy - r - GAP.rank
    // 얼굴: 동그라미 안에 캐릭터 사진, 없으면 이니셜
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fill()
    const img = url ? photos.get(url) : undefined
    if (img) {
      ctx.clip()
      ctx.drawImage(img, x - r, cy - r, r * 2, r * 2)
    }
    ctx.restore()
    if (!img) chalkText(ctx, initialOf(name), x, cy + 4, { size: r * 0.9 })
    chalkCircle(ctx, x, cy, r, place === 1 ? CHALK.gold : CHALK.white, place === 1 ? 6 : 5)
    const first = place === 1
    chalkText(ctx, `${rank}`, x, rankY, { size: first ? 72 : 54, bold: true, color: first ? CHALK.gold : CHALK.white })
    if (first) crown(ctx, x, rankY - GAP.crown, 34)
    chalkText(ctx, name, x, BOTTOM.name, { size: first ? 62 : 50, maxWidth: w * 0.24 })
    chalkText(ctx, minutesText(minutes), x, BOTTOM.min, { size: 40, maxWidth: w * 0.24 })
  })
}

// ranking: 오늘 순위(아직이면 null), photos: 사람 id → 캐릭터 얼굴 사진 (ranking/usePortraits)
export function RankingBoard({ board, ranking, photos }: { board: Point & { facing: Facing }; ranking: Ranking | null; photos: Record<string, string> }) {
  const face = useRef<THREE.Mesh>(null)
  const tex = useRef<THREE.CanvasTexture | null>(null)
  const images = useRef(new Map<string, HTMLImageElement>()) // 사진 주소 → 다 불러온 그림
  const [imageCount, setImageCount] = useState(0) // 그림을 다 불러올 때마다 늘려 다시 그림
  const [fontReady, setFontReady] = useState(false)

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

  // 케리스 케듀체가 오면 다시 그려 글꼴을 바꿉니다.
  useEffect(() => {
    let alive = true
    void loadChalkFont().then(() => alive && setFontReady(true))
    return () => {
      alive = false
    }
  }, [])

  // 그릴 칸 (배열은 매번 새로 만들어지므로 글자로 비교)
  const slots: Slot[] = podium(ranking?.top ?? []).map((s) => s && [s.place, s.row.rank, s.name, s.row.minutes, photos[s.row.id] ?? ''])
  const text = JSON.stringify(slots)

  // 새 사진은 그림으로 불러 둡니다. (dataURL 이라 금방 끝남)
  useEffect(() => {
    for (const slot of JSON.parse(text) as Slot[]) {
      const url = slot?.[4]
      if (!url || images.current.has(url)) continue
      const img = new Image()
      img.onload = () => {
        images.current.set(url, img)
        setImageCount((n) => n + 1)
      }
      img.src = url
    }
  }, [text])

  useEffect(() => {
    const t = tex.current
    const ctx = (t?.image as HTMLCanvasElement | undefined)?.getContext('2d')
    if (!t || !ctx) return
    draw(ctx, JSON.parse(text) as Slot[], images.current)
    t.needsUpdate = true
  }, [text, imageCount, fontReady])

  return (
    <group position={[board.x, 0, board.z]} rotation={[0, facingAngle(board.facing), 0]} scale={BOARD_SCALE}>
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
