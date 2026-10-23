// 로비. 카페 지점들의 문이 늘어서 있고, 문 앞에서 E를 누르면 그 지점으로 들어간다.
//
// 지점 공간 파트(김현)의 Player 를 그대로 가져다 쓴다. Player 는 props 만 받으므로 고칠 게 없다.
// 문 접근 감지는 Player 의 좌석 감지(spots)를 그대로 쓴다. 문 앞 한 걸음 앞에 지점을 두면
// 가까이 갔을 때 onNear, E 를 누르면 onSeat 이 그 문 번호로 불린다.
// (Player 는 "앉으면" 캐릭터를 숨기지만, 문을 열면 곧바로 장면이 바뀌므로 보이지 않는다)
//
// 어느 문이 실제로 열리는지는 DB의 branches 를 보고 정한다. slug 가 없는 문은 준비 중이다.
//
// 시점은 지점과 같다: 처음엔 1인칭으로 걸어 다니고, V 로 위에서 보기와 바꾼다. (#71)
// 1인칭에서는 어느 문이 어느 지점인지 보이도록 문마다 이름 간판을 단다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrthographicCamera } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useLocation } from 'react-router'
import { Player } from '../space/Player'
import { WalkCamera } from '../space/WalkCamera'
import { LABEL_PX, labelTexture } from '../space/labelTexture'
import { useSession } from '../auth/useSession'
import { InfoPanel } from '../menu/InfoPanel'
import { SceneMenu } from '../menu/SceneMenu'
import type { PanelView } from '../menu/panelTypes'
import { panelKey } from '../menu/panelTypes'
import { useMenuShortcuts } from '../menu/useMenuShortcuts'
import { getKeymap, keyLabel, useKeymap } from '../menu/keymap'
import type { Box, Spot } from '../space/layout'
import { supabase } from '../lib/supabase'
import { useMyAvatar } from '../profile/useMyAvatar'
import { passageOf } from '../space/passage'
import { useWalkView } from '../space/useWalkView'
import { useParticipants } from '../realtime/useParticipants'
import { OtherParticipants } from '../realtime/OtherParticipants'
import { LOBBY_CHANNEL } from '../realtime/participants'
import type { PresenceState } from '../realtime/participants'
import { currentCondition } from '../study/condition'
import { useOnline, useOnlinePlace } from '../realtime/onlineContext'
import { LOBBY_PLACE } from '../realtime/online'
import { ChatOverlay } from '../chat/ChatOverlay'
import { EmoteControls } from '../space/EmoteControls'
import { newEmoteState } from '../space/emotes'
import lobby from './lobby.json'

const DOOR_GAP = 1.1 // 문 앞에서 이만큼 떨어진 곳이 입장 지점
// 지점에서 나오면 그 지점 문 앞 이만큼 떨어진 곳에 섭니다. 입장 지점(1.1)보다 멀어서
// 나오자마자 "입장" 안내가 뜨지 않습니다. (#150)
const ARRIVE_GAP = 2.1
const NO_KIOSK = { x: 1000, z: 1000 } // 로비에는 키오스크가 없다. 아래 Player 주석 참고
const SIGN = { width: 2.4, y: 1.75 } // 문 간판 크기와 높이 (문 높이 2.2)

const COLOR = {
  floor: '#dfe6ee',
  wall: '#8a8f98',
  doorOpen: '#4ade80',
  doorSoon: '#6b7280',
  near: '#f59e0b',
}

type Branch = { id: number; slug: string; name: string }

