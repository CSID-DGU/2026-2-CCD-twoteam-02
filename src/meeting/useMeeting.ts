// 회의 화면에 필요한 것: 회의 정보(이름·공개 범위·인원), 참석자 목록(닉네임), 접속 신호 (#45)
//
// 참석자 목록의 원본은 DB(meeting_members)입니다. 누가 지금 방에 있는지는 회의 실시간 방(meeting:회의번호)에서
// 받는 참석자들(useParticipants)로 알고, 그 목록이 바뀌면(presentKey) DB 를 다시 읽습니다.
// 누가 어느 의자에 앉아 있는지는 실시간 방으로 받습니다(지점과 같음). DB 의 자리 번호는 같은 의자에 두 사람이 앉지 않게 막는 데만 씁니다.
//
// 창을 그냥 닫으면 DB 에는 5분 동안 남아 있지만(접속 신호가 끊기면 pg_cron 이 내보냄),
// 실시간 방에서는 바로 빠지므로 화면에서는 바로 사라집니다(MeetingScene 이 방에 있는 사람만 그림).
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const HEARTBEAT_MS = 60_000 // 접속 신호 주기. 5분 넘게 없으면 DB 가 회의에서 내보냅니다(0021).
const REFRESH_MS = 30_000 // 실시간 방 소식을 놓쳤을 때를 대비해 참석자 목록을 다시 읽는 주기

export type MeetingPerson = { userId: string; nickname: string }
export type MeetingInfo = { title: string; isPrivate: boolean; capacity: number }
export type MeetingState =
  | { status: 'loading' }
  | { status: 'notMember' } // 회의가 끝났거나, 들어 있지 않은 회의 (주소로 바로 들어온 경우 등)
  | { status: 'error'; message: string }
  | { status: 'ready'; info: MeetingInfo; people: MeetingPerson[] }

type MemberRow = { user_id: string }
type AvatarRow = { id: string; nickname: string }

// presentKey: 실시간 방에 있는 사람들의 계정 번호를 이어 붙인 값. 바뀌면 DB 를 다시 읽습니다.
export function useMeeting(meetingId: number, myId: string, presentKey: string): MeetingState {
  const [state, setState] = useState<MeetingState>({ status: 'loading' })
  const [tick, setTick] = useState(0) // REFRESH_MS 마다 올라가 다시 읽게 합니다.

  // 접속 신호와 주기적으로 다시 읽기
  useEffect(() => {
    const beat = () => void supabase.rpc('meeting_heartbeat')
    beat()
    const heartbeat = setInterval(beat, HEARTBEAT_MS)
    const refresh = setInterval(() => setTick((t) => t + 1), REFRESH_MS)
    return () => {
      clearInterval(heartbeat)
      clearInterval(refresh)
    }
  }, [meetingId])

  useEffect(() => {
    let alive = true
    const load = async () => {
      const [meeting, members] = await Promise.all([
        supabase.from('meetings').select('title, is_private, capacity, ended_at').eq('id', meetingId).maybeSingle(),
        supabase.from('meeting_members').select('user_id').eq('meeting_id', meetingId).is('left_at', null),
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
      const avatars = await supabase.from('avatars').select('id, nickname').in('id', rows.map((r) => r.user_id))
      if (!alive) return
      if (avatars.error) console.error('참석자 정보를 불러오지 못했습니다:', avatars.error.message)
      const byId = new Map(((avatars.data ?? []) as AvatarRow[]).map((a) => [a.id, a]))
      setState({
        status: 'ready',
        info: { title: meeting.data.title, isPrivate: meeting.data.is_private, capacity: meeting.data.capacity },
        people: rows.map((r) => ({ userId: r.user_id, nickname: byId.get(r.user_id)?.nickname ?? '…' })),
      })
    }
    void load()
    return () => {
      alive = false
    }
  }, [meetingId, myId, presentKey, tick])

  return state
}
