// 해변 모래 글씨의 상태와 실시간 전송 (화면은 SandWriting). DB 없이 Supabase 실시간 전송만 씁니다(축구공과 같은 방식).
// 늦게 온 사람은 need 를 보내고, 이미 있던 사람이 조금씩 다른 시간 뒤에 남은 판을 다시 보내 줍니다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { LIMIT, addOp, boardAt, pruneMarks, readMsg } from './sandLogic'
import type { SandMark, SandMsg, SandOp } from './sandLogic'

const CHANNEL = 'beach-sand'
const SYNC = { min: 150, range: 1000, marks: 12 } // need 에 답하기까지 기다리는 시간(ms), 다시 보내는 판 수

export type SandBoard = { id: string; x: number; z: number; rot: number }
const newId = () => Math.random().toString(36).slice(2, 12)

// 모래 글씨 상태와 실시간 전송. 해변이 아니면(enabled false) 아무 일도 하지 않음
export function useSandMarks(enabled: boolean) {
  const [marks, setMarks] = useState<SandMark[]>([])
  const marksRef = useRef(marks)
  useEffect(() => {
    marksRef.current = marks
  }, [marks])
  const [me] = useState(newId)
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    if (!enabled) return
    let reply: number | undefined
    const ch = supabase.channel(CHANNEL, { config: { broadcast: { self: false } } })
    const take = (payload: unknown) => {
      const m = readMsg(payload)
      if (m) setMarks((list) => addOp(list, m, Date.now()))
    }
    ch.on('broadcast', { event: 'op' }, ({ payload }) => take(payload))
      .on('broadcast', { event: 'mark' }, ({ payload }) => {
        window.clearTimeout(reply) // 다른 사람이 먼저 답함
        const ops = (payload as { ops?: unknown } | null)?.ops
        if (!Array.isArray(ops)) return
        for (const op of ops.slice(0, LIMIT.ops)) {
          const m = readMsg({ ...(payload as object), op })
          if (m) setMarks((list) => (list.some((k) => k.id === m.id && k.ops.length >= ops.length) ? list : addOp(list, m, Date.now())))
        }
      })
      .on('broadcast', { event: 'need' }, () => {
        window.clearTimeout(reply)
        reply = window.setTimeout(() => {
          const now = Date.now()
          for (const k of marksRef.current.slice(-SYNC.marks)) {
            void ch.send({ type: 'broadcast', event: 'mark', payload: { id: k.id, by: k.by, x: k.x, z: k.z, rot: k.rot, age: now - k.at, ops: k.ops } })
          }
        }, SYNC.min + Math.random() * SYNC.range)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void ch.send({ type: 'broadcast', event: 'need', payload: {} })
      })
    channel.current = ch
    return () => {
      window.clearTimeout(reply)
      channel.current = null
      void supabase.removeChannel(ch)
    }
  }, [enabled])

  // 1분 지난 판 지우기
  useEffect(() => {
    if (!enabled) return
    const t = window.setInterval(() => setMarks((list) => (list.length && pruneMarks(list, Date.now()).length !== list.length ? pruneMarks(list, Date.now()) : list)), 1000)
    return () => window.clearInterval(t)
  }, [enabled])

  // 내가 쓴 획·글자: 내 화면에 더하고 모두에게 보냄
  const write = useCallback(
    (b: SandBoard, op: SandOp) => {
      const msg: SandMsg = { id: b.id, by: me, x: b.x, z: b.z, rot: b.rot, age: 0, op }
      setMarks((list) => addOp(list, msg, Date.now()))
      void channel.current?.send({ type: 'broadcast', event: 'op', payload: msg })
    },
    [me],
  )
  return { marks, write }
}

export const startBoard = (me: { x: number; z: number }, heading: number): SandBoard => ({ id: newId(), ...boardAt(me, heading) })
