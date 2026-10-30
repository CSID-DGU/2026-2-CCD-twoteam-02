// 건물(지점)에 들어설 때 잠깐 뜨는 규칙 안내 (캠빛 대학교 도서관·강의동·정보관, 휴식방).
// 앉기 전에 그곳이 어떤 곳인지 알 수 있게 합니다. 누를 것·초점 없이 몇 초 뒤 저절로 사라집니다(rulesLogic.entryNotice).
import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'

const SHOW_MS = 5000

export function EntryNotice({ text, onDone }: { text: string; onDone: () => void }) {
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
      🏛 {text}
    </div>
  )
}

const style: CSSProperties = {
  position: 'fixed', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 25, maxWidth: 'min(92vw, 640px)',
  padding: '10px 18px', borderRadius: 12, background: 'rgba(32,35,42,.92)', color: '#f3e6b3', textAlign: 'center',
  font: '600 14px system-ui, sans-serif', boxShadow: '0 6px 20px rgba(0,0,0,.3)', pointerEvents: 'none',
}
