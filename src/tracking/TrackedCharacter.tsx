// 트래킹 결과를 캐릭터에 반영합니다: 고개 각도 → 머리 회전, 눈 감김 → 눈 감은 스킨,
// (pose 를 넘기면) 팔 방향 → 팔 회전
//
// 캐릭터는 복사본에 이 캐릭터만 쓰는 재질을 입혀 그립니다. 원본을 그대로 쓰면 눈을 감을 때
// 같은 모델(a)을 쓰는 다른 참여자 캐릭터까지 같이 눈을 감습니다. (#113, useEyeSkin.ts)
import { useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { FaceState, PoseState } from "./useTracking";
import { armDirection, pickTarget } from "./armLogic";
import type { ArmJoints, ArmTarget } from "./armLogic";
import { headAngles, nextEyesClosed } from "./faceSync";
import { showEyes, useEyeSkin } from "./useEyeSkin";

const MODEL = "a"; // 내 캐릭터 모델 (public/models/character-a.glb)
const MODEL_URL = `/models/character-${MODEL}.glb`;
const HEAD_NODE = "head";
const HEAD_FOLLOW = 12; // 머리가 목표 각도를 따라가는 빠르기
const ARM_FOLLOW = 12; // 팔이 목표 방향을 따라가는 빠르기. 머리와 같은 값
const ARM_REST = new THREE.Vector3(0, -1, 0); // 팔 막대의 기본 방향 (아래로 늘어짐)
// 거울처럼 움직이도록 사용자 오른팔을 캐릭터 왼팔(화면 오른쪽)에 붙입니다.
const ARMS = [
  { node: "arm-left", side: "right" },
  { node: "arm-right", side: "left" },
] as const;

type Props = {
  face: RefObject<FaceState>;
  pose?: RefObject<PoseState>; // 없으면 팔은 움직이지 않습니다.
};

export function TrackedCharacter({ face, pose }: Props) {
  const { scene } = useGLTF(MODEL_URL);
  // 지점의 내 캐릭터(Player)와 같은 모델이므로 복사본을 씁니다.
  const model = useMemo(() => scene.clone(true), [scene]);
  const eyes = useEyeSkin(model, MODEL);
  const eyesClosed = useRef(false);
  // 팔마다 직전에 고른 기준 관절(손목/팔꿈치). 기준이 떨리지 않게 기억합니다.
  const armTargets = useRef<Record<string, ArmTarget>>({});
  // 매 프레임 새로 만들지 않도록 계산용 값을 미리 만들어 둡니다.
  const armCalc = useRef({ dir: new THREE.Vector3(), goal: new THREE.Quaternion() });

  useFrame((_, delta) => {
    const head = model.getObjectByName(HEAD_NODE);
    if (!head) return;
    const state = face.current;

    // 눈: 감긴 정도에 따라 뜬 스킨과 감은 스킨을 바꿉니다.
    eyesClosed.current = nextEyesClosed(eyesClosed.current, state);
    showEyes(eyes.current, eyesClosed.current);

    // 내 모습 화면은 거울처럼 움직입니다. 얼굴을 놓치면 정면으로 천천히 돌아옵니다.
    const angles = headAngles(state, true);
    // 떨림을 줄이기 위해 목표 각도로 부드럽게 따라갑니다.
    const follow = 1 - Math.exp(-HEAD_FOLLOW * delta);
    head.rotation.order = "YXZ";
    head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, angles?.yaw ?? 0, follow);
    head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, angles?.pitch ?? 0, follow);
    head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, angles?.roll ?? 0, follow);

    // 팔: 어깨에서 손목(안 보이면 팔꿈치) 쪽으로 팔 막대를 돌립니다. 둘 다 안 보이면 천천히 내립니다.
    if (!pose) return;
    const armFollow = 1 - Math.exp(-ARM_FOLLOW * delta);
    const { dir, goal } = armCalc.current;
    for (const { node, side } of ARMS) {
      const arm = model.getObjectByName(node);
      if (!arm) continue;
      const joints: ArmJoints | null = pose.current[side];
      const target = pickTarget(joints, armTargets.current[node] ?? null);
      armTargets.current[node] = target;
      const d = armDirection(joints, target);
      if (d) goal.setFromUnitVectors(ARM_REST, dir.set(d.x, d.y, d.z));
      else goal.identity();
      arm.quaternion.slerp(goal, armFollow);
    }
  });

  return <primitive object={model} />;
}

useGLTF.preload(MODEL_URL);
