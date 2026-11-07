// 앉아 있을 때 시점을 바꾸는 버튼 (#436). 키보드의 시점 키(기본 V)와 같은 일을 마우스로 합니다.
// 내 모습 화면(SelfView, 오른쪽 아래) 바로 위에 놓습니다.
import type { CSSProperties } from 'react'
import { keyLabel, useKeymap } from '../menu/keymap'
import { SELF_VIEW_SIZE } from './SelfView'
import { SEAT_VIEW_NAME } from './seatViewLogic'
import { cycleSeatView, useSeatView } from './useSeatView'

export function SeatViewButton() {
  const view = useSeatView()
  const key = keyLabel(useKeymap().view)
  return (
    <button
      type="button"
      style={style}
      // 누른 뒤 버튼에 포커스가 남으면 Space(정면 보기)가 이 버튼을 다시 누르므로 바로 뺍니다.
      onClick={(e) => {
        cycleSeatView()
        e.currentTarget.blur()
      }}
      title={`시점 바꾸기 (${key})`}
    >
      👁 {SEAT_VIEW_NAME[view]} · {key}
    </button>
  )
}

const style: CSSProperties = {
  position: 'fixed',
  right: 16,
  bottom: 16 + SELF_VIEW_SIZE + 8,
  zIndex: 5,
  padding: '6px 12px',
  borderRadius: 999,
  border: 'none',
  background: 'rgba(0,0,0,.55)',
  color: '#fff',
  font: '13px/1.4 system-ui, sans-serif',
  cursor: 'pointer',
}
