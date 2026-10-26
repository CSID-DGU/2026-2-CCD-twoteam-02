// 캐릭터 3D 모델과 내 캐릭터가 바뀌었다는 알림 (React와 무관한 순수 모듈)
//
// 캐릭터 18종(public/models/character-a~r.glb)은 3D 모양·관절·동작이 모두 같고 스킨 그림만 다릅니다.
// 그래서 모든 캐릭터가 모델 하나(a)를 쓰고, 스킨은 고른 부품을 겹쳐 만든 그림으로 입힙니다(캐릭터 꾸미기, #56, src/avatar/).
// 화면 부품들은 캐릭터를 "아바타 키" 글자로 주고받습니다(avatarLogic.avatarKey).

export const BASE_MODEL_URL = '/models/character-a.glb'
export const DEFAULT_MODEL = 'a' // 가입하면 처음 받는 차림 (캐릭터 a 의 머리·상의·하의)

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
