// 로비·지점 오른쪽 위 메뉴 (#70, #208).
//   위 상자: 자주 쓰는 것. 내 기록·친구·내 프로필(누르면 페이지를 옮기지 않고 창), 로비로(지점만)
//   아래 상자: 가끔 쓰는 것. 트래킹 검증(지점만), 로그아웃
// 키보드로도 엽니다(R·F·P·L, #205). 버튼 앞에 키를 키캡 모양으로 적습니다.
import { Link } from 'react-router'
import LogoutButton from '../auth/LogoutButton'
import { keyCap, menuBox, menuDivider, menuRow, menuRowMinor, menuStack } from './cornerStyle'
import type { PanelView } from './panelTypes'
import { LOBBY_KEY, PANEL_KEYS } from './shortcuts'

type Props = {
  myId: string
  onOpen: (view: PanelView) => void
  onLobby?: () => void // 지점에서만: 로비로 나가기
  showTracking?: boolean // 지점에서만: 트래킹 검증 화면으로 가는 버튼
}

export function SceneMenu({ myId, onOpen, onLobby, showTracking = false }: Props) {
  return (
    <div style={menuStack}>
      <nav style={menuBox}>
        {PANEL_KEYS.map((it) => (
          <button
            key={it.code}
            type="button"
            style={menuRow}
            onClick={() => onOpen(it.kind === 'profile' ? { kind: 'profile', userId: myId } : { kind: it.kind })}
          >
            <span style={keyCap}>{it.key}</span>
            {it.label}
          </button>
        ))}
        {onLobby && (
          <>
            <div style={menuDivider} />
            {/* 버튼으로 나가도 보던 방향 그대로 로비의 그 지점 문 앞에 섭니다. (#150) */}
            <button type="button" style={menuRow} onClick={onLobby}>
              <span style={keyCap}>{LOBBY_KEY.key}</span>
              로비로
            </button>
          </>
        )}
      </nav>
      <div style={menuBox}>
        {showTracking && (
          <Link to="/tracking" style={menuRowMinor}>
            트래킹 검증
          </Link>
        )}
        <LogoutButton style={menuRowMinor} />
      </div>
    </div>
  )
}
