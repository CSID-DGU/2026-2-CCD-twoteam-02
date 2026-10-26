// 귓속말 상태를 화면들에 나눠 주는 통로 (#49). 실제 연결은 ChatProvider 가 합니다.
// 로그는 앱 맨 위에 두어 로비 ↔ 지점을 오가도 유지되고, 새로고침·로그아웃하면 사라집니다.
import { createContext, useContext } from 'react'
import type { Friend } from './chatLogic'

export type ChatLine = {
  id: number
  at: number // 받은·보낸 시각 (ms)
  kind: 'in' | 'out' | 'system' | 'invite' // 받은 귓속말 / 보낸 귓속말 / 안내 / 받은 회의 초대 (#45)
  peer?: Friend // 상대 (in·out·invite)
  text: string
  meeting?: MeetingInvite // 회의 초대일 때 (invite)
  quiet?: boolean // 방해금지 중에 받아 소리·알림 없이 쌓인 것
}

// 받은 회의 초대. 회의 이름·지점은 받은 쪽이 DB 에서 읽은 값입니다(보낸 사람이 적어 보낸 값이 아님).
export type MeetingInvite = { id: number; title: string; branchSlug: string }

export type ChatValue = {
  enabled: boolean // 로그인했을 때만
  lines: ChatLine[]
  unread: number // 로그창을 닫아 둔 동안 받은 귓속말 수
  markRead: () => void
  online: Friend[] // 지금 접속 중인 친구 (귓속말 받을 수 있는 사람)
  colors: Record<string, string> // 이번 접속에서 친구마다 정한 글자 색 (처음 이야기할 때 정함)
  refreshFriends: () => void // 친구 목록을 다시 읽습니다 (로그창을 열 때)
  target: string | null // 지금 고른 친구
  setTarget: (id: string | null) => void
  lastFrom: string | null // 마지막으로 나에게 귓속말한 친구 (채팅창을 열 때 먼저 골라 둠)
  send: (to: string, text: string) => Promise<string> // 성공하면 '', 실패하면 안내문
  sendInvite: (to: string, meetingId: number) => Promise<boolean> // 회의 초대 알림 (#45). 친구가 접속해 있지 않으면 false
  note: (text: string) => void // 로그에 안내 한 줄
  quiet: boolean // 방해금지인지 (공부를 시작하면 자동으로 켜짐, 언제든 직접 끄고 켬, #216)
  studying: boolean
  setQuiet: (on: boolean) => void // 방해금지 켜고 끄기. 공부 중에 끈 것은 그 공부 동안만
  muted: boolean // 소리 끔
  setMuted: (on: boolean) => void
  // 프로필 창의 "귓속말" 버튼: 그 친구를 받는 사람으로 고르고 채팅창을 엽니다. (프로필 창은 openKey 가 바뀌면 닫힘)
  startWhisper: (friendId: string) => void
  openKey: number // startWhisper 를 부를 때마다 올라감
  hasOverlay: boolean // 지금 화면에 채팅창이 있는지 (로비·지점만). 없으면 귓속말 버튼을 숨김
  setHasOverlay: (on: boolean) => void
}

export const ChatContext = createContext<ChatValue | null>(null)

export function useChat() {
  return useContext(ChatContext)
}
