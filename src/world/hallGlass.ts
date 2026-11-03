// 캠퍼스 건물 유리: 안이 흐릿하게 비치고 하늘이 얹혀 "보이는 듯 안 보이는 듯" 보입니다.
// 실내를 실시간으로 그리지 않고 실내 그림을 흐리게(큰 밉맵) 읽어 가볍습니다. 빛 없이 재질 계산만 합니다.
// 낮: 실내는 어둡고 하늘 반사가 강함. 밤: 실내 불빛이 번져 보이고 반사는 약함. 비스듬히 볼수록 더 많이 비침(프레넬).
import * as THREE from 'three'
import { libraryPicture } from '../space/libraryTextures'
import { NIGHT_UNIFORM } from './worldMaterials'

export const HALL_GLASS = { blur: 3.2, dayInside: 0.3, nightInside: 0.85, dayReflect: 0.5, nightReflect: 0.1, fresnel: 0.5, sheen: 0.14, zenith: [0.2, 0.42, 0.72], horizon: [0.72, 0.82, 0.9], nightSky: [0.03, 0.05, 0.11] }
const vec3 = (c: number[]) => `vec3(${c.map((v) => v.toFixed(2)).join(',')})`

let cached: THREE.ShaderMaterial | null = null
export function hallGlassMat() {
  if (cached) return cached
  const G = HALL_GLASS
  cached = new THREE.ShaderMaterial({
    uniforms: { map: { value: libraryPicture() }, night: NIGHT_UNIFORM },
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
      uniform float night;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNor;
      void main() {
        vec3 N = normalize(vNor);
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 R = reflect(-V, N);
        float up = clamp(R.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 sky = mix(mix(${vec3(G.horizon)}, ${vec3(G.zenith)}, up), ${vec3(G.nightSky)}, night);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        float amount = clamp(mix(${G.dayReflect.toFixed(2)}, ${G.nightReflect.toFixed(2)}, night) + ${G.fresnel.toFixed(2)} * fres, 0.0, 1.0);
        vec3 inside = texture2D(map, vUv, ${G.blur.toFixed(1)}).rgb * mix(${G.dayInside.toFixed(2)}, ${G.nightInside.toFixed(2)}, night);
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
