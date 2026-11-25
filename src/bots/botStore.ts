// 봇 현황을 앱 전체에서 한 곳에서 읽어 나눠 줍니다 (#50).
//
// 접속 목록(OnlineProvider)과 장면(useBotPeers)이 같이 쓰므로, 화면마다 따로 읽지 않고 여기서 BOT_POLL_MS 마다 한 번만 읽습니다.
// 보는 곳이 하나라도 있을 때만 읽고, 모두 떠나면 멈춥니다. (friends/useFollow 의 모듈 저장소와 같은 방식)
// 0075 를 아직 적용하지 않은 DB 면 함수가 없어 오류가 나는데, 그때는 봇이 없는 것으로 봅니다.
import { useSyncExternalStore } from 'react'
import { supabase } from '../lib/supabase'
import { BOT_POLL_MS, parseBotPresence } from './botLogic'
import type { BotPresence } from './botLogic'

const EMPTY: BotPresence = { rows: [], offset: 0, at: 0 }
let current: BotPresence = EMPTY
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null
let warned = false

async function load() {
  const { data, error } = await supabase.rpc('bot_presence')
  if (error) {
    if (!warned) console.info('봇 현황을 읽지 못했습니다(봇 없음으로 봄):', error.message)
    warned = true
    current = EMPTY
  } else {
    current = parseBotPresence(data, Date.now())
  }
  listeners.forEach((l) => l())
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  if (timer === null) {
    void load()
    timer = setInterval(() => void load(), BOT_POLL_MS)
  }
  return () => {
    listeners.delete(onChange)
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
}

const NONE = () => () => {}

// 봇 현황. enabled 가 false 면(로그인 전) 읽지 않고 빈 값
export function useBotPresence(enabled = true): BotPresence {
  return useSyncExternalStore(enabled ? subscribe : NONE, () => (enabled ? current : EMPTY))
}

// 관리자 탭에서 켜고 끈 뒤 바로 다시 읽게 합니다
export const reloadBotPresence = () => void load()
