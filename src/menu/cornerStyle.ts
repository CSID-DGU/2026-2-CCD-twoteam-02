// 화면 오른쪽 위 버튼들의 공통 모양 (로비·지점의 메뉴 버튼, 로비로·로그아웃 등)
import type { CSSProperties } from 'react'

export const cornerButton: CSSProperties = {
  position: 'fixed', right: 16, zIndex: 10, padding: '6px 12px',
  borderRadius: 8, border: 'none', background: '#fff', color: '#20232a',
  font: '14px system-ui, sans-serif', textDecoration: 'none', cursor: 'pointer',
  boxShadow: '0 1px 4px rgba(0,0,0,.3)',
}

export const CORNER_GAP = 40 // 버튼끼리 세로 간격(px)
