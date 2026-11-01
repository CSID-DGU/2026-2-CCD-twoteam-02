// 플래너 종이 더미 + 모서리를 끌어 넘기기. 쓴 날만큼 종이가 쌓여 보입니다 (설계: docs/superpowers/specs/2026-11-01-planner-notebook-design.md)
//
//   아래 더미   : 보고 있는 날보다 앞선 쓴 날. 종이 왼쪽 아래로 가장자리가 삐져나옴 (지난날로 갈수록 얇아짐)
//   넘겨 온 묶음: 보고 있는 날보다 뒤인 쓴 날. 종이 오른쪽으로 삐져나옴 (넘길수록 두꺼워짐)
//   오른쪽 아래 모서리: 끌면 맨 위 장이 오른쪽 묶음으로 들려 나가며 전날(prev)이 드러남
//   왼쪽 아래 모서리  : 끌면 다음 날(next) 장이 오른쪽에서 덮이듯 들어옴
// 짧게 누르기만 해도 한 장 넘어갑니다(폰). 넘길지 되돌릴지는 notebookLogic.flipOutcome.
// 새 라이브러리 없이 CSS transform 으로 움직입니다.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { flipOutcome, visibleSheets } from './notebookLogic'
import { PAPER, PRINT, paperSurface } from './paperStyle'

const EDGE_PX = 1.5 // 더미 한 장이 삐져나오는 거리 (8장이면 12px, 최대 14px 안)
const TILT_DEG = [-1.2, 0.8, -0.5, 1.4, -1, 0.6, -1.5, 1.1] // 더미 장마다 정해진 기울기 (렌더마다 흔들리지 않게)
const CORNER_PX = 28 // 모서리 잡는 자리 크기 (화면 px)
const CORNER_OUT_PX = 12 // 그중 종이 바깥으로 빼는 만큼. 종이 안쪽은 16px 삼각형만 남아 시간표·메모 칸을 거의 덮지 않음
const DRAG_FULL = 0.5 // 종이 폭의 이만큼 끌면 진행률 1
const FLIP_MS = 250 // 놓은 뒤 끝까지(또는 제자리로) 가는 시간

type Mode = 'back' | 'forward'
type Props = {
  width: number
  height: number
  below: number
  flipped: number
  label: string
  canBack: boolean
  canForward: boolean
  onBack: () => void
  onForward: () => void
  top: ReactNode
  prev: ReactNode | null
  next: ReactNode | null
}

// 진행률 p(0~1)일 때 움직이는 장의 모양: 오른쪽 위로 들려 나가며 살짝 휨
const liftedStyle = (p: number): CSSProperties => ({
  transform: `perspective(1600px) translate(${p * 62}%, ${-p * 8}%) rotate(${p * 10}deg) rotateY(${-p * 28}deg)`,
  transformOrigin: '0% 100%',
  boxShadow: `${-6 - p * 18}px ${8 + p * 14}px ${16 + p * 20}px rgba(0,0,0,${0.18 + p * 0.22})`,
  opacity: 1 - p * 0.35,
})

