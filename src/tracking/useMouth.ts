// 말할 때 보이는 벌린 입 (#61, 캐릭터 꾸미기 #56). 회의실에서 입을 벌리면 고른 "벌린 입" 그림이 다문 입 위를 덮고, 다물면 사라집니다.
//
// 캐릭터 머리(head)는 모두 같은 크기의 상자라서 같은 자리에 붙입니다. 머리 안쪽 좌표로 얼굴 앞면은 z = +4,
// 가로 -4(그림 왼쪽) ~ +4, 세로 바닥 0 ~ 꼭대기 8 입니다(모델을 재어 확인). 얼굴 그림의 칸(8×8)이 이 좌표 한 칸입니다.
// 얼굴의 입 자리(avatarLogic.MOUTH_OVERLAY)만 한 판을 머리의 자식으로 붙여서, 고개를 돌리면 같이 돕니다.
// 판의 그림은 그 사람의 피부색 바탕에 고른 벌린 입을 얹은 것이라(composeSkin.mouthOverlay), 덮어도 얼굴과 이어져 보입니다.
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { MOUTH_OVERLAY } from "../avatar/avatarLogic";
import { mouthOverlay } from "../avatar/composeSkin";

const HEAD_NODE = "head";
const FACE_Z = 4.02; // 얼굴 앞면(4)보다 살짝 앞. 같은 높이면 겹쳐서 깜빡입니다
const MOUTH_FOLLOW = 14; // 받은 입 벌림 값을 따라가는 빠르기. 다른 사람 값은 0.25초마다 오므로 부드럽게 이어 줍니다
const OPEN_AT = 0.3; // 이만큼 넘게 벌리면 벌린 입을 보여 줍니다
const CLOSE_AT = 0.2; // 이보다 작아져야 다시 다문 입 (말하는 동안 깜빡거리지 않게)

// 이 캐릭터(root)의 머리에 벌린 입 판을 붙입니다. model: 아바타 키(고른 차림). 반환한 판은 프레임마다 updateMouth 로 켜고 끕니다.
export function useMouth(root: THREE.Object3D, model: string) {
  const mouth = useMemo(() => {
    const { c0, r0, c1, r1 } = MOUTH_OVERLAY;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(c1 - c0, r1 - r0), new THREE.MeshBasicMaterial());
    mesh.name = "mouth";
    mesh.visible = false;
    // 얼굴 칸 (c, r) → 머리 좌표 (x = c - 4, y = 8 - r)
    mesh.position.set((c0 + c1) / 2 - 4, 8 - (r0 + r1) / 2, FACE_Z);
    return mesh;
  }, []);

  // 고른 벌린 입 그림을 판에 입힙니다(차림이 바뀌면 다시).
  useEffect(() => {
    let alive = true;
    void mouthOverlay(model).then(
      (tex) => alive && applyTexture(mouth, tex),
      (e: Error) => console.error("벌린 입 그림을 만들지 못했습니다:", e.message),
    );
    return () => {
      alive = false;
    };
  }, [mouth, model]);

  useEffect(() => {
    const head = root.getObjectByName(HEAD_NODE);
    if (!head) return;
    head.add(mouth);
    return () => {
      head.remove(mouth);
    };
  }, [root, mouth]);

  useEffect(
    () => () => {
      mouth.geometry.dispose();
      (mouth.material as THREE.Material).dispose(); // 그림(texture)은 같은 차림끼리 같이 쓰므로 버리지 않음
    },
    [mouth],
  );

  return mouth;
}

// 훅이 돌려준 값을 컴포넌트 안에서 바꾸면 React 규칙 검사에 걸려서, 바꾸는 일은 이 함수들이 합니다.
function applyTexture(mouth: THREE.Mesh, tex: THREE.Texture) {
  const material = mouth.material as THREE.MeshBasicMaterial;
  material.map = tex;
  material.needsUpdate = true;
}

// open: 벌린 정도(0~1). 지금 값에서 그쪽으로 부드럽게 따라가며, 충분히 벌렸을 때 벌린 입을 보여 줍니다.
export function updateMouth(mouth: THREE.Mesh, open: number, delta: number) {
  const current = (mouth.userData.open as number | undefined) ?? 0;
  const next = THREE.MathUtils.lerp(current, open, 1 - Math.exp(-MOUTH_FOLLOW * delta));
  mouth.userData.open = next;
  const material = mouth.material as THREE.MeshBasicMaterial;
  mouth.visible = Boolean(material.map) && next > (mouth.visible ? CLOSE_AT : OPEN_AT);
}
