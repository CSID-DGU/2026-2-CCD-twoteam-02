// 캠퍼스 중정: 밝은 포장돌 원. 한가운데의 등불 나무와 잔디·빈백은 courtyard(LanternTree)가 그립니다.
import { useMemo } from 'react'
import * as THREE from 'three'
import type { CourtSpec } from './worldLogic'

const PAVE_TILE = 3.2 // 포장 그림 한 장이 덮는 크기(m)
const PAVE_Y = 0.03

// 밝은 크림색 포장돌: 줄마다 어긋나고 돌마다 색이 조금씩 다름, 줄눈은 옅게
let paveMap: THREE.CanvasTexture | null = null
function paveTexture() {
  if (paveMap) return paveMap
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  g.fillStyle = '#d9cfbd' // 줄눈
  g.fillRect(0, 0, S, S)
  const tones = ['#f3ecdf', '#efe5d4', '#f6f0e6', '#ebe0cd', '#f1e4d6']
  const rows = 8
  const rowH = S / rows
  const cols = 4
  const colW = S / cols
  for (let r = 0; r < rows; r++) {
    for (let k = -1; k < cols; k++) {
      g.fillStyle = tones[(r * 3 + k * 7 + 40) % tones.length]
      g.fillRect(k * colW + (r % 2 ? colW / 2 : 0) + 1.5, r * rowH + 1.5, colW - 3, rowH - 3)
    }
  }
  paveMap = new THREE.CanvasTexture(c)
  paveMap.wrapS = paveMap.wrapT = THREE.RepeatWrapping
  paveMap.colorSpace = THREE.SRGBColorSpace
  return paveMap
}

export function CampusCourt({ court }: { court: CourtSpec }) {
  const pave = useMemo(() => {
    const map = paveTexture().clone()
    map.repeat.set((court.r * 2) / PAVE_TILE, (court.r * 2) / PAVE_TILE)
    map.needsUpdate = true
    return new THREE.MeshStandardMaterial({ map, roughness: 0.9 })
  }, [court.r])
  return (
    <mesh position={[court.x, PAVE_Y, court.z]} rotation-x={-Math.PI / 2} material={pave}>
      <circleGeometry args={[court.r, 56]} />
    </mesh>
  )
}
