// 강의실 종 알림 (캠빛 강의동): 쉬는 시간이 되면 "🔔 쉬는 시간이에요", 수업이 시작되면 "🔔 수업 시작".
// 축하 카드처럼 누를 것·초점·소리가 없고 잠깐 뒤 저절로 사라집니다 (공부 흐름을 끊지 않게).
import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'

const SHOW_MS = 3500

export function ClassBellNotice({ phase, onDone }: { phase: 'class' | 'break'; onDone: () => void }) {
  const done = useRef(onDone) // 지점 화면이 자주 다시 그려져도 타이머를 다시 걸지 않게
  useEffect(() => {
    done.current = onDone
  }, [onDone])
  useEffect(() => {
    const t = setTimeout(() => done.current(), SHOW_MS)
    return () => clearTimeout(t)
  }, [])
  return (
    <div style={style} aria-live="polite">
      {phase === 'break' ? '🔔 쉬는 시간이에요 · 10분 쉬고 다시 시작해요' : '🔔 수업 시작 · 다 같이 공부해요'}
    </div>
  )
}

const style: CSSProperties = {
  position: 'fixed', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 25,
  padding: '10px 18px', borderRadius: 12, background: 'rgba(255,250,242,.96)', color: '#3b2a1a',
  font: '600 15px system-ui, sans-serif', boxShadow: '0 6px 20px rgba(0,0,0,.25)', pointerEvents: 'none',
}
