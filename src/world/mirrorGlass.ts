// 광장 가게 유리창: 밖에서 안이 보이지 않는 반사 유리 (선팅·하프미러 유리처럼).
// 예전에는 가까이 가면 실제 실내와 안의 사람을 그렸지만(ShopInteriors), 밖에서 안을 들여다볼 수 없게 바꿨습니다.
// 실내를 그리지 않고 재질 계산만 해서 가볍습니다. 모든 가게 창(1층 창·문 창·위층 앞 창)이 재질 하나를 같이 씁니다.
// 낮: 하늘이 비치는 어두운 유리. 밤: 안에서 불이 켜진 듯 따뜻하게 번지되 실내 모습은 보이지 않음. 비스듬히 볼수록 더 많이 비침(프레넬).
// 지점 안 통창 너머 거리(CafeWindows)에서도 같은 재질이라 어디서 봐도 남의 가게 안은 보이지 않습니다.
import * as THREE from 'three'
import { NIGHT_UNIFORM } from './worldMaterials'

// tint: 유리 너머 어두운 색(낮), warm: 밤에 번지는 불빛 색. reflect: 정면에서도 비치는 정도(낮·밤)
export const MIRROR_GLASS = {
  tint: [0.08, 0.1, 0.13], warm: [0.95, 0.72, 0.42], warmNight: 0.55,
  dayReflect: 0.7, nightReflect: 0.25, fresnel: 0.3, sheen: 0.18,
  zenith: [0.2, 0.42, 0.72], horizon: [0.72, 0.82, 0.9], nightSky: [0.03, 0.05, 0.11],
}
const vec3 = (c: number[]) => `vec3(${c.map((v) => v.toFixed(2)).join(',')})`

let cached: THREE.ShaderMaterial | null = null
export function mirrorGlassMat() {
  if (cached) return cached
  const G = MIRROR_GLASS
  cached = new THREE.ShaderMaterial({
    // 자르기 면(clippingPlanes)을 따르게: 지점 통창 너머 거리(CafeWindows)는 방 쪽을 잘라 내고 그리는데,
    // 직접 짠 셰이더는 아래 clipping 조각을 넣어야 잘립니다. 없으면 방 자리에 있는 이 유리가 창에 판처럼 비침 (이끼 정원 뒷창)
    clipping: true,
    uniforms: { night: NIGHT_UNIFORM }, // 밤 값은 setNightGlow 가 매 프레임 바꿈 (hallGlass 와 같이 씀)
    vertexShader: `
      #include <clipping_planes_pars_vertex>
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNor;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vNor = mat3(modelMatrix) * normal;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `
      #include <clipping_planes_pars_fragment>
      uniform float night;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNor;
      void main() {
        #include <clipping_planes_fragment>
        vec3 N = normalize(vNor);
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 R = reflect(-V, N);
        float up = clamp(R.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 sky = mix(mix(${vec3(G.horizon)}, ${vec3(G.zenith)}, up), ${vec3(G.nightSky)}, night);
        float fres = pow(1.0 - abs(dot(N, V)), 3.0);
        float amount = clamp(mix(${G.dayReflect.toFixed(2)}, ${G.nightReflect.toFixed(2)}, night) + ${G.fresnel.toFixed(2)} * fres, 0.0, 1.0);
        // 유리 너머: 무늬 없이 위가 조금 밝은 단색. 밤에는 따뜻한 불빛만 번짐
        vec3 inside = mix(${vec3(G.tint)}, ${vec3(G.warm)} * ${G.warmNight.toFixed(2)}, night) * (0.8 + 0.2 * vUv.y);
        vec3 col = mix(inside, sky, amount);
        // 유리에 스치는 비스듬한 빛 줄기 (자리마다 다르게, 밤에는 약하게)
        float band = pow(0.5 + 0.5 * sin((vWorld.x + vWorld.z + vWorld.y * 0.6) * 0.9), 18.0);
        col += band * ${G.sheen.toFixed(2)} * (1.0 - night * 0.8);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  return cached
}
