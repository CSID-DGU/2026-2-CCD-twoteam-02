// 트래킹 결과를 캐릭터에 반영합니다: 고개 각도 → 머리 회전, 눈 감김 → 눈 감은 스킨,
// (pose 를 넘기면) 팔 방향 → 팔 회전, (showMouth 면) 입 벌림 → 입 모양 (회의실, #61)
//
// 캐릭터는 복사본에 이 캐릭터만 쓰는 재질을 입혀 그립니다. 원본을 그대로 쓰면 눈을 감을 때
// 같은 모델(a)을 쓰는 다른 참여자 캐릭터까지 같이 눈을 감습니다. (#113, useEyeSkin.ts)
import { useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { FaceState, PoseState } from "./useTracking";
import { characterArms } from "./armLogic";
import { applyArms } from "./armPose";
import { useArmDirections } from "./useArmDirections";
import { headAngles, mouthOpen, nextEyesClosed } from "./faceSync";
import { showEyes, useEyeSkin } from "./useEyeSkin";
import { updateMouth, useMouth } from "./useMouth";
import { BASE_MODEL_URL, DEFAULT_MODEL } from "../profile/characters";

const HEAD_NODE = "head";
const HEAD_FOLLOW = 12; // 머리가 목표 각도를 따라가는 빠르기
const ARM_FOLLOW = 8; // 팔이 목표 방향을 따라가는 빠르기. 떨림을 줄이려고 머리보다 느리게 둡니다. (#139)

type Props = {
  face: RefObject<FaceState>;
  pose?: RefObject<PoseState>; // 없으면 팔은 움직이지 않습니다.
  model?: string; // 캐릭터 차림(아바타 키). 내 프로필에서 고른 차림 (#131·#56)
  showMouth?: boolean; // 입 벌림을 보여 줄지. 회의실에서만 켭니다 (#61)
};

export function TrackedCharacter({ face, pose, model = DEFAULT_MODEL, showMouth = false }: Props) {
  const { scene } = useGLTF(BASE_MODEL_URL); // 모든 캐릭터가 같은 모델, 스킨만 다름 (#56)
  // 지점의 내 캐릭터(Player)와 같은 모델이므로 복사본을 씁니다.
  const character = useMemo(() => scene.clone(true), [scene]);
  const eyes = useEyeSkin(character, model);
  const eyesClosed = useRef(false);
  const mouth = useMouth(character);
  // 떨림을 걸러낸 팔 방향 (armLogic.ts 참고)
  const arms = useArmDirections(pose);

  useFrame((_, delta) => {
    const head = character.getObjectByName(HEAD_NODE);
    if (!head) return;
    const state = face.current;

    // 눈: 감긴 정도에 따라 뜬 스킨과 감은 스킨을 바꿉니다.
    eyesClosed.current = nextEyesClosed(eyesClosed.current, state);
    showEyes(eyes.current, eyesClosed.current);
    // 입: 벌린 만큼 입 모양을 늘립니다(회의실에서만).
    updateMouth(mouth, showMouth ? mouthOpen(state) : 0, delta);

    // 내 모습 화면은 거울처럼 움직입니다. 얼굴을 놓치면 정면으로 천천히 돌아옵니다.
    const angles = headAngles(state, true);
    // 떨림을 줄이기 위해 목표 각도로 부드럽게 따라갑니다.
    const follow = 1 - Math.exp(-HEAD_FOLLOW * delta);
    head.rotation.order = "YXZ";
    head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, angles?.yaw ?? 0, follow);
    head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, angles?.pitch ?? 0, follow);
    head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, angles?.roll ?? 0, follow);

    // 팔: 어깨에서 손목(안 보이면 팔꿈치) 쪽으로 팔 막대를 돌립니다. 거울처럼 붙입니다.
    if (!pose) return;
    applyArms(character, characterArms(arms.current, true), 1 - Math.exp(-ARM_FOLLOW * delta));
  });

  return <primitive object={character} />;
}

useGLTF.preload(BASE_MODEL_URL);
