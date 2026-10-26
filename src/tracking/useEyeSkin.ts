// 캐릭터 복사본에 자기만의 재질을 입히고, 고른 차림의 스킨을 입히고, 눈 감은 스킨으로 바꿔 끼울 수 있게 하는 훅
//
// scene.clone(true) 는 뼈대·위치만 새로 만들고 재질(material)은 원본과 같이 씁니다.
// 그래서 한 캐릭터의 스킨을 바꾸면 같은 모델을 쓰는 캐릭터가 모두 같이 바뀌었습니다. (#113)
// 여기서 재질을 복사해 이 캐릭터에만 입히고, 스킨은 그 복사본에만 끼웁니다.
//
// 모든 캐릭터는 같은 3D 모델 하나를 쓰고, 스킨만 고른 부품을 겹쳐 만든 그림으로 바꿉니다(캐릭터 꾸미기, #56).
// 캐릭터 전체가 스킨 한 장(재질 하나)을 같이 쓰므로, 스킨을 통째로 바꿔 끼워 눈을 감깁니다.
// 스킨을 만드는 동안(처음 한 번, 아주 잠깐)은 캐릭터를 숨겨 기본 캐릭터가 비쳐 보이지 않게 합니다.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { avatarSkin } from "../avatar/composeSkin";

export type EyeSkin = {
  material: THREE.MeshBasicMaterial; // 이 캐릭터만 쓰는 재질
  open: THREE.Texture;
  closed: THREE.Texture; // 눈 감은 그림이 없는 머리면 open 과 같음
};

// 받은 3D 객체를 바꾸는 일은 컴포넌트·훅 밖에서 합니다(React 규칙 검사가 넘겨받은 값을 바꾸는 것을 막기 때문).
function setVisible(o: THREE.Object3D, visible: boolean) {
  o.visible = visible;
}

// 만든 스킨을 원래 스킨과 같은 방식(걸러 그리기 등)으로 붙이도록 설정을 맞춥니다.
function matchTexture(tex: THREE.Texture, original: THREE.Texture | null) {
  if (!original || (tex.minFilter === original.minFilter && tex.magFilter === original.magFilter)) return;
  tex.minFilter = original.minFilter;
  tex.magFilter = original.magFilter;
  tex.needsUpdate = true;
}

// root: 이 캐릭터의 복사본, model: 아바타 키(avatarLogic, 예전처럼 a~r 한 글자여도 됨)
export function useEyeSkin(root: THREE.Object3D, model: string) {
  const skin = useRef<EyeSkin | null>(null);

  useEffect(() => {
    // 원래 재질 → 이 캐릭터용 복사본. 부위(머리·몸·팔…)마다 같은 재질을 쓰므로 하나만 복사합니다.
    const own = new Map<THREE.Material, THREE.Material>();
    const originals: [THREE.Mesh, THREE.Material][] = [];
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || Array.isArray(o.material) || o.name === "mouth") return; // 입 모양(#61)은 따로
      const original = o.material as THREE.Material;
      let copy = own.get(original);
      if (!copy) {
        copy = original.clone(); // 스킨 그림(texture)은 같이 쓰고 재질만 따로 둡니다.
        own.set(original, copy);
      }
      originals.push([o, original]);
      o.material = copy;
    });

    const material = [...own.values()][0] as THREE.MeshBasicMaterial | undefined;
    const original = material?.map ?? null;
    let alive = true;
    setVisible(root, false);
    avatarSkin(model)
      .then(({ open, closed }) => {
        if (!alive || !material) return;
        matchTexture(open, original);
        if (closed) matchTexture(closed, original);
        material.map = open;
        skin.current = { material, open, closed: closed ?? open };
      })
      .catch((e: Error) => console.error("캐릭터 스킨을 만들지 못했습니다:", e.message)) // 못 만들면 기본 스킨 그대로
      .finally(() => {
        if (alive) setVisible(root, true);
      });

    return () => {
      alive = false;
      skin.current = null;
      setVisible(root, true);
      for (const [mesh, original] of originals) mesh.material = original;
      for (const copy of own.values()) copy.dispose(); // 스킨 그림은 다른 캐릭터와 같이 쓰므로 버리지 않음
    };
  }, [root, model]);

  return skin;
}

// 눈 뜬 스킨과 감은 스킨을 바꿔 끼웁니다. 스킨을 아직 못 만들었으면 아무것도 하지 않습니다.
export function showEyes(skin: EyeSkin | null, closed: boolean) {
  if (!skin) return;
  const wanted = closed ? skin.closed : skin.open;
  if (skin.material.map !== wanted) skin.material.map = wanted;
}
