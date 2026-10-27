// 얼굴 판: 눈썹·눈·입을 얼굴 앞에 붙인 판에 그립니다 (#293). 눈 깜빡임과 말할 때 벌린 입(#61)도 이 판의 그림만 바꿉니다.
//
// 캐릭터 머리(head)는 모두 같은 크기의 상자라서 같은 자리에 붙입니다. 머리 안쪽 좌표로 얼굴 앞면은 z = +4,
// 가로 -4(그림 왼쪽) ~ +4, 세로 바닥 0 ~ 꼭대기 8 입니다(모델을 재어 확인). 판은 이 앞면을 꼭 덮는 크기이고, 머리의 자식이라
// 고개를 돌리면 같이 돕니다. 판의 그림은 투명 바탕에 부품만 있어서 스킨(피부·앞머리)이 그대로 비쳐 보입니다.
// 그림은 차림·눈(뜸/감음)·입(다묾/벌림)마다 composeSkin.faceTexture 가 만들어 두고, 같은 차림의 캐릭터끼리 같이 씁니다.
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { faceTexture } from "../avatar/composeSkin";

const HEAD_NODE = "head";
const FACE_Z = 4.02; // 얼굴 앞면(4)보다 살짝 앞. 같은 높이면 겹쳐서 깜빡입니다
const MOUTH_FOLLOW = 14; // 받은 입 벌림 값을 따라가는 빠르기. 다른 사람 값은 0.25초마다 오므로 부드럽게 이어 줍니다
const OPEN_AT = 0.3; // 이만큼 넘게 벌리면 벌린 입을 보여 줍니다
const CLOSE_AT = 0.2; // 이보다 작아져야 다시 다문 입 (말하는 동안 깜빡거리지 않게)

// 판과 지금 보여 줄 모습. 훅이 돌려준 뒤에는 showEyes·updateMouth 로만 바꿉니다.
export type FaceHandle = {
  mesh: THREE.Mesh;
  model: string;
  eyesClosed: boolean;
  talking: boolean;
  open: number; // 부드럽게 따라간 입 벌림 값
  shown: string; // 판에 올라가 있는(또는 올리는 중인) 그림의 이름. 같으면 다시 올리지 않음
};

// 이 캐릭터(root)의 머리에 얼굴 판을 붙입니다. model: 아바타 키(고른 차림)
export function useFace(root: THREE.Object3D, model: string): FaceHandle {
  const face = useMemo<FaceHandle>(() => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ transparent: true }));
    mesh.name = "face";
    mesh.position.set(0, 4, FACE_Z);
    mesh.visible = false; // 그림이 올라가면 보임
    return { mesh, model, eyesClosed: false, talking: false, open: 0, shown: "" };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 차림이 바뀌면 아래 effect 가 model 을 바꾸고 다시 그림
  }, []);

  // 차림이 바뀌면 새 그림으로. 눈·입 네 가지 모습을 미리 만들어 두어 깜빡일 때 늦지 않게 합니다.
  useEffect(() => {
    setModel(face, model);
    for (const closed of [false, true]) for (const talking of [false, true]) void faceTexture(model, closed, talking).catch(() => {});
  }, [face, model]);

  useEffect(() => {
    const head = root.getObjectByName(HEAD_NODE);
    if (!head) return;
    head.add(face.mesh);
    return () => {
      head.remove(face.mesh);
    };
  }, [root, face]);

  useEffect(
    () => () => {
      face.mesh.geometry.dispose();
      (face.mesh.material as THREE.Material).dispose(); // 그림(texture)은 같은 차림끼리 같이 쓰므로 버리지 않음
    },
    [face],
  );

  return face;
}

// 훅이 돌려준 값을 컴포넌트 안에서 바꾸면 React 규칙 검사에 걸려서, 바꾸는 일은 이 함수들이 합니다.
function setModel(face: FaceHandle, model: string) {
  face.model = model;
  refresh(face);
}

// 지금 모습(차림·눈·입)의 그림을 판에 올립니다. 그림을 만드는 동안은 앞 그림을 그대로 둡니다.
function refresh(face: FaceHandle) {
  const name = `${face.model}#${face.eyesClosed ? 1 : 0}${face.talking ? 1 : 0}`;
  if (face.shown === name) return;
  face.shown = name;
  faceTexture(face.model, face.eyesClosed, face.talking).then(
    (tex) => {
      if (face.shown !== name) return; // 그 사이 모습이 또 바뀜
      const material = face.mesh.material as THREE.MeshBasicMaterial;
      if (material.map !== tex) {
        material.map = tex;
        material.needsUpdate = true;
      }
      face.mesh.visible = true;
    },
    (e: Error) => console.error("얼굴 그림을 만들지 못했습니다:", e.message),
  );
}

// 눈을 감았는지
export function showEyes(face: FaceHandle, closed: boolean) {
  if (face.eyesClosed === closed) return;
  face.eyesClosed = closed;
  refresh(face);
}

// open: 입 벌린 정도(0~1). 지금 값에서 그쪽으로 부드럽게 따라가며, 충분히 벌렸을 때 벌린 입으로 바꿉니다.
export function updateMouth(face: FaceHandle, open: number, delta: number) {
  face.open = THREE.MathUtils.lerp(face.open, open, 1 - Math.exp(-MOUTH_FOLLOW * delta));
  const talking = face.open > (face.talking ? CLOSE_AT : OPEN_AT);
  if (face.talking === talking) return;
  face.talking = talking;
  refresh(face);
}
