// 캐릭터 복사본에 자기만의 재질을 입히고, 눈 감은 스킨으로 바꿔 끼울 수 있게 하는 훅
//
// scene.clone(true) 는 뼈대·위치만 새로 만들고 재질(material)은 원본과 같이 씁니다.
// 그래서 한 캐릭터의 스킨을 바꾸면 같은 모델을 쓰는 캐릭터가 모두 같이 눈을 감았습니다. (#113)
// 여기서 재질을 복사해 이 캐릭터에만 입히고, 눈 감은 스킨은 그 복사본에만 끼웁니다.
//
// 캐릭터 전체가 스킨 한 장(재질 하나)을 같이 쓰므로, 스킨을 통째로 바꿔 끼워 눈을 감깁니다.
import { useEffect, useRef } from "react";
import * as THREE from "three";

const blinkUrl = (model: string) => `/models/Textures/texture-${model}-blink.png`;
// 눈 감은 스킨 그림이 없는 모델. 이 모델들은 눈을 감지 않습니다.
const NO_BLINK = new Set(["f", "m", "p", "q"]);

export type EyeSkin = {
  material: THREE.MeshBasicMaterial; // 이 캐릭터만 쓰는 재질
  open: THREE.Texture;
  closed: THREE.Texture;
};

// root: 이 캐릭터의 복사본, model: 캐릭터 종류(a~r)
export function useEyeSkin(root: THREE.Object3D, model: string) {
  const skin = useRef<EyeSkin | null>(null);

  useEffect(() => {
    // 원래 재질 → 이 캐릭터용 복사본. 부위(머리·몸·팔…)마다 같은 재질을 쓰므로 하나만 복사합니다.
    const own = new Map<THREE.Material, THREE.Material>();
    const originals: [THREE.Mesh, THREE.Material][] = [];
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
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
    const open = material?.map;
    let closed: THREE.Texture | null = null;
    if (material && open && !NO_BLINK.has(model)) {
      const loaded = new THREE.TextureLoader().load(blinkUrl(model), () => {
        skin.current = { material, open, closed: loaded };
      });
      // 원래 스킨과 같은 방식으로 입혀지도록 설정을 그대로 맞춥니다.
      loaded.flipY = open.flipY;
      loaded.colorSpace = open.colorSpace;
      loaded.wrapS = open.wrapS;
      loaded.wrapT = open.wrapT;
      loaded.minFilter = open.minFilter;
      loaded.magFilter = open.magFilter;
      closed = loaded;
    }

    return () => {
      skin.current = null;
      for (const [mesh, original] of originals) mesh.material = original;
      for (const copy of own.values()) copy.dispose();
      closed?.dispose();
    };
  }, [root, model]);

  return skin;
}

// 눈 뜬 스킨과 감은 스킨을 바꿔 끼웁니다. 스킨을 아직 못 불러왔으면 아무것도 하지 않습니다.
export function showEyes(skin: EyeSkin | null, closed: boolean) {
  if (!skin) return;
  const wanted = closed ? skin.closed : skin.open;
  if (skin.material.map !== wanted) skin.material.map = wanted;
}
