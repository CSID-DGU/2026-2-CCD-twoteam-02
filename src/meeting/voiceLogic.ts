// 회의실 음성 계산 (#46). React·브라우저 API와 무관한 순수 로직입니다.
//
// 연결 방식: 참석자끼리 한 줄씩 직접 연결합니다(메시, 최대 8명이면 한 사람당 7줄).
// 두 사람 중 누가 연결을 거는지(offer 를 보내는지)를 계정 번호 순서로 정해, 양쪽이 동시에 걸어 꼬이는 일을 막습니다.

// 무료 공용 STUN 서버. 내 브라우저의 바깥 주소를 알아내는 데만 쓰고, 음성은 이 서버를 거치지 않습니다.
// 학교·회사 와이파이처럼 막힌 곳에서 연결이 안 되면 중계 서버(TURN)가 필요할 수 있습니다(이슈 #46 "확인할 것").
export const ICE_SERVERS: { urls: string }[] = [{ urls: 'stun:stun.l.google.com:19302' }]

export const CONNECT_TIMEOUT_MS = 10000 // 연결을 건 뒤 이 시간 안에 이어지지 않으면 다시 겁니다
export const SPEAKING_LEVEL = 0.02 // 소리 크기(RMS, 0~1)가 이보다 크면 말하는 중으로 봅니다
export const SPEAKING_HOLD_MS = 400 // 말이 잠깐 끊겨도 이 시간 동안은 말하는 중으로 둡니다(🔊 가 깜빡이지 않게)

// 내가 연결을 거는 쪽인지. 계정 번호가 작은 쪽이 겁니다.
export function isCaller(myId: string, otherId: string): boolean {
  return myId < otherId
}

// 소리 크기(RMS). 분석기에서 받은 -1~1 범위의 소리 값들.
export function rms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

// 말하는 중인지. lastLoudAt: 마지막으로 SPEAKING_LEVEL 을 넘은 시각(ms)
export function isSpeaking(lastLoudAt: number | null, now: number): boolean {
  return lastLoudAt !== null && now - lastLoudAt < SPEAKING_HOLD_MS
}

// 주고받는 신호. offer·answer 는 연결 조건(SDP), ice 는 연결할 수 있는 주소 후보입니다.
export type VoiceSignal =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: RTCIceCandidateInit }

// 받은 신호가 모양이 맞는지 확인합니다. 같은 회의 사람만 보낼 수 있지만, 모양이 틀린 값은 버립니다.
export function parseSignal(data: unknown): VoiceSignal | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if ((d.kind === 'offer' || d.kind === 'answer') && typeof d.sdp === 'string') return { kind: d.kind, sdp: d.sdp }
  if (d.kind === 'ice' && d.candidate && typeof d.candidate === 'object') return { kind: 'ice', candidate: d.candidate as RTCIceCandidateInit }
  return null
}
