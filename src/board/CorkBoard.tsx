// 벽에 걸린 코르크 게시판 (3D): 위에 "☆ 오늘의 한마디 ☆" 분필 칠판 간판(광장 "오늘의 공부왕" 과 같은 칠판),
// 아래 원목 테 + 코르크 판 + 최근 쪽지들(손글씨 글 + 빨간 압정).
// 쪽지 글은 캔버스에 그려 텍스처로 붙입니다. 판에 다 안 들어가는 오래된 쪽지는 창(BoardPanel)에서만 보여요.
import { useEffect, useState } from 'react'
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { CHALK, chalkStar, chalkText, doodles, drawBoard, loadChalkFont } from '../ranking/chalk'
import { wallPose } from '../space/theme'
import type { Frame } from '../space/theme'
import { HAND_FIXED as HAND, INK, NOTE_COLOR } from '../planner/paperStyle'
import { BOARD, pinLayout } from './boardLogic'
import type { BoardNote } from './boardLogic'

// 게시판 자리: 벽 좌표 (x,z), 판 폭·높이, face 는 판이 보는 쪽(벽 안쪽), y 는 판 가운데 높이
export type NoteBoardSpec = { x: number; z: number; w: number; h: number; face: Frame['face']; y: number }

const textures = new Map<string, CanvasTexture>()
function cached(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat?: { x: number; y: number }) {
  let t = textures.get(key)
  if (!t) {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    draw(canvas.getContext('2d')!)
    t = new CanvasTexture(canvas)
    t.colorSpace = SRGBColorSpace
    if (repeat) {
      t.wrapS = RepeatWrapping
      t.wrapT = RepeatWrapping
      t.repeat.set(repeat.x, repeat.y)
    }
    textures.set(key, t)
  }
  return t
}

