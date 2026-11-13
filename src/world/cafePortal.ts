// 카페 창 너머 실제 거리 (CafeWindows 가 씀). three.js 만 쓰는 코드라 컴포넌트 파일과 나눴습니다.
//
// 방법 (포털): 지점 화면 안에 캠리단길을 "따로 된 장면"(outside)으로 같이 두고, 매 프레임
//   1) 그 장면을 지금 카메라 그대로 화면 크기의 그림(렌더 타깃)에 그립니다. 출입문 벽 안쪽(방 쪽)은 잘라 냅니다(clip).
//   2) 창 구멍에 붙인 판이 그 그림에서 "화면의 자기 자리" 픽셀을 그대로 보여 줍니다.
// 그래서 걸으면 원근이 맞게 바뀌는 진짜 창처럼 보이고, 지점 조명은 거리에, 거리 가로등은 지점 안에 섞이지 않습니다.
// 출입문 벽·옆벽은 자르는 방향이 달라 벽마다 따로 그리고, 창이 화면에 없는 벽은 그리지 않습니다(가볍게). 그림 해상도는 PORTAL_PIXEL_RATIO.
// 광장 전체를 한 번 더 그리는 일이라 무거워서 두 가지로 줄입니다 (#516):
//   - 해상도: CSS 픽셀의 PORTAL_PIXEL_RATIO 배로 상한. 예전(화면의 0.6배, dpr 상한 없음)과 레티나에서 같고, 더 촘촘한 화면에서는 더 커지지 않음
//   - 횟수: 카메라가 멈춰 있으면(앉아서 공부) 초당 약 30번만. 움직이면 매 프레임
//     (지난 그림을 화면 자리로 읽으므로 카메라가 돌 때 옛 그림을 쓰면 창 밖 풍경이 창틀과 어긋나 미끄러져 보임)
//   - 범위: 창들이 화면에서 차지하는 네모 안만 그림. 네모 밖 픽셀은 칠하지 않고(scissor),
//     카메라 시야도 그 네모로 좁혀(setViewOffset: 화면 일부만 찍는 카메라) 창 밖으로 안 보이는 건물·나무는 그리기에서 빠짐.
//     창이 읽는 픽셀은 화면 전체를 그렸을 때와 똑같음
import * as THREE from 'three'

// 창 너머 그림의 해상도: CSS 픽셀 1개당 그림 픽셀 수. 화면(dpr)보다 촘촘하게는 그리지 않음
// 1.2 = 예전 레티나(dpr 2 × 0.6)와 같은 화질. 0.6·1.0 은 창 밖이 흐려 보였음 (#516, 화면 확인)
export const PORTAL_PIXEL_RATIO = 1.2
// 카메라가 멈췄을 때 다시 그리는 최소 간격(ms). 30Hz(33ms)보다 조금 짧게: 60Hz 화면에서 프레임 간격이 조금 흔들려도 두 프레임에 한 번
export const PORTAL_STILL_MS = 28
// 카메라 행렬(투영×시점) 원소가 이만큼 안 바뀌면 멈춘 것으로 봄. 앉은 시점 카메라는 매 프레임 조금씩 따라가는(lerp·slerp) 중이라
// 완전히 같은 값이 안 될 수 있음. 1e-5 는 2000px 화면에서 약 0.01px 차이
export const PORTAL_MOVE_EPS = 1e-5

// 창 너머 그림을 그려 둘 곳. 8비트 색(픽셀당 4바이트, HalfFloat 의 절반)
// sRGB 로 저장(SRGB8_ALPHA8)해서 어두운 곳 색 띠를 막음: 그릴 때·읽을 때 GPU 가 선형 색으로 알아서 바꿈
// 대신 1 보다 밝은 빛(가로등 등)은 톤매핑 전에 1 에서 잘림 (#516, 화면 비교로 확인)
export function portalTarget() {
  return new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace })
}

