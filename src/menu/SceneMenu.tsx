// 로비·지점 오른쪽 위의 "내 기록", "친구", "내 프로필" 버튼. 누르면 페이지를 옮기지 않고 창을 엽니다. (#70)
import { CORNER_GAP, cornerButton } from './cornerStyle'
import type { PanelView } from './panelTypes'

export function SceneMenu({ top, myId, onOpen }: { top: number; myId: string; onOpen: (view: PanelView) => void }) {
  const items: { label: string; view: PanelView }[] = [
    { label: '내 기록', view: { kind: 'records' } },
    { label: '친구', view: { kind: 'friends' } },
    { label: '내 프로필', view: { kind: 'profile', userId: myId } },
  ]
  return (
    <>
      {items.map((it, i) => (
        <button key={it.label} type="button" style={{ ...cornerButton, top: top + i * CORNER_GAP }} onClick={() => onOpen(it.view)}>
          {it.label}
        </button>
      ))}
    </>
  )
}
