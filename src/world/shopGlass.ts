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
import { nightGlow } from './worldMaterials'
import { libraryPicture } from '../space/libraryTextures'

export const SHOP_SCALE = 0.4 // 실내 그림 해상도 (화면 대비)
export const SHOP_NEAR = 20 // 카메라가 이 거리(m) 안일 때만 실제 실내
export const MAX_LIVE = 1 // 한 프레임에 실제 실내를 그리는 가게 수
const SHOP_BG = new THREE.Color('#1a1a1a') // 실내 장면 바탕 (천장 없는 지점 위쪽)
// 원통 도서관 유리: 낮에는 하늘이 비치고(reflect) 실내는 어둡게(dayInside), 밤에는 안에서 불이 켜진 듯 밝게(nightInside)
export const DRUM_GLASS = { top: 6.6, reflect: 0.2, fresnel: 0.65, dayInside: 0.62, nightInside: 1.25, zenith: [0.2, 0.42, 0.72], horizon: [0.72, 0.82, 0.92] }
const vec3 = (c: number[]) => `vec3(${c.map((v) => v.toFixed(2)).join(',')})`

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

// facing·center: 입구가 보는 방향과 건물 가운데. 있으면 건물 뒤쪽에서는 실내를 그리지 않음 (창이 앞쪽에만 있는 원통 도서관. 옆 창은 문 면보다 뒤라 가운데 기준)
export type ShopView = { scene: THREE.Scene; target: THREE.WebGLRenderTarget; mat: THREE.ShaderMaterial; front: THREE.Box3; door: THREE.Vector3; facing?: THREE.Vector3; center?: THREE.Vector3 }
const views = new Map<string, ShopView>()

// 하늘이 비치는 유리 (원통 도서관). 곡면이라 면 방향으로 반사 세기를 계산합니다. 빛 없이 재질만이라 가볍습니다
function reflectiveGlass(map: THREE.Texture, fallback: THREE.Texture) {
  const G = DRUM_GLASS
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, fallback: { value: fallback }, res: { value: new THREE.Vector2(1, 1) }, live: { value: 0 }, night: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNor;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vNor = mat3(modelMatrix) * normal;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform sampler2D map;
      uniform sampler2D fallback;
      uniform vec2 res;
      uniform float live;
      uniform float night;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNor;
      void main() {
        vec3 inside = live > 0.5 ? texture2D(map, gl_FragCoord.xy / res).rgb : texture2D(fallback, vUv).rgb;
        vec3 V = normalize(vWorld - cameraPosition);
        vec3 N = normalize(vNor);
        float f = pow(1.0 - abs(dot(V, N)), 3.0);
        vec3 R = reflect(V, N);
        vec3 sky = mix(${vec3(G.horizon)}, ${vec3(G.zenith)}, clamp(R.y * 1.4 + 0.25, 0.0, 1.0));
        float amount = clamp(${G.reflect.toFixed(2)} + ${G.fresnel.toFixed(2)} * f, 0.0, 1.0) * (1.0 - night);
        gl_FragColor = vec4(mix(inside * mix(${G.dayInside.toFixed(2)}, ${G.nightInside.toFixed(2)}, night), sky, amount), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
}

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

// 원통 도서관의 유리창 재질과 실내 장면. 파사드가 없어 그림은 도서관 실내, 유리는 하늘이 비치는 재질 (shopView 보다 먼저 불러 이것으로 만듦)
export function drumView(slug: string): ShopView {
  let v = views.get(slug)
  if (!v) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
    const scene = new THREE.Scene()
    scene.background = SHOP_BG
    v = { scene, target, mat: reflectiveGlass(target.texture, libraryPicture()), front: new THREE.Box3(), door: new THREE.Vector3(), facing: new THREE.Vector3(), center: new THREE.Vector3() }
    views.set(slug, v)
  }
  return v
}

const frustum = new THREE.Frustum()
const viewProj = new THREE.Matrix4()
const buffer = new THREE.Vector2()
const camPos = new THREE.Vector3()
const toCam = new THREE.Vector3()
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
    if (v.mat.uniforms.night) v.mat.uniforms.night.value = nightGlow()
    if (v.front.isEmpty()) continue
    if (v.facing && v.center && toCam.subVectors(camPos, v.center).dot(v.facing) < 0) continue // 건물 뒤쪽이면 창이 안 보임
    const d = camPos.distanceTo(v.door)
    if (d <= SHOP_NEAR && frustum.intersectsBox(v.front)) near.push({ v, d })
  }
  // 위에서 보기(직교 카메라)는 세로 유리가 화면에 안 보여 실내를 그리지 않음. 1인칭으로 돌아오면 그 프레임에 화면보다 먼저 다시 그림
  if (near.length === 0 || (camera as THREE.OrthographicCamera).isOrthographicCamera) return
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
export function placeShop(slug: string, front: THREE.Box3, door: THREE.Vector3, facing?: THREE.Vector3, center?: THREE.Vector3) {
  const v = shopView(slug)
  v.front.copy(front)
  v.door.copy(door)
  if (facing) v.facing?.copy(facing)
  if (center) v.center?.copy(center)
}
