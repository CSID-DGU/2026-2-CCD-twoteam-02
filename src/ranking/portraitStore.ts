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
