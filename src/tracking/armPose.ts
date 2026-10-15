// 캐릭터 팔 막대를 정해진 방향으로 돌립니다. 내 모습 화면과 앉아 있는 다른 참여자 캐릭터가 같이 씁니다.
// 방향이 없으면(팔을 못 찾음) 천천히 내립니다.
import * as THREE from "three";
import type { CharacterArms } from "./armLogic";

const ARM_REST = new THREE.Vector3(0, -1, 0); // 팔 막대의 기본 방향 (아래로 늘어짐)
const NODES = [
  ["armLeft", "arm-left"],
  ["armRight", "arm-right"],
] as const;

// 매 프레임 새로 만들지 않도록 계산용 값을 미리 만들어 둡니다.
const dir = new THREE.Vector3();
const goal = new THREE.Quaternion();

// follow: 이번 프레임에 목표로 다가갈 비율(0~1)
export function applyArms(root: THREE.Object3D, arms: CharacterArms | null, follow: number) {
  for (const [key, name] of NODES) {
    const node = root.getObjectByName(name);
    if (!node) continue;
    const d = arms?.[key];
    // 받은 값은 반올림돼 길이가 1이 아닐 수 있어 다시 맞춥니다.
    if (d) goal.setFromUnitVectors(ARM_REST, dir.set(d.x, d.y, d.z).normalize());
    else goal.identity();
    node.quaternion.slerp(goal, follow);
  }
}
