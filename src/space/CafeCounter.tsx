// 카페 카운터 (바리스타 앞): 나무 판자 몸통 + 밝은 상판, 에스프레소 머신, 컵, 유리 빵 진열장, 위에 매단 메뉴판.
// 자리는 지점 JSON 의 barista (baristaLogic.counterBox). counter 가 false 인 지점(원래 카운터가 있는 학생회관 카페)은 메뉴판만.
import { useMemo } from 'react'
import * as THREE from 'three'
import type { Barista } from './baristaLogic'
import { COUNTER } from './baristaLogic'
import { colorMat, wallMat } from '../world/worldMaterials'
import { SIGN_FONT } from '../world/facadeTextures'

const ANGLE: Record<Barista['facing'], number> = { south: 0, north: Math.PI, east: Math.PI / 2, west: -Math.PI / 2 }
const BOARD = { w: 1.6, h: 1.0, y: 3.0 } // 매단 메뉴판 (바리스타 말풍선보다 위)

// 메뉴판 그림: 칠판에 손글씨 메뉴
function menuTexture(items: Barista['menu']) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 320
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#2b2f2a'
  ctx.fillRect(0, 0, 512, 320)
  ctx.strokeStyle = '#8a6a4a'
  ctx.lineWidth = 14
  ctx.strokeRect(7, 7, 498, 306)
  ctx.fillStyle = '#f4f1e6'
  ctx.textAlign = 'center'
  ctx.font = `700 46px ${SIGN_FONT.serif}`
  ctx.fillText('MENU', 256, 62)
  ctx.textAlign = 'left'
  ctx.font = `400 34px ${SIGN_FONT.hand}`
  items.slice(0, 5).forEach((m, i) => ctx.fillText(`${m.icon} ${m.name}`, 52, 116 + i * 44))
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function CafeCounter({ barista, wood = '#8a6a4a' }: { barista: Barista; wood?: string }) {
  const menu = useMemo(() => menuTexture(barista.menu), [barista.menu])
  const len = barista.w
  const chrome = colorMat('#c9ccd2')
  const top = colorMat('#efeae2')
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#dff3ff', transparent: true, opacity: 0.25, roughness: 0.05 }), [])
  return (
    // 카운터 기준: 길이는 x, 손님 쪽이 +z
    <group position={[barista.x, 0, barista.z]} rotation-y={ANGLE[barista.facing]}>
      {barista.counter && (
        <>
          <mesh position-y={COUNTER.h / 2} material={wallMat('planks', wood, len, COUNTER.h)}>
            <boxGeometry args={[len, COUNTER.h, COUNTER.d]} />
          </mesh>
          <mesh position-y={COUNTER.h + 0.03} material={top}>
            <boxGeometry args={[len + 0.1, 0.06, COUNTER.d + 0.12]} />
          </mesh>
          {/* 에스프레소 머신 (바리스타 쪽) */}
          <group position={[-len / 2 + 0.55, COUNTER.h + 0.06, -0.12]}>
            <mesh position-y={0.22} material={chrome}>
              <boxGeometry args={[0.6, 0.44, 0.4]} />
            </mesh>
            <mesh position={[0, 0.3, 0.205]} material={colorMat('#2b2b2b')}>
              <planeGeometry args={[0.5, 0.18]} />
            </mesh>
            {[-0.15, 0.15].map((x) => (
              <mesh key={x} position={[x, 0.1, 0.24]} material={colorMat('#1d1d1d')}>
                <cylinderGeometry args={[0.03, 0.03, 0.08, 8]} />
              </mesh>
            ))}
          </group>
          {/* 컵 쌓음 */}
          {[0, 1, 2].map((k) => (
            <mesh key={k} position={[-len / 2 + 1.05, COUNTER.h + 0.1 + k * 0.09, -0.15]} material={colorMat('#f4f1ea')}>
              <cylinderGeometry args={[0.06, 0.045, 0.09, 10]} />
            </mesh>
          ))}
          {/* 유리 빵 진열장 (손님 쪽) */}
          <group position={[len / 2 - 0.55, COUNTER.h + 0.06, 0.05]}>
            <mesh position-y={0.17} material={glass}>
              <boxGeometry args={[0.7, 0.34, 0.45]} />
            </mesh>
            {[-0.2, 0, 0.2].map((x, i) => (
              <mesh key={x} position={[x, 0.07, 0]} material={colorMat(['#c98a45', '#d9a35a', '#b8742f'][i])}>
                <sphereGeometry args={[0.07, 10, 8]} />
              </mesh>
            ))}
          </group>
        </>
      )}
      {/* 매단 메뉴판 (손님 쪽을 봄) */}
      <group position={[0, BOARD.y, -0.2]}>
        <mesh>
          <planeGeometry args={[BOARD.w, BOARD.h]} />
          <meshStandardMaterial map={menu} />
        </mesh>
        {[-0.6, 0.6].map((x) => (
          <mesh key={x} position={[x, BOARD.h / 2 + 0.4, 0]} material={colorMat('#2a2a2a')}>
            <cylinderGeometry args={[0.01, 0.01, 0.8, 4]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}
