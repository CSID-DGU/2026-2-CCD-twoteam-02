// 팔 트래킹 계산: Pose 관절 위치 → 캐릭터 팔 방향. React·three.js 와 무관한 순수 로직입니다.
//
// 캐릭터 팔은 관절 없는 막대 하나라 어깨 회전만 표현할 수 있습니다.
// 그래서 "어깨에서 어디를 향하는지" 방향 하나만 구합니다.
//
// 떨림 줄이기 (#139): 팔 트래킹은 정확도보다 자연스러움이 중요합니다.
// - 앞뒤(z) 값은 카메라 한 대로 추정해서 가만히 있어도 크게 흔들립니다. 반만 반영합니다.
// - 잰 방향을 평균 내고(ARM_SMOOTH), 그 평균이 붙잡아 둔 방향과 ARM_HOLD_DEG 넘게 달라질 때만 팔을 옮깁니다.
//   잰 값 하나하나와 비교하면 흔들린 값끼리의 차이가 기준을 넘어 팔이 가끔 튑니다.
//   한번 움직이기 시작하면 평균이 멈출 때(ARM_SETTLE_DEG)까지 따라가, 목표 앞에서 어정쩡하게 멈추지 않게 합니다.
// - 잠깐 관절을 놓쳐도 ARM_LOST_MS 동안은 그 자세를 유지합니다(팔이 툭 떨어졌다 올라오지 않게).

export const POSE_HZ = 15; // 팔 트래킹용 Pose 인식 횟수(초당). 그 사이는 캐릭터 쪽에서 부드럽게 이어 붙입니다.
export const SHOULDER_VISIBLE = 0.5; // 어깨가 이 값보다 덜 보이면 그 팔은 "모름"
export const WRIST_ON = 0.6; // 손목이 이 값보다 잘 보이면 어깨→손목 기준으로 바꿉니다.
export const WRIST_OFF = 0.4; // 이 값보다 덜 보여야 어깨→팔꿈치로 돌아갑니다. (기준이 왔다 갔다 떨리지 않게)
export const ELBOW_VISIBLE = 0.5; // 팔꿈치 기준을 쓸 수 있는 최소값
export const ARM_Z_WEIGHT = 0.5; // 앞뒤(z) 값을 이만큼만 반영합니다. (흔들림이 가장 큰 축)
export const ARM_SMOOTH = 0.4; // 새로 잰 방향을 평균에 섞는 비율 (작을수록 부드럽고 느림)
export const ARM_HOLD_DEG = 8; // 평균이 붙잡아 둔 방향과 이 각도 안이면 팔을 그대로 둡니다.
export const ARM_SETTLE_DEG = 1.5; // 움직이는 중에 평균이 한 번에 이보다 덜 바뀌면 멈춘 것으로 봅니다.
export const ARM_LOST_MS = 600; // 관절을 놓쳐도 이 시간 동안은 마지막 자세를 유지합니다.

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
  const z = -(end.z - arm.shoulder.z) * ARM_Z_WEIGHT;
  const len = Math.hypot(x, y, z);
  if (len < 1e-6) return null;
  return { x: x / len, y: y / len, z: z / len };
}

// 두 방향 사이 각도(도)
export function angleBetween(a: Direction, b: Direction): number {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  return (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
}

// 팔 하나의 상태. dir: 캐릭터에 쓸 붙잡아 둔 방향(null 이면 팔을 내림), avg: 잰 방향의 평균, moving: 따라가는 중
export type ArmHold = { dir: Direction | null; avg: Direction | null; moving: boolean; lostAt: number | null };
export const initialArmHold: ArmHold = { dir: null, avg: null, moving: false, lostAt: null };

// a 에서 b 쪽으로 t 만큼 섞은 방향 (길이 1로 맞춤)
function mix(a: Direction, b: Direction, t: number): Direction {
  const x = a.x + (b.x - a.x) * t;
  const y = a.y + (b.y - a.y) * t;
  const z = a.z + (b.z - a.z) * t;
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

// 새로 잰 방향(measured)으로 붙잡아 둔 방향을 갱신합니다.
export function nextArmHold(prev: ArmHold, measured: Direction | null, nowMs: number): ArmHold {
  if (!measured) {
    // 놓친 지 얼마 안 됐으면 마지막 자세를 유지합니다. 오래 놓치면 팔을 내리고 평균도 지웁니다.
    const lostAt = prev.lostAt ?? nowMs;
    if (nowMs - lostAt < ARM_LOST_MS) return { ...prev, lostAt };
    return { ...initialArmHold, lostAt };
  }
  const avg = prev.avg ? mix(prev.avg, measured, ARM_SMOOTH) : measured;
  if (!prev.dir) return { dir: avg, avg, moving: false, lostAt: null };
  // 따라가는 중이면 평균이 멈출 때까지 계속, 멈춰 있으면 평균이 크게 벗어날 때만 움직이기 시작합니다.
  const moving = prev.moving
    ? !!prev.avg && angleBetween(prev.avg, avg) >= ARM_SETTLE_DEG
    : angleBetween(prev.dir, avg) >= ARM_HOLD_DEG;
  return { dir: moving || prev.moving ? avg : prev.dir, avg, moving, lostAt: null };
}

// 사용자 팔 방향(거울 기준) → 캐릭터 팔 막대 방향.
//   거울(내 모습 화면): 사용자 오른팔을 캐릭터 왼팔(화면 오른쪽)에 붙입니다.
//   실제 방향(다른 사람 화면): 사용자 왼팔은 캐릭터 왼팔. 거울을 되돌리려면 팔을 바꾸고 좌우(x)를 뒤집습니다.
export type UserArms = { left: Direction | null; right: Direction | null };
export type CharacterArms = { armLeft: Direction | null; armRight: Direction | null };

export function characterArms(user: UserArms, mirror: boolean): CharacterArms {
  if (mirror) return { armLeft: user.right, armRight: user.left };
  const flip = (d: Direction | null) => (d ? { x: -d.x, y: d.y, z: d.z } : null);
  return { armLeft: flip(user.left), armRight: flip(user.right) };
}
