// 팔 움직임 신호: 어깨→손목(또는 팔꿈치) 방향이 기준에서 MOTION_DEG 넘게 벗어나면 "움직였다"고 보고 시각을 찍습니다.
// 집중 판정(focusLogic)에서 "깨어 있음"의 근거로 씁니다. 손·모자로 눈이 가려져 눈 감음으로 읽히거나,
// 숙여서 얼굴을 놓쳐 엎드림으로 셀 때도, 필기하느라 팔이 움직이고 있으면 졸음 타이머를 처음부터 다시 셉니다.
//
// 자세가 아니라 변화를 봅니다. 팔이 책상 쪽을 향한 자세 자체는 엎드려 자도 같아서 근거가 못 됩니다.
// 3D 방향의 각도를 쓰므로 카메라에서 얼마나 떨어져 앉았는지와 무관합니다.
// 캐릭터 팔(armLogic의 ARM_HOLD_DEG 8°)보다 작은 기준을 따로 둡니다. 필기 손놀림은 어깨→손목 각도로 2~6° 정도라
// 캐릭터 기준으로는 안 잡힙니다.
// 화면·MediaPipe와 무관한 순수 함수라 따로 둡니다. (Node로 시나리오 검사 — 다른 파일을 값으로 import하지 않음)

import type { ArmTarget, Direction } from "./armLogic";

// 기준값 (임시 — 측정 전 추정값. 근거: docs/판정-기준-근거.md 6절)
// 가만히 있을 때 Pose 추정 떨림보다는 크고 필기 손놀림보다는 작게 잡았습니다. 각본 시험 3번(숙여 필기)·12번(엎드리기)으로 정합니다.
export const MOTION_DEG = 4;

// 팔 하나의 움직임 기록. ref: 마지막 움직임 때의 방향(기준), target: 그때 기준으로 삼은 관절
export type ArmMotion = { ref: Direction | null; target: ArmTarget; lastMotionMs: number | null };
export const initialArmMotion: ArmMotion = { ref: null, target: null, lastMotionMs: null };

// 두 단위 벡터 사이 각도(도). armLogic.angleBetween과 같지만 Node 검사를 위해 값 import를 피합니다.
function angleDeg(a: Direction, b: Direction): number {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  return (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
}

// 새로 잰 방향(measured)과 그때 쓴 관절(target)로 움직임 기록을 갱신합니다.
// - 팔을 놓치면(null) 기준을 지웁니다. 다시 잡힌 첫 방향은 기준이 될 뿐 움직임이 아닙니다. (Pose 끊김을 움직임으로 보지 않음)
// - 관절이 바뀌면(손목↔팔꿈치) 방향이 튀므로 기준만 바꿉니다.
// - 기준에서 MOTION_DEG 이상 벗어나면 움직임 시각을 찍고 기준을 그 방향으로 옮깁니다. 천천히 흘러가도 누적되면 움직임입니다.
export function nextArmMotion(prev: ArmMotion, measured: Direction | null, target: ArmTarget, nowMs: number): ArmMotion {
  if (!measured || !target) return { ref: null, target: null, lastMotionMs: prev.lastMotionMs };
  if (!prev.ref || prev.target !== target) return { ref: measured, target, lastMotionMs: prev.lastMotionMs };
  if (angleDeg(prev.ref, measured) >= MOTION_DEG) return { ref: measured, target, lastMotionMs: nowMs };
  return prev;
}

// 양팔 중 더 최근 움직임 시각. 둘 다 없으면 null
export function latestMotionMs(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.max(left, right);
}
