// 화면에 띄워 두는 창 (위쪽 손잡이를 끌어 옮김). 자리는 이 브라우저에 기억합니다(창마다 id).
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

const MARGIN = 8

function loadPos(id: string, fallback: { x: number; y: number }) {
  try {
    const raw = localStorage.getItem(`dooteum.window.${id}`)
    const p = raw ? (JSON.parse(raw) as { x: number; y: number }) : null
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : fallback
  } catch {
    return fallback
  }
}
function savePos(id: string, p: { x: number; y: number }) {
  try {
    localStorage.setItem(`dooteum.window.${id}`, JSON.stringify(p))
  } catch {
    // 기억하지 못해도 이번에는 그 자리에 둠
  }
}

// x·y: 화면 비율(0~1)로 왼쪽 위 자리. handle: 손잡이 줄에 넣을 것(제목·버튼)
export function FloatingWindow({ id, initial, width, handle, children, style }: { id: string; initial: { x: number; y: number }; width: number; handle: ReactNode; children: ReactNode; style?: CSSProperties }) {
  const [pos, setPos] = useState(() => loadPos(id, initial))
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!drag.current) return
      const w = box.current?.offsetWidth ?? width
      const h = box.current?.offsetHeight ?? 100
      const x = Math.min(Math.max(e.clientX - drag.current.dx, MARGIN - w + 80), window.innerWidth - 80) / window.innerWidth
      const y = Math.min(Math.max(e.clientY - drag.current.dy, MARGIN), window.innerHeight - Math.min(h, 40)) / window.innerHeight
      setPos({ x, y })
    }
    const up = () => {
      if (!drag.current) return
      drag.current = null
      setPos((p) => {
        savePos(id, p)
        return p
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [id, width])

  return (
    <div ref={box} style={{ position: 'fixed', left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, width, pointerEvents: 'auto', ...style }}>
      <div
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button, input')) return
          drag.current = { dx: e.clientX - pos.x * window.innerWidth, dy: e.clientY - pos.y * window.innerHeight }
          e.preventDefault()
        }}
        style={{ cursor: 'grab', userSelect: 'none', touchAction: 'none' }}
      >
        {handle}
      </div>
      {children}
    </div>
  )
}
