// 광장에서 가게 앞면 유리창으로 실제 실내가 보이게 (ShopInteriors 가 씀). three.js 만 쓰는 코드라 컴포넌트 파일과 나눴습니다.
//
// 방법은 지점 안 통창(cafePortal)의 반대 방향입니다. 광장 화면 안에 가게마다 실내를 "따로 된 장면"으로 두고,
// 그 가게 창이 화면에 보이고 가까울 때 그 장면을 지금 카메라로 그림(렌더 타깃)에 그립니다.
// 가게 유리창 판(Facades 의 Pane, 위층 앞 창)은 그 그림에서 화면의 자기 자리 픽셀을 보여 줍니다.
// 무거워서 한 프레임에 가장 가까운 MAX_LIVE 곳만 실제 실내를 그리고, 나머지 창은 실내 그림(interiorTexture)을 보여 줍니다.
// 실내 장면은 지점 테마 조명만 받아 거리 가로등·밤과 섞이지 않습니다. 가게마다 그림 한 장(slug 별로 한 번 만듦).
import * as THREE from 'three'
import type { FacadeStyle } from './worldLogic'
import { interiorTexture } from './facadeTextures'

export const SHOP_SCALE = 0.4 // 실내 그림 해상도 (화면 대비)
export const SHOP_NEAR = 20 // 카메라가 이 거리(m) 안일 때만 실제 실내
export const MAX_LIVE = 1 // 한 프레임에 실제 실내를 그리는 가게 수
const SHOP_BG = new THREE.Color('#1a1a1a') // 실내 장면 바탕 (천장 없는 지점 위쪽)

// live 1: 렌더 타깃(실제 실내)을 화면 좌표로, 0: 실내 그림을 판 좌표로
function glassMaterial(map: THREE.Texture, fallback: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, fallback: { value: fallback }, res: { value: new THREE.Vector2(1, 1) }, live: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D map;
      uniform sampler2D fallback;
      uniform vec2 res;
      uniform float live;
      varying vec2 vUv;
      void main() {
        gl_FragColor = live > 0.5 ? texture2D(map, gl_FragCoord.xy / res) : vec4(texture2D(fallback, vUv).rgb * 0.9, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
}

export type ShopView = { scene: THREE.Scene; target: THREE.WebGLRenderTarget; mat: THREE.ShaderMaterial; front: THREE.Box3; door: THREE.Vector3 }
const views = new Map<string, ShopView>()

// 그 가게 유리창 재질과 실내 장면 (처음 부를 때 만듦)
export function shopView(slug: string, style: FacadeStyle = 'classic'): ShopView {
  let v = views.get(slug)
  if (!v) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
    const scene = new THREE.Scene()
    scene.background = SHOP_BG
    v = { scene, target, mat: glassMaterial(target.texture, interiorTexture(style)), front: new THREE.Box3(), door: new THREE.Vector3() }
    views.set(slug, v)
  }
  return v
}
export const shopGlass = (slug: string, style: FacadeStyle) => shopView(slug, style).mat

const frustum = new THREE.Frustum()
const viewProj = new THREE.Matrix4()
const buffer = new THREE.Vector2()
const camPos = new THREE.Vector3()
const near: { v: ShopView; d: number }[] = []

// 보이는·가까운 가게 중 가장 가까운 MAX_LIVE 곳만 실내를 그림 (useFrame 에서 화면보다 먼저)
export function renderShops(gl: THREE.WebGLRenderer, camera: THREE.Camera, slugs: string[]) {
  camera.updateMatrixWorld()
  viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  frustum.setFromProjectionMatrix(viewProj)
  camera.getWorldPosition(camPos)
  near.length = 0
  for (const slug of slugs) {
    const v = views.get(slug)
    if (!v) continue
    v.mat.uniforms.live.value = 0
    if (v.front.isEmpty()) continue
    const d = camPos.distanceTo(v.door)
    if (d <= SHOP_NEAR && frustum.intersectsBox(v.front)) near.push({ v, d })
  }
  if (near.length === 0) return
  near.sort((a, b) => a.d - b.d)
  gl.getDrawingBufferSize(buffer)
  const w = Math.max(1, Math.floor(buffer.x * SHOP_SCALE))
  const h = Math.max(1, Math.floor(buffer.y * SHOP_SCALE))
  const prev = gl.getRenderTarget()
  for (const { v } of near.slice(0, MAX_LIVE)) {
    if (v.target.width !== w || v.target.height !== h) v.target.setSize(w, h)
    v.mat.uniforms.res.value.copy(buffer)
    v.mat.uniforms.live.value = 1
    gl.setRenderTarget(v.target)
    gl.render(v.scene, camera)
  }
  gl.setRenderTarget(prev)
}

// 가게 앞면 자리 (화면에 보이는지·가까운지 판단용)
export function placeShop(slug: string, front: THREE.Box3, door: THREE.Vector3) {
  const v = shopView(slug)
  v.front.copy(front)
  v.door.copy(door)
}
