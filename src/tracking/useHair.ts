// 머리카락: 고른 머리 모양의 입체 부품을 이 캐릭터의 머리에 붙이고 고른 머리 색을 입힙니다 (#296).
// 머리(head) 뼈의 자식이라 고개를 돌리면 같이 돕니다. 차림이 바뀌면 떼고 새로 붙입니다.
import { useEffect } from "react";
import type * as THREE from "three";
import { findPart, parseAvatarKey } from "../avatar/avatarLogic";
import { disposePartModel, loadPartModel, makePartModel } from "../avatar/partModel";

const HEAD_NODE = "head";

// root: 이 캐릭터의 복사본, model: 아바타 키
export function useHair(root: THREE.Object3D, model: string) {
  useEffect(() => {
    const head = root.getObjectByName(HEAD_NODE);
    const avatar = parseAvatarKey(model);
    const part = findPart("hair", avatar.hair);
    if (!head || !part?.model) return;
    let alive = true;
    let hair: THREE.Object3D | null = null;
    loadPartModel(part.model).then(
      (template) => {
        if (!alive) return;
        hair = makePartModel(template, part, avatar.hairColor);
        hair.name = "hair";
        head.add(hair);
      },
      (e: Error) => console.error("머리카락 모델을 불러오지 못했습니다:", e.message),
    );
    return () => {
      alive = false;
      if (hair) {
        head.remove(hair);
        disposePartModel(hair);
      }
    };
  }, [root, model]);
}
