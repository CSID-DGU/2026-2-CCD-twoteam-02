// 로비·지점 위에 띄우는 창: 내 기록, 친구, 프로필, 설정. (#70, #222)
//
// 다른 주소로 페이지를 옮기면 로비·지점 화면이 사라지면서 서 있던 위치, 앉은 자리, 공부 타이머,
// 실시간 연결이 다 끊깁니다. 그래서 창으로 띄우고, 닫으면 원래 있던 그대로 돌아옵니다.
// 창 안에서 친구 이름을 누르면 같은 창이 그 사람 프로필로 바뀌고, "뒤로"로 돌아갑니다.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { RecordsView } from '../study/RecordsPage'
import { FriendsView } from '../friends/FriendsPage'
import { ProfileView } from '../profile/ProfileView'
import type { PanelView } from './panelTypes'
import { SettingsView } from './SettingsView'
import { useChat } from '../chat/chatContext'
import type { InviteTarget } from '../meeting/InviteButton'
import { WorldMap } from '../map/WorldMap'
import type { MapHere } from '../map/WorldMap'

const TITLE: Record<PanelView['kind'], string> = { records: '내 기록', friends: '친구', profile: '프로필', settings: '설정', map: '전체 지도' }

// invite: 회의 중에 연 창이면 그 회의(번호·지금 있는 사람). 친구 창에 "회의에 초대" 버튼이 보입니다. (#45)
// here: 지금 내가 있는 곳과 위치. 전체 지도에 내 화살표를 그립니다. (#300)
type Props = { initial: PanelView; myId: string; onClose: () => void; invite?: InviteTarget; here?: MapHere }
export function InfoPanel({ initial, myId, onClose, invite, here }: Props) {
  const [stack, setStack] = useState<PanelView[]>([initial]) // 창 안에서 옮겨 다닌 순서 (뒤로 가기용)
  const view = stack[stack.length - 1]
  const open = (next: PanelView) => setStack((s) => [...s, next])
  const back = () => setStack((s) => s.slice(0, -1))

  // 프로필에서 "귓속말"을 누르면 채팅창이 열리도록 이 창은 닫습니다. (#49)
  const openKey = useChat()?.openKey ?? 0
  const [firstOpenKey] = useState(openKey)
  useEffect(() => {
    if (openKey !== firstOpenKey) onClose()
  }, [openKey, firstOpenKey, onClose])

  // Esc 로도 닫습니다.
  useEffect(() => {
    const down = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [onClose])

  const title = view.kind === 'profile' && view.userId === myId ? '내 프로필' : TITLE[view.kind]
  return (
    <div style={styles.backdrop} onClick={onClose}>
      {/* 창 안을 눌러도 닫히지 않게 합니다. */}
      <div style={view.kind === 'map' ? { ...styles.panel, ...styles.wide } : styles.panel} onClick={(e) => e.stopPropagation()}>
        <header style={styles.header}>
          {stack.length > 1 && (
            <button type="button" style={styles.ghost} onClick={back}>
              ← 뒤로
            </button>
          )}
          <h2 style={styles.title}>{title}</h2>
          <button type="button" style={styles.close} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>
        {view.kind === 'records' && <RecordsView />}
        {view.kind === 'friends' && (
          <FriendsView onOpenProfile={(userId) => open({ kind: 'profile', userId })} invite={invite} />
        )}
        {view.kind === 'settings' && <SettingsView />}
        {view.kind === 'map' && <WorldMap here={here} />}
        {view.kind === 'profile' && (
          <div style={styles.card}>
            <ProfileView key={view.userId} userId={view.userId} isMe={view.userId === myId} />
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, zIndex: 20, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.45)' },
  panel: {
    width: 'min(640px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
    // 배경은 페이지 배경과 같게 해서 안의 카드(#20232a)가 구분되게 합니다.
    padding: 20, borderRadius: 12, background: '#16181d', color: '#fff', font: '14px/1.6 system-ui, sans-serif',
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  wide: { width: 'min(1100px, calc(100vw - 32px))' }, // 전체 지도는 넓게
  header: { display: 'flex', alignItems: 'center', gap: 8 },
  card: { padding: 16, borderRadius: 12, background: '#20232a' },
  title: { margin: 0, fontSize: 18, flex: 1, color: '#fff' }, // 전역 h2 색(index.css)이 라이트 모드에서 검정이라 직접 지정
  ghost: {
    padding: '4px 10px', borderRadius: 6, border: '1px solid #4b5563', background: 'transparent',
    color: '#fff', cursor: 'pointer', font: 'inherit',
  },
  close: {
    width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent', color: '#aab0bb',
    cursor: 'pointer', fontSize: 16,
  },
}
