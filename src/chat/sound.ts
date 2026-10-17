// 귓속말 알림음 (#49). 소리 파일 없이 브라우저가 짧은 "띵"을 만듭니다(Web Audio).
// 브라우저는 사용자가 화면을 한 번이라도 누르거나 키를 치기 전에는 소리를 막습니다.
// 로비·지점에서는 이미 키보드·마우스를 썼으므로 대부분 바로 울립니다. 막히면 조용히 넘어갑니다.

let audio: AudioContext | null = null

export function playDing() {
  try {
    audio ??= new AudioContext()
    const now = audio.currentTime
    const tone = audio.createOscillator()
    const gain = audio.createGain()
    tone.type = 'sine'
    tone.frequency.setValueAtTime(880, now) // 라(A5)
    tone.frequency.setValueAtTime(1320, now + 0.08) // 한 번 올라가는 두 음
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3)
    tone.connect(gain).connect(audio.destination)
    tone.start(now)
    tone.stop(now + 0.32)
  } catch {
    // 소리를 못 내도 채팅은 그대로 동작합니다.
  }
}
