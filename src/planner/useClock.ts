// 가방 시계 상태(스톱워치·알람)를 화면들이 같이 쓰는 작은 저장소 + 알람 감시.
//
// - 상태는 계정별 localStorage(dooteum.clock.<사용자 id>)에 시각 기준으로 저장 → 새로고침·화면 이동·시계 닫기에도 이어짐.
//   다른 탭에서 바꾸면(storage 이벤트) 다시 읽어 같이 바뀜(한 탭에서 끄면 다른 탭도 꺼짐).
// - 알람 감시(useClockWatcher)는 가방(BagLayer, 로그인 화면 어디서나)에서 한 번만. 숨긴 탭에서도 늦지 않게 workerInterval 1초.
// - 울리면: 소리(소리 끔·방해금지와 무관), 탭 제목 깜빡임, 1인칭 시점 잠금 풀기. 소리는 SOUND_STOP_MS 뒤 저절로 멈춤.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useSession } from '../auth/useSession'
import { workerInterval } from '../lib/workerInterval'
import { INITIAL_CLOCK, SOUND_STOP_MS, parseClockState, swReset, swToggle } from './clockLogic'
import type { Alarm, ClockState } from './clockLogic'
import { prepareAlarmSound, startAlarmSound, stopAlarmSound } from './alarmSound'

const keyOf = (uid: string) => `dooteum.clock.${uid}`
const RING_TITLE = '⏰ 알람!'

let userId: string | null = null
let state: ClockState = INITIAL_CLOCK
let soundBlocked = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

function load(uid: string): ClockState {
  try {
    const raw = localStorage.getItem(keyOf(uid))
    return raw ? parseClockState(JSON.parse(raw)) : INITIAL_CLOCK
  } catch {
    return INITIAL_CLOCK
  }
}

// 세션은 훅마다 비동기로 받아와 처음엔 null 이라, null 은 무시(새로 그려지는 화면이 저장소를 비우지 않게).
// 로그아웃하면 가방(BagLayer)이 통째로 내려가고, 계정이 바뀌면 새 id 로 다시 읽음.
function bind(uid: string | null) {
  if (uid === null || uid === userId) return
  userId = uid
  state = uid ? load(uid) : INITIAL_CLOCK
  notify()
}

function update(change: (s: ClockState) => ClockState) {
  if (!userId) return
  state = change(state)
  try {
    localStorage.setItem(keyOf(userId), JSON.stringify(state))
  } catch {
    // 기억하지 못해도 이번 화면에서는 동작
  }
  notify()
}

// 다른 탭에서 바꾼 것 따라가기
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (userId && e.key === keyOf(userId)) {
      state = load(userId)
      notify()
    }
  })
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useClock() {
  const { session } = useSession()
  const uid = session?.user.id ?? null
  useEffect(() => bind(uid), [uid])
  const s = useSyncExternalStore(subscribe, () => state)
  const blocked = useSyncExternalStore(subscribe, () => soundBlocked)
  const now = Date.now
  return {
    state: s,
    soundBlocked: blocked,
    toggleSw: useCallback(() => update((c) => ({ ...c, sw: swToggle(c.sw, now()) })), [now]),
    resetSw: useCallback(() => update((c) => ({ ...c, sw: swReset(c.sw) })), []),
    // 새로 맞추면 이전 알람은 사라짐 (하나만). 부르는 버튼에서 prepareAlarmSound 를 먼저 (소리 허용)
    setAlarm: useCallback((a: Alarm) => update((c) => ({ ...c, alarm: a })), []),
    cancelAlarm: useCallback(() => update((c) => ({ ...c, alarm: null })), []),
    dismiss: useCallback(() => update((c) => ({ ...c, ringing: null })), []),
  }
}

// 가방에서 한 번만 부름. 1초마다 알람 시각이 지났는지 보고, 울리는 동안 소리·탭 제목을 맡음
export function useClockWatcher() {
  const { session } = useSession()
  const uid = session?.user.id ?? null
  useEffect(() => bind(uid), [uid])

  useEffect(() => {
    let savedTitle: string | null = null
    let blink = false
    const restore = () => {
      stopAlarmSound()
      if (savedTitle !== null) document.title = savedTitle
      savedTitle = null
      if (soundBlocked) {
        soundBlocked = false
        notify()
      }
    }
    const tick = () => {
      const now = Date.now()
      if (state.alarm && now >= state.alarm.at) {
        const due = state.alarm
        update((c) => ({ ...c, alarm: null, ringing: due }))
        if (document.pointerLockElement) document.exitPointerLock()
      }
      const ringing = state.ringing
      if (!ringing) {
        restore()
        return
      }
      // 소리: 울리기 시작하고 SOUND_STOP_MS 동안만. 막혀 있으면 끄기 창에 안내
      if (now - ringing.at < SOUND_STOP_MS) {
        const ok = startAlarmSound()
        if (soundBlocked !== !ok) {
          soundBlocked = !ok
          notify()
        }
      } else {
        stopAlarmSound()
      }
      // 탭 제목 깜빡임 (다른 탭에 가 있어도 알아채게)
      if (savedTitle === null) savedTitle = document.title
      blink = !blink
      document.title = blink ? RING_TITLE : savedTitle
    }
    // 소리가 막혔으면 아무 데나 한 번 누를 때 다시 준비
    const unlock = () => {
      if (state.ringing || state.alarm) prepareAlarmSound()
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    tick()
    const stop = workerInterval(1000, tick)
    return () => {
      stop()
      restore()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])
}

// 창이 열린 동안 화면 숫자 갱신용 지금 시각
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(t)
  }, [intervalMs])
  return now
}
