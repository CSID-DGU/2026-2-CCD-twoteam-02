// 가방 속 종이(플래너·메모) 모양. 인쇄된 글자는 반듯한 글꼴, 직접 쓴 글자는 손글씨(오춘기 김작가, index.css)
import type { CSSProperties } from 'react'
import type { MemoColor } from './useMemos'

export const INK = '#2c3e66' // 펜 잉크 (직접 쓴 글씨)
export const LINE = '#7aa6c2' // 플래너 인쇄 선·글자
export const PAPER = '#f1ebe6'
export const HAND = "'OchungiKim', 'KyoboHandwriting2020A', cursive"
export const PRINT = "'Arial Rounded MT Bold', 'Nunito', 'Pretendard', system-ui, sans-serif"

// 종이 결: 아주 옅은 잡티(SVG 노이즈)를 깔아 화면색이 아니라 종이처럼
const NOISE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.45 0 0 0 0 0.38 0 0 0 0 0.3 0 0 0 0.09 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
export const paperSurface = (color = PAPER): CSSProperties => ({
  backgroundColor: color,
  backgroundImage: NOISE,
  boxShadow: '0 10px 28px rgba(0,0,0,0.35), inset 0 0 40px rgba(120,90,60,0.08)',
})

// 직접 쓰는 칸: 테두리 없이 종이에 바로 쓴 것처럼
export const handInput: CSSProperties = {
  fontFamily: HAND,
  color: INK,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  padding: 0,
  width: '100%',
  fontSize: 22,
  lineHeight: 1.1,
}
export const printLabel: CSSProperties = { fontFamily: PRINT, color: LINE, fontWeight: 800, letterSpacing: 1, fontSize: 13 }

// 메모지 색 (memo_notes.color)
export const NOTE_COLOR: Record<MemoColor, string> = { yellow: '#fbe9a6', pink: '#f8d3dc', blue: '#d3e7f5', green: '#d9efcf' }