// 문은 벽에 붙어 있으므로, 입장 지점은 문에서 방 안쪽으로 한 걸음 들어온 자리다.
// 문은 Player 의 "앉는 자리"로 다루므로 E 를 누르면 몸이 rot 쪽으로 돈다. 문 쪽(-Z)을 보게 둔다.
const doorSpots: Spot[] = lobby.doors.map((d) => ({
  no: d.no,
  x: d.x,
  z: d.z + DOOR_GAP,
  rot: Math.PI,
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
  onEnter: (branch: Branch, heading: number) => void // heading: 문에 들어갈 때 보던 방향 (지점에서 그대로 섬, #150)
}

export default function LobbyScene({ onEnter }: Props) {
  const [near, setNear] = useState<number | null>(null)
  const [branches, setBranches] = useState<Branch[] | null>(null)
  const [message, setMessage] = useState('')
  // 처음엔 1인칭. V 로 바꾸면 지점에 다녀와도 유지합니다. (useWalkView)
  const [view, setView] = useWalkView()
  // 지점에서 문으로 나왔으면 그 지점 문 앞에서 보던 방향 그대로 섭니다(#150).
  // "로비로" 버튼으로 나왔으면 문을 등지고(+Z) 서고, 주소로 바로 들어오면 가운데에서 문들 쪽(-Z)을 봅니다.
  const location = useLocation()
  const [arrival] = useState(() => {
    const { from, heading } = passageOf(location.state)
    const door = lobby.doors.find((d) => d.slug === from)
    if (!door) return { spawn: lobby.spawn, heading: Math.PI }
    return { spawn: { x: door.x, z: door.z + ARRIVE_GAP }, heading: heading ?? 0 }
  })
  const pos = useRef({ x: arrival.spawn.x, z: arrival.spawn.z }) // 1인칭 카메라가 따라갈 내 위치
  const heading = useRef(arrival.heading) // 1인칭에서 바라보는 방향
  const bodyHeading = useRef(arrival.heading) // 몸이 바라보는 방향 (위에서 보기에서도 맞음). 문에 들어갈 때 넘깁니다.
  const [locked, setLocked] = useState(false) // 1인칭에서 마우스가 잠겨 있는지 (마우스로 바라보는 중, #73)
  // 로비 위에 띄운 창(내 기록·친구·프로필). 페이지를 옮기지 않아 닫으면 서 있던 위치가 그대로입니다. (#70)
  const [panel, setPanel] = useState<PanelView | null>(null)
  const { session } = useSession()
  const { model: myModel } = useMyAvatar() // 내 프로필에서 고른 캐릭터 (#131). 읽기 전에는 null
  // 로비에 있는 다른 참여자 (실시간, #166). 내 위치·방향은 매 프레임 바뀌므로 ref 에 담아 두면 훅이 주기적으로 보냅니다.
  const me = useRef<PresenceState | null>(null)
  // 감정표현 (#162): Player 가 동작하고, 1인칭 카메라는 그동안 앞으로 빠져 나를 비춥니다.
  const emote = useRef(newEmoteState())
  const suspendLook = useRef(false) // 감정표현 바퀴를 고르는 동안 마우스로 시점이 돌지 않게
  const others = useParticipants(LOBBY_CHANNEL, me)
  // 캐릭터 숨김 모드(실험 B 조건)면 로비에서도 다른 참여자를 그리지 않습니다.
  const [condition] = useState(() => currentCondition(location.search))
  // 사이트 전체 접속 상태에 "로비에 있음"으로 표시하고, 전체 접속자 수를 읽습니다. (#176)
  useOnlinePlace(LOBBY_PLACE)
  const onlineCount = useOnline().size
  // 오른쪽 위 버튼 단축키 R·F·P (#205)
  useMenuShortcuts({ myId: session?.user.id ?? null, panel, setPanel })
  const panelRef = useRef(panel) // V 키 처리(한 번만 등록)에서 최신 값을 읽기 위해
  useEffect(() => {
    panelRef.current = panel
  }, [panel])

  // V 키로 시점을 바꿉니다. 글자를 입력하는 중이면 무시합니다.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== getKeymap().view || e.repeat || panelRef.current) return // 1인칭 ↔ 위에서 보기 (키는 설정에서 바꿈, #250)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      setView((v) => (v === 'top' ? 'first' : 'top'))
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [setView])

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
    // E 를 누른 순간 보던 방향. 문 앞에서 몸이 돌거나 지점 목록을 읽는 동안 바뀌기 전에 붙잡아 둔다. (#150)
    const enteringHeading = bodyHeading.current
    const door = lobby.doors.find((d) => d.no === doorNo)
    if (!door) return
    const list = branches ?? (await loadBranches())
    const found = list.find((b) => b.slug === door.slug)
    if (!found) {
      setMessage(`${door.label}은 아직 준비 중입니다.`)
      return
    }
    setMessage('')
    onEnter(found, enteringHeading)
  }

  const nearDoor = lobby.doors.find((d) => d.no === near)
  // 안내 문구에 보일 키 글자 (설정에서 바꾼 키를 따라감, #250)
  const keymap = useKeymap()
  const K = { view: keyLabel(keymap.view), interact: keyLabel(keymap.interact), emoteWheel: keyLabel(keymap.emoteWheel) }
  const viewHint = view === 'top' ? `${K.view} 1인칭으로` : locked ? `Esc 커서 보이기 · ${K.view} 위에서 보기` : `클릭해서 둘러보기 · ${K.view} 위에서 보기`
  const hint = panel ? '' : nearDoor ? `${nearDoor.label} · ${K.interact} 입장` : `WASD로 움직여 문 앞으로 가세요 · Shift 달리기 · ${K.emoteWheel} 감정표현 · ${viewHint}`

  return (
    <>
      <Canvas>
        {view === 'first' ? <WalkCamera posRef={pos} headingRef={heading} paused={panel !== null} onLockChange={setLocked} emoteRef={emote} suspendLookRef={suspendLook} /> : <FitCamera />}
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
            <group key={d.no}>
              <mesh position={[d.x, 1.1, d.z]}>
                <boxGeometry args={[d.w, 2.2, d.d]} />
                <meshStandardMaterial color={color} />
              </mesh>
              {/* 간판: 문 앞면(로비 쪽)에 붙입니다. 준비 중인 문은 회색 간판 */}
              <mesh position={[d.x, SIGN.y, d.z + d.d / 2 + 0.01]}>
                <planeGeometry args={[SIGN.width, (SIGN.width * LABEL_PX.h) / LABEL_PX.w]} />
                <meshBasicMaterial map={labelTexture(d.label, open ? '#14532d' : '#374151')} transparent />
              </mesh>
            </group>
          )
        })}

        {/* 로비의 다른 참여자. 누르면 프로필 창 (#166). 로비에서는 모두 공부 전이라 상태 표시등은 끕니다. */}
        {condition === 'visible' && (
          <OtherParticipants others={others} spots={[]} showStatus={false} onSelect={(userId) => setPanel({ kind: 'profile', userId })} />
        )}

        {/* 내 캐릭터를 읽은 뒤에 그립니다. (기본 캐릭터가 잠깐 보였다가 바뀌지 않게) */}
        {myModel && (
          <Player
            model={myModel}
            obstacles={obstacles}
            spawn={arrival.spawn}
            spawnHeading={arrival.heading}
            emoteRef={emote}
            spots={doorSpots}
            // 로비에는 키오스크가 없다. Player 가 키오스크 좌표를 반드시 받으므로,
            // 걸어서 닿을 수 없는 자리를 줘서 감지가 일어나지 않게 한다. (로비는 30×18 크기다)
            kiosk={NO_KIOSK}
            frozen={panel !== null}
            onNearKiosk={() => {}}
            onKiosk={() => {}}
            onNear={setNear}
            onSeat={(no) => void tryEnter(no)}
            onMove={(x, z, h) => {
              pos.current.x = x
              pos.current.z = z
              bodyHeading.current = h
              // 로비에서는 앉는 자리가 없고 모두 공부 전(idle)입니다.
              // 서서 감정표현 중이면 같이 실어 보냅니다. (#162)
              const e = emote.current
              if (session) me.current = { userId: session.user.id, x, z, h, seat: null, status: 'idle', ...(e.playing ? { emote: e.playing, emoteSeq: e.seq } : {}) }
            }}
            headingRef={view === 'first' ? heading : undefined}
          />
        )}
      </Canvas>

      {(message || hint) && <div style={hintBox}>{message || hint}</div>}
      {/* 전체 접속자 수 (나 포함). 숨김 모드(실험 B)에서는 인원도 보여 주지 않습니다. (#176) */}
      {condition === 'visible' && onlineCount > 0 && <div style={onlineBox}>🟢 지금 {onlineCount}명 접속 중</div>}
      <ChatOverlay /> {/* 친구 귓속말 로그창 (#49) */}
      <EmoteControls emoteRef={emote} suspendLookRef={suspendLook} disabled={panel !== null} /> {/* 감정표현: 1~8, X 바퀴 (#162) */}
      {/* 조준점: 마우스가 잠겨 커서가 없을 때 화면 가운데가 클릭 위치입니다. (캐릭터를 누르면 프로필, #166) */}
      {locked && <div style={crosshair} />}
      {session && <SceneMenu myId={session.user.id} onOpen={setPanel} />}
      {/* key: 단축키로 다른 창으로 바꾸면 새 창으로 엽니다 */}
      {panel && session && <InfoPanel key={panelKey(panel)} initial={panel} myId={session.user.id} onClose={() => setPanel(null)} />}
    </>
  )
}

const onlineBox: React.CSSProperties = {
  position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10,
  padding: '6px 12px', borderRadius: 999, background: 'rgba(32,35,42,.85)', color: '#fff',
  font: '13px system-ui, sans-serif', fontVariantNumeric: 'tabular-nums',
}

const crosshair: React.CSSProperties = {
  position: 'fixed', left: '50%', top: '50%', width: 6, height: 6, marginLeft: -3, marginTop: -3,
  borderRadius: '50%', background: '#fff', boxShadow: '0 0 0 1.5px rgba(0,0,0,.6)', pointerEvents: 'none',
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
