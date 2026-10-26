// 위에서 내려다보는 카메라. 지점과 회의실(#45)이 같이 씁니다.
import { useThree } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";

// 창 크기가 바뀌어도 공간 전체가 화면에 들어오도록 배율을 맞춥니다.
export function TopDownCamera({ area }: { area: { w: number; d: number } }) {
  const size = useThree((s) => s.size);
  const zoom = Math.min(
    size.width / (area.w + 1),
    size.height / (area.d + 1)
  );
  return (
    <OrthographicCamera
      makeDefault
      position={[0, 20, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      zoom={zoom}
    />
  );
}
