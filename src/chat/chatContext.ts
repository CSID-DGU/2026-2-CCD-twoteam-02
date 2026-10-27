// 귓속말·그룹 채팅 상태를 화면들에 나눠 주는 통로 (#49, #298). 실제 연결은 ChatProvider 가 합니다.
// 로그는 앱 맨 위에 두어 로비 ↔ 지점을 오가도 유지되고, 새로고침·로그아웃하면 사라집니다.
import { createContext, useContext } from 'react'
import type { Friend, Group, MeetingRoom, Recipient } from './chatLogic'
import type { GroupInvite } from './useGroup'

export type ChatLine = {
  id: number
  at: number // 받은·보낸 시각 (ms)
  // 받은 말 / 보낸 말 / 안내 / 받은 회의 초대 (#45) / 받은 그룹 초대 (#298)
  kind: 'in' | 'out' | 'system' | 'invite' | 'groupInvite'
  peer?: Friend // 귓속말·초대는 상대, 받은 그룹·회의 채팅은 말한 사람 (보낸 그룹·회의 채팅은 없음)
  room?: { kind: 'group' | 'meeting'; key: string } // 그룹·회의 채팅 줄이면 그 방 (#298). key 로 색을 정함
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
  recipients: Recipient[] // 채팅창에서 Tab 으로 고를 수 있는 받는 사람 (접속한 친구, 내 그룹, 지금 있는 회의)
  colors: Record<string, string> // 이번 접속에서 받는 사람(key)마다 정한 글자 색 (처음 이야기할 때 정함)
  refreshFriends: () => void // 친구·그룹 목록을 다시 읽습니다 (로그창을 열 때)
  target: string | null // 지금 고른 받는 사람 key (친구 계정 번호, group:번호, meeting:번호)
  setTarget: (key: string | null) => void
  lastFrom: string | null // 마지막으로 나에게 말을 건 곳 key (채팅창을 열 때 먼저 골라 둠)
  send: (to: string, text: string) => Promise<string> // 성공하면 '', 실패하면 안내문
  // 그룹(파티, #298). 한 사람은 그룹 하나에만. 친구 화면·프로필 창·채팅창이 씁니다. 성공하면 '', 실패하면 안내문
  group: Group | null
  groupInvites: GroupInvite[] // 받은 그룹 초대 (5분 안)
  groupError: string
  inviteToGroup: (friendId: string) => Promise<string>
  acceptGroupInvite: (inviterId: string) => Promise<string> // 지금 그룹이 있으면 나와서 옮겨 감
  declineGroupInvite: (inviterId: string) => Promise<string>
  leaveGroup: () => Promise<string>
  // 회의 채팅 (#298). 회의 화면이 들어올 때 알리고(나가면 null), 받은 말을 넘깁니다(src/chat/useMeetingChat.ts).
  setMeeting: (meeting: (MeetingRoom & { send: (text: string) => Promise<boolean> }) | null) => void
  receiveMeeting: (from: string, payload: unknown) => void
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
