// 해변 밤 조명: 모래 위 횃불. 불꽃은 빛나는 재질과 번짐 판으로만 그리고(실시간 빛 없음), 밤에만 커집니다.
// 파라솔 전구는 BeachSeats, 산책로 줄 전구·가로등은 다른 바깥 공간과 같은 StringLights·Lamps 가 그립니다.
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Point } from './worldLogic'
import { nightGlow } from './worldMaterials'
import { glowTexture } from './beachTextures'

const TORCH = { h: 1.7, r: 0.045, cup: 0.09, flameH: 0.34, flameR: 0.1 } // 대·불꽃 크기
const FIRE = { color: '#ffae4d', day: 0.15, night: 2.6, flickerSpeed: 9, showAbove: 0.04 } // 불꽃 색, 낮·밤 세기, 흔들림 빠르기
const HALO = { size: 2.2, ground: 7, dayOpacity: 0, haloOpacity: 0.55, groundOpacity: 0.34 } // 불꽃 둘레·땅 빛 번짐

const poleMat = new THREE.MeshStandardMaterial({ color: '#6d4c30', roughness: 0.85 })
const flameMat = new THREE.MeshStandardMaterial({ color: FIRE.color, emissive: FIRE.color, emissiveIntensity: FIRE.day })
const haloMat = new THREE.SpriteMaterial({ color: FIRE.color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })
const groundMat = new THREE.MeshBasicMaterial({ color: FIRE.color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })

export function BeachLights({ torches }: { torches: Point[] }) {
  const flames = useRef<(THREE.Mesh | null)[]>([])
  useFrame(({ clock }) => {
    if (!haloMat.map) {
      haloMat.map = glowTexture()
      groundMat.map = glowTexture()
      haloMat.needsUpdate = true
      groundMat.needsUpdate = true
    }
    const g = Math.min(1, nightGlow())
    const t = clock.elapsedTime
    flameMat.emissiveIntensity = FIRE.day + (FIRE.night - FIRE.day) * g
    haloMat.opacity = HALO.haloOpacity * g
    groundMat.opacity = HALO.groundOpacity * g
    flames.current.forEach((m, i) => {
      if (!m) return
      m.visible = g > FIRE.showAbove // 낮에는 꺼짐
      const f = Math.sin(t * FIRE.flickerSpeed + i * 1.7) * 0.5 + Math.sin(t * FIRE.flickerSpeed * 1.7 + i) * 0.5
      m.scale.set(1 + f * 0.1, 1 + f * 0.18, 1 + f * 0.1)
    })
  })
  return (
    <group>
      {torches.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <mesh position-y={TORCH.h / 2} material={poleMat}>
            <cylinderGeometry args={[TORCH.r, TORCH.r * 1.2, TORCH.h, 6]} />
          </mesh>
          <mesh position-y={TORCH.h} material={poleMat}>
            <cylinderGeometry args={[TORCH.cup, TORCH.cup * 0.6, 0.12, 8]} />
          </mesh>
          <mesh
            ref={(m) => {
              flames.current[i] = m
            }}
            position-y={TORCH.h + 0.06 + TORCH.flameH / 2}
            material={flameMat}
          >
            <coneGeometry args={[TORCH.flameR, TORCH.flameH, 8]} />
          </mesh>
          <sprite position-y={TORCH.h + 0.2} scale={[HALO.size, HALO.size, 1]} material={haloMat} />
          <mesh rotation-x={-Math.PI / 2} position-y={0.06} material={groundMat}>
            <planeGeometry args={[HALO.ground, HALO.ground]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
