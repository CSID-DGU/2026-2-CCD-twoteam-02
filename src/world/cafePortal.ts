// 카페 창 너머 실제 거리 (CafeWindows 가 씀). three.js 만 쓰는 코드라 컴포넌트 파일과 나눴습니다.
//
// 방법 (포털): 지점 화면 안에 캠리단길을 "따로 된 장면"(outside)으로 같이 두고, 매 프레임
//   1) 그 장면을 지금 카메라 그대로 화면 크기의 그림(렌더 타깃)에 그립니다. 출입문 벽 안쪽(방 쪽)은 잘라 냅니다(clip).
//   2) 창 구멍에 붙인 판이 그 그림에서 "화면의 자기 자리" 픽셀을 그대로 보여 줍니다.
// 그래서 걸으면 원근이 맞게 바뀌는 진짜 창처럼 보이고, 지점 조명은 거리에, 거리 가로등은 지점 안에 섞이지 않습니다.
// 출입문 벽·옆벽은 자르는 방향이 달라 벽마다 따로 그리고, 창이 화면에 없는 벽은 그리지 않습니다(가볍게). 그림은 화면의 PORTAL_SCALE 배 해상도.
import * as THREE from 'three'

export const PORTAL_SCALE = 0.6

// 창 판 재질: 렌더 타깃 그림을 화면 좌표로 읽음. 그림은 선형 색·톤매핑 전이라 여기서 화면처럼 바꿈
export function portalMaterial(map: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, res: { value: new THREE.Vector2(1, 1) } },
    vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D map;
      uniform vec2 res;
      void main() {
        gl_FragColor = texture2D(map, gl_FragCoord.xy / res);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
}

const frustum = new THREE.Frustum()
const viewProj = new THREE.Matrix4()
const buffer = new THREE.Vector2()

// 벽 하나의 창들: 그 벽 바깥만 남기는 자르기 면(clip), 그 벽 창에 비출 그림(target)·재질(mat), 창 자리(화면에 보이는지 확인용)
// shift: 그 벽을 그릴 때만 거리 장면을 옮김 (뒷벽: 실내가 건물보다 깊어서, 건물 실제 뒷면에서 내다본 풍경이 오게)
export type PortalView = { target: THREE.WebGLRenderTarget; mat: THREE.ShaderMaterial; clip: THREE.Plane; windows: THREE.Box3[]; shift?: THREE.Vector3 }
export type Portal = { scene: THREE.Scene; views: PortalView[] }

// 거리 장면을 벽마다 렌더 타깃에 그림 (useFrame 에서 화면보다 먼저). 창이 화면에 보이는 벽만
export function renderPortal(gl: THREE.WebGLRenderer, camera: THREE.Camera, p: Portal) {
  camera.updateMatrixWorld()
  viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  frustum.setFromProjectionMatrix(viewProj)
  gl.getDrawingBufferSize(buffer)
  const prevTarget = gl.getRenderTarget()
  const prevClip = gl.clippingPlanes
  for (const v of p.views) {
    if (!v.windows.some((b) => frustum.intersectsBox(b))) continue
    v.mat.uniforms.res.value.copy(buffer)
    gl.setRenderTarget(v.target)
    gl.clippingPlanes = [v.clip]
    if (v.shift) p.scene.position.copy(v.shift)
    else p.scene.position.set(0, 0, 0)
    gl.render(p.scene, camera)
  }
  p.scene.position.set(0, 0, 0)
  gl.clippingPlanes = prevClip
  gl.setRenderTarget(prevTarget)
}

// 화면 크기가 바뀌면 렌더 타깃도
export function resizePortal(p: Portal, width: number, height: number) {
  for (const v of p.views) v.target.setSize(Math.max(1, Math.floor(width * PORTAL_SCALE)), Math.max(1, Math.floor(height * PORTAL_SCALE)))
}

export function disposePortal(p: Portal) {
  for (const v of p.views) {
    v.target.dispose()
    v.mat.dispose()
  }
}
