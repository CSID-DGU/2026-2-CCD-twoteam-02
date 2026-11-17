// 운영 기록 보내기 (#590). supabase.ts 가 연결을 만든 뒤 startTelemetry 를 한 번 부릅니다.
//
// 1분마다(분이 바뀐 직후) 모인 기록을 ops_report 로 보냅니다. 창을 숨기면(다른 탭·닫기) 바로 보냅니다.
// 로그인하지 않았으면 보내지 않고 버립니다(보낸 사람을 정할 수 없음). 게스트는 로그인으로 칩니다.
// 보내기에 실패해도 다시 보내지 않습니다. 운영 기록 때문에 요청이 쌓이면 안 되기 때문입니다.
// 저장소를 바꾸게 되면(예: 다른 DB) 이 파일만 바꾸면 됩니다.
import type { SupabaseClient } from '@supabase/supabase-js'
import { clearAll, drain, getGpu, recordError, setSignedIn } from './collector'
import { deviceFrom, FLUSH_MS, isNoiseRejection, MAX_ERROR_ROWS, MAX_FPS_ROWS, scrubDetail } from './opsLogic'

// 브라우저가 스스로 내는, 화면에 영향 없는 경고
const IGNORED = /ResizeObserver loop/

let started = false

export function startTelemetry(client: SupabaseClient): void {
  if (started || typeof window === 'undefined') return
  started = true
  const version: string = import.meta.env.VITE_APP_VERSION ?? 'dev'

  async function flush(all: boolean) {
    const { fps, errors } = drain(Date.now(), all)
    if (fps.length === 0 && errors.length === 0) return
    const { data } = await client.auth.getSession()
    if (!data.session) return // 로그인 전 기록은 꺼낸 채로 버림
    const device = deviceFrom(navigator.userAgent, navigator.hardwareConcurrency ?? 0, getGpu(), version)
    const rounds = Math.max(Math.ceil(fps.length / MAX_FPS_ROWS), Math.ceil(errors.length / MAX_ERROR_ROWS))
    for (let i = 0; i < rounds; i++) {
      const { error } = await client.rpc('ops_report', {
        p_device: device,
        p_fps: fps.slice(i * MAX_FPS_ROWS, (i + 1) * MAX_FPS_ROWS),
        p_errors: errors.slice(i * MAX_ERROR_ROWS, (i + 1) * MAX_ERROR_ROWS),
      })
      if (error) {
        console.warn('운영 기록을 보내지 못했습니다:', error.message)
        return
      }
    }
  }
  const send = (all: boolean) => void flush(all).catch(() => {})

  // 분이 바뀐 뒤 2~7초에 첫 번째, 그 뒤 1분마다. 사람마다 조금씩 어긋나게 해 한꺼번에 몰리지 않게 함
  const first = FLUSH_MS - (Date.now() % FLUSH_MS) + 2000 + Math.random() * 5000
  window.setTimeout(() => {
    send(false)
    window.setInterval(() => send(false), FLUSH_MS)
  }, first)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') send(true)
  })

  // 로그인했을 때만 모음(로그인 전 에러가 로그인한 사람 이름으로 섞이지 않게). 로그아웃하면 그 전 기록도 버림
  client.auth.onAuthStateChange((event, session) => {
    setSignedIn(session !== null)
    if (event === 'SIGNED_OUT') clearAll()
  })

  // 잡히지 않은 화면 오류
  window.addEventListener('error', (e) => {
    const message = e.message || String(e.error ?? '')
    if (!IGNORED.test(message)) recordError({ kind: 'js', code: 'error', target: '', detail: scrubDetail(message) })
  })
  window.addEventListener('unhandledrejection', (e) => {
    const reason: unknown = e.reason
    if (isNoiseRejection(reason)) return // 소리 자동 재생 막힘·취소한 요청은 화면 오류가 아님
    const message = reason instanceof Error ? reason.message : String(reason)
    recordError({ kind: 'js', code: 'rejection', target: '', detail: scrubDetail(message) })
  })
}
