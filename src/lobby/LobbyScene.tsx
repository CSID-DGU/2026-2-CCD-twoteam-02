// 로비. 카페 지점들의 문이 늘어서 있고, 문 앞에서 E를 누르면 그 지점으로 들어간다.
//
// 지점 공간 파트(김현)의 Player 를 그대로 가져다 쓴다. Player 는 props 만 받으므로 고칠 게 없다.
// 문 접근 감지는 Player 의 좌석 감지(spots)를 그대로 쓴다. 문 앞 한 걸음 앞에 지점을 두면
// 가까이 갔을 때 onNear, E 를 누르면 onSeat 이 그 문 번호로 불린다.
// (Player 는 "앉으면" 캐릭터를 숨기지만, 문을 열면 곧바로 장면이 바뀌므로 보이지 않는다)
//
// 어느 문이 실제로 열리는지는 DB의 branches 를 보고 정한다. slug 가 없는 문은 준비 중이다.
import { useCallback, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrthographicCamera } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Player } from '../space/Player'
import type { Box, Spot } from '../space/layout'
import { supabase } from '../lib/supabase'
import lobby from './lobby.json'

const DOOR_GAP = 1.1 // 문 앞에서 이만큼 떨어진 곳이 입장 지점
const NO_KIOSK = { x: 1000, z: 1000 } // 로비에는 키오스크가 없다. 아래 Player 주석 참고

const COLOR = {
  floor: '#dfe6ee',
  wall: '#8a8f98',
  doorOpen: '#4ade80',
  doorSoon: '#6b7280',
  near: '#f59e0b',
}

type Branch = { id: number; slug: string; name: string }

// 문은 벽에 붙어 있으므로, 입장 지점은 문에서 방 안쪽으로 한 걸음 들어온 자리다.
const doorSpots: Spot[] = lobby.doors.map((d) => ({
  no: d.no,
  x: d.x,
  z: d.z + DOOR_GAP,
  rot: 0,
}))

const obstacles: Box[] = [
  ...lobby.walls,
  ...lobby.doors.map((d) => ({ x: d.x, z: d.z, w: d.w, d: d.d })),
]

function FitCamera() {
  const size = useThree((s) => s.size)
  const zoom = Math.min(size.width / (lobby.size.w + 1), size.height / (lobby.size.d + 1))
  return <OrthographicCamera makeDefault position={[0, 20, 0]} rotation={[-Math.PI / 2, 0, 0]} zoom={zoom} />
}

type Props = {
  onEnter: (branch: Branch) => void
}

export default function LobbyScene({ onEnter }: Props) {
  const [near, setNear] = useState<number | null>(null)
  const [branches, setBranches] = useState<Branch[] | null>(null)
  const [message, setMessage] = useState('')

  const loadBranches = useCallback(async () => {
    const { data, error } = await supabase.from('branches').select('id, slug, name').eq('is_open', true)
    if (error) {
      setMessage(`지점 목록을 불러오지 못했습니다: ${error.message}`)
      return [] as Branch[]
    }
    const list = (data ?? []) as Branch[]
    setBranches(list)
    return list
  }, [])

  // 들어갈 수 있는 문인지 확인하고 들어간다. 목록을 아직 안 읽었으면 이때 읽는다.
  async function tryEnter(doorNo: number | null) {
    if (doorNo === null) return
    const door = lobby.doors.find((d) => d.no === doorNo)
    if (!door) return
    const list = branches ?? (await loadBranches())
    const found = list.find((b) => b.slug === door.slug)
    if (!found) {
      setMessage(`${door.label}은 아직 준비 중입니다.`)
      return
    }
    setMessage('')
    onEnter(found)
  }

  const nearDoor = lobby.doors.find((d) => d.no === near)
  const hint = nearDoor ? `${nearDoor.label} · E 입장` : '방향키나 WASD로 움직여 문 앞으로 가세요'

  return (
    <>
      <Canvas>
        <FitCamera />
        <ambientLight intensity={1.2} />
        <directionalLight position={[6, 12, 4]} intensity={0.6} />

        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[lobby.size.w, lobby.size.d]} />
          <meshStandardMaterial color={COLOR.floor} />
        </mesh>

        {lobby.walls.map((w, i) => (
          <mesh key={`wall-${i}`} position={[w.x, 1.25, w.z]}>
            <boxGeometry args={[w.w, 2.5, w.d]} />
            <meshStandardMaterial color={COLOR.wall} />
          </mesh>
        ))}

        {lobby.doors.map((d) => {
          const open = branches === null || branches.some((b) => b.slug === d.slug)
          const color = d.no === near ? COLOR.near : open ? COLOR.doorOpen : COLOR.doorSoon
          return (
            <mesh key={d.no} position={[d.x, 1.1, d.z]}>
              <boxGeometry args={[d.w, 2.2, d.d]} />
              <meshStandardMaterial color={color} />
            </mesh>
          )
        })}

        <Player
          obstacles={obstacles}
          spawn={lobby.spawn}
          spots={doorSpots}
          // 로비에는 키오스크가 없다. Player 가 키오스크 좌표를 반드시 받으므로,
          // 걸어서 닿을 수 없는 자리를 줘서 감지가 일어나지 않게 한다. (로비는 30×18 크기다)
          kiosk={NO_KIOSK}
          frozen={false}
          onNearKiosk={() => {}}
          onKiosk={() => {}}
          onNear={setNear}
          onSeat={(no) => void tryEnter(no)}
        />
      </Canvas>

      <div style={hintBox}>{message || hint}</div>
    </>
  )
}

const hintBox: React.CSSProperties = {
  position: 'fixed',
  left: '50%',
  bottom: 24,
  transform: 'translateX(-50%)',
  padding: '8px 16px',
  borderRadius: 8,
  background: 'rgba(32,35,42,.85)',
  color: '#fff',
  font: '14px system-ui, sans-serif',
}
