// 기록 모드 조작 (#190). 주소에 ?record=자리번호 가 있을 때만 지점 화면에 나타납니다(참가자는 볼 일이 없음).
//   Shift+R: 기록 시작 / 끝. 끝나면 이 컴퓨터에 JSON 파일(수치)과 같은 이름의 영상 파일이 내려받아집니다.
//   기록 중에는 왼쪽 아래에 "● REC 12:34" 가 뜨고, 그사이 창을 닫으려 하면 브라우저가 한 번 묻습니다.
// 기록은 Web Worker 타이머(workerInterval)로 0.25초마다 합니다. 다만 3D 화면은 창이 가려지면 멈춰서 값이 바뀌지 않으므로,
// 기록하는 동안 창을 가리지 않습니다.
//
// 영상: 트래킹이 이미 켜 둔 웹캠 영상을 MediaRecorder(브라우저에 들어 있는 녹화 기능)로 같이 녹화합니다.
// 카메라를 한 번만 쓰므로 다른 녹화 프로그램이 필요 없고, 영상이 실제로 녹화를 시작한 순간(onstart)을 수치의 0초로 잡아
// A 조건 영상과 C 조건 수치가 같은 시각에서 시작합니다. 카메라는 자리에 앉아야 켜지므로 앉은 뒤에 Shift+R 을 누릅니다.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import type { PresenceState } from '../realtime/participants'
import type { MyTracking } from '../study/SeatedStudy'
import { workerInterval } from '../lib/workerInterval'
import {
  MAX_GAP_SEC, MIN_FACE_RATE, RECORD_INTERVAL_MS, VIDEO_BITS_PER_SECOND, VIDEO_CHUNK_MS,
  buildFile, clockOf, fileNameOf, pickVideoType, sampleOf,
} from './recordLogic'
import type { RecordQuality, RecordSample } from './recordLogic'

const TOGGLE_KEY = 'KeyR' // Shift 와 함께

type Props = {
  meRef: RefObject<PresenceState | null> // 지점 화면이 매 프레임 채우는 내 상태 (다른 참여자에게 보내는 값과 같음)
  trackingRef: RefObject<MyTracking | null> // 앉아 있는 동안의 트래킹 (웹캠 영상을 여기서 꺼냅니다)
  branch: string // 지점 slug
  seat: number // 기록할 자리
}

// 방금 내려받은 파일
type Saved = { name: string; video: string | null; videoCut: boolean; quality: RecordQuality }

