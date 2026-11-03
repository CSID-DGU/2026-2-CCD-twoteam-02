// 해변 모래 글씨·그림 (사용자 요청). 모래 위에서 키를 누르면 발 앞을 내려다보고, 마우스로 끌어 그리거나 글자를 칩니다.
// 남긴 것은 해변의 모두에게 보이고 1분 뒤 사라집니다. DB 없이 Supabase 실시간 전송만 씁니다(축구공과 같은 방식).
// 늦게 온 사람은 need 를 보내고, 이미 있던 사람이 조금씩 다른 시간 뒤에 남은 판을 다시 보내 줍니다.
// 판마다 캔버스 그림 한 장을 바닥에 눕혀 그립니다. 판 수는 sandLogic.LIMIT 로 제한합니다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { BOARD, LIFE_MS, LIMIT, cleanText, markAlpha, toBoard } from './sandLogic'
import type { SandMark, SandOp } from './sandLogic'
import type { SandBoard } from './useSandMarks'
import { HAND_FONTS } from '../planner/handFonts'
import type { HandFontId } from '../planner/handFonts'
import { useHandFont } from '../planner/useHandFont'

const CANVAS_PX = 512
const INK = { dark: 'rgba(96,68,40,0.78)', light: 'rgba(255,240,208,0.6)', line: 13, emboss: 2.5, font: 88 } // 파인 곳, 파인 가장자리 빛, 획 굵기(px), 빛 어긋남(px), 글자 크기(px)
const LOOK = { y: 3.5 } // 내려다보는 높이(m)
const MARK_Y = 0.015 // 모래 위로 살짝
const STEP_MIN = 0.008 // 획 점 사이 최소 거리(판 좌표). 점 수를 줄임

// 파인 모래처럼: 어긋난 밝은 선 위에 어두운 선 (캔버스에 획 하나 더 그림)
// 쓴 사람의 손글씨 글씨체 (플래너에서 고른 것). 크기는 글씨체별 배율을 따름
function fontOf(id: HandFontId) {
  const f = HAND_FONTS.find((x) => x.id === id) ?? HAND_FONTS[0]
  return `400 ${Math.round(INK.font * f.scale)}px ${f.family}`
}

function drawOp(g: CanvasRenderingContext2D, op: SandOp) {
  const S = CANVAS_PX
  const paint = (dx: number, color: string) => {
    g.save()
    g.translate(dx, dx)
    g.strokeStyle = color
    g.fillStyle = color
    g.lineWidth = INK.line
    g.lineCap = g.lineJoin = 'round'
    if (op.t === 'line') {
      g.beginPath()
      g.moveTo(op.p[0] * S, op.p[1] * S)
      for (let i = 2; i < op.p.length; i += 2) g.lineTo(op.p[i] * S, op.p[i + 1] * S)
      g.stroke()
    } else {
      g.font = fontOf(op.f)
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(op.s, op.u * S, op.v * S, S * 0.94)
    }
    g.restore()
  }
  paint(INK.emboss, INK.light)
  paint(0, INK.dark)
}

type Look = { g: CanvasRenderingContext2D; texture: THREE.CanvasTexture; material: THREE.MeshStandardMaterial; queue: Promise<unknown> }
function makeLook(): Look {
  const c = document.createElement('canvas')
  c.width = c.height = CANVAS_PX
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return { g: c.getContext('2d')!, texture, material: new THREE.MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false, roughness: 1 }), queue: Promise.resolve() }
}
// 글씨체 파일을 받은 뒤에 그림 (안 받은 채 그리면 다른 글꼴로 남음). 순서가 섞이지 않게 줄 세움. 못 받아도 그림
function paintOps(look: Look, ops: SandOp[]) {
  const fonts = ops.flatMap((op) => (op.t === 'text' ? [document.fonts.load(fontOf(op.f), op.s)] : []))
  look.queue = look.queue
    .then(() => Promise.all(fonts))
    .catch(() => undefined)
    .then(() => {
      for (const op of ops) drawOp(look.g, op)
      look.texture.needsUpdate = true
    })
}
function freeLook(look: Look) {
  look.texture.dispose()
  look.material.dispose()
}

