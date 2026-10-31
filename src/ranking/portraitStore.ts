// 순위용 캐릭터 얼굴 사진 저장소. React 와 무관한 순수 모듈입니다. (Node 로 검사)
//
// 차림(아바타 키)마다 얼굴 사진(dataURL)을 한 번만 찍어 두고, 게시판·순위 창이 같이 씁니다.
//   requestPortrait  찍어 달라고 줄 세우기 (이미 찍었거나 줄에 있거나 실패한 차림은 무시)
//   nextPortrait     찍을 차례인 차림 (PortraitStudio 가 하나씩 꺼내 찍음)
//   savePortrait     찍은 사진 저장 → 구독자에게 알림
//   failPortrait     찍지 못함 → 다시 시도하지 않고 이니셜로 보임
// 화면을 새로 열면(새로고침) 처음부터 다시 찍습니다. (저장하지 않음)

const photos = new Map<string, string>()
const failed = new Set<string>()
const queue: string[] = []
const listeners = new Set<() => void>()
let version = 0 // 바뀔 때마다 늘어남 (useSyncExternalStore 의 스냅샷)

function emit() {
  version++
  for (const l of listeners) l()
}

export function subscribePortraits(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const portraitsVersion = () => version
export const getPortrait = (key: string): string | null => photos.get(key) ?? null

export function requestPortrait(key: string) {
  if (!key || photos.has(key) || failed.has(key) || queue.includes(key)) return
  queue.push(key)
  emit()
}

export const nextPortrait = (): string | null => queue[0] ?? null

function done(key: string) {
  const i = queue.indexOf(key)
  if (i >= 0) queue.splice(i, 1)
  emit()
}

export function savePortrait(key: string, dataUrl: string) {
  photos.set(key, dataUrl)
  done(key)
}

export function failPortrait(key: string) {
  failed.add(key)
  done(key)
}

// ── 찍는 순서 (PortraitStudio 가 장면마다 부름) ──────────────────────────
// 준비(스킨·얼굴 판·머리카락이 다 붙음) → SETTLE_MS 기다림 → 카메라 겨누기 → 다음 장면에서 찍기.
// 시간 초과는 "아직 준비 안 됨"일 때만, 벽시계가 아니라 그린 장면 수로 셉니다.
// (다른 탭에 다녀오면 그동안 장면이 멈추므로, 돌아와서 바로 실패로 굳지 않게)
export const SETTLE_MS = 600 // 다 붙은 뒤 한 번 더 기다리는 시간
export const TIMEOUT_FRAMES = 600 // 이만큼 그려도 준비가 안 되면 못 찍은 것으로 (60fps 에서 약 10초)

export type CaptureStep = { frames: number; readyAt: number | null; aimed: boolean; done: boolean }
export type CaptureAction = 'wait' | 'aim' | 'shoot' | 'fail'

export const newCaptureStep = (): CaptureStep => ({ frames: 0, readyAt: null, aimed: false, done: false })

export function captureAction(s: CaptureStep, now: number, ready: boolean): CaptureAction {
  if (s.done) return 'wait'
  if (s.readyAt === null) {
    if (ready) {
      s.readyAt = now
      return 'wait'
    }
    if (++s.frames > TIMEOUT_FRAMES) {
      s.done = true
      return 'fail'
    }
    return 'wait'
  }
  if (now - s.readyAt < SETTLE_MS) return 'wait'
  if (!s.aimed) {
    s.aimed = true
    return 'aim'
  }
  s.done = true
  return 'shoot'
}