// 코르크: 갈색 바탕에 밝고 어두운 알갱이 (고정 씨앗이라 늘 같은 무늬)
function corkTexture(repeat: { x: number; y: number }) {
  return cached(`cork|${repeat.x}|${repeat.y}`, 256, 256, (ctx) => {
    let s = 7
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    ctx.fillStyle = '#c29767'
    ctx.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 5000; i++) {
      const v = rnd()
      ctx.fillStyle = v < 0.45 ? 'rgba(110,70,35,0.35)' : v < 0.8 ? 'rgba(235,200,150,0.3)' : 'rgba(70,40,20,0.4)'
      ctx.beginPath()
      ctx.arc(rnd() * 256, rnd() * 256, 0.6 + rnd() * 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
  }, repeat)
}

// 쪽지 한 장: 종이 색 + 손글씨 글(앞 몇 줄) + 아래 닉네임
const NOTE_PX = 256
function noteTexture(n: BoardNote) {
  return cached(`note|${n.id}|${n.color}|${n.body}|${n.nickname}`, NOTE_PX, NOTE_PX, (ctx) => {
    ctx.fillStyle = NOTE_COLOR[n.color]
    ctx.fillRect(0, 0, NOTE_PX, NOTE_PX)
    ctx.fillStyle = INK
    ctx.font = `34px ${HAND}`
    ctx.textBaseline = 'top'
    // 글자 단위로 줄바꿈 (한글은 띄어쓰기 없이도 길어서)
    const lines: string[] = []
    for (const para of n.body.split('\n')) {
      let line = ''
      for (const ch of para) {
        if (ctx.measureText(line + ch).width > NOTE_PX - 28) {
          lines.push(line)
          line = ch
        } else line += ch
      }
      lines.push(line)
    }
    const max = 5
    lines.slice(0, max).forEach((l, i) => ctx.fillText(i === max - 1 && lines.length > max ? `${l.slice(0, -1)}…` : l, 14, 22 + i * 38))
    ctx.font = `20px sans-serif`
    ctx.globalAlpha = 0.65
    ctx.fillText(n.nickname, 14, NOTE_PX - 32)
  })
}

export function CorkBoard({ board, notes }: { board: NoteBoardSpec; notes: BoardNote[] }) {
  const p = wallPose(board.x, board.z, board.face, board.y, 0.1 + 0.03)
  const frame = 0.07
  const placed = pinLayout(notes.map((n) => n.id), board.w - 0.1, board.h - 0.1)
  const byId = new Map(notes.map((n) => [n.id, n]))
  // 분필 글꼴(케듀체)을 받은 뒤 간판을 다시 그림 (그 전에는 시스템 글꼴)
  const [fontReady, setFontReady] = useState(false)
  useEffect(() => {
    let alive = true
    void loadChalkFont().then(() => alive && setFontReady(true))
    return () => {
      alive = false
    }
  }, [])
  return (
    <group position={[p.x, p.y, p.z]} rotation-y={p.rotY}>
      {/* 원목 테 */}
      <mesh position-z={-0.01}>
        <boxGeometry args={[board.w + frame * 2, board.h + frame * 2, 0.04]} />
        <meshStandardMaterial color="#a77a4b" roughness={0.6} />
      </mesh>
      {/* 코르크 판 */}
      <mesh position-z={0.012}>
        <planeGeometry args={[board.w, board.h]} />
        <meshStandardMaterial map={corkTexture({ x: board.w / 0.8, y: board.h / 0.8 })} bumpMap={corkTexture({ x: board.w / 0.8, y: board.h / 0.8 })} bumpScale={1.5} roughness={0.95} />
      </mesh>
      {/* 쪽지 + 압정 */}
      {placed.map((pin, i) => {
        const n = byId.get(pin.id)!
        return (
          <group key={pin.id} position={[pin.x, pin.y, 0.016 + i * 0.0004]} rotation-z={pin.tilt}>
            <mesh>
              <planeGeometry args={[BOARD.note, BOARD.note]} />
              <meshStandardMaterial map={noteTexture(n)} roughness={0.9} />
            </mesh>
            <mesh position={[0, BOARD.note / 2 - 0.03, 0.008]}>
              <sphereGeometry args={[0.014, 10, 8]} />
              <meshStandardMaterial color="#d33c3c" roughness={0.35} />
            </mesh>
          </group>
        )
      })}
      {/* 머리 간판: 원목 테를 두른 분필 칠판 */}
      <group position-y={board.h / 2 + frame + SIGN.gap + SIGN.h / 2}>
        <mesh position-z={-0.01}>
          <boxGeometry args={[SIGN.w + 0.12, SIGN.h + 0.12, 0.05]} />
          <meshStandardMaterial color={CHALK.wood} roughness={0.6} />
        </mesh>
        <mesh position-z={0.017}>
          <planeGeometry args={[SIGN.w, SIGN.h]} />
          <meshBasicMaterial map={titleTexture(fontReady)} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

// 간판 칠판: 짙은 초록 바탕 + 노란 분필 제목 + 흰 분필 안내 + 구석 낙서와 별
const SIGN = { w: 2.0, h: 0.5, gap: 0.08 }
function titleTexture(fontReady: boolean) {
  return cached(`board-title|${fontReady}`, 800, 200, (ctx) => {
    const w = 800
    const h = 200
    drawBoard(ctx, w, h)
    doodles(ctx, w, h, 0.8)
    chalkText(ctx, '오늘의 한마디', w / 2, h * 0.42, { size: 78, bold: true, color: CHALK.yellow })
    ctx.save()
    ctx.strokeStyle = CHALK.gold
    ctx.lineWidth = 3
    ctx.globalAlpha = 0.85
    chalkStar(ctx, w / 2 - 250, h * 0.42, 20)
    chalkStar(ctx, w / 2 + 250, h * 0.42, 20)
    ctx.restore()
    chalkText(ctx, '함께 공부하는 사람들에게 쪽지를 남겨요', w / 2, h * 0.8, { size: 28, color: CHALK.white })
  })
}
