// 메모장에서 뜯은 메모 한 장. 화면에 붙여 두고 끌어 옮기고, 손글씨로 씀. 위쪽은 뜯은 자국(톱니)
import { useEffect, useRef } from 'react'
import type { Memo } from './useMemos'
import { HAND, INK, NOTE_COLOR, handInput, paperSurface } from './paperStyle'

const W = 200
const H = 190

// 뜯은 자국: 위 끝을 톱니처럼
const TORN = 'polygon(0% 4%, 5% 0%, 10% 4%, 15% 1%, 20% 4%, 25% 0%, 30% 3%, 35% 0%, 40% 4%, 45% 1%, 50% 4%, 55% 0%, 60% 3%, 65% 1%, 70% 4%, 75% 0%, 80% 3%, 85% 0%, 90% 4%, 95% 1%, 100% 4%, 100% 100%, 0% 100%)'

export function StickyNote({ memo, onChange, onHide, onRemove }: { memo: Memo; onChange: (p: Partial<Memo>) => void; onHide: () => void; onRemove: () => void }) {
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const latest = useRef(onChange)
  useEffect(() => {
    latest.current = onChange
  }, [onChange])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!drag.current) return
      const x = Math.min(Math.max((e.clientX - drag.current.dx) / window.innerWidth, 0), 1 - W / window.innerWidth)
      const y = Math.min(Math.max((e.clientY - drag.current.dy) / window.innerHeight, 0), 1 - 40 / window.innerHeight)
      latest.current({ x, y })
    }
    const up = () => {
      drag.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  const tilt = ((memo.id * 37) % 7) - 3 // 장마다 조금씩 비뚤게
  return (
    <div style={{ position: 'fixed', left: `${memo.x * 100}%`, top: `${memo.y * 100}%`, width: W, height: H, transform: `rotate(${tilt * 0.6}deg)`, pointerEvents: 'auto', filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.3))' }}>
      <div style={{ ...paperSurface(NOTE_COLOR[memo.color]), boxShadow: 'none', width: '100%', height: '100%', clipPath: TORN, position: 'relative' }}>
        <div
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return
            drag.current = { dx: e.clientX - memo.x * window.innerWidth, dy: e.clientY - memo.y * window.innerHeight }
            e.preventDefault()
          }}
          style={{ height: 26, cursor: 'grab', display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 2, padding: '0 4px', touchAction: 'none' }}
        >
          <button onClick={onHide} title="떼서 가방에 넣기" style={iconBtn}>↧</button>
          <button onClick={onRemove} title="버리기" style={iconBtn}>✕</button>
        </div>
        <textarea
          value={memo.body}
          maxLength={1000}
          onChange={(e) => onChange({ body: e.target.value })}
          placeholder="메모"
          style={{ ...handInput, position: 'absolute', inset: '28px 12px 10px 12px', width: 'auto', resize: 'none', fontSize: 21, lineHeight: 1.3, fontFamily: HAND, color: INK }}
        />
      </div>
    </div>
  )
}

const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#7a6a55', fontSize: 14, padding: '0 3px' }
