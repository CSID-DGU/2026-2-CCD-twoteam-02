// 회의 채팅 (#298). 회의에 있는 사람끼리는 자동으로 한 방에서 이야기합니다(오버워치의 팀 채팅처럼).
//
// 회의 화면은 이미 회의 방(meeting:회의번호, 참석자만 들어오는 비공개 방, 0021)에 들어가 있으므로
// 채팅도 그 방으로 주고받습니다. 음성 연결 신호(useSignalPort)와 같은 방식입니다.
//   useChatPort()  → 통로를 하나 만들어 useParticipants 에 넘김 (useParticipants 가 send 를 채우고, 받은 말은 채팅으로 감)
//   useMeetingChat → 채팅(ChatProvider)에 "지금 이 회의에 있고, 참석자는 누구"라고 알림
// 회의 화면을 떠나면 채팅창 Tab 목록에서 [회의]가 사라집니다.
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { ChatPort } from '../realtime/participants'
import { useChat } from './chatContext'

// 회의 방 채팅 통로를 만들고, 받은 말을 채팅으로 넘깁니다.
export function useChatPort() {
  const port = useRef<ChatPort>({ receive: () => {}, send: null })
  const receiveMeeting = useChat()?.receiveMeeting
  useEffect(() => {
    const p = port.current
    if (!receiveMeeting) return
    p.receive = receiveMeeting
    return () => {
      p.receive = () => {}
    }
  }, [receiveMeeting])
  return port
}

// 채팅에 "지금 이 회의에 있고, 참석자는 누구"라고 알립니다. others: 지금 회의 방에 있는 다른 참석자
export function useMeetingChat(meetingId: number, others: { userId: string; nickname: string }[], port: RefObject<ChatPort>) {
  const setMeeting = useChat()?.setMeeting

  // 참석자가 바뀔 때마다 알립니다. (닉네임에 쉼표가 있어도 되도록 JSON 으로 묶어 비교)
  const membersKey = JSON.stringify(others.map((o) => [o.userId, o.nickname]).sort())
  useEffect(() => {
    if (!setMeeting) return
    const members = (JSON.parse(membersKey) as [string, string][]).map(([id, nickname]) => ({ id, nickname }))
    setMeeting({ id: meetingId, members, send: async (text) => (port.current.send ? port.current.send(text) : false) })
  }, [meetingId, membersKey, port, setMeeting])

  // 회의 화면을 떠나면 [회의]를 없앱니다.
  useEffect(() => () => setMeeting?.(null), [setMeeting])
}
