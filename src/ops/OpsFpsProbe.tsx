// 운영 기록용 FPS 측정기 (#590). 광장·지점·회의실의 Canvas 안에 하나씩 둡니다.
//
// 설정의 "FPS 표시"(FpsProbe)와 따로 늘 돕니다. 프레임 간격만 collector 에 넘기고 화면 상태는 바꾸지 않아
// 다시 그리는 일이 생기지 않습니다. 1분 요약은 collector·opsLogic 이 만듭니다.
import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { fpsFrame, fpsStart, fpsStop, setGpu } from './collector'

// place: plaza·campus·beach(world.id), branch:<slug>, meeting
export function OpsFpsProbe({ place }: { place: string }) {
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    fpsStart(place)
    return () => fpsStop()
  }, [place])

  // 그래픽 카드 이름: 어떤 기기에서 끊기는지 찾는 데 가장 쓸모 있음. 브라우저가 감추면 빈 문자열
  useEffect(() => {
    try {
      const ctx = gl.getContext()
      const ext = ctx.getExtension('WEBGL_debug_renderer_info')
      setGpu(ext ? String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '') : '')
    } catch {
      setGpu('')
    }
  }, [gl])

  useFrame((_, delta) => fpsFrame(delta))
  return null
}
