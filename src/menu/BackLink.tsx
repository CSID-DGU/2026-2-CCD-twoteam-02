// 페이지(/records 등)에서 "뒤로": 들어오기 전 화면으로 돌아갑니다.
// 주소를 직접 쳐서 들어와 돌아갈 곳이 없으면 로비로 갑니다.
import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router'

export function BackLink({ style }: { style?: CSSProperties }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      style={style}
      onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'))}
    >
      뒤로
    </button>
  )
}
