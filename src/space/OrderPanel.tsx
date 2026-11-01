// 카페 주문 창 (카운터 앞에서 E): 메뉴를 고르면 바리스타가 만들어 내 손에 컵을 줌. 돈·기록 없이 보기만 (DB 안 씀)
import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import type { MenuItem } from './baristaLogic'

const box: CSSProperties = {
  position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 60,
  width: 'min(360px, calc(100vw - 32px))', padding: 18, borderRadius: 16,
  background: '#2b2f2a', color: '#f4f1e6', border: '6px solid #8a6a4a', boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
}
const item: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 12px', marginTop: 8, borderRadius: 10,
  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#f4f1e6', fontSize: 16, cursor: 'pointer', textAlign: 'left',
}

export function OrderPanel({ title, menu, onPick, onClose }: { title: string; menu: MenuItem[]; onPick: (m: MenuItem) => void; onClose: () => void }) {
  // Esc 로 닫기
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose()
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [onClose])
  return (
    <div style={box} role="dialog" aria-label="주문하기">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b style={{ fontSize: 18 }}>☕ {title} 메뉴</b>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#f4f1e6', fontSize: 18, cursor: 'pointer' }} aria-label="닫기">
          ✕
        </button>
      </div>
      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>고르면 바리스타가 만들어 드려요 (무료 · 내 화면에만 보여요)</div>
      {menu.map((m) => (
        <button key={m.name} style={item} onClick={() => onPick(m)}>
          <span style={{ fontSize: 22 }}>{m.icon}</span>
          {m.name}
        </button>
      ))}
    </div>
  )
}
