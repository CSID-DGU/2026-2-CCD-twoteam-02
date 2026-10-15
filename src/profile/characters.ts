// 고를 수 있는 캐릭터 목록과 내 캐릭터가 바뀌었다는 알림 (React와 무관한 순수 모듈)
//
// 캐릭터는 public/models/character-<글자>.glb 이고, DB(profiles.avatar.model)도 a~r 만 받습니다(0010, 0015).
// 두 쪽이 같은 목록이어야 하므로 글자를 바꾸면 DB 제약도 같이 바꿔야 합니다.

export const CHARACTER_MODELS = 'abcdefghijklmnopqr'.split('') // 18종
export const DEFAULT_MODEL = 'a' // 가입하면 처음 받는 캐릭터

export const modelUrl = (model: string) => `/models/character-${model}.glb`

export function isCharacterModel(value: unknown): value is string {
  return typeof value === 'string' && CHARACTER_MODELS.includes(value)
}

// 내 프로필(캐릭터·닉네임)을 바꿨다고 같은 브라우저 안의 다른 화면에 알립니다.
// 내 캐릭터 화면은 다시 읽고, 지점은 다른 참여자에게 "다시 읽어 달라"고 알립니다. (#131)
const CHANGED = 'dooteum:my-profile-changed'

export function announceMyProfileChanged() {
  window.dispatchEvent(new Event(CHANGED))
}

export function onMyProfileChanged(listener: () => void) {
  window.addEventListener(CHANGED, listener)
  return () => window.removeEventListener(CHANGED, listener)
}