// 창 판 재질: 렌더 타깃 그림을 화면 좌표로 읽음. 그림은 선형 색·톤매핑 전이라 여기서 화면처럼 바꿈
// 투명도는 1 로 고정: 그림의 빈 곳이 투명하면 캔버스도 투명해져 페이지 배경(다크·라이트 모드 색)이 비침 (#450)
export function portalMaterial(map: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, res: { value: new THREE.Vector2(1, 1) } },
    vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D map;
      uniform vec2 res;
      void main() {
        gl_FragColor = vec4(texture2D(map, gl_FragCoord.xy / res).rgb, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
}

const frustum = new THREE.Frustum()
const viewProj = new THREE.Matrix4()
const buffer = new THREE.Vector2()
const corner = new THREE.Vector4()
const RECT_MARGIN = 2 // 네모 가장자리 여유(그림 픽셀). 반올림으로 창 테두리 한 줄이 비지 않게
// 벽마다 마지막으로 그린 시각 (없으면 그림이 낡음: 처음, 창이 화면 밖에 있었음, 크기 바뀜, 위에서 보기)
const drawnAt = new WeakMap<PortalView, number>()
// 포털마다 마지막으로 그릴 때의 카메라 (viewProj 와 같은 값). 달라졌으면 카메라가 움직인 것
const lastViewProj = new WeakMap<Portal, THREE.Matrix4>()
// 포털마다 거리를 찍는 카메라: 화면 카메라를 매번 그대로 베끼고 시야만 창 네모로 좁힘 (화면 카메라는 건드리지 않음)
const portalCams = new WeakMap<Portal, THREE.PerspectiveCamera>()
function portalCamOf(p: Portal) {
  let cam = portalCams.get(p)
  if (!cam) {
    cam = new THREE.PerspectiveCamera()
    portalCams.set(p, cam)
  }
  return cam
}

// 창 상자들이 화면에서 차지하는 네모를 그림 픽셀로 [x, y(아래 기준), 폭, 높이]. 화면 밖 창은 뺌.
// 창 귀퉁이가 카메라 뒤에 있으면 화면 위치를 못 구하므로 null (= 화면 전체를 그림)
function windowRect(boxes: THREE.Box3[], w: number, h: number): [number, number, number, number] | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const b of boxes) {
    if (!frustum.intersectsBox(b)) continue
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z, 1).applyMatrix4(viewProj)
      if (corner.w <= 1e-6) return null
      const nx = corner.x / corner.w, ny = corner.y / corner.w
      x0 = Math.min(x0, nx); x1 = Math.max(x1, nx); y0 = Math.min(y0, ny); y1 = Math.max(y1, ny)
    }
  }
  // 화면 좌표(-1~1) → 그림 픽셀, 화면 밖은 잘라 냄
  const px0 = Math.max(0, Math.floor(((Math.max(x0, -1) + 1) / 2) * w) - RECT_MARGIN)
  const py0 = Math.max(0, Math.floor(((Math.max(y0, -1) + 1) / 2) * h) - RECT_MARGIN)
  const px1 = Math.min(w, Math.ceil(((Math.min(x1, 1) + 1) / 2) * w) + RECT_MARGIN)
  const py1 = Math.min(h, Math.ceil(((Math.min(y1, 1) + 1) / 2) * h) + RECT_MARGIN)
  if (px1 <= px0 || py1 <= py0) return null
  return [px0, py0, px1 - px0, py1 - py0]
}

function nearlySame(a: THREE.Matrix4, b: THREE.Matrix4) {
  for (let i = 0; i < 16; i++) if (Math.abs(a.elements[i] - b.elements[i]) > PORTAL_MOVE_EPS) return false
  return true
}

// 벽 하나의 창들: 그 벽 바깥만 남기는 자르기 면(clip), 그 벽 창에 비출 그림(target)·재질(mat), 창 자리(화면에 보이는지 확인용)
// shift: 그 벽을 그릴 때만 거리 장면을 옮김 (뒷벽: 실내가 건물보다 깊어서, 건물 실제 뒷면에서 내다본 풍경이 오게)
// clip 이 없으면 자르지 않음 (둥근 도서관: 창이 사방이라 면 하나로 못 자르고, 방 자리의 물체를 빼서 그림)
export type PortalView = { target: THREE.WebGLRenderTarget; mat: THREE.ShaderMaterial; clip?: THREE.Plane; windows: THREE.Box3[]; shift?: THREE.Vector3 }
export type Portal = { scene: THREE.Scene; views: PortalView[] }

