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
import { useIsTouch } from '../space/useIsTouch'
import { useState } from 'react'
import { useIsGuest } from '../auth/useIsGuest'
import { GUEST_KEEP_DAYS } from '../auth/guestNotice'
import type { CSSProperties, ReactNode } from 'react'

const guestNote: CSSProperties = { display: 'block', padding: '4px 8px', color: '#cbd5e1', fontSize: 12, lineHeight: 1.5 }

// 컴퓨터에서 메뉴를 접어 뒀는지. 계정이 아니라 이 브라우저에 기억합니다(미니맵 설정과 같은 방식).
const FOLD_KEY = 'dooteum.menuFolded'

function loadFolded(): boolean {
  try {
    return localStorage.getItem(FOLD_KEY) === 'on'
  } catch {
    return false // 저장소를 못 쓰는 브라우저(사생활 보호 모드 등)면 펼친 채로 시작
  }
}

function saveFolded(on: boolean) {
  try {
    localStorage.setItem(FOLD_KEY, on ? 'on' : 'off')
  } catch {
    // 기억하지 못해도 이번 접속에서는 접힌 상태를 씁니다.
  }
}

type Props = {
  myId: string
  onOpen: (view: PanelView) => void
  onLobby?: () => void // 지점에서만: 바깥(광장·캠퍼스)으로 나가기
  lobbyLabel?: string // 나가기 버튼 글자 (없으면 "캠리단길로"). 캠빛 대학교 건물이면 "캠빛 대학교로"
  onTracking?: () => void // 지점에서만: 트래킹 검증 화면으로 가는 버튼
  onSkyTime?: () => void // 광장·캠퍼스에서만: 팀 전용 하늘 조절판(시간·날씨) 열기·닫기
  onQuickSeat?: () => void // 바깥 공간에서만: 바로 앉기 (최애 공간 빈자리에 앉아 공부 시작, #116)
  top?: ReactNode // 메뉴 맨 위에 둘 것 (FPS 표시). 있으면 메뉴가 그 아래로 내려감
}

export function SceneMenu({ myId, onOpen: openPanel, onLobby, onTracking, onSkyTime, onQuickSeat, lobbyLabel = '캠리단길로', top }: Props) {
  const keys = useKeymap()
  const team = useIsTeam(myId)
  // 폰(#377): 작은 화면을 가리지 않게 [☰] 하나로 접어 두고, 누르면 펼침. 고르면 다시 접힘
  const touch = useIsTouch()
  const guest = useIsGuest()
  const [unfolded, setUnfolded] = useState(false)
  // 컴퓨터: 메뉴가 화면을 가려 거슬리면 직접 접어 둠. 접은 채로 두면 다시 들어와도 접혀 있음(이 브라우저에 기억).
  // 접어도 단축키(G·R·F·P·O 등)는 그대로 됩니다.
  const [folded, setFoldedState] = useState(loadFolded)
  const setFolded = (on: boolean) => {
    setFoldedState(on)
    saveFolded(on)
  }
  const onOpen = (view: PanelView) => {
    setUnfolded(false)
    openPanel(view)
  }
  if (touch && !unfolded) {
    return (
      <div style={menuStack}>
        <button type="button" style={{ ...menuRow, justifyContent: 'center' }} onClick={() => setUnfolded(true)} aria-label="메뉴 펼치기">
          ☰ 메뉴
        </button>
      </div>
    )
  }
  if (!touch && folded) {
    return (
      <div style={menuStack}>
        {top /* FPS 표시는 접어도 보임(켠 사람만) */}
        <div style={menuBox}>
          <button type="button" style={{ ...menuRow, justifyContent: 'center' }} onClick={() => setFolded(false)} aria-label="메뉴 펼치기">
            ☰ 메뉴
          </button>
        </div>
      </div>
    )
  }
  return (
    <div style={menuStack}>
      {top /* 맨 위 칸: FPS 표시(설정에서 켰을 때) */}
      {touch && (
        <button type="button" style={{ ...menuRow, justifyContent: 'center' }} onClick={() => setUnfolded(false)} aria-label="메뉴 접기">
          ✕ 접기
        </button>
      )}
      {!touch && (
        <div style={menuBox}>
          <button type="button" style={{ ...menuRowMinor, justifyContent: 'center' }} onClick={() => setFolded(true)} aria-label="메뉴 접기">
            ▲ 메뉴 접기
          </button>
        </div>
      )}
      {/* 게스트 (#375): 가입하면 친구·채팅·회의·순위를 쓰고 기록이 이어짐. 가입은 설정 → 내 정보 */}
      {guest && (
        <div style={menuBox}>
          <span style={guestNote}>게스트로 둘러보는 중 · {GUEST_KEEP_DAYS}일 동안 접속하지 않으면 기록이 지워져요</span>
          <button type="button" style={menuRow} onClick={() => onOpen({ kind: 'settings' })}>
            가입하기 (기록 이어짐)
          </button>
        </div>
      )}
      <nav style={menuBox}>
        {/* 바로 앉기 (#116): 최애 공간의 빈자리에 앉아 바로 공부 시작. 단축키 없음 */}
        {onQuickSeat && (
          <button
            type="button"
            style={menuRow}
            onClick={() => {
              setUnfolded(false)
              onQuickSeat()
            }}
          >
            🪑 바로 앉기
          </button>
        )}
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
            {/* 버튼으로 나가도 보던 방향 그대로 바깥(광장·캠퍼스)의 그 건물 입구 앞에 섭니다. (#150, #315) */}
            <button type="button" style={menuRow} onClick={onLobby}>
              <span style={keyCap}>{keyLabel(keys.lobby)}</span>
              {lobbyLabel}
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
        {/* 팀에게만: 하늘 시각·빠르기·날씨 조절 (노을·밤·비·눈 확인용, 내 화면만 바뀜) */}
        {team && onSkyTime && (
          <button type="button" style={menuRowMinor} onClick={onSkyTime}>
            하늘 조절
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
