// 지점 배경 소리 (휴식방 물소리). 소리 파일 없이 브라우저가 직접 만듭니다(Web Audio).
// 파일이 없으니 저작권 걱정이 없고, 받는 시간·용량도 없습니다. (귓속말 알림음 chat/sound.ts 와 같은 방식)
//
// 시냇물 소리 = 네 겹을 섞습니다.
//   흐름: 가운데 높이만 남긴 잡음을 아주 작게 깐 바탕
//   반짝임: 높은 잡음을 작게. 물 표면이 부서지는 "쏴" 느낌
//   졸졸: 짧게 "퐁" 하고 올라가는 소리를 촘촘하고 불규칙하게 (돌 사이로 흐르는 소리의 핵심)
//   똑: 가끔 맑게 울리는 물방울 하나 (상쾌한 느낌)
// 처음엔 낮은 잡음(갈색 잡음)을 크게 깔고 느리게 출렁이게 했는데, 바람 소리처럼 들려서(사용자 의견, 2026-10-31)
// 낮은 소리와 느린 출렁임을 빼고 물방울 쪽을 늘렸습니다.
//
// 브라우저는 화면을 누르거나 키를 치기 전에는 소리를 막습니다. 지점에 들어올 때 이미 키를 눌렀으므로 대부분 바로 나고,
// 막혀 있으면 다음에 누르거나 칠 때 시작합니다.
// 켜고 끈 것·음량은 이 브라우저에 기억합니다(마우스 감도와 같은 방식, DB 변경 없음).

export type AmbienceKind = 'stream' | 'waves' // 시냇물, 파도. 다른 소리를 더하면 여기에 이름을 늘립니다

const BASE_GAIN = 0.5 // 음량 100% 일 때 전체 크기. 공부·쉬는 데 거슬리지 않게 작게
const FADE_IN = 2.5 // 들어오면 이만큼(초) 천천히 커짐
const FADE_OUT = 0.8 // 나가거나 끄면 이만큼(초) 줄어들고 멈춤
const NOISE_SECONDS = 4 // 반복 재생할 잡음 길이(초). 너무 짧으면 반복이 들림
const FLOW_FREQ = 900 // 흐름: 가운데 높이(Hz). 낮은 웅웅거림(바람 같음)은 뺌
const FLOW_GAIN = 0.05
const SPARKLE_FREQ = 4500 // 반짝임: 이 높이(Hz) 위만
const SPARKLE_GAIN = 0.025
const BUBBLE_GAP_MS = [15, 90] // 졸졸 방울 사이 간격(ms) 범위. 촘촘할수록 물이 많이 흐르는 느낌
const BUBBLE_GAIN = [0.01, 0.045] // 방울 하나의 크기 범위
const BUBBLE_FREQ = [700, 2400] // 방울이 시작하는 높이(Hz) 범위. 짧게 1.8배까지 올라감
const BUBBLE_SECONDS = 0.045 // 방울 하나의 길이
const DRIP_GAP_MS = [900, 3200] // 똑 사이 간격(ms) 범위
const DRIP_GAIN = 0.05
const DRIP_FREQ = [1600, 3000] // 똑 높이(Hz) 범위

// 파도: 잡음을 낮은 쪽만 남겨 밀려오고 빠지게. 두 겹이 서로 다른 주기로 겹쳐 일정하게 반복되는 느낌을 없앰
const WAVE_SECONDS = [8, 14] // 파도 하나가 밀려왔다 빠지는 길이(초) 범위
const WAVE_GAIN = [0.12, 0.34] // 파도 하나의 크기 범위
const WAVE_FREQ = { low: 320, high: 1250 } // 빠졌을 때·부서질 때 필터 높이(Hz)
const WAVE_RISE = 0.4 // 파도 길이 중 커지는 데 쓰는 비율
const WAVE_BED = 0.05 // 파도 사이에도 깔리는 바다 소리
const WAVE_BED_FREQ = 420
const WAVE_FOAM = { freq: 3200, gain: 0.05, delay: 0.3 } // 부서진 뒤 거품 소리: 높이, 크기, 파도 길이 중 시작 위치
const WAVE_LAYER_GAP = 4500 // 둘째 겹이 늦게 시작하는 시간(ms)
const LEVEL_SECONDS = 0.6 // 위치에 따라 크기가 바뀌는 데 걸리는 시간(초)

