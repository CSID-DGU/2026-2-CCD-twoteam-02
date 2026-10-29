// 위에서 내려다보는 카메라. 지점과 회의실(#45), 광장(#315)이 같이 씁니다.
//
// 지점·회의실: 창 크기가 바뀌어도 공간 전체가 화면에 들어오도록 배율을 맞춥니다.
// 광장처럼 넓은 곳(followRef 를 넘김): 전체를 맞추면 캐릭터가 점처럼 작아지므로, 내 위치를 따라다니며 둘레 span(m)만 보여 줍니다.
import { useRef } from "react";
import type { RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";
import type * as THREE from "three";

const CAMERA_HEIGHT = 20; // 미니맵 카메라와 같은 높이
export const FOLLOW_SPAN = 30; // 따라다닐 때 화면 짧은 변에 들어오는 거리(m) 기본값

type Props = {
  area: { w: number; d: number };
  followRef?: RefObject<{ x: number; z: number }>; // 있으면 이 위치를 따라다님
  span?: number; // 따라다닐 때 화면 짧은 변에 들어오는 거리(m)
};

export function TopDownCamera({ area, followRef, span = FOLLOW_SPAN }: Props) {
  const size = useThree((s) => s.size);
  const camera = useRef<THREE.OrthographicCamera>(null);
  const zoom = followRef
    ? Math.min(size.width, size.height) / span
    : Math.min(size.width / (area.w + 1), size.height / (area.d + 1));

  // 따라다니기: 매 프레임 카메라를 내 위치 바로 위로 옮깁니다. (높이·회전은 그대로)
  useFrame(() => {
    const c = camera.current;
    const p = followRef?.current;
    if (!c || !p) return;
    c.position.x = p.x;
    c.position.z = p.z;
  });

  return (
    <OrthographicCamera
      ref={camera}
      makeDefault
      position={[0, CAMERA_HEIGHT, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      zoom={zoom}
    />
  );
}
