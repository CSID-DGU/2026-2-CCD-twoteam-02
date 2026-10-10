// 팔 트래킹 계산: Pose 관절 위치 → 캐릭터 팔 방향. React·three.js 와 무관한 순수 로직입니다.
//
// 캐릭터 팔은 관절 없는 막대 하나라 어깨 회전만 표현할 수 있습니다.
// 그래서 "어깨에서 어디를 향하는지" 방향 하나만 구합니다.

export const POSE_HZ = 15; // 팔 트래킹용 Pose 인식 횟수(초당). 그 사이는 캐릭터 쪽에서 부드럽게 이어 붙입니다.
export const SHOULDER_VISIBLE = 0.5; // 어깨가 이 값보다 덜 보이면 그 팔은 "모름"
export const WRIST_ON = 0.6; // 손목이 이 값보다 잘 보이면 어깨→손목 기준으로 바꿉니다.
export const WRIST_OFF = 0.4; // 이 값보다 덜 보여야 어깨→팔꿈치로 돌아갑니다. (기준이 왔다 갔다 떨리지 않게)
export const ELBOW_VISIBLE = 0.5; // 팔꿈치 기준을 쓸 수 있는 최소값

// MediaPipe Pose 3D 좌표(미터, 골반 중심). y 는 아래가 +, z 는 카메라 쪽이 -.
export type Joint = { x: number; y: number; z: number; visibility: number };
export type ArmJoints = { shoulder: Joint; elbow: Joint; wrist: Joint };
export type ArmTarget = "wrist" | "elbow" | null; // 어느 관절을 향할지. null 이면 모름
export type Direction = { x: number; y: number; z: number }; // 캐릭터 기준 단위 벡터

// 손목이 잘 보이면 손목, 아니면 팔꿈치를 향합니다. prev 는 직전 선택(떨림 방지용)입니다.
export function pickTarget(arm: ArmJoints | null, prev: ArmTarget): ArmTarget {
  if (!arm || arm.shoulder.visibility < SHOULDER_VISIBLE) return null;
  const wristLimit = prev === "wrist" ? WRIST_OFF : WRIST_ON;
  if (arm.wrist.visibility > wristLimit) return "wrist";
  if (arm.elbow.visibility > ELBOW_VISIBLE) return "elbow";
  return null;
}

// 어깨 → 목표 관절 방향을 캐릭터 기준으로 바꿉니다.
// 거울처럼 움직이도록 맞추면 Pose 좌표의 세 축이 모두 뒤집힙니다.
//   x: 거울 (내 오른쪽이 화면 오른쪽)
//   y: Pose 는 아래가 +, three.js 는 위가 +
//   z: Pose 는 카메라 쪽이 -, 캐릭터는 카메라(+Z)를 보고 있음
export function armDirection(arm: ArmJoints | null, target: ArmTarget): Direction | null {
  if (!arm || !target) return null;
  const end = arm[target];
  const x = -(end.x - arm.shoulder.x);
  const y = -(end.y - arm.shoulder.y);
  const z = -(end.z - arm.shoulder.z);
  const len = Math.hypot(x, y, z);
  if (len < 1e-6) return null;
  return { x: x / len, y: y / len, z: z / len };
}
