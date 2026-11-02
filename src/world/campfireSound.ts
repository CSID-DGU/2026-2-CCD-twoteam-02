// 캠프파이어 장작 소리 "타닥타닥". 소리 파일 없이 브라우저가 만듭니다(Web Audio, src/chat/sound.ts 와 같은 방식).
//   흰 잡음 한 조각(10~60ms)을 띠 소리(bandpass)로 짧게 튕김. 간격·높이·세기를 매번 다르게, 가끔 두 번 연달아.
//   불이 타는 "화르르" 바탕 소리는 넣지 않음 (사용자 요청: 장작 소리만)
// 크기는 setCampfireVolume(0~1)으로 (불과의 거리, campfireLogic.fireLoudness). 0 이면 타닥 소리도 멈춤.
// 브라우저는 사용자가 화면을 누르거나 키를 치기 전에는 소리를 막습니다. 광장에서는 이미 키보드를 쓰므로 대부분 바로 납니다.

const MAX = 0.5 // 가장 가까울 때 전체 크기
const CRACKLE_GAP: [number, number] = [70, 420] // 타닥 사이 (ms)

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noise: AudioBuffer | null = null
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
  noise = noiseBuffer(c)
  master = c.createGain()
  master.gain.value = 0
  master.connect(c.destination)
  ctx = c
  return c
}

function crackle(c: AudioContext, at: number) {
  if (!noise || !master) return
  const len = 0.01 + Math.random() * 0.05
  const src = c.createBufferSource()
  src.buffer = noise
  const band = c.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 1200 + Math.random() * 4000
  band.Q.value = 0.8 + Math.random() * 2
  const g = c.createGain()
  const peak = 0.4 + Math.random() * 1.4
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(peak, at + 0.002)
  g.gain.exponentialRampToValueAtTime(0.0001, at + len)
  src.connect(band).connect(g).connect(master)
  src.start(at, Math.random() * 1.5, len + 0.02)
}

function tick() {
  timer = null
  if (!ctx || volume <= 0) return
  const now = ctx.currentTime
  crackle(ctx, now)
  if (Math.random() < 0.3) crackle(ctx, now + 0.03 + Math.random() * 0.06) // 탁-탁 두 번
  const [a, b] = CRACKLE_GAP
  timer = window.setTimeout(tick, a + Math.random() * (b - a))
}

// 0~1. 매 프레임 불러도 됨 (바뀔 때만 일함)
export function setCampfireVolume(v: number) {
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
    // 소리를 못 내도 캠프파이어는 그대로 보입니다
  }
}

// 광장을 떠나면 (화면이 사라질 때) 조용히
export function stopCampfireSound() {
  setCampfireVolume(0)
  if (timer !== null) window.clearTimeout(timer)
  timer = null
}
