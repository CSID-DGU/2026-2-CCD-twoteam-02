// 화면 오른쪽 위 버튼들의 공통 모양
import type { CSSProperties } from 'react'

// 흰 버튼 하나 (트래킹 검증 화면의 "지점 공간으로" 등)
export const cornerButton: CSSProperties = {
  position: 'fixed', right: 16, zIndex: 10, padding: '6px 12px',
  borderRadius: 8, border: 'none', background: '#fff', color: '#20232a',
  font: '14px system-ui, sans-serif', textDecoration: 'none', cursor: 'pointer',
  boxShadow: '0 1px 4px rgba(0,0,0,.3)',
}

// 로비·지점의 오른쪽 위 메뉴 (#208). 접속 인원·FPS 상자, 아래 안내 문구와 같은 어두운 반투명으로 맞춥니다.
const HUD_BG = 'rgba(32,35,42,.85)'
const MENU_WIDTH = 140 // 버튼 폭을 모두 같게

// 메뉴 상자들을 세로로 쌓는 자리
export const menuStack: CSSProperties = {
  position: 'fixed', top: 16, right: 16, zIndex: 10, width: MENU_WIDTH,
  display: 'flex', flexDirection: 'column', gap: 8,
}

// 버튼들을 담는 상자
export const menuBox: CSSProperties = {
  display: 'flex', flexDirection: 'column', padding: 4, borderRadius: 8, background: HUD_BG,
}

// 상자 안의 버튼 한 줄 (button, a 모두)
export const menuRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px',
  borderRadius: 6, border: 'none', background: 'transparent', boxShadow: 'none', color: '#fff',
  font: '13px system-ui, sans-serif', textAlign: 'left', textDecoration: 'none', cursor: 'pointer',
}

// 가끔 쓰는 버튼(트래킹 검증·로그아웃)은 조금 작고 흐리게
export const menuRowMinor: CSSProperties = { ...menuRow, padding: '4px 8px', color: '#aab0bb', fontSize: 12 }

// 버튼 앞의 키 표시 (키캡 모양)
export const keyCap: CSSProperties = {
  display: 'inline-grid', placeItems: 'center', minWidth: 18, height: 18, padding: '0 4px',
  borderRadius: 4, border: '1px solid rgba(255,255,255,.35)', color: '#d1d5db',
  font: '11px ui-monospace, monospace',
}

// 상자 안 구분선
export const menuDivider: CSSProperties = { height: 1, margin: '4px 6px', background: 'rgba(255,255,255,.15)' }
