// 회의 화면에 필요한 것: 회의 정보, 지금 참석자(닉네임·캐릭터), 접속 신호 (#45)
//
// 참석자 목록의 원본은 DB(meeting_members)입니다. 들어오고 나가는 순간은 회의 실시간 방(meeting:회의번호)의
// Presence 로 알아채고, 그때 DB 를 다시 읽습니다. 이 방은 비공개 방이라 그 회의 참석자만 들어올 수 있습니다(0021 4절).
// Presence: 방에 누가 접속해 있는지 서버가 알려 주는 기능. 탭을 닫으면 서버가 자동으로 지웁니다.
//
// 창을 그냥 닫으면 DB 에는 5분 동안 남아 있지만(접속 신호가 끊기면 pg_cron 이 내보냄),
// Presence 에서는 바로 빠지므로 화면에서는 바로 사라집니다.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { MeetingMember } from './meetingLogic'

const HEARTBEAT_MS = 60_000 // 접속 신호 주기. 5분 넘게 없으면 DB 가 회의에서 내보냅니다(0021).
const REFRESH_MS = 30_000 // Presence 를 놓쳤을 때를 대비해 참석자 목록을 다시 읽는 주기

export type MeetingPerson = MeetingMember & { nickname: string; model: string }
export type MeetingInfo = { title: string; isPrivate: boolean }
export type MeetingState =
  | { status: 'loading' }
  | { status: 'notMember' } // 회의가 끝났거나, 들어 있지 않은 회의 (주소로 바로 들어온 경우 등)
  | { status: 'error'; message: string }
  | { status: 'ready'; info: MeetingInfo; people: MeetingPerson[] }

type MemberRow = { user_id: string; seat_no: number }
type AvatarRow = { id: string; nickname: string; avatar: { model?: string } | null }

export function useMeeting(meetingId: number, myId: string): MeetingState {
  const [state, setState] = useState<MeetingState>({ status: 'loading' })

  useEffect(() => {
    let alive = true
    let present: Set<string> | null = null // Presence 로 받은 접속자. 처음 받기 전에는 DB 목록을 그대로 씁니다.
    let latest: { info: MeetingInfo; people: MeetingPerson[] } | null = null

    // 화면에 보일 참석자: DB 에 있고 방에 접속해 있는 사람 (나는 늘 포함)
    const publish = () => {
      if (!alive || !latest) return
      const people = present ? latest.people.filter((p) => p.userId === myId || present?.has(p.userId)) : latest.people
      setState({ status: 'ready', info: latest.info, people })
    }

    const load = async () => {
      const [meeting, members] = await Promise.all([
        supabase.from('meetings').select('title, is_private, ended_at').eq('id', meetingId).maybeSingle(),
        supabase.from('meeting_members').select('user_id, seat_no').eq('meeting_id', meetingId).is('left_at', null),
      ])
      if (!alive) return
      const error = meeting.error ?? members.error
      if (error) {
        setState({ status: 'error', message: error.message })
        return
      }
      const rows = (members.data ?? []) as MemberRow[]
      if (!meeting.data || meeting.data.ended_at || !rows.some((r) => r.user_id === myId)) {
        setState({ status: 'notMember' })
        return
      }
      const avatars = await supabase.from('avatars').select('id, nickname, avatar').in('id', rows.map((r) => r.user_id))
      if (!alive) return
      if (avatars.error) console.error('참석자 정보를 불러오지 못했습니다:', avatars.error.message)
      const byId = new Map(((avatars.data ?? []) as AvatarRow[]).map((a) => [a.id, a]))
      latest = {
        info: { title: meeting.data.title, isPrivate: meeting.data.is_private },
        people: rows.map((r) => ({
          userId: r.user_id,
          seatNo: r.seat_no,
          nickname: byId.get(r.user_id)?.nickname ?? '…',
          model: byId.get(r.user_id)?.avatar?.model ?? 'a',
        })),
      }
      publish()
    }

    void load()

    const channel = supabase.channel(`meeting:${meetingId}`, { config: { private: true, presence: { key: myId } } })
    channel
      .on('presence', { event: 'sync' }, () => {
        present = new Set(Object.keys(channel.presenceState()))
        // 처음 보는 사람이 있으면 DB 를 다시 읽고(새 참석자), 아니면 목록만 다시 거릅니다(나간 사람).
        if (latest && [...present].some((id) => !latest?.people.some((p) => p.userId === id))) void load()
        else publish()
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel.track({ userId: myId })
      })

    const beat = () => void supabase.rpc('meeting_heartbeat')
    beat()
    const heartbeat = setInterval(beat, HEARTBEAT_MS)
    const refresh = setInterval(() => void load(), REFRESH_MS)

    return () => {
      alive = false
      clearInterval(heartbeat)
      clearInterval(refresh)
      void supabase.removeChannel(channel)
    }
  }, [meetingId, myId])

  return state
}
