// 팀 전용 하늘 조절판. 광장·캠퍼스 메뉴의 "하늘 조절"(팀 계정에만 보임)으로 엽니다.
//
// 하늘을 둘러보며 쓸 수 있게 창(InfoPanel)이 아니라 화면 왼쪽 위에 작게 띄웁니다. 창이 뜨면 캐릭터·시점이 멈추기 때문입니다.
//   시각 버튼  동틀 녘·해 질 녘(그날 일출·일몰 EVENT_LEAD_MIN 분 전), 정오, 밤
//   빠르기     지금 하늘 시각에서 끊기지 않고 이어서 빨라지거나 느려짐 (skyLogic 의 retime)
//   날씨       실제(서울 날씨) · 맑음 · 흐림 · 비 · 눈(쌓인 모습까지) · 뇌우. 확인용 주소 ?weather= 와 같은 날씨
//   세기       비·눈을 고르면 약하게(0.3) · 보통(0.6) · 강하게(1)
//   눈 쌓임    날씨대로 · 없음 · 조금 · 가득 (날씨와 따로. 맑은 날 쌓인 눈도 볼 수 있음, 주소 ?snowcover= 와 같음)
//   먼 도시    보임 · 숨김 (밤에 지평선에 보이는 빌딩 숲, CitySkyline). 지울지 정하기 전 비교용
//   지금 때    시각 버튼 중 지금 하늘 시각이 들어 있는 때(skyLogic 의 dayPeriod)를 초록으로 칠함. 시간이 흐르면 옮겨 감
//   처음으로   실제 시각·1배속·실제 날씨·날씨대로 쌓임
// 내 화면의 하늘만 바뀝니다(skyClock). 구름 자리·번개 때는 그대로 실제 시각을 따릅니다.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { dayPeriod, retime, seoulClockText, seoulTimeOn, sunEvents, worldTime } from './skyLogic'
import type { DayPeriod } from './skyLogic'
import { COVERS, STRENGTHS, getSkyClock, hasStrength, setSkyClock, setSkyCover, setSkyStrength, setSkyWeather, setSkyline, useSkyClock, useSkyCover, useSkyStrength, useSkyWeatherPick, useSkyline } from './skyClock'
import type { WeatherPick } from './skyClock'

const SPEEDS = [0, 1, 60, 300, 1800] // 0 은 멈춤. 300× 면 1분에 5시간
const EVENT_LEAD_MIN = 20 // 동틀 녘·해 질 녘 버튼: 일출·일몰 이만큼 전으로
const FIXED = { noon: [12, 0], night: [22, 0] } as const
const TICK_MS = 500 // 시각 표시를 다시 그리는 간격

const WEATHERS: { id: WeatherPick | null; label: string }[] = [
  { id: null, label: '실제' },
  { id: 'clear', label: '맑음' },
  { id: 'cloudy', label: '흐림' },
  { id: 'rain', label: '비' },
  { id: 'snow', label: '눈' },
  { id: 'storm', label: '뇌우' },
]

type Jump = DayPeriod
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

// 실제 시각, 1배속, 실제 날씨(세기는 보통), 날씨대로 쌓임으로
function reset() {
  const now = Date.now()
  setSkyClock({ start: now, base: now, speed: 1 })
  setSkyWeather(null)
  setSkyStrength(STRENGTHS[1].value)
  setSkyCover(null)
}

export function SkyTimePanel({ onClose }: { onClose: () => void }) {
  const clock = useSkyClock()
  const weather = useSkyWeatherPick()
  const strength = useSkyStrength()
  const cover = useSkyCover()
  const skyline = useSkyline()
  const [shown, setShown] = useState('') // 지금 하늘 시각 글자
  const [period, setPeriod] = useState<DayPeriod | null>(null) // 지금 하늘 시각이 들어 있는 때 (그 시각 버튼을 칠함)

  useEffect(() => {
    const tick = () => {
      const c = getSkyClock()
      const ms = c ? worldTime(c, Date.now()) : null
      setShown(ms === null ? '' : seoulClockText(ms))
      setPeriod(ms === null ? null : dayPeriod(ms))
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
          🕒 하늘 조절 <b style={styles.time}>{shown}</b> {clock && (clock.speed === 0 ? '(멈춤)' : `(×${clock.speed})`)}
        </span>
        <button type="button" style={styles.close} onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </div>
      <div style={styles.row}>
        {JUMPS.map((j) => (
          <button key={j.id} type="button" style={{ ...styles.button, ...(period === j.id ? styles.on : null) }} onClick={() => jump(j.id)}>
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
      <div style={styles.row}>
        <span style={styles.label}>날씨</span>
        {WEATHERS.map((w) => (
          <button
            key={w.label}
            type="button"
            style={{ ...styles.button, ...(weather === w.id ? styles.on : null) }}
            onClick={() => setSkyWeather(w.id)}
          >
            {w.label}
          </button>
        ))}
      </div>
      {hasStrength(weather) && (
        <div style={styles.row}>
          <span style={styles.label}>세기</span>
          {STRENGTHS.map((s) => (
            <button
              key={s.value}
              type="button"
              style={{ ...styles.button, ...(strength === s.value ? styles.on : null) }}
              onClick={() => setSkyStrength(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <div style={styles.row}>
        <span style={styles.label}>눈 쌓임</span>
        {COVERS.map((c) => (
          <button
            key={c.label}
            type="button"
            style={{ ...styles.button, ...(cover === c.value ? styles.on : null) }}
            onClick={() => setSkyCover(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div style={styles.row}>
        <span style={styles.label}>먼 도시</span>
        {[
          { on: true, label: '보임' },
          { on: false, label: '숨김' },
        ].map((o) => (
          <button key={o.label} type="button" style={{ ...styles.button, ...(skyline === o.on ? styles.on : null) }} onClick={() => setSkyline(o.on)}>
            {o.label}
          </button>
        ))}
        <span style={styles.hint}>밤에만 보여요</span>
      </div>
      <button type="button" style={{ ...styles.button, width: '100%' }} onClick={reset}>
        지금 시각·실제 날씨로
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
  hint: { opacity: 0.6, fontSize: 12 },
  button: {
    padding: '4px 8px', borderRadius: 6, border: '1px solid #4b5563', background: 'transparent',
    color: '#fff', cursor: 'pointer', font: 'inherit',
  },
  on: { border: 'none', background: '#22c55e', color: '#0b1a10', fontWeight: 600 },
}
