// 해변 모래 글씨의 상태와 실시간 전송 (화면은 SandWriting). DB 없이 Supabase 실시간 전송만 씁니다(축구공과 같은 방식).
// 늦게 온 사람은 need 를 보내고, 이미 있던 사람이 조금씩 다른 시간 뒤에 남은 판을 다시 보내 줍니다.
// 중계 서버를 쓰면(#473) 따로 방을 열지 않고 해변 위치 방(playPort)으로 주고받습니다. need 는 서버가 가장 오래 있던 한 사람에게만
// 넘기고, 그 사람은 물어본 사람에게만 판을 하나씩 바로 보냅니다(sand-mark).
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { supabase } from '../lib/supabase'
import type { PlayListener, PlayPort } from '../realtime/participants'
import { LIMIT, addOp, boardAt, pruneMarks, readMsg } from './sandLogic'
import type { SandMark, SandMsg, SandOp } from './sandLogic'

const CHANNEL = 'beach-sand'
// 채널마다 해변이 따로다 (#481). 1채널은 예전 방 이름 그대로, 2번부터 뒤에 :번호
const sandRoom = (channelNo: number) => (channelNo > 1 ? `${CHANNEL}:${channelNo}` : CHANNEL)
const SYNC = { min: 150, range: 1000, marks: 12 } // need 에 답하기까지 기다리는 시간(ms), 다시 보내는 판 수
const REPLY_MAX_CHARS = 60000 // 중계 서버로 보내는 판 하나의 크기 상한 (서버는 64KB, relay/src/playLogic.ts). 넘으면 뒤 획을 덜어 냄

export type SandBoard = { id: string; x: number; z: number; rot: number }
const newId = () => Math.random().toString(36).slice(2, 12)

// 모래 글씨 상태와 실시간 전송. 해변이 아니면(enabled false) 아무 일도 하지 않음. playPort: 중계 서버 위치 방 통로 (#473), 없으면 Supabase 방
export function useSandMarks(enabled: boolean, channelNo = 1, playPort?: RefObject<PlayPort>) {
  const [marks, setMarks] = useState<SandMark[]>([])
  const marksRef = useRef(marks)
  useEffect(() => {
    marksRef.current = marks
  }, [marks])
  const [me] = useState(newId)
  const channel = useRef<((msg: SandMsg) => void) | null>(null) // 획·글자 하나 보내기

  useEffect(() => {
    if (!enabled) return
    let reply: number | undefined
    const take = (payload: unknown) => {
      const m = readMsg(payload)
      if (m) setMarks((list) => addOp(list, m, Date.now()))
    }
    const takeMark = (payload: unknown) => {
      const ops = (payload as { ops?: unknown } | null)?.ops
      if (!Array.isArray(ops)) return
      for (const op of ops.slice(0, LIMIT.ops)) {
        const m = readMsg({ ...(payload as object), op })
        if (m) setMarks((list) => (list.some((k) => k.id === m.id && k.ops.length >= ops.length) ? list : addOp(list, m, Date.now())))
      }
    }
    // 남은 판 (need 에 답할 때)
    const recentMarks = () => {
      const now = Date.now()
      return marksRef.current.slice(-SYNC.marks).map((k) => ({ id: k.id, by: k.by, x: k.x, z: k.z, rot: k.rot, age: now - k.at, ops: k.ops }))
    }

    // 중계 서버: 위치 방으로. need 는 서버가 이미 한 사람만 골랐으므로 기다리지 않고 물어본 사람에게만 답합니다
    const port = playPort?.current
    if (port) {
      const ask = () => port.send?.('sand-need', {})
      const listener: PlayListener = {
        receive: (m) => {
          if (m.e === 'sand-op') take(m.p)
          else if (m.e === 'sand-mark') takeMark(m.p)
          else if (m.e === 'sand-need' && m.r) {
            for (const mark of recentMarks()) {
              const fit = { ...mark, ops: [...mark.ops] }
              while (fit.ops.length > 1 && JSON.stringify(fit).length > REPLY_MAX_CHARS) fit.ops.pop()
              port.send?.('sand-mark', fit, m.r)
            }
          }
        },
        ready: ask,
      }
      port.listeners.add(listener)
      channel.current = (msg) => port.send?.('sand-op', msg)
      ask()
      return () => {
        port.listeners.delete(listener)
        channel.current = null
        setMarks([]) // 채널을 옮기면 이전 채널 글씨는 지우고 새 채널에 다시 물어봄
      }
    }

    const ch = supabase.channel(sandRoom(channelNo), { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'op' }, ({ payload }) => take(payload))
      .on('broadcast', { event: 'mark' }, ({ payload }) => {
        window.clearTimeout(reply) // 다른 사람이 먼저 답함
        takeMark(payload)
      })
      .on('broadcast', { event: 'need' }, () => {
        window.clearTimeout(reply)
        reply = window.setTimeout(() => {
          for (const mark of recentMarks()) void ch.send({ type: 'broadcast', event: 'mark', payload: mark })
        }, SYNC.min + Math.random() * SYNC.range)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void ch.send({ type: 'broadcast', event: 'need', payload: {} })
      })
    channel.current = (msg) => void ch.send({ type: 'broadcast', event: 'op', payload: msg })
    return () => {
      window.clearTimeout(reply)
      channel.current = null
      void supabase.removeChannel(ch)
      setMarks([]) // 채널을 옮기면 이전 채널 글씨는 지우고 새 채널에 다시 물어봄
    }
  }, [enabled, channelNo, playPort])

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
      channel.current?.(msg)
    },
    [me],
  )
  return { marks, write }
}

export const startBoard = (me: { x: number; z: number }, heading: number): SandBoard => ({ id: newId(), ...boardAt(me, heading) })
