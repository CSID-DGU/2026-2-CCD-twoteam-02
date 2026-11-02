// 캠리단길 분수 소리 "쏴아 + 똑똑". 소리 파일 없이 브라우저가 만듭니다(Web Audio, campfireSound 와 같은 방식).
//   쏴아: 흰 잡음을 물소리 높이(띠 소리 bandpass)만 남겨 계속 깔고, 천천히 크기가 일렁이게 (물줄기가 떨어지는 소리)
//   웅웅: 같은 잡음의 낮은 소리만 아주 작게 (수반에 물이 고이는 소리)
//   똑똑: 짧은 사인파가 높은 음에서 뚝 떨어지는 소리(물방울). 간격·높이·세기를 매번 다르게
// 크기는 setFountainVolume(0~1)으로 (분수와의 거리, fountainLogic.fountainLoudness). 0 이면 물방울도 멈춤.
// 브라우저는 사용자가 화면을 누르거나 키를 치기 전에는 소리를 막습니다. 광장에서는 이미 키보드를 쓰므로 대부분 바로 납니다.

const MAX = 0.25 // 가장 가까울 때 전체 크기
const RUSH = 0.25 // 쏴아 (약하게: 물방울 소리가 들릴 만큼)
const LOW = 0.18
const DROP_GAP: [number, number] = [90, 380] // 물방울 사이 (ms)

let ctx: AudioContext | null = null
let master: GainNode | null = null
let rush: GainNode | null = null
let timer: number | null = null
let volume = 0

function noiseBuffer(c: AudioContext) {
  const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return b
}

function start() {
  if (ctx) return ctx
  const c = new AudioContext()
  master = c.createGain()
  master.gain.value = 0
  master.connect(c.destination)
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c)
  src.loop = true
  // 쏴아
  const band = c.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 1600
  band.Q.value = 0.5
  const soft = c.createBiquadFilter()
  soft.type = 'lowpass'
  soft.frequency.value = 5000
  rush = c.createGain()
  rush.gain.value = RUSH
  src.connect(band).connect(soft).connect(rush).connect(master)
  // 웅웅
  const low = c.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 300
  const lowGain = c.createGain()
  lowGain.gain.value = LOW
  src.connect(low).connect(lowGain).connect(master)
  src.start()
  ctx = c
  return c
}

function drop(c: AudioContext, at: number) {
  if (!master) return
  const o = c.createOscillator()
  const g = c.createGain()
  const f = 900 + Math.random() * 1500
  const len = 0.03 + Math.random() * 0.04
  o.type = 'sine'
  o.frequency.setValueAtTime(f * 1.6, at)
  o.frequency.exponentialRampToValueAtTime(f, at + len) // 똑: 높은 음에서 뚝 떨어짐
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.12, at + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, at + len)
  o.connect(g).connect(master)
  o.start(at)
  o.stop(at + len + 0.02)
}

function tick() {
  timer = null
  if (!ctx || volume <= 0) return
  const now = ctx.currentTime
  drop(ctx, now)
  if (Math.random() < 0.25) drop(ctx, now + 0.04 + Math.random() * 0.08)
  rush?.gain.setTargetAtTime(RUSH * (0.85 + Math.random() * 0.3), now, 0.4) // 물소리가 조금씩 일렁임
  const [a, b] = DROP_GAP
  timer = window.setTimeout(tick, a + Math.random() * (b - a))
}

// 0~1. 매 프레임 불러도 됨 (바뀔 때만 일함)
export function setFountainVolume(v: number) {
  const next = Math.max(0, Math.min(1, v))
  if (Math.abs(next - volume) < 0.01 && !(next === 0 && volume !== 0)) return
  volume = next
  try {
    if (volume > 0) start()
    if (!ctx || !master) return
    if (ctx.state === 'suspended') void ctx.resume()
    master.gain.setTargetAtTime(volume * MAX, ctx.currentTime, 0.3)
    if (volume > 0 && timer === null) tick()
  } catch {
    // 소리를 못 내도 분수는 그대로 보입니다
  }
}

// 광장을 떠나면 (화면이 사라질 때) 조용히
export function stopFountainSound() {
  setFountainVolume(0)
  if (timer !== null) window.clearTimeout(timer)
  timer = null
}