const between = ([lo, hi]: number[]) => lo + Math.random() * (hi - lo)

// 흰 잡음(모든 높이가 고르게) 한 토막
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buf
}

function loop(ctx: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  return src
}

// setLevel: 사용자 음량에 곱하는 크기 0~1 (물과의 거리 등). 부드럽게 바뀜
export type AmbienceHandle = { setVolume: (volume: number) => void; setLevel: (level: number) => void; stop: () => void }

// 배경 소리를 시작합니다. volume 0~1. 돌려받은 stop 으로 끕니다(서서히 줄어든 뒤 정리).
export function startAmbience(kind: AmbienceKind, volume: number): AmbienceHandle | null {
  let ctx: AudioContext
  try {
    ctx = new AudioContext()
  } catch {
    return null // 소리를 못 내도 화면은 그대로 동작합니다.
  }
  const now = ctx.currentTime
  const master = ctx.createGain()
  master.gain.setValueAtTime(0.0001, now)
  master.gain.linearRampToValueAtTime(BASE_GAIN * volume, now + FADE_IN)
  const levelGain = ctx.createGain() // 위치에 따른 크기 (사용자 음량과 따로)
  master.connect(levelGain).connect(ctx.destination)
  const sources: AudioScheduledSourceNode[] = []

  if (kind === 'stream') {
    const white = noiseBuffer(ctx)
    // 흐름: 가운데 높이만 아주 작게
    const flow = loop(ctx, white)
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = FLOW_FREQ
    band.Q.value = 0.6
    const flowGain = ctx.createGain()
    flowGain.gain.value = FLOW_GAIN
    flow.connect(band).connect(flowGain).connect(master)
    // 반짝임: 높은 소리만 작게
    const sparkle = loop(ctx, white)
    const high = ctx.createBiquadFilter()
    high.type = 'highpass'
    high.frequency.value = SPARKLE_FREQ
    const sparkleGain = ctx.createGain()
    sparkleGain.gain.value = SPARKLE_GAIN
    sparkle.connect(high).connect(sparkleGain).connect(master)
    sources.push(flow, sparkle)
  }
  const waveTimers: number[] = []
  if (kind === 'waves') {
    const white = noiseBuffer(ctx)
    const bed = loop(ctx, white)
    const bedFilter = ctx.createBiquadFilter()
    bedFilter.type = 'lowpass'
    bedFilter.frequency.value = WAVE_BED_FREQ
    const bedGain = ctx.createGain()
    bedGain.gain.value = WAVE_BED
    bed.connect(bedFilter).connect(bedGain).connect(master)
    sources.push(bed)
    // 파도 한 겹: 필터가 열리며 커졌다가 닫히며 줄어듦. 끝나면 다음 파도를 불규칙한 길이로
    const layer = (slot: number) => {
      const src = loop(ctx, white)
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = WAVE_FREQ.low
      const gain = ctx.createGain()
      gain.gain.value = 0
      src.connect(filter).connect(gain).connect(master)
      const foam = loop(ctx, white)
      const high = ctx.createBiquadFilter()
      high.type = 'highpass'
      high.frequency.value = WAVE_FOAM.freq
      const foamGain = ctx.createGain()
      foamGain.gain.value = 0
      foam.connect(high).connect(foamGain).connect(master)
      sources.push(src, foam)
      const swell = () => {
        const t = ctx.currentTime
        const len = between(WAVE_SECONDS)
        const peak = t + len * WAVE_RISE
        const top = between(WAVE_GAIN)
        gain.gain.cancelScheduledValues(t)
        gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t)
        gain.gain.linearRampToValueAtTime(top, peak)
        gain.gain.linearRampToValueAtTime(0.0001, t + len)
        filter.frequency.cancelScheduledValues(t)
        filter.frequency.setValueAtTime(WAVE_FREQ.low, t)
        filter.frequency.exponentialRampToValueAtTime(WAVE_FREQ.high, peak)
        filter.frequency.exponentialRampToValueAtTime(WAVE_FREQ.low, t + len)
        foamGain.gain.cancelScheduledValues(t)
        foamGain.gain.setValueAtTime(0, t + len * WAVE_FOAM.delay)
        foamGain.gain.linearRampToValueAtTime(WAVE_FOAM.gain * (top / WAVE_GAIN[1]), peak + 0.4)
        foamGain.gain.linearRampToValueAtTime(0, t + len)
        waveTimers[slot] = window.setTimeout(swell, len * 1000)
      }
      return swell
    }
    const first = layer(0)
    const second = layer(1)
    first()
    waveTimers[2] = window.setTimeout(second, WAVE_LAYER_GAP)
  }
  sources.forEach((s) => s.start())

  // 짧은 사인파 하나: f0 에서 rise 배까지 미끄러지며 올라가고 seconds 동안 줄어듦
  const ping = (f0: number, rise: number, gain: number, seconds: number) => {
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.exponentialRampToValueAtTime(f0 * rise, t + Math.min(seconds, 0.05))
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds)
    osc.connect(g).connect(master)
    osc.start(t)
    osc.stop(t + seconds + 0.01)
  }
  // 졸졸 방울과 가끔 똑. 다음 것은 불규칙한 간격 뒤에
  const timers = { bubble: 0, drip: 0 }
  const bubble = () => {
    ping(between(BUBBLE_FREQ), 1.8, between(BUBBLE_GAIN), BUBBLE_SECONDS)
    timers.bubble = window.setTimeout(bubble, between(BUBBLE_GAP_MS))
  }
  const drip = () => {
    ping(between(DRIP_FREQ), 1.3, DRIP_GAIN, 0.25)
    timers.drip = window.setTimeout(drip, between(DRIP_GAP_MS))
  }
  if (kind === 'stream') {
    timers.bubble = window.setTimeout(bubble, between(BUBBLE_GAP_MS))
    timers.drip = window.setTimeout(drip, between(DRIP_GAP_MS))
  }

  // 소리가 막혀 있으면 다음에 누르거나 칠 때 시작합니다.
  const resume = () => void ctx.resume()
  if (ctx.state === 'suspended') {
    window.addEventListener('pointerdown', resume)
    window.addEventListener('keydown', resume)
  }
  const unlisten = () => {
    window.removeEventListener('pointerdown', resume)
    window.removeEventListener('keydown', resume)
  }
  ctx.onstatechange = () => {
    if (ctx.state === 'running') unlisten()
  }

  let stopped = false
  return {
    setVolume(v) {
      if (stopped) return
      master.gain.cancelScheduledValues(ctx.currentTime)
      master.gain.setTargetAtTime(BASE_GAIN * v, ctx.currentTime, 0.1)
    },
    setLevel(level) {
      if (stopped) return
      levelGain.gain.setTargetAtTime(level, ctx.currentTime, LEVEL_SECONDS)
    },
    stop() {
      if (stopped) return
      stopped = true
      waveTimers.forEach((id) => window.clearTimeout(id))
      window.clearTimeout(timers.bubble)
      window.clearTimeout(timers.drip)
      unlisten()
      const t = ctx.currentTime
      master.gain.cancelScheduledValues(t)
      master.gain.setValueAtTime(master.gain.value, t)
      master.gain.linearRampToValueAtTime(0.0001, t + FADE_OUT)
      window.setTimeout(() => void ctx.close(), FADE_OUT * 1000 + 100)
    },
  }
}

// ── 이 브라우저에 기억하는 켜기·음량 ─────────────────────────────
export type AmbiencePref = { on: boolean; volume: number }
const STORAGE_KEY = 'dooteum.ambience'
const DEFAULT_PREF: AmbiencePref = { on: true, volume: 0.6 }

// key·fallback: 다른 소리(광장 캠프파이어·분수, useNearSounds)도 같은 모양으로 따로 기억할 때
export function loadAmbiencePref(key = STORAGE_KEY, fallback = DEFAULT_PREF): AmbiencePref {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (raw && typeof raw.on === 'boolean' && typeof raw.volume === 'number') {
      return { on: raw.on, volume: Math.min(1, Math.max(0, raw.volume)) }
    }
  } catch {
    // 읽지 못하면 기본값
  }
  return { ...fallback }
}

export function saveAmbiencePref(pref: AmbiencePref, key = STORAGE_KEY) {
  try {
    localStorage.setItem(key, JSON.stringify(pref))
  } catch {
    // 기억하지 못해도 이번 접속에서는 바꾼 값을 씁니다.
  }
}
