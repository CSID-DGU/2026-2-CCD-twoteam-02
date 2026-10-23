// 기록 모드 조작 (#190). 주소에 ?record=자리번호 가 있을 때만 지점 화면에 나타납니다(참가자는 볼 일이 없음).
//   Shift+R: 기록 시작 / 끝. 끝나면 이 컴퓨터에 JSON 파일이 내려받아집니다.
//   기록 중에는 왼쪽 아래에 "● REC 12:34" 가 뜨고, 그사이 창을 닫으려 하면 브라우저가 한 번 묻습니다.
// 기록은 Web Worker 타이머(workerInterval)로 0.25초마다 합니다. 다만 3D 화면은 창이 가려지면 멈춰서 값이 바뀌지 않으므로,
// 기록하는 동안 창을 가리지 않습니다.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import type { PresenceState } from '../realtime/participants'
import { workerInterval } from '../lib/workerInterval'
import { MAX_GAP_SEC, MIN_FACE_RATE, RECORD_INTERVAL_MS, buildFile, clockOf, fileNameOf, sampleOf } from './recordLogic'
import type { RecordQuality, RecordSample } from './recordLogic'

const TOGGLE_KEY = 'KeyR' // Shift 와 함께

type Props = {
  meRef: RefObject<PresenceState | null> // 지점 화면이 매 프레임 채우는 내 상태 (다른 참여자에게 보내는 값과 같음)
  branch: string // 지점 slug
  seat: number // 기록할 자리
}

export function RecordControls({ meRef, branch, seat }: Props) {
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [last, setLast] = useState<{ name: string; quality: RecordQuality } | null>(null) // 방금 내려받은 파일
  const samples = useRef<RecordSample[]>([])
  const startedAt = useRef<Date | null>(null)

  // 기록 중: 0.25초마다 내 상태를 담습니다.
  useEffect(() => {
    if (!recording) return
    const start = performance.now()
    const stop = workerInterval(RECORD_INTERVAL_MS, () => {
      const t = Math.round(performance.now() - start)
      const me = meRef.current
      if (me) samples.current.push(sampleOf(me, t))
      setElapsed(t)
    })
    return stop
  }, [recording, meRef])

  // 기록 중에 창을 닫거나 새로고침하면 기록이 사라지므로 한 번 묻습니다.
  useEffect(() => {
    if (!recording) return
    const ask = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [recording])

  // Shift+R 로 시작·끝 (최신 값을 읽으려고 ref 에 담아 둡니다)
  const toggle = () => {
    if (!recording) {
      samples.current = []
      startedAt.current = new Date()
      setElapsed(0)
      setLast(null)
      setRecording(true)
      return
    }
    setRecording(false)
    const file = buildFile(branch, seat, startedAt.current ?? new Date(), samples.current)
    const name = fileNameOf(file)
    download(name, JSON.stringify(file))
    setLast({ name, quality: file.quality })
  }
  const toggleRef = useRef(toggle)
  useEffect(() => {
    toggleRef.current = toggle
  })
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== TOGGLE_KEY || !e.shiftKey || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      e.preventDefault()
      toggleRef.current()
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])

  return (
    <div style={styles.box}>
      {recording ? (
        <span>
          <span style={styles.dot}>●</span> REC {clockOf(elapsed)} · {seat}번 · Shift+R 끝
        </span>
      ) : (
        <span>기록 모드 {seat}번 자리 · Shift+R 기록 시작</span>
      )}
      {last && !recording && (
        <span style={{ color: last.quality.ok ? '#86efac' : '#fca5a5' }}>
          {last.name} 저장 · 얼굴 인식 {Math.round(last.quality.faceRate * 100)}% (기준 {MIN_FACE_RATE * 100}%) · 가장 긴 끊김{' '}
          {last.quality.longestGapSec.toFixed(1)}초 (기준 {MAX_GAP_SEC}초 미만) · {last.quality.ok ? '사용 가능' : '다시 기록 필요'}
        </span>
      )}
    </div>
  )
}

// 파일을 이 컴퓨터로 내려받습니다. (서버로 보내지 않음)
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const styles: Record<string, CSSProperties> = {
  box: {
    position: 'fixed', left: 16, bottom: 16, zIndex: 12, display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 'calc(100vw - 260px)',
    padding: '6px 10px', borderRadius: 8, background: 'rgba(32,35,42,.85)', color: '#fff', font: '13px system-ui, sans-serif',
  },
  dot: { color: '#ef4444' },
}
