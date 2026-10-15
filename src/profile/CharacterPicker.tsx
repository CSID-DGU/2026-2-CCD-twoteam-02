// 캐릭터 고르는 창: 18종을 3D 화면 하나에 6×3으로 세워 두고, 눌러서 고릅니다. (#131)
//
// 캐릭터마다 3D 화면(Canvas)을 따로 만들지 않는 이유: 18개가 동시에 돌면 무겁고(#137),
// 브라우저가 한 번에 열 수 있는 3D 화면 수(보통 16개)도 넘습니다.
// 고른 캐릭터는 뒤에 파란 원이 생기고 걷는 동작을 합니다.
// 창을 열면 18종을 모두 받아 두므로, 저장한 뒤 지점의 내 캐릭터가 바뀔 때 다시 기다리지 않습니다.
import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import type { Group, PerspectiveCamera } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { CHARACTER_MODELS, modelUrl } from './characters'

const COLS = 6
const GAP_X = 1.3 // 옆 캐릭터와의 간격
const GAP_Y = 1.8 // 윗줄과의 간격
const SCALE = 0.6 // 지점과 같은 크기 (키 약 1.6)
const FOV = 30
const MARGIN = 1.05 // 화면 가장자리 여백 비율
const SELECTED_COLOR = '#3b82f6' // 내 자리 표시와 같은 파랑
const FADE = 0.15

const ROWS = Math.ceil(CHARACTER_MODELS.length / COLS)
const GRID_W = COLS * GAP_X
const GRID_H = ROWS * GAP_Y

type Props = {
  value: string | null // 지금 고른 캐릭터 (아직 모르면 null)
  onChange: (model: string) => void
}

export function CharacterPicker({ value, onChange }: Props) {
  return (
    <div style={{ height: 340, borderRadius: 10, overflow: 'hidden', background: '#16181d' }}>
      <Canvas camera={{ fov: FOV, position: [0, 0, 12] }}>
        <ambientLight intensity={1.5} />
        <directionalLight position={[3, 5, 4]} intensity={1.5} />
        <FitCamera />
        {CHARACTER_MODELS.map((m, i) => (
          <Slot
            key={m}
            model={m}
            x={((i % COLS) - (COLS - 1) / 2) * GAP_X}
            // 캐릭터 발이 기준이라 칸 가운데보다 반 칸 아래에 세웁니다.
            y={(ROWS / 2 - Math.floor(i / COLS) - 1) * GAP_Y + 0.05}
            selected={m === value}
            onPick={onChange}
          />
        ))}
      </Canvas>
    </div>
  )
}

// 창 크기(폰·노트북)에 맞춰 18종이 다 보이도록 카메라 거리를 정합니다.
function FitCamera() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const { width, height } = useThree((s) => s.size)
  useEffect(() => {
    const half = Math.tan((FOV * Math.PI) / 360) // 화면 절반 높이 / 거리
    const aspect = width / height
    const distance = Math.max(GRID_H / 2 / half, GRID_W / 2 / (half * aspect)) * MARGIN
    camera.position.set(0, 0, distance)
    camera.lookAt(0, 0, 0)
  }, [camera, width, height])
  return null
}

type SlotProps = { model: string; x: number; y: number; selected: boolean; onPick: (model: string) => void }

function Slot({ model, x, y, selected, onPick }: SlotProps) {
  const ref = useRef<Group>(null!)
  const { scene, animations } = useGLTF(modelUrl(model))
  // 지점에 같은 모델이 있을 수 있으므로 복사본을 씁니다.
  const copy = useMemo(() => scene.clone(true), [scene])
  const { actions } = useAnimations(animations, ref)

  useEffect(() => {
    const action = selected ? actions.walk : actions.idle
    action?.reset().fadeIn(FADE).play()
    return () => {
      action?.fadeOut(FADE)
    }
  }, [actions, selected])

  // 캐릭터에 마우스를 올리면 누를 수 있다는 걸 손가락 커서로 알립니다.
  const cursor = (e: ThreeEvent<PointerEvent>, value: string) => {
    ;(e.nativeEvent.target as HTMLElement).style.cursor = value
  }

  return (
    <group
      ref={ref}
      position={[x, y, 0]}
      onClick={(e) => {
        e.stopPropagation()
        onPick(model)
      }}
      onPointerOver={(e) => cursor(e, 'pointer')}
      onPointerOut={(e) => cursor(e, '')}
    >
      {selected && (
        <mesh position={[0, 0.8, -0.4]}>
          <circleGeometry args={[0.62, 32]} />
          <meshBasicMaterial color={SELECTED_COLOR} transparent opacity={0.55} />
        </mesh>
      )}
      <primitive object={copy} scale={SCALE} />
    </group>
  )
}