// 판 한 장. 새 획만 그려 넣고, 1분 끝에 옅어짐
function MarkPlane({ mark }: { mark: SandMark }) {
  const look = useMemo(() => makeLook(), [])
  useEffect(() => () => freeLook(look), [look])
  const drawn = useRef(0)
  useEffect(() => {
    if (mark.ops.length === drawn.current) return
    paintOps(look, mark.ops.slice(drawn.current))
    drawn.current = mark.ops.length
  }, [mark.ops, look])
  const mesh = useRef<THREE.Mesh>(null)
  useFrame(() => {
    const m = mesh.current?.material as THREE.MeshStandardMaterial | undefined
    if (m) m.opacity = markAlpha(mark.at, Date.now())
  })
  return (
    <group position={[mark.x, MARK_Y, mark.z]} rotation-y={mark.rot}>
      <mesh ref={mesh} rotation-x={-Math.PI / 2} material={look.material} renderOrder={1}>
        <planeGeometry args={[BOARD.size, BOARD.size]} />
      </mesh>
    </group>
  )
}

export function SandMarks({ marks }: { marks: SandMark[] }) {
  return (
    <>
      {marks.map((m) => (
        <MarkPlane key={m.id} mark={m} />
      ))}
    </>
  )
}

// 쓰는 동안의 시점: 판 바로 위에서 내려다봄. 화면 위쪽이 내가 바라보던 앞쪽. 끝나면 위쪽 방향을 되돌림
export function SandCamera({ board }: { board: SandBoard }) {
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    const up = new THREE.Vector3(0, 1, 0)
    camera.up.set(-Math.sin(board.rot), 0, -Math.cos(board.rot))
    camera.position.set(board.x, LOOK.y, board.z)
    camera.lookAt(board.x, 0, board.z)
    camera.updateMatrixWorld()
    return () => {
      camera.up.copy(up)
    }
  }, [camera, board])
  return null
}

// 쓰는 판: 테두리를 보여 주고, 끌면 획이 생김
export function SandPad({ board, write, drawingRef }: { board: SandBoard; write: (b: SandBoard, op: SandOp) => void; drawingRef?: RefObject<boolean> }) {
  const line = useRef<number[] | null>(null)
  const preview = useRef<THREE.Line>(null)
  const previewGeo = useMemo(() => new THREE.BufferGeometry(), [])
  const previewMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#604428' }), [])
  const frame = useMemo(() => {
    const h = BOARD.size / 2
    return new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-h, 0, -h), new THREE.Vector3(h, 0, -h), new THREE.Vector3(h, 0, h), new THREE.Vector3(-h, 0, h), new THREE.Vector3(-h, 0, -h)])
  }, [])
  const frameMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#fff4dc', transparent: true, opacity: 0.55 }), [])
  useEffect(
    () => () => {
      previewGeo.dispose()
      previewMat.dispose()
      frame.dispose()
      frameMat.dispose()
    },
    [previewGeo, previewMat, frame, frameMat],
  )

  const flush = useCallback(() => {
    const p = line.current
    line.current = null
    if (drawingRef) drawingRef.current = false
    previewGeo.setFromPoints([])
    if (p && p.length >= 4) write(board, { t: 'line', p })
    else if (p && p.length === 2) write(board, { t: 'line', p: [p[0], p[1], p[0] + 0.002, p[1]] }) // 점 하나만 찍어도 남게
  }, [board, write, previewGeo, drawingRef])
  useEffect(() => {
    window.addEventListener('pointerup', flush)
    return () => window.removeEventListener('pointerup', flush)
  }, [flush])

  // 쓰는 중인 획을 바로 보여 줌 (떼면 파인 모래 그림으로 바뀜)
  const showPreview = () => {
    const p = line.current
    if (!p) return
    const c = Math.cos(board.rot)
    const s = Math.sin(board.rot)
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < p.length; i += 2) {
      const lx = (p[i] - 0.5) * BOARD.size
      const lz = (p[i + 1] - 0.5) * BOARD.size
      pts.push(new THREE.Vector3(board.x + c * lx + s * lz, MARK_Y + 0.01, board.z - s * lx + c * lz))
    }
    previewGeo.setFromPoints(pts)
  }
  const add = (e: ThreeEvent<PointerEvent>, start: boolean) => {
    const uv = toBoard(board, { x: e.point.x, z: e.point.z })
    if (!uv) {
      if (line.current) flush()
      return
    }
    if (start) {
      line.current = [uv.u, uv.v]
      if (drawingRef) drawingRef.current = true
    } else if (line.current) {
      const p = line.current
      if (Math.hypot(p[p.length - 2] - uv.u, p[p.length - 1] - uv.v) < STEP_MIN) return
      p.push(uv.u, uv.v)
      if (p.length >= LIMIT.points - 2) {
        flush() // 획이 너무 길면 끊고 이어서
        line.current = [uv.u, uv.v]
      }
    }
    showPreview()
  }
  const previewLine = useMemo(() => new THREE.Line(previewGeo, previewMat), [previewGeo, previewMat])
  const frameLine = useMemo(() => new THREE.Line(frame, frameMat), [frame, frameMat])
  return (
    <>
      <primitive object={previewLine} ref={preview} frustumCulled={false} />
      <group position={[board.x, MARK_Y + 0.01, board.z]} rotation-y={board.rot}>
        <primitive object={frameLine} />
      </group>
      {/* 넓은 투명 판: 마우스 자리를 땅 좌표로 받음 */}
      <mesh position={[board.x, 0.02, board.z]} rotation-x={-Math.PI / 2} onPointerDown={(e) => add(e, true)} onPointerMove={(e) => add(e, false)}>
        <planeGeometry args={[BOARD.size * 3, BOARD.size * 3]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  )
}

