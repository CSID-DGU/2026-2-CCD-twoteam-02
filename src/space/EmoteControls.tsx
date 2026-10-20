// 감정표현 고르기 (#162). 로비·지점에 띄웁니다.
//
// 숫자키 1~8: 바로 실행
// X 를 누르고 있기: 화면 가운데에 감정표현 바퀴가 뜨고, 마우스를 움직인 방향의 칸이 골라집니다. 떼면 실행, Esc 는 취소
//   (오버워치 감정표현 바퀴처럼. 마우스가 잠겨 있어도 움직인 양으로 고르고, 그동안은 시점이 돌지 않음)
// 실제 동작은 Player 가 emoteRef 의 request 를 받아 합니다. 서 있을 때만 되고, 움직이면 멈춥니다.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { EMOTES, requestEmote, wheelIndex } from './emotes'
import type { EmoteState } from './emotes'

const WHEEL_KEY = 'KeyX'
const RADIUS = 118 // 바퀴 반지름(px)

type Props = {
  emoteRef: RefObject<EmoteState>
  suspendLookRef: RefObject<boolean> // 바퀴를 고르는 동안 마우스로 시점이 돌지 않게 (WalkCamera)
  disabled: boolean // 창이 떠 있거나 앉아 있으면 쓰지 않음
}

const typing = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement

export function EmoteControls({ emoteRef, suspendLookRef, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState<number | null>(null)
  const moved = useRef({ x: 0, y: 0 }) // 바퀴를 연 뒤 마우스를 움직인 양
  const openRef = useRef(false)
  const pickRef = useRef<number | null>(null)

  useEffect(() => {
    const close = () => {
      openRef.current = false
      suspendLookRef.current = false
      setOpen(false)
      setPick(null)
      pickRef.current = null
    }
    if (disabled) {
      if (openRef.current) close()
      return
    }
    const down = (e: KeyboardEvent) => {
      if (typing(e.target) || e.repeat) return
      const quick = EMOTES.find((m) => m.code === e.code)
      if (quick && !openRef.current) {
        requestEmote(emoteRef.current, quick.id)
        return
      }
      if (e.code === WHEEL_KEY) {
        moved.current = { x: 0, y: 0 }
        openRef.current = true
        suspendLookRef.current = true
        setOpen(true)
      } else if (e.code === 'Escape' && openRef.current) {
        close()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code !== WHEEL_KEY || !openRef.current) return
      const i = pickRef.current
      if (i !== null) requestEmote(emoteRef.current, EMOTES[i].id)
      close()
    }
    const move = (e: MouseEvent) => {
      if (!openRef.current) return
      moved.current.x += e.movementX
      moved.current.y += e.movementY
      const i = wheelIndex(moved.current.x, moved.current.y, EMOTES.length)
      pickRef.current = i
      setPick(i)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('mousemove', move)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('blur', close)
    }
  }, [disabled, emoteRef, suspendLookRef])

  if (!open) return null
  return (
    <div style={styles.wheel} aria-label="감정표현 바퀴">
      <div style={styles.center}>{pick === null ? '감정표현' : EMOTES[pick].label}</div>
      {EMOTES.map((m, i) => {
        const angle = (i / EMOTES.length) * Math.PI * 2 // 위가 0, 시계 방향
        const x = Math.sin(angle) * RADIUS
        const y = -Math.cos(angle) * RADIUS
        return (
          <div key={m.id} style={{ ...styles.slot, ...(pick === i ? styles.slotOn : null), transform: `translate(${x}px, ${y}px)` }}>
            <span style={styles.icon}>{m.icon}</span>
            <span style={styles.num}>{i + 1}</span>
          </div>
        )
      })}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wheel: {
    position: 'fixed', left: '50%', top: '50%', width: 0, height: 0, zIndex: 25, pointerEvents: 'none',
    font: '13px system-ui, sans-serif', color: '#fff',
  },
  center: {
    position: 'absolute', left: -60, top: -18, width: 120, height: 36, borderRadius: 18, display: 'grid', placeItems: 'center',
    background: 'rgba(20,22,27,.85)', fontWeight: 700,
  },
  slot: {
    position: 'absolute', left: -30, top: -30, width: 60, height: 60, borderRadius: '50%', display: 'grid', placeItems: 'center',
    background: 'rgba(20,22,27,.75)', border: '2px solid rgba(255,255,255,.15)', transition: 'background .1s, border-color .1s',
  },
  slotOn: { background: 'rgba(59,130,246,.85)', borderColor: '#fff' },
  icon: { fontSize: 26, lineHeight: 1 },
  num: { position: 'absolute', right: 6, bottom: 2, fontSize: 10, opacity: 0.7 },
}
