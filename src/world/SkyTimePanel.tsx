// 팀 전용 하늘 시간 조절판. 광장·캠퍼스 메뉴의 "하늘 시간"(팀 계정에만 보임)으로 엽니다.
//
// 하늘을 둘러보며 쓸 수 있게 창(InfoPanel)이 아니라 화면 왼쪽 위에 작게 띄웁니다. 창이 뜨면 캐릭터·시점이 멈추기 때문입니다.
//   시각 버튼  동틀 녘·해 질 녘(그날 일출·일몰 EVENT_LEAD_MIN 분 전), 정오, 밤
//   빠르기     지금 하늘 시각에서 끊기지 않고 이어서 빨라지거나 느려짐 (skyLogic 의 retime)
//   지금으로   실제 시각, 1배속
// 내 화면의 하늘만 바뀝니다(skyClock). 날씨·구름·번개는 그대로 실제 시각을 따릅니다.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { retime, seoulClockText, seoulTimeOn, sunEvents, worldTime } from './skyLogic'
import { getSkyClock, setSkyClock, useSkyClock } from './skyClock'

const SPEEDS = [0, 1, 60, 300, 1800] // 0 은 멈춤. 300× 면 1분에 5시간
const EVENT_LEAD_MIN = 20 // 동틀 녘·해 질 녘 버튼: 일출·일몰 이만큼 전으로
const FIXED = { noon: [12, 0], night: [22, 0] } as const
const TICK_MS = 500 // 시각 표시를 다시 그리는 간격

type Jump = 'dawn' | 'noon' | 'dusk' | 'night'
const JUMPS: { id: Jump; label: string }[] = [
  { id: 'dawn', label: '동틀 녘' },
  { id: 'noon', label: '정오' },
  { id: 'dusk', label: '해 질 녘' },
  { id: 'night', label: '밤' },
]

// 빠르기만 바꿉니다(지금 하늘 시각에서 이어짐).
function setSpeed(speed: number) {
  const c = getSkyClock()
  if (c) setSkyClock(retime(c, Date.now(), speed))
}

// 지금 보이는 하늘 날짜의 그 시각으로. 빠르기는 그대로
function jump(id: Jump) {
  const c = getSkyClock()
  if (!c) return
  const now = Date.now()
  const day = worldTime(c, now)
  let at: number | null
  if (id === 'noon' || id === 'night') {
    const [h, m] = FIXED[id]
    at = seoulTimeOn(day, h, m)
  } else {
    const ev = sunEvents(day)
    const t = id === 'dawn' ? ev.rise : ev.set
    at = t === null ? null : t - EVENT_LEAD_MIN * 60_000
  }
  if (at !== null) setSkyClock({ start: at, base: now, speed: c.speed })
}

// 실제 시각, 1배속으로
function reset() {
  const now = Date.now()
  setSkyClock({ start: now, base: now, speed: 1 })
}

export function SkyTimePanel({ onClose }: { onClose: () => void }) {
  const clock = useSkyClock()
  const [shown, setShown] = useState('') // 지금 하늘 시각 글자

  useEffect(() => {
    const tick = () => {
      const c = getSkyClock()
      setShown(c ? seoulClockText(worldTime(c, Date.now())) : '')
    }
    tick()
    const t = setInterval(tick, TICK_MS)
    return () => clearInterval(t)
  }, [])

  return (
    // 누른 버튼에 초점이 남지 않게: 남으면 점프(Space)·E 를 누를 때 그 버튼이 다시 눌림
    <div style={styles.box} onMouseDown={(e) => e.preventDefault()}>
      <div style={styles.head}>
        <span>
          🕒 하늘 시간 <b style={styles.time}>{shown}</b> {clock && (clock.speed === 0 ? '(멈춤)' : `(×${clock.speed})`)}
        </span>
        <button type="button" style={styles.close} onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </div>
      <div style={styles.row}>
        {JUMPS.map((j) => (
          <button key={j.id} type="button" style={styles.button} onClick={() => jump(j.id)}>
            {j.label}
          </button>
        ))}
      </div>
      <div style={styles.row}>
        <span style={styles.label}>빠르기</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            style={{ ...styles.button, ...(clock?.speed === s ? styles.on : null) }}
            onClick={() => setSpeed(s)}
          >
            {s === 0 ? '멈춤' : `${s}×`}
          </button>
        ))}
      </div>
      <button type="button" style={{ ...styles.button, width: '100%' }} onClick={reset}>
        지금 시각으로
      </button>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  box: {
    position: 'fixed', top: 96, left: 16, zIndex: 12, width: 'min(330px, calc(100vw - 32px))',
    display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 12,
    background: 'rgba(32,35,42,.9)', color: '#fff', font: '13px/1.4 system-ui, sans-serif',
  },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  time: { fontVariantNumeric: 'tabular-nums', fontSize: 15 },
  close: { border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', font: 'inherit' },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  label: { opacity: 0.8, marginRight: 2 },
  button: {
    padding: '4px 8px', borderRadius: 6, border: '1px solid #4b5563', background: 'transparent',
    color: '#fff', cursor: 'pointer', font: 'inherit',
  },
  on: { border: 'none', background: '#22c55e', color: '#0b1a10', fontWeight: 600 },
}