const bar: CSSProperties = { position: 'absolute', left: '50%', bottom: 28, transform: 'translateX(-50%)', display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', borderRadius: 12, background: 'rgba(40,30,20,0.82)', color: '#fff', fontSize: 14, zIndex: 20 }
const inputStyle: CSSProperties = { width: 240, padding: '8px 10px', borderRadius: 8, border: '1px solid #8a7a66', background: '#fff8ea', color: '#2d2a25', fontSize: 15 }
const doneBtn: CSSProperties = { padding: '8px 12px', borderRadius: 8, border: 'none', background: '#e8c88a', color: '#2d2a25', fontWeight: 700, cursor: 'pointer' }

// 화면 아래 입력 막대: 글자를 치고 Enter 면 모래에 찍힘. 찍을 때마다 한 줄씩 아래로. Esc·버튼으로 끝냄
const TEXT_LINE = { first: 0.2, step: 0.17 }
export function SandBar({ board, write, onClose }: { board: SandBoard; write: (b: SandBoard, op: SandOp) => void; onClose: () => void }) {
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const { font } = useHandFont()
  const family = (HAND_FONTS.find((x) => x.id === font) ?? HAND_FONTS[0]).family
  const lines = useRef(0)
  const stamp = () => {
    if (!text.trim()) return
    const s = cleanText(text)
    if (!s) {
      setNote('쓸 수 없는 낱말이 있어요')
      return
    }
    const v = TEXT_LINE.first + (lines.current % 5) * TEXT_LINE.step
    lines.current++
    write(board, { t: 'text', s, u: 0.5, v, f: font })
    setText('')
    setNote('')
  }
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [onClose])
  return (
    <div style={bar} onPointerDown={(e) => e.stopPropagation()}>
      <span>마우스로 끌어 그리기</span>
      <input
        style={{ ...inputStyle, fontFamily: family, fontSize: 18 }}
        value={text}
        maxLength={LIMIT.text}
        placeholder="글자를 치고 Enter"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          // 한글 조합 중 Enter 는 글자 확정이라 찍지 않음
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) stamp()
          if (e.key === 'Escape') onClose()
        }}
      />
      <button style={doneBtn} onClick={onClose}>
        다 썼어요 (Esc)
      </button>
      {note && <span style={{ color: '#ffd0c0' }}>{note}</span>}
      <span style={{ opacity: 0.7, fontSize: 12 }}>{Math.round(LIFE_MS / 60000)}분 뒤 사라져요</span>
    </div>
  )
}

