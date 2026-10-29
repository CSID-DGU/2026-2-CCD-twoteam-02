// 층 고르는 창 (여러 층 건물의 지점 안 엘리베이터).
import { useEffect } from 'react'
import type { PlacedFloor } from './worldLogic'

// 층 고르는 창: 엘리베이터 버튼처럼 위층부터. 숫자 키(1·2·3)로도 고르고 Esc 로 닫습니다.
// current: 지금 있는 층(지점 안 엘리베이터). 그 층은 "지금 층"으로 표시하고 누를 수 없습니다.
export function FloorPicker({ floors, current, onPick, onClose }: {
  floors: PlacedFloor[]
  current?: string
  onPick: (slug: string) => void
  onClose: () => void
}) {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        onClose()
        return
      }
      const f = floors.find((x) => e.code === `Digit${x.level}`)
      if (f && f.slug !== current) onPick(f.slug)
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [floors, current, onPick, onClose])
  return (
    <div style={pickerBox}>
      <div style={{ fontWeight: 600, marginBottom: 10 }}>몇 층으로 갈까요?</div>
      {[...floors].reverse().map((f) => (
        <button
          key={f.slug}
          style={{ ...pickerButton, ...(f.slug === current ? { opacity: 0.5, cursor: 'default' } : {}) }}
          disabled={f.slug === current}
          onClick={() => onPick(f.slug)}
        >
          <b style={{ width: 28 }}>{f.level}F</b> {f.name}
          {f.slug === current && <span style={{ marginLeft: 'auto', opacity: 0.8 }}>지금 층</span>}
        </button>
      ))}
      <button style={{ ...pickerButton, justifyContent: 'center', opacity: 0.8 }} onClick={onClose}>
        닫기 (Esc)
      </button>
    </div>
  )
}

const pickerBox: React.CSSProperties = {
  position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 20,
  width: 260, padding: 16, borderRadius: 12, background: 'rgba(32,35,42,.94)', color: '#fff',
  font: '14px system-ui, sans-serif',
}

const pickerButton: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginTop: 6, padding: '10px 12px',
  border: 0, borderRadius: 8, background: 'rgba(255,255,255,.1)', color: '#fff', font: 'inherit', cursor: 'pointer', textAlign: 'left',
}
