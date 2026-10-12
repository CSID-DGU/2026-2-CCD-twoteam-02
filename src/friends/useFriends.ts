// 내 친구 관계를 읽고, 요청·수락·삭제·검색을 합니다.
// friendships 는 RLS 로 내가 들어간 줄만 보이고(0012), 닉네임은 avatars 뷰에서 읽습니다.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { parseQuery } from './friendsLogic'
import type { Friendship } from './friendsLogic'

export type UserCard = { id: string; nickname: string }

type FriendshipRow = { id: number; requester_id: string; addressee_id: string; status: 'pending' | 'accepted' }

const SEARCH_LIMIT = 20

// DB 오류를 한국어로
function toMessage(code: string | undefined, fallback: string) {
  if (code === '23505') return '이미 요청을 보냈거나 친구인 사람입니다.' // 두 사람 사이 한 줄 유니크
  if (code === '42P01' || code === 'PGRST205') return '친구 기능 DB가 아직 준비되지 않았어요. (0012 마이그레이션 실행 필요)'
  return fallback
}

export function useFriends(myId: string | undefined) {
  const [list, setList] = useState<Friendship[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map()) // 계정 번호 → 닉네임
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0) // 올리면 다시 읽습니다. (새로고침 버튼, 요청·수락·삭제 뒤)

  useEffect(() => {
    if (!myId) return
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('friendships')
        .select('id, requester_id, addressee_id, status')
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (error) {
        console.error('친구 목록을 불러오지 못했습니다:', error.message)
        setError(toMessage(error.code, '친구 목록을 불러오지 못했어요. 새로고침해 주세요.'))
        setLoading(false)
        return
      }
      const rows = ((data ?? []) as FriendshipRow[]).map((r) => ({
        id: r.id,
        requesterId: r.requester_id,
        addresseeId: r.addressee_id,
        status: r.status,
      }))
      // 상대 닉네임을 한 번에 읽습니다.
      const ids = [...new Set(rows.map((r) => (r.requesterId === myId ? r.addresseeId : r.requesterId)))]
      const map = new Map<string, string>()
      if (ids.length > 0) {
        const { data: people } = await supabase.from('avatars').select('id, nickname').in('id', ids)
        for (const p of (people ?? []) as UserCard[]) map.set(p.id, p.nickname)
      }
      if (cancelled) return
      setList(rows)
      setNames(map)
      setError('')
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [myId, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  // 닉네임으로 찾기. 태그는 화면에서 거릅니다(friendsLogic.matchUsers).
  const search = useCallback(async (query: string): Promise<UserCard[] | string> => {
    const { name } = parseQuery(query)
    if (name.length < 1) return '닉네임을 한 글자 이상 적어 주세요.'
    // % 와 _ 는 검색 특수 문자라 글자 그대로 찾도록 바꿉니다.
    const pattern = `%${name.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    const { data, error } = await supabase
      .from('avatars')
      .select('id, nickname')
      .ilike('nickname', pattern)
      .limit(SEARCH_LIMIT)
    if (error) return `찾지 못했어요: ${error.message}`
    return (data ?? []) as UserCard[]
  }, [])

  // 성공하면 '', 실패하면 안내문
  const request = useCallback(
    async (otherId: string) => {
      if (!myId) return '로그인이 필요합니다.'
      const { error } = await supabase.from('friendships').insert({ requester_id: myId, addressee_id: otherId })
      if (error) return toMessage(error.code, `요청하지 못했어요: ${error.message}`)
      reload()
      return ''
    },
    [myId, reload],
  )

  const accept = useCallback(
    async (friendshipId: number) => {
      const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId)
      if (error) return toMessage(error.code, `수락하지 못했어요: ${error.message}`)
      reload()
      return ''
    },
    [reload],
  )

  // 거절·요청 취소·친구 삭제 모두 같은 동작(줄 지우기)입니다.
  const remove = useCallback(
    async (friendshipId: number) => {
      const { error } = await supabase.from('friendships').delete().eq('id', friendshipId)
      if (error) return toMessage(error.code, `처리하지 못했어요: ${error.message}`)
      reload()
      return ''
    },
    [reload],
  )

  return { list, names, loading, error, reload, search, request, accept, remove }
}
