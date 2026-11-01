// 가방 시계 알람 소리 "띠리리리". 소리 파일 없이 브라우저가 만듭니다(Web Audio, src/chat/sound.ts 와 같은 방식).
// 직접 맞춘 알람이라 "소리 끔"·"방해금지"와 무관하게 울립니다(설계 3.3).
// 브라우저는 사용자가 화면을 누르기 전에는 소리를 막습니다. 그래서 알람을 맞추는 버튼을 누를 때 prepareAlarmSound 로
// 미리 준비해 둡니다. 새로고침 뒤 아무것도 안 눌렀으면 막힐 수 있고, 그때 startAlarmSound 는 false 를 돌려줍니다.

const BEEP_HZ = 1568 // 솔(G6): 높고 또렷한 알람 음
const BEEP_MS = 120 // 삐 한 번 길이
const BEEP_GAP_MS = 60 // 삐 사이
const BEEPS = 4 // 한 묶음에 삐 4번 ("띠리리리")
const REST_MS = 600 // 묶음 사이 쉼
const VOLUME = 0.2

let ctx: AudioContext | null = null
let timer: number | null = null

// 사용자가 누른 순간에 불러 주세요 (소리 허용)
export function prepareAlarmSound(): void {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    // 소리를 못 내도 알람 창은 뜹니다
  }
}

function playBurst(c: AudioContext) {
  const t0 = c.currentTime
  for (let i = 0; i < BEEPS; i++) {
    const at = t0 + (i * (BEEP_MS + BEEP_GAP_MS)) / 1000
    const tone = c.createOscillator()
    const gain = c.createGain()
    tone.type = 'sine'
    tone.frequency.setValueAtTime(BEEP_HZ, at)
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(VOLUME, at + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + BEEP_MS / 1000)
    tone.connect(gain).connect(c.destination)
    tone.start(at)
    tone.stop(at + BEEP_MS / 1000 + 0.02)
  }
}

// 울리기 시작 (이미 울리는 중이면 그대로). 소리가 막혀 있으면 false
export function startAlarmSound(): boolean {
  try {
    ctx ??= new AudioContext()
    if (ctx.state !== 'running') {
      void ctx.resume()
      return false
    }
    if (timer !== null) return true
    const c = ctx
    playBurst(c)
    timer = window.setInterval(() => playBurst(c), BEEPS * (BEEP_MS + BEEP_GAP_MS) + REST_MS)
    return true
  } catch {
    return false
  }
}

export function stopAlarmSound(): void {
  if (timer !== null) window.clearInterval(timer)
  timer = null
}
