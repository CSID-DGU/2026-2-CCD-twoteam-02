// 얼굴 트래킹 결과 → 캐릭터 머리 각도·눈 감김 (화면·three.js와 무관한 순수 로직)
//
// 내 모습 화면(TrackedCharacter)과, 다른 참여자에게 보내는 내 고개·눈(#129)이 같은 계산을 씁니다.
//
// 거울과 실제 방향:
//   내 모습 화면은 거울처럼 보여야 자연스럽습니다. 내가 왼쪽을 보면 화면 속 캐릭터도 화면 왼쪽을 봅니다.
//   다른 사람 화면에서는 거울이 아니라 실제 방향이어야 합니다. 내가 내 왼쪽을 보면 캐릭터도 자기 왼쪽을 봅니다.
//   거울은 좌우를 뒤집으므로 좌우(yaw)·갸웃(roll)의 부호만 반대가 되고 위아래(pitch)는 같습니다.
// 거울처럼 움직이게 하는 부호입니다. 방향이 반대로 보이면 1과 -1을 바꾸세요.
const MIRROR_YAW = -1; // 좌우
const MIRROR_PITCH = 1; // 위아래
const MIRROR_ROLL = -1; // 갸웃

// 캐릭터 눈 감김 기준 (eyeBlink 점수). 집중 판정은 이제 공부 시작 때 보정한 눈 크기(EAR)를 써서 이 값과 따로 갑니다.
// 예전 판정과 같은 값을 그대로 둡니다. (측정: 정면에서 뜸 11~19%, 감음 50~52%)
export const BLINK_THRESHOLD = 0.4; // 이 값보다 크면 눈을 감은 것으로 봅니다.
export const BLINK_OPEN_THRESHOLD = 0.3; // 이 값보다 작아져야 다시 뜬 것으로 봅니다. (깜빡거림 방지)

export type FaceInput = { found: boolean; yaw: number; pitch: number; roll: number; blink: number };
export type HeadAngles = { yaw: number; pitch: number; roll: number }; // 캐릭터 머리 회전(라디안)

// 캐릭터 머리 각도. 얼굴을 못 찾았으면 null (받는 쪽은 정면으로 천천히 돌아갑니다)
export function headAngles(face: FaceInput, mirror: boolean): HeadAngles | null {
  if (!face.found) return null;
  const flip = mirror ? 1 : -1; // 실제 방향이면 좌우·갸웃만 뒤집습니다.
  return {
    yaw: face.yaw * MIRROR_YAW * flip,
    pitch: face.pitch * MIRROR_PITCH,
    roll: face.roll * MIRROR_ROLL * flip,
  };
}

// 눈을 감았는지. 이미 감은 상태면 더 크게 떠야 뜬 것으로 칩니다. 얼굴을 못 찾으면 뜬 것으로 봅니다.
export function nextEyesClosed(prev: boolean, face: FaceInput): boolean {
  const limit = prev ? BLINK_OPEN_THRESHOLD : BLINK_THRESHOLD;
  return face.found && face.blink > limit;
}
