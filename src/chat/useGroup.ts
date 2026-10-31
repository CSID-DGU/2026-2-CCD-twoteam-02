// 내 채팅 그룹(파티)과 받은 그룹 초대를 읽고, 초대·수락·거절·나가기를 합니다 (#298).
// 한 사람은 그룹 하나에만 있습니다. 그룹·멤버·초대 표는 RLS 로 내 것만 보이고(0029), 쓰기는 DB 함수로만 합니다.
// 닉네임은 avatars 뷰에서 읽습니다. ChatProvider 가 한 번만 부르고, 친구 화면은 useChat() 으로 같은 값을 씁니다.
//
// 창을 닫으면(서비스를 나가면) 그룹에서도 빠집니다(0041). 열려 있는 동안 1분마다 그룹 접속 신호를 보내고,
// DB 가 3분 넘게 신호가 끊긴 멤버를 뺍니다. 새로고침·잠깐 끊김은 3분 안에 돌아오므로 그룹이 그대로입니다.
// 신호의 답(내 그룹 인원)이 지금 알고 있는 인원과 다르면(누가 빠졌거나 들어옴) 그룹을 다시 읽습니다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { HEARTBEAT_MS } from '../auth/useHeartbeat'
import { GROUP_INVITE_MS } from './chatLogic'
import type { Group } from './chatLogic'

// 받은 그룹 초대 (5분 안의 것만)
export type GroupInvite = { inviterId: string; nickname: string; at: number }

type MemberRow = { group_id: number; user_id: string }

// 그룹 접속 신호 (0041). 끊긴 멤버를 정리한 뒤 내 그룹 인원(나 포함, 없으면 0)을 돌려줍니다.
// 0041 을 아직 실행하지 않은 DB 면 null (그룹은 예전처럼 그대로 씀)
async function groupHeartbeat(): Promise<number | null> {
  const { data, error } = await supabase.rpc('chat_group_heartbeat')
  if (error) {
    console.warn('그룹 접속 신호를 보내지 못했습니다(0041 마이그레이션 확인):', error.message)
    return null
  }
  return typeof data === 'number' ? data : null
}
type InviteRow = { inviter_id: string; created_at: string }

// DB 오류를 한국어로. DB 함수가 낸 안내문(raise exception)은 그대로 보여 줍니다.
function toMessage(error: { code?: string; message: string }, fallback: string) {
  if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202') {
    return '그룹 기능 DB가 아직 준비되지 않았어요. (0029 마이그레이션 실행 필요)'
  }
  if (error.code?.startsWith('P0') || error.code === '42501') return error.message
  return `${fallback}: ${error.message}`
}

export function useGroup(myId: string | undefined) {
  const [group, setGroup] = useState<Group | null>(null)
  const [invites, setInvites] = useState<GroupInvite[]>([])
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0) // 올리면 다시 읽습니다.
  const knownSize = useRef(0) // 지금 알고 있는 내 그룹 인원 (나 포함, 없으면 0)

  useEffect(() => {
    if (!myId) return
    let cancelled = false
    async function load() {
      await groupHeartbeat() // 먼저 끊긴 멤버를 정리하고 읽음 (오래 쉬다 돌아왔으면 예전 그룹에서 빠진 뒤)
      if (cancelled) return
      const since = new Date(Date.now() - GROUP_INVITE_MS).toISOString()
      const [members, received] = await Promise.all([
        supabase.from('chat_group_members').select('group_id, user_id'), // RLS: 내 그룹의 멤버만
        supabase.from('chat_group_invites').select('inviter_id, created_at').eq('invitee_id', myId).gte('created_at', since),
      ])
      if (cancelled) return
      const failed = members.error ?? received.error
      if (failed) {
        console.error('그룹을 불러오지 못했습니다:', failed.message)
        setError(toMessage(failed, '그룹을 불러오지 못했어요'))
        return
      }
      const rows = (members.data ?? []) as MemberRow[]
      const inviteRows = (received.data ?? []) as InviteRow[]
      const ids = [...new Set([...rows.map((r) => r.user_id), ...inviteRows.map((r) => r.inviter_id)])].filter((id) => id !== myId)
      const names = new Map<string, string>()
      if (ids.length > 0) {
        const { data: people } = await supabase.from('avatars').select('id, nickname').in('id', ids)
        for (const p of (people ?? []) as { id: string; nickname: string }[]) names.set(p.id, p.nickname)
      }
      if (cancelled) return
      const mine = rows.find((r) => r.user_id === myId)
      knownSize.current = mine ? rows.length : 0
      setGroup(
        mine
          ? {
              id: mine.group_id,
              members: rows.filter((r) => r.user_id !== myId).map((r) => ({ id: r.user_id, nickname: names.get(r.user_id) ?? '멤버' })),
            }
          : null,
      )
      setInvites(
        inviteRows.map((r) => ({ inviterId: r.inviter_id, nickname: names.get(r.inviter_id) ?? '친구', at: Date.parse(r.created_at) })),
      )
      setError('')
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [myId, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  // 열려 있는 동안 1분마다 그룹 접속 신호. 인원이 달라졌으면 다시 읽습니다.
  useEffect(() => {
    if (!myId) return
    const timer = setInterval(() => {
      void groupHeartbeat().then((size) => {
        if (size !== null && size !== knownSize.current) reload()
      })
    }, HEARTBEAT_MS)
    return () => clearInterval(timer)
  }, [myId, reload])

  // 성공하면 '', 실패하면 안내문
  const invite = useCallback(async (friendId: string) => {
    const { error } = await supabase.rpc('invite_to_chat_group', { p_friend: friendId })
    return error ? toMessage(error, '초대하지 못했어요') : ''
  }, [])

  const accept = useCallback(
    async (inviterId: string) => {
      const { error } = await supabase.rpc('accept_chat_group_invite', { p_inviter: inviterId })
      reload() // 실패해도(만료) 초대 목록을 다시 읽어 지웁니다.
      return error ? toMessage(error, '그룹에 들어가지 못했어요') : ''
    },
    [reload],
  )

  const decline = useCallback(
    async (inviterId: string) => {
      const { error } = await supabase.rpc('decline_chat_group_invite', { p_inviter: inviterId })
      reload()
      return error ? toMessage(error, '거절하지 못했어요') : ''
    },
    [reload],
  )

  const leave = useCallback(async () => {
    const { error } = await supabase.rpc('leave_chat_group')
    if (error) return toMessage(error, '그룹에서 나가지 못했어요')
    reload()
    return ''
  }, [reload])

  // 로그아웃하면 비웁니다(다른 계정의 그룹이 남지 않게).
  return {
    group: myId ? group : null,
    invites: myId ? invites : [],
    error: myId ? error : '',
    reload,
    invite,
    accept,
    decline,
    leave,
  }
}
