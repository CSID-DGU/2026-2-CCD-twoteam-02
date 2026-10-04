// 트래킹 결과를 캐릭터에 반영합니다: 고개 각도 → 머리 회전, 눈 감김 → 눈 감은 스킨
import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { FaceState } from "./useFaceTracking";

const MODEL_URL = "/models/character-a.glb";
const BLINK_TEXTURE_URL = "/models/Textures/texture-a-blink.png"; // 눈 감은 스킨
const HEAD_NODE = "head";

// 거울처럼 움직이게 하는 부호입니다. 방향이 반대로 보이면 1과 -1을 바꾸세요.
const YAW_SIGN = -1; // 좌우
const PITCH_SIGN = 1; // 위아래
const ROLL_SIGN = -1; // 갸웃
export const BLINK_THRESHOLD = 0.5; // 이 값보다 크면 눈을 감은 것으로 봅니다.
const BLINK_OPEN_THRESHOLD = 0.35; // 이 값보다 작아져야 다시 뜬 것으로 봅니다. (깜빡거림 방지)

type EyeTextures = {
  material: THREE.MeshBasicMaterial;
  open: THREE.Texture;
  closed: THREE.Texture;
};

export function TrackedCharacter({ face }: { face: RefObject<FaceState> }) {
  const { scene } = useGLTF(MODEL_URL);
  const eyes = useRef<EyeTextures | null>(null);
  const eyesClosed = useRef(false);

  // 눈 감은 스킨을 불러옵니다. 캐릭터 전체가 스킨 한 장을 같이 쓰므로 통째로 바꿔 끼웁니다.
  useEffect(() => {
    const head = scene.getObjectByName(HEAD_NODE);
    if (!(head instanceof THREE.Mesh)) return;
    const material = head.material as THREE.MeshBasicMaterial;
    const open = material.map;
    if (!open) return;

    const closed = new THREE.TextureLoader().load(BLINK_TEXTURE_URL, () => {
      eyes.current = { material, open, closed };
    });
    // 원래 스킨과 같은 방식으로 입혀지도록 설정을 그대로 맞춥니다.
    closed.flipY = open.flipY;
    closed.colorSpace = open.colorSpace;
    closed.wrapS = open.wrapS;
    closed.wrapT = open.wrapT;
    closed.minFilter = open.minFilter;
    closed.magFilter = open.magFilter;

    return () => {
      eyes.current = null;
      material.map = open;
      closed.dispose();
    };
  }, [scene]);

  useFrame((_, delta) => {
    const head = scene.getObjectByName(HEAD_NODE);
    if (!head) return;
    const state = face.current;

    // 눈: 감긴 정도에 따라 뜬 스킨과 감은 스킨을 바꿉니다.
    const limit = eyesClosed.current ? BLINK_OPEN_THRESHOLD : BLINK_THRESHOLD;
    eyesClosed.current = state.found && state.blink > limit;
    if (eyes.current) {
      const { material, open, closed } = eyes.current;
      const wanted = eyesClosed.current ? closed : open;
      if (material.map !== wanted) material.map = wanted;
    }

    // 얼굴을 놓치면 정면으로 천천히 돌아옵니다.
    const yaw = state.found ? state.yaw * YAW_SIGN : 0;
    const pitch = state.found ? state.pitch * PITCH_SIGN : 0;
    const roll = state.found ? state.roll * ROLL_SIGN : 0;
    // 떨림을 줄이기 위해 목표 각도로 부드럽게 따라갑니다.
    const follow = 1 - Math.exp(-12 * delta);
    head.rotation.order = "YXZ";
    head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, yaw, follow);
    head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, pitch, follow);
    head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, roll, follow);
  });

  return <primitive object={scene} />;
}

useGLTF.preload(MODEL_URL);
