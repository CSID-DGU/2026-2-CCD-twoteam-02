// 캐릭터 얼굴 앞에 붙이는 입 모양 (#61). 회의실에서 입을 벌리면 그만큼 세로로 늘어나고, 다물면 사라집니다.
//
// 캐릭터 18종 모두 머리(head)가 같은 크기의 상자라서 같은 자리에 붙입니다.
// 머리 안쪽 좌표로 얼굴 앞면은 z = +4, 높이는 바닥 0 ~ 꼭대기 8 이고(모델을 재어 확인), 스킨에 그려진 입은 얼굴 아래쪽
// 약 80% 높이에 있습니다. 그 자리를 덮는 어두운 사각형을 머리의 자식으로 붙여서, 고개를 돌리면 같이 돕니다.
// 다물고 있을 때는 숨겨서 스킨에 그려진 원래 입이 보입니다.
import { useEffect, useMemo } from "react";
import * as THREE from "three";

const HEAD_NODE = "head";
// 머리 안쪽 좌표(얼굴 한 변 = 8)
const MOUTH = {
  width: 2, // 얼굴 너비의 1/4
  top: 2.2, // 입 윗선 높이. 벌리면 아래로 늘어납니다(턱이 내려가듯)
  minHeight: 0.35, // 조금 벌렸을 때
  maxHeight: 1.6, // 다 벌렸을 때
  z: 4.02, // 얼굴 앞면(4)보다 살짝 앞. 같은 높이면 겹쳐서 깜빡입니다
};
const MOUTH_COLOR = "#3a1f1f";
const MOUTH_FOLLOW = 14; // 입이 목표 크기를 따라가는 빠르기. 다른 사람 값은 0.25초마다 오므로 부드럽게 이어 줍니다
const SHOW_FROM = 0.02; // 이보다 작게 벌어졌으면 숨깁니다

// 이 캐릭터(root)의 머리에 입 모양을 붙입니다. 반환한 입은 프레임마다 updateMouth 로 움직입니다.
export function useMouth(root: THREE.Object3D) {
  const mouth = useMemo(() => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: MOUTH_COLOR }));
    mesh.name = "mouth";
    mesh.visible = false;
    return mesh;
  }, []);

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
      (mouth.material as THREE.Material).dispose();
    },
    [mouth],
  );

  return mouth;
}

// open: 벌릴 정도(0~1). 지금 크기에서 그쪽으로 부드럽게 따라갑니다.
// 훅이 돌려준 값을 컴포넌트 안에서 바꾸면 React 규칙 검사에 걸려서, 바꾸는 일은 이 함수가 합니다.
export function updateMouth(mouth: THREE.Mesh, open: number, delta: number) {
  const current = (mouth.userData.open as number | undefined) ?? 0;
  const next = THREE.MathUtils.lerp(current, open, 1 - Math.exp(-MOUTH_FOLLOW * delta));
  mouth.userData.open = next;
  mouth.visible = next > SHOW_FROM;
  if (!mouth.visible) return;
  const height = MOUTH.minHeight + (MOUTH.maxHeight - MOUTH.minHeight) * next;
  mouth.scale.set(MOUTH.width, height, 1);
  mouth.position.set(0, MOUTH.top - height / 2, MOUTH.z);
}