export function RecordControls({ meRef, trackingRef, branch, seat }: Props) {
  const [recording, setRecording] = useState(false)
  const [withVideo, setWithVideo] = useState(false) // 이번 기록에 영상도 녹화하는지
  const [elapsed, setElapsed] = useState(0)
  const [last, setLast] = useState<Saved | null>(null)
  const [hint, setHint] = useState('') // 시작하지 못한 이유 등
  const samples = useRef<RecordSample[]>([])
  const startedAt = useRef<Date | null>(null)
  const startMs = useRef(0) // 수치의 0초 (performance.now 기준)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const videoType = useRef<string | null>(null)
  const stopping = useRef(false) // Shift+R 로 끝내는 중인지 (아니면 녹화가 저절로 멈춘 것)
  const videoCut = useRef(false) // 끝내기 전에 영상 녹화가 멈췄는지 (자리에서 일어나 카메라가 꺼지는 등)

  // 기록 중: 0.25초마다 내 상태를 담습니다.
  useEffect(() => {
    if (!recording) return
    const stop = workerInterval(RECORD_INTERVAL_MS, () => {
      const t = Math.round(performance.now() - startMs.current)
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

  // 기록 중에 지점을 떠나면 녹화를 멈춥니다. (파일은 남기지 않음)
  useEffect(
    () => () => {
      const r = recorder.current
      if (r && r.state !== 'inactive') {
        r.onstop = null
        r.stop()
      }
    },
    [],
  )

  // 수치 기록을 시작합니다. 영상이 있으면 영상이 실제로 시작된 순간에 부릅니다.
  const begin = (video: boolean) => {
    samples.current = []
    startedAt.current = new Date()
    startMs.current = performance.now()
    setElapsed(0)
    setLast(null)
    setWithVideo(video)
    setRecording(true)
  }

  const start = () => {
    const src = trackingRef.current?.video.current?.srcObject
    const stream = src instanceof MediaStream && src.getVideoTracks().some((t) => t.readyState === 'live') ? src : null
    if (!stream) {
      setHint('자리에 앉아 카메라가 켜진 뒤 Shift+R 을 눌러 주세요.')
      return
    }
    const type = typeof MediaRecorder === 'undefined' ? null : pickVideoType((t) => MediaRecorder.isTypeSupported(t))
    videoType.current = type
    recorder.current = null
    if (!type) {
      setHint('이 브라우저는 영상 녹화를 지원하지 않아 수치만 기록합니다.')
      begin(false)
      return
    }
    setHint('')
    chunks.current = []
    stopping.current = false
    videoCut.current = false
    const r = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: VIDEO_BITS_PER_SECOND })
    r.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data)
    }
    r.onstart = () => begin(true)
    r.onerror = () => {
      if (recorder.current === r && r.state === 'inactive') recorder.current = null // 시작도 못 했으면 다시 누를 수 있게
      setHint('영상 녹화에 문제가 생겼어요. 끝낸 뒤 다시 기록해 주세요.')
    }
    r.onstop = () => {
      if (!stopping.current) videoCut.current = true // 끝내기 전에 저절로 멈춤. 끝낼 때 받아 둔 만큼만 저장합니다
    }
    recorder.current = r
    r.start(VIDEO_CHUNK_MS)
  }

  const finish = () => {
    setRecording(false)
    const r = recorder.current
    const file = buildFile(branch, seat, startedAt.current ?? new Date(), samples.current, r ? videoType.current : null)
    const name = fileNameOf(file)
    download(name, new Blob([JSON.stringify(file)], { type: 'application/json' }))
    const saveVideo = () => {
      if (file.video) download(file.video, new Blob(chunks.current, { type: videoType.current ?? undefined }))
      chunks.current = []
    }
    if (r && r.state !== 'inactive') {
      // 남은 조각은 stop 뒤에 마지막으로 들어오므로, 멈춘 다음에 파일로 만듭니다.
      stopping.current = true
      r.onstop = saveVideo
      r.stop()
    } else if (r) {
      saveVideo()
    }
    recorder.current = null
    setLast({ name, video: file.video, videoCut: videoCut.current, quality: file.quality })
  }

  // Shift+R 로 시작·끝 (최신 값을 읽으려고 ref 에 담아 둡니다)
  const toggle = () => {
    if (recording) finish()
    else if (!recorder.current) start() // 영상이 시작되기를 기다리는 중에는 다시 누르지 않게
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

  const ok = last !== null && last.quality.ok && !last.videoCut
  return (
    <div style={styles.box}>
      {recording ? (
        <span>
          <span style={styles.dot}>●</span> REC {clockOf(elapsed)} · {seat}번 · {withVideo ? '영상+수치' : '수치만'} · Shift+R 끝
        </span>
      ) : (
        <span>기록 모드 {seat}번 자리 · 앉은 뒤 Shift+R 기록 시작 (영상+수치)</span>
      )}
      {hint && <span style={{ color: '#fde68a' }}>{hint}</span>}
      {last && !recording && (
        <span style={{ color: ok ? '#86efac' : '#fca5a5' }}>
          {last.name}
          {last.video ? ` + ${last.video}` : ' (영상 없음)'} 저장 · 얼굴 인식 {Math.round(last.quality.faceRate * 100)}% (기준{' '}
          {MIN_FACE_RATE * 100}%) · 가장 긴 끊김 {last.quality.longestGapSec.toFixed(1)}초 (기준 {MAX_GAP_SEC}초 미만)
          {last.videoCut && ' · 영상이 도중에 끊김(자리에서 일어나는 등)'} · {ok ? '사용 가능' : '다시 기록 필요'}
        </span>
      )}
    </div>
  )
}

// 파일을 이 컴퓨터로 내려받습니다. (서버로 보내지 않음)
function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  // 큰 영상은 내려받기가 시작되기 전에 주소를 지우면 실패할 수 있어 조금 뒤에 지웁니다.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

const styles: Record<string, CSSProperties> = {
  box: {
    position: 'fixed', left: 16, bottom: 16, zIndex: 12, display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 'calc(100vw - 260px)',
    padding: '6px 10px', borderRadius: 8, background: 'rgba(32,35,42,.85)', color: '#fff', font: '13px system-ui, sans-serif',
  },
  dot: { color: '#ef4444' },
}
