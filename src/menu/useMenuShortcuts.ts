// 오른쪽 위 버튼의 키보드 단축키를 겁니다 (#205). 로비·지점이 씁니다.
//   R 내 기록, F 친구, P 내 프로필, O 설정: 창을 열고, 같은 키를 다시 누르면 닫습니다.
//   L 로비로, T 트래킹 검증: onLobby·onTracking 을 준 화면(지점)에서만. 언제 갈 수 있는지는 그 화면이 정합니다.
//   키는 설정에서 바꿀 수 있어서, 누른 순간의 키 표(getKeymap)로 판단합니다. (#250)
import { useEffect, useRef } from 'react'
import type { PanelView } from './panelTypes'
import { isShortcut, panelAfterKey } from './shortcuts'
import { getKeymap } from './keymap'

type Options = {
  myId: string | null // 로그인 전이면 null (단축키를 걸지 않음)
  panel: PanelView | null // 지금 떠 있는 창
  setPanel: (view: PanelView | null) => void
  disabled?: boolean // 키오스크·확인 창처럼 다른 창이 떠 있으면 true
  onLobby?: () => void // L 을 눌렀을 때. 지금 나갈 수 없으면 주지 않습니다.
  onTracking?: () => void // T 를 눌렀을 때 (트래킹 검증 화면으로). 지금 갈 수 없으면 주지 않습니다.
}

export function useMenuShortcuts(options: Options) {
  // 키 처리는 한 번만 등록하고, 누른 순간의 최신 값을 읽습니다.
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const { myId, panel, setPanel, disabled, onLobby, onTracking } = latest.current
      if (!myId || disabled || !isShortcut(e)) return
      const keys = getKeymap()
      const leave = e.code === keys.lobby ? onLobby : e.code === keys.tracking ? onTracking : undefined
      if (e.code === keys.lobby || e.code === keys.tracking) {
        if (panel || !leave) return
        e.preventDefault()
        leave()
        return
      }
      const next = panelAfterKey(e.code, panel, myId)
      if (next === undefined) return
      e.preventDefault()
      setPanel(next)
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])
}
