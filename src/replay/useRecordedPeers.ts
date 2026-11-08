// C 조건의 팀원 캐릭터를 기록 파일로 재생합니다 (#195).
//
// 사이트에 올려 둔 기록(public/experiment/, peersManifest.ts)을 참가자 화면이 직접 읽어, 실시간 참여자와 똑같은 모양의 목록으로 돌려줍니다.
// 서버·재생용 계정·진행자 조작이 필요 없고, 인터넷이 잠깐 끊겨도 재생은 멈추지 않습니다.
// 참가자가 지점에 들어온 순간이 0초입니다(botLogic.ts). 새로고침해도 처음부터 다시 들어오지 않도록 들어온 시각을 이 탭에 남겨 둡니다.
import { useEffect, useState } from 'react'
import type { Participant } from '../realtime/participants'
import type { BranchLayout } from '../space/layout'
import { ENTER_DELAY_MS, botState } from './botLogic'
import type { Bot } from './botLogic'
import { loadPeerRecords } from './peersManifest'
import { TICK_MS } from './replayLogic'

const ENTERED_KEY = 'dooteum.peersEnteredAt:' // + 지점. 이 탭에서 처음 들어온 시각(ms)

function enteredAt(branchId: string): number {
  const key = ENTERED_KEY + branchId
  try {
    const saved = Number(sessionStorage.getItem(key))
    if (saved > 0) return saved
    const now = Date.now()
    sessionStorage.setItem(key, String(now))
    return now
  } catch {
    return Date.now()
  }
}

type Loaded = Bot & { nickname: string; model: string }

export function useRecordedPeers(enabled: boolean, branch: BranchLayout): Participant[] {
  const [bots, setBots] = useState<Loaded[]>([])
  const [shown, setShown] = useState<Participant[]>([])

  // 기록 파일을 읽고, 파일에 적힌 자리를 지점에서 찾아 봇을 만듭니다.
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void loadPeerRecords().then((peers) => {
      if (cancelled) return
      const list: Loaded[] = []
      peers.forEach((p, i) => {
        const seat = branch.seats.find((s) => s.no === p.file.seat)
        if (!seat) {
          console.error(`팀원 기록의 자리(${p.file.seat}번)가 ${branch.id} 에 없습니다.`)
          return
        }
        list.push({ userId: `recorded-${i}`, record: p.file, seat, enterAt: ENTER_DELAY_MS[i] ?? ENTER_DELAY_MS[ENTER_DELAY_MS.length - 1], nickname: p.name, model: p.model })
      })
      setBots(list)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, branch])

  // 0.25초마다(기록 간격) 지금 보일 값을 계산합니다.
  useEffect(() => {
    if (!enabled || bots.length === 0) return
    const start = enteredAt(branch.id)
    const tick = () => {
      const elapsed = Date.now() - start
      setShown(
        bots.flatMap((b) => {
          const s = botState(b, branch.spawn, elapsed)
          return s ? [{ ...s, nickname: b.nickname, model: b.model }] : []
        }),
      )
    }
    tick()
    const timer = setInterval(tick, TICK_MS)
    return () => clearInterval(timer)
  }, [enabled, bots, branch])

  return enabled ? shown : EMPTY
}

const EMPTY: Participant[] = []
