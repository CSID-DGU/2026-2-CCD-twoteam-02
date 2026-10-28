// 로비·지점 오른쪽 위 메뉴 (#70, #208).
//   위 상자: 자주 쓰는 것. 내 기록·친구·내 프로필(누르면 페이지를 옮기지 않고 창), 로비로(지점만)
//   아래 상자: 가끔 쓰는 것. 설정(#222), 트래킹 검증(지점만), 로그아웃
// 키보드로도 엽니다(R·F·P·L·O·T, #205). 버튼 앞에 키를 키캡 모양으로 적습니다. 키는 설정에서 바꾼 대로 보입니다(#250).
import LogoutButton from '../auth/LogoutButton'
import { keyCap, menuBox, menuDivider, menuRow, menuRowMinor, menuStack } from './cornerStyle'
import type { PanelView } from './panelTypes'
import { PANEL_KEYS } from './shortcuts'
import { keyLabel, useKeymap } from './keymap'
import { useIsTeam } from '../report/useIsTeam'

type Props = {
  myId: string
  onOpen: (view: PanelView) => void
  onLobby?: () => void // 지점에서만: 로비로 나가기
  onTracking?: () => void // 지점에서만: 트래킹 검증 화면으로 가는 버튼
}

export function SceneMenu({ myId, onOpen, onLobby, onTracking }: Props) {
  const keys = useKeymap()
  const team = useIsTeam(myId)
  return (
    <div style={menuStack}>
      <nav style={menuBox}>
        {PANEL_KEYS.filter((it) => it.action !== 'settings').map((it) => (
          <button
            key={it.action}
            type="button"
            style={menuRow}
            onClick={() => onOpen(it.action === 'profile' ? { kind: 'profile', userId: myId } : { kind: it.action })}
          >
            <span style={keyCap}>{keyLabel(keys[it.action])}</span>
            {it.label}
          </button>
        ))}
        {onLobby && (
          <>
            <div style={menuDivider} />
            {/* 버튼으로 나가도 보던 방향 그대로 로비의 그 지점 문 앞에 섭니다. (#150) */}
            <button type="button" style={menuRow} onClick={onLobby}>
              <span style={keyCap}>{keyLabel(keys.lobby)}</span>
              로비로
            </button>
          </>
        )}
      </nav>
      <div style={menuBox}>
        <button type="button" style={menuRowMinor} onClick={() => onOpen({ kind: 'settings' })}>
          <span style={keyCap}>{keyLabel(keys.settings)}</span>
          설정
        </button>
        {/* 오판·버그 신고 (#121). 단축키 없음 */}
        <button type="button" style={menuRowMinor} onClick={() => onOpen({ kind: 'report' })}>
          신고하기
        </button>
        {/* 팀에게만: 모인 신고를 보는 창. 팀인지는 team_members 에 내 행이 있는지로 정합니다. */}
        {team && (
          <button type="button" style={menuRowMinor} onClick={() => onOpen({ kind: 'reports' })}>
            신고 목록
          </button>
        )}
        {onTracking && (
          <button type="button" style={menuRowMinor} onClick={onTracking}>
            <span style={keyCap}>{keyLabel(keys.tracking)}</span>
            트래킹 검증
          </button>
        )}
        <LogoutButton style={menuRowMinor} />
      </div>
    </div>
  )
}
