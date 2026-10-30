// 칭호가 오른 순간 화면 가운데(조금 위)에 잠깐 뜨는 축하 카드 (꽃 피는 칭호).
// 큰 꽃 이모지가 피어나듯 커지고 주변으로 꽃잎·반짝이가 터진 뒤 CARD_MS 뒤 저절로 사라집니다.
// 공부 중에 뜨므로 집중을 끊지 않게 합니다(사용자 요구):
//   닫기 버튼 없음, 클릭·키 입력을 받지 않음(pointer-events: none), 초점을 가져가지 않음 → "다른 화면 사용" 판정·타이머에 영향 없음.
//   소리 없음. 책상을 가리지 않게 작게.
import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { titleOf } from './levelLogic'

const CARD_MS = 3500 // 보이는 시간
// 터지는 꽃잎·반짝이: [글자, x 이동(px), y 이동(px)]
const BURST: [string, number, number][] = [
  ['🌸', -120, -60], ['🌸', 130, -50], ['🌷', -100, 70], ['🌸', 110, 80],
  ['✨', 0, -110], ['✨', -160, 10], ['✨', 160, 15], ['🌼', -40, 95], ['🌼', 50, -95],
]

export function LevelUpCard({ level, onDone }: { level: number; onDone: () => void }) {
  // 지점 화면은 자주 다시 그려져 onDone 이 매번 새 함수입니다. 그때마다 타이머를 다시 걸지 않도록 ref 로 읽습니다.
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  }, [onDone])
  useEffect(() => {
    const t = setTimeout(() => done.current(), CARD_MS)
    return () => clearTimeout(t)
  }, [])
  const title = titleOf(level)
  if (!title) return null
  const next = titleOf(level + 1)
  return (
    <div style={styles.wrap} aria-live="polite">
      <style>{KEYFRAMES}</style>
      {BURST.map(([e, dx, dy], i) => (
        <span key={i} style={{ ...styles.spark, ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px`, animationDelay: `${(i % 3) * 0.06}s` }}>
          {e}
        </span>
      ))}
      <div style={styles.card}>
        <div style={styles.big}>{title.emoji}</div>
        <div style={{ ...styles.name, color: title.color }}>{title.name} 달성!</div>
        <div style={styles.sub}>
          누적 {title.hours}시간 · {next ? `다음 ${next.emoji} ${next.name}까지 ${next.hours - title.hours}시간` : '가장 높은 단계예요'}
        </div>
      </div>
    </div>
  )
}

// 카드: 톡 튀어나와 머물다 사라짐 / 꽃: 피어나듯 커짐 / 꽃잎: 가운데에서 바깥으로 흩어지며 사라짐
const KEYFRAMES = `
@keyframes levelup-pop { 0% { transform: scale(.4); opacity: 0 } 12% { transform: scale(1.08); opacity: 1 } 20% { transform: scale(1) } 85% { opacity: 1 } 100% { opacity: 0 } }
@keyframes levelup-bloom { 0% { transform: scale(.2) } 30% { transform: scale(1.2) } 45% { transform: scale(1) } }
@keyframes levelup-burst { 0% { transform: translate(0, 0) scale(.3); opacity: 0 } 15% { opacity: 1 } 100% { transform: translate(var(--dx), var(--dy)) scale(1); opacity: 0 } }
`

const styles: Record<string, CSSProperties> = {
  wrap: {
    position: 'fixed', left: '50%', top: '36%', width: 0, height: 0, zIndex: 30,
    pointerEvents: 'none', // 누를 수 없음: 쓰던 마우스·키보드 그대로
    font: '14px system-ui, sans-serif',
  },
  card: {
    position: 'absolute', left: -150, top: -60, width: 300, padding: '14px 18px', borderRadius: 16, textAlign: 'center',
    background: 'rgba(255,250,242,.96)', boxShadow: '0 8px 30px rgba(0,0,0,.3)',
    animation: `levelup-pop ${CARD_MS}ms ease-out forwards`,
  },
  big: { fontSize: 44, display: 'inline-block', animation: `levelup-bloom ${CARD_MS}ms ease-out forwards` },
  name: { fontWeight: 800, fontSize: 20, marginTop: 2 },
  sub: { fontSize: 12, color: '#6b6158', marginTop: 4 },
  spark: { position: 'absolute', left: -8, top: -10, fontSize: 16, animation: `levelup-burst ${CARD_MS * 0.6}ms ease-out forwards`, opacity: 0 },
}
