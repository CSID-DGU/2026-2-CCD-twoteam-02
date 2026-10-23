// room A: 캠 ON 조건의 화상회의 화면 (#192, #197). 로비의 room A 문으로 들어옵니다.
//
// Zoom 대신 자체 재생 화면입니다(실험 문서 4절). Zoom 갤러리처럼 2×2 바둑판에 팀원 3명의 녹화 영상과
// 내 카메라 미리보기(셀프뷰)를 한 칸씩 띄웁니다.
//   - 소리 없음. 칸마다 이름표와 마이크 꺼짐 표시
//   - 셀프뷰는 이 기기 안의 카메라 미리보기일 뿐, 어디에도 보내거나 저장하지 않습니다(CLAUDE.md 절대 규칙)
//   - 트래킹·공부 타이머는 돌리지 않습니다. A 는 영상만 보여 주는 조건입니다
//   - 들어오면 바로 재생하고 영상이 끝나면 마지막 장면에서 멈춥니다. (진행자 시작 신호는 #196 에서)
// 진행자는 Shift+O 로 영상·이름표를 고릅니다(VideoSetup). 나가기 버튼이나 L 키로 로비의 room A 문 앞으로 돌아갑니다.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router'
import { useOnlinePlace } from '../realtime/onlineContext'
import { DEFAULT_PEERS, loadPeers } from './videoStore'
import type { PeerVideo } from './videoStore'
import { VideoSetup } from './VideoSetup'

export const ROOM_A_SLUG = 'room-a' // 로비 문과 접속 상태에서 쓰는 이름
const LEAVE_KEY = 'KeyL'
const SETUP_KEY = 'KeyO' // Shift 와 함께

type Shown = { name: string; url: string | null } // 화면에 띄울 칸 (영상 주소는 이 화면이 있는 동안만 쓰는 임시 주소)

const isTyping = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement

export function VideoRoom() {
  const navigate = useNavigate()
  useOnlinePlace(ROOM_A_SLUG)
  const [peers, setPeers] = useState<PeerVideo[]>(DEFAULT_PEERS)
  const [shown, setShown] = useState<Shown[]>(() => DEFAULT_PEERS.map((p) => ({ name: p.name, url: null })))
  const [setupOpen, setSetupOpen] = useState(false)
  const [camError, setCamError] = useState('')
  const selfVideo = useRef<HTMLVideoElement>(null)
  const urls = useRef<string[]>([]) // 만든 임시 주소. 바꾸거나 화면을 떠나면 지웁니다

  // 저장한 영상으로 칸을 채웁니다. Blob 을 <video> 에 넣으려면 임시 주소(createObjectURL)가 필요합니다.
  const show = (list: PeerVideo[]) => {
    urls.current.forEach((u) => URL.revokeObjectURL(u))
    const next = list.map((p) => ({ name: p.name, url: p.file ? URL.createObjectURL(p.file) : null }))
    urls.current = next.flatMap((s) => (s.url ? [s.url] : []))
    setPeers(list)
    setShown(next)
  }
  const showRef = useRef(show)
  useEffect(() => {
    showRef.current = show
  })

  useEffect(() => {
    let cancelled = false
    void loadPeers().then((list) => {
      if (!cancelled) showRef.current(list)
    })
    return () => {
      cancelled = true
      urls.current.forEach((u) => URL.revokeObjectURL(u))
      urls.current = []
    }
  }, [])

  // 내 카메라 미리보기. 화면을 떠나면 카메라를 끕니다.
  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        if (selfVideo.current) selfVideo.current.srcObject = s
      })
      .catch((e: unknown) => {
        if (!cancelled) setCamError(e instanceof Error && e.name === 'NotAllowedError' ? '카메라 권한이 필요해요' : '카메라를 켤 수 없어요')
      })
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // 나가기: 로비의 room A 문 앞에서 로비 쪽(+Z)을 보고 섭니다. (#150 의 지점 → 로비와 같게)
  const leave = () => navigate('/', { state: { from: ROOM_A_SLUG, heading: 0 } })
  const leaveRef = useRef(leave)
  useEffect(() => {
    leaveRef.current = leave
  })

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      if (e.code === SETUP_KEY && e.shiftKey) setSetupOpen((o) => !o)
      else if (e.code === LEAVE_KEY && !e.shiftKey) leaveRef.current()
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])

  return (
    <div style={styles.page}>
      {/* 2×2 바둑판: 팀원 3명 + 마지막 칸에 나 */}
      <div style={styles.grid}>
        {shown.map((s, i) => (
          <div key={i} style={styles.tile}>
            {s.url ? (
              <video style={styles.video} src={s.url} autoPlay muted playsInline />
            ) : (
              <div style={styles.noVideo}>{s.name.slice(0, 1)}</div>
            )}
            <NameTag name={s.name} />
          </div>
        ))}
        {/* 셀프뷰: 거울처럼 좌우를 뒤집어 보여 줍니다(화상회의 앱과 같게). */}
        <div style={styles.tile}>
          <video ref={selfVideo} style={{ ...styles.video, transform: 'scaleX(-1)' }} autoPlay muted playsInline />
          {camError && <div style={styles.camError}>{camError}</div>}
          <NameTag name="나" />
        </div>
      </div>

      <button type="button" style={styles.leave} onClick={leave}>
        나가기 (L)
      </button>

      {setupOpen && <VideoSetup peers={peers} onSaved={show} onClose={() => setSetupOpen(false)} />}
    </div>
  )
}

// 이름표와 마이크 꺼짐 표시 (화상회의 앱처럼 칸 왼쪽 아래)
function NameTag({ name }: { name: string }) {
  return (
    <div style={styles.nameTag}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" aria-label="마이크 꺼짐">
        <path d="M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-.8 2" />
        <path d="M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3M3 3l18 18" />
      </svg>
      {name}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  page: { position: 'fixed', inset: 0, background: '#111317', color: '#fff', font: '14px system-ui, sans-serif' },
  // 2×2 바둑판. 칸이 16:9 라 바둑판 전체도 16:9 입니다. 화면(아래 나가기 버튼 자리를 뺀 곳)에 꽉 차게 맞춥니다.
  grid: {
    position: 'absolute', left: '50%', top: 'calc(50% - 28px)', transform: 'translate(-50%, -50%)',
    width: 'min(calc(100vw - 32px), calc((100vh - 88px) * 16 / 9))', aspectRatio: '16 / 9',
    display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 8,
  },
  tile: { position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#1f2228' },
  video: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  noVideo: {
    width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 48, fontWeight: 700, color: '#6b7280',
  },
  nameTag: {
    position: 'absolute', left: 8, bottom: 8, display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px',
    borderRadius: 6, background: 'rgba(0,0,0,.6)', fontSize: 13,
  },
  camError: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 12, textAlign: 'center', fontSize: 12, color: '#aab0bb' },
  leave: {
    position: 'fixed', left: '50%', bottom: 16, transform: 'translateX(-50%)', padding: '8px 18px', borderRadius: 8, border: 'none',
    background: '#dc2626', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit', zIndex: 5,
  },
}