export function NotebookStack({ width, height, below, flipped, label, canBack, canForward, onBack, onForward, top, prev, next }: Props) {
  const [drag, setDrag] = useState<{ mode: Mode; p: number; animating: boolean } | null>(null)
  const start = useRef<{ x: number; y: number; t: number; moved: number } | null>(null)
  const [hover, setHover] = useState<Mode | null>(null)
  const done = useRef<number | null>(null)
  useEffect(() => () => {
    if (done.current !== null) window.clearTimeout(done.current)
  }, [])
  // 넘기기 효과(FLIP_MS)가 끝난 때의 최신 콜백을 부름. 효과 도중 옆 장 읽기가 끝나면 그 내용을 넘겨받게
  const latest = useRef({ onBack, onForward })
  useEffect(() => {
    latest.current = { onBack, onForward }
  }, [onBack, onForward])

  const down = (mode: Mode, e: ReactPointerEvent) => {
    if (drag?.animating || (mode === 'back' ? !canBack : !canForward)) return
    // 뒤의 3D 화면(클릭하면 시점 잠금)이 이 누르기를 받지 않게
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, moved: 0 }
    setDrag({ mode, p: 0, animating: false })
    e.preventDefault()
  }
  const move = (e: ReactPointerEvent) => {
    const s = start.current
    if (!s || !drag || drag.animating) return
    const d = Math.hypot(e.clientX - s.x, e.clientY - s.y)
    s.moved = Math.max(s.moved, d)
    setDrag({ ...drag, p: Math.min(1, d / (width * DRAG_FULL)) })
  }
  // 뗄 때. 화면이 포인터를 가져가 떼는 신호 없이 놓쳐도(lostpointercapture) 같이 처리해 반쯤 들린 채 멈추지 않게. 두 번 와도 한 번만
  const up = (e: { timeStamp: number }) => {
    const s = start.current
    start.current = null
    if (!s || !drag || drag.animating) return
    const result = flipOutcome({ progress: drag.p, movedPx: s.moved, ms: e.timeStamp - s.t })
    setDrag({ ...drag, p: result === 'flip' ? 1 : 0, animating: true })
    done.current = window.setTimeout(() => {
      done.current = null
      if (result === 'flip') (drag.mode === 'back' ? latest.current.onBack : latest.current.onForward)()
      setDrag(null)
    }, FLIP_MS)
  }

  // 그래도 떼는 신호를 모서리가 못 받는 경우 대비: 끄는 동안은 화면 어디서 떼든 마무리
  const upRef = useRef(up)
  useEffect(() => {
    upRef.current = up
  })
  const dragging = drag !== null && !drag.animating
  useEffect(() => {
    if (!dragging) return
    const f = (e: PointerEvent) => upRef.current(e)
    window.addEventListener('pointerup', f)
    return () => window.removeEventListener('pointerup', f)
  }, [dragging])

  const transition = drag?.animating ? `transform ${FLIP_MS}ms ease-out, opacity ${FLIP_MS}ms ease-out, box-shadow ${FLIP_MS}ms ease-out` : 'none'
  const sheet: CSSProperties = { position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 2 }
  const pileSheet = (i: number, side: 'below' | 'flipped'): CSSProperties => ({
    ...sheet,
    ...paperSurface(PAPER),
    boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
    transform:
      side === 'below'
        ? `translate(${-EDGE_PX * (i + 1)}px, ${EDGE_PX * (i + 1)}px) rotate(${TILT_DEG[i % TILT_DEG.length]}deg)`
        : `translate(${EDGE_PX * (i + 1)}px, ${-EDGE_PX * 0.4 * (i + 1)}px) rotate(${-TILT_DEG[i % TILT_DEG.length] * 0.6}deg)`,
  })
  // 모서리: 넘길 수 있으면 접힌 삼각형, 올리면 더 들림
  const corner = (mode: Mode, enabled: boolean): CSSProperties => ({
    position: 'absolute',
    bottom: -CORNER_OUT_PX,
    [mode === 'back' ? 'right' : 'left']: -CORNER_OUT_PX,
    width: CORNER_PX,
    height: CORNER_PX,
    // 종이 모서리 쪽 삼각형만 잡히게 (안쪽 칸을 덮지 않도록)
    clipPath: mode === 'back' ? 'polygon(100% 0, 100% 100%, 0 100%)' : 'polygon(0 0, 100% 100%, 0 100%)',
    zIndex: 5,
    cursor: enabled ? 'grab' : 'default',
    touchAction: 'none',
    pointerEvents: enabled ? 'auto' : 'none',
  })
  // 접힌 모서리 그림: 잡는 자리(corner)는 삼각형으로 잘려 있어 그 안에 두면 가려지므로 종이 모서리에 따로 그림
  const fold = (mode: Mode): CSSProperties => {
    const size = hover === mode || drag?.mode === mode ? 30 : 18
    return {
      position: 'absolute',
      bottom: 0,
      [mode === 'back' ? 'right' : 'left']: 0,
      zIndex: 4,
      pointerEvents: 'none', // 그림일 뿐, 잡는 건 아래 모서리 자리(corner)
      width: size,
      height: size,
      background: `linear-gradient(${mode === 'back' ? '315deg' : '45deg'}, transparent 50%, #e2d6c6 50%)`,
      boxShadow: mode === 'back' ? '-2px -2px 4px rgba(0,0,0,0.15)' : '2px -2px 4px rgba(0,0,0,0.15)',
      transition: 'width 120ms, height 120ms',
    }
  }

  const p = drag?.p ?? 0
  return (
    <div style={{ position: 'relative', width, height }}>
      {Array.from({ length: visibleSheets(below) }, (_, i) => visibleSheets(below) - 1 - i).map((i) => (
        <div key={`b${i}`} style={pileSheet(i, 'below')} />
      ))}
      {Array.from({ length: visibleSheets(flipped) }, (_, i) => visibleSheets(flipped) - 1 - i).map((i) => (
        <div key={`f${i}`} style={pileSheet(i, 'flipped')} />
      ))}

      {/* 지난날로 넘길 때 드러나는 전날 장 */}
      {drag?.mode === 'back' && prev && <div style={sheet}>{prev}</div>}

      {/* 맨 위 장 (지난날로 넘길 때 들려 나감) */}
      <div style={{ ...sheet, ...(drag?.mode === 'back' ? liftedStyle(p) : {}), transition, zIndex: 2 }}>{top}</div>

      {/* 앞날로 넘길 때 덮이는 다음 날 장 (오른쪽에서 들어옴) */}
      {drag?.mode === 'forward' && next && <div style={{ ...sheet, ...liftedStyle(1 - p), transition, zIndex: 3 }}>{next}</div>}

      <div style={corner('back', canBack)} onPointerDown={(e) => down('back', e)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onPointerEnter={() => setHover('back')} onPointerLeave={() => setHover(null)} title="지난날로 넘기기" aria-label="지난날로 넘기기" role="button">
      </div>
      <div style={corner('forward', canForward)} onPointerDown={(e) => down('forward', e)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onPointerEnter={() => setHover('forward')} onPointerLeave={() => setHover(null)} title="다음 날로 넘기기" aria-label="다음 날로 넘기기" role="button">
      </div>
      {canBack && drag?.mode !== 'back' && <div style={fold('back')} />}
      {canForward && drag?.mode !== 'forward' && <div style={fold('forward')} />}

      <div style={{ position: 'absolute', left: 0, right: 0, top: height + 6, textAlign: 'center', fontFamily: PRINT, fontSize: 11, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.6)', pointerEvents: 'none' }}>{label}</div>
    </div>
  )
}