// 거리 장면을 벽마다 렌더 타깃에 그림 (useFrame 에서 화면보다 먼저). 창이 화면에 보이는 벽만
// 위에서 보기는 건너뜀: 세로 유리가 화면에 안 보임. 1인칭으로 돌아오면 그 프레임에 화면보다 먼저 다시 그림
// 카메라가 그대로면 벽마다 PORTAL_STILL_MS 안에 한 번만 그림 (그사이 창은 지난 그림을 그대로 보여 줌)
export function renderPortal(gl: THREE.WebGLRenderer, camera: THREE.Camera, p: Portal) {
  if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
    for (const v of p.views) drawnAt.delete(v)
    return
  }
  const now = performance.now()
  camera.updateMatrixWorld()
  viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  let last = lastViewProj.get(p)
  const moved = !last || !nearlySame(last, viewProj)
  if (!last) lastViewProj.set(p, (last = new THREE.Matrix4()))
  last.copy(viewProj)
  frustum.setFromProjectionMatrix(viewProj)
  gl.getDrawingBufferSize(buffer)
  const prevTarget = gl.getRenderTarget()
  const prevClip = gl.clippingPlanes
  const cam = portalCamOf(p)
  cam.copy(camera as THREE.PerspectiveCamera, false) // 시야각·비율·레이어(하늘)·월드 행렬까지 같게. false: 자식은 베끼지 않음
  // 위치는 베낀 월드 행렬을 그대로 씀. 렌더러가 위치·회전으로 다시 계산하지 않게 (화면 카메라는 좌석 등 부모 아래 있을 수 있음)
  // copy 가 이 두 값도 화면 카메라 것으로 덮으므로 매번 다시 끔
  cam.matrixAutoUpdate = false
  cam.matrixWorldAutoUpdate = false
  for (const v of p.views) {
    if (!v.windows.some((b) => frustum.intersectsBox(b))) {
      drawnAt.delete(v) // 화면 밖이던 동안 그림이 낡음 → 다시 보이는 프레임에 바로 그림
      continue
    }
    const at = drawnAt.get(v)
    if (!moved && at !== undefined && now - at < PORTAL_STILL_MS) continue
    drawnAt.set(v, now)
    v.mat.uniforms.res.value.copy(buffer)
    const { width: tw, height: th } = v.target
    const rect = windowRect(v.windows, tw, th)
    if (rect) {
      const [x, y, w, h] = rect
      cam.setViewOffset(tw, th, x, th - y - h, w, h) // setViewOffset 은 위쪽 기준이라 y 를 뒤집음
      v.target.viewport.set(x, y, w, h)
      v.target.scissor.set(x, y, w, h)
    } else {
      cam.clearViewOffset()
      v.target.viewport.set(0, 0, tw, th)
      v.target.scissor.set(0, 0, tw, th)
    }
    v.target.scissorTest = true // 지우기(clear)도 네모 안만
    gl.setRenderTarget(v.target)
    gl.clippingPlanes = v.clip ? [v.clip] : []
    if (v.shift) p.scene.position.copy(v.shift)
    else p.scene.position.set(0, 0, 0)
    gl.render(p.scene, cam)
  }
  p.scene.position.set(0, 0, 0)
  gl.clippingPlanes = prevClip
  gl.setRenderTarget(prevTarget)
}

// 화면 크기가 바뀌면 렌더 타깃도. width·height 는 CSS 픽셀(useThree 의 size), dpr 은 화면 픽셀 배율
// 그림 크기만 줄이고, 창 판은 화면 위 비율(gl_FragCoord / res)로 읽으므로 자리는 그대로 맞음
export function resizePortal(p: Portal, width: number, height: number, dpr: number) {
  const k = Math.min(dpr, PORTAL_PIXEL_RATIO)
  for (const v of p.views) {
    v.target.setSize(Math.max(1, Math.floor(width * k)), Math.max(1, Math.floor(height * k)))
    drawnAt.delete(v) // 크기를 바꾸면 그림이 지워짐
  }
}

export function disposePortal(p: Portal) {
  for (const v of p.views) {
    v.target.dispose()
    v.mat.dispose()
  }
}
