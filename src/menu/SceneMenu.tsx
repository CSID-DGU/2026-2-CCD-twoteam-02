// 로비·지점 오른쪽 위의 "내 기록", "친구", "내 프로필" 버튼. 누르면 페이지를 옮기지 않고 창을 엽니다. (#70)
// 키보드로도 엽니다(R·F·P, #205). 버튼에 키를 같이 적습니다.
import { CORNER_GAP, cornerButton } from './cornerStyle'
import type { PanelView } from './panelTypes'
import { PANEL_KEYS, withKey } from './shortcuts'

export function SceneMenu({ top, myId, onOpen }: { top: number; myId: string; onOpen: (view: PanelView) => void }) {
  return (
    <>
      {PANEL_KEYS.map((it, i) => (
        <button
          key={it.code}
          type="button"
          style={{ ...cornerButton, top: top + i * CORNER_GAP }}
          onClick={() => onOpen(it.kind === 'profile' ? { kind: 'profile', userId: myId } : { kind: it.kind })}
        >
          {withKey(it.key, it.label)}
        </button>
      ))}
    </>
  )
}
