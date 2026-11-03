// 창 너머 장면(createPortal) 안의 카메라를 화면 카메라와 같게 맞춥니다. (#450)
//
// 왜 필요한가: R3F 포털은 처음 만들 때의 카메라를 자기 값으로 들고 있어, 화면 카메라가 바뀌어도(지점의 1인칭·위에서 보기·앉기) 따라오지 않습니다.
// 그러면 포털 안 WorldSky 가 옛 카메라에 하늘 레이어를 켜서 창에 하늘·별·달이 그려지지 않고, 달 판도 옛 카메라 쪽을 봅니다.
// 포털 안에 넣어 쓰고, camera 에는 포털 밖에서 읽은 화면 카메라를 넘깁니다.
import { useLayoutEffect } from 'react'
import { useThree } from '@react-three/fiber'
import type { Camera } from '@react-three/fiber'

export function PortalCamera({ camera }: { camera: Camera }) {
  const set = useThree((s) => s.set) // 포털 안이므로 포털 쪽 상태를 바꿉니다
  useLayoutEffect(() => set({ camera }), [camera, set])
  return null
}
