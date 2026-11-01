// 딱밤 "딱!" 소리 (#304). 소리 파일 없이 브라우저(Web Audio)에서 바로 만듭니다.
// 짧은 잡음(손가락이 이마에 닿는 소리) + 높은음이 빠르게 떨어지는 소리를 0.12초 동안 겹칩니다.
let ctx: AudioContext | null = null

export function playFlickSound() {
  try {
    ctx ??= new AudioContext()
    const now = ctx.currentTime
    // 잡음: 아주 짧게 터졌다 사라짐
    const len = Math.floor(ctx.sampleRate * 0.05)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3
    const noise = ctx.createBufferSource()
    noise.buffer = buf
    const noiseGain = ctx.createGain()
    noiseGain.gain.value = 0.6
    noise.connect(noiseGain).connect(ctx.destination)
    noise.start(now)
    // "딱": 1600Hz 에서 500Hz 로 빠르게 떨어지는 소리
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(1600, now)
    osc.frequency.exponentialRampToValueAtTime(500, now + 0.08)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.35, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.13)
  } catch {
    // 소리를 못 내는 브라우저면 흔들림·문구만
  }
}
