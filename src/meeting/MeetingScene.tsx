// 회의 화면 (#45): 주소 /meeting/회의번호?branch=지점slug
//
// 회의를 만들 때 정한 인원만큼 원형 테이블 둘레에 의자가 놓여 있습니다(meetingLogic).
// 들어오면 남쪽 문 앞에 서 있고, 지점처럼 걸어 다니다(WASD, V 로 1인칭·위에서 보기) 빈 의자에서 E 를 누르면 앉습니다.
// 앉기 전에 DB 에 의자를 잡아 봅니다(sit_meeting_seat, 0022). 두 사람이 동시에 눌러도 한 명만 앉습니다(솔카페 자리와 같은 방식).
// 앉아 있는 동안만 웹캠 트래킹(고개·눈·팔)을 켜서 오른쪽 아래 내 모습 화면에 보이고, 다른 참석자에게도 보냅니다.
// 회의실에서는 공부 타이머·집중 판정을 하지 않습니다.
// 문 앞에서 E, 또는 L(어디서든)을 누르면 회의에서 나가고 지점 회의실 문 앞으로 돌아갑니다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Canvas } from '@react-three/fiber'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { useSession } from '../auth/useSession'
import { useMyAvatar } from '../profile/useMyAvatar'
import { BRANCH_LAYOUTS, DEFAULT_BRANCH } from '../space/branches'
import { CHAIR } from '../space/layout'
import { SeatCamera } from '../space/SeatCamera'
import { WalkCamera } from '../space/WalkCamera'
import { TopDownCamera } from '../space/TopDownCamera'
import { Player } from '../space/Player'
import { EmoteControls } from '../space/EmoteControls'
import { newEmoteState } from '../space/emotes'
import { useWalkView } from '../space/useWalkView'
import { LABEL_PX, labelTexture } from '../space/labelTexture'
import { OtherParticipants } from '../realtime/OtherParticipants'
import { useParticipants } from '../realtime/useParticipants'
import type { Participant, PresenceState } from '../realtime/participants'
import { useOnlinePlace } from '../realtime/onlineContext'
import { ChatOverlay } from '../chat/ChatOverlay'
import { getKeymap, keyLabel, useKeymap } from '../menu/keymap'
import { headAngles, nextEyesClosed } from '../tracking/faceSync'
import { characterArms } from '../tracking/armLogic'
import type { Direction } from '../tracking/armLogic'
import type { MyTracking } from '../study/SeatedStudy'
import { MEETING_ROOM, meetingChairs, meetingObstacles, meetingPlace, tableRadius } from './meetingLogic'
import { SeatedTracking } from './SeatedTracking'
import { useMeeting } from './useMeeting'
import type { MeetingInfo, MeetingPerson } from './useMeeting'

const WALL_HEIGHT = 2.5
const TABLE_HEIGHT = 0.74 // 지점 책상과 같은 높이
const DOOR_HEIGHT = 2.2 // 지점 출입문과 같음
const DOOR_SIGN = { width: 1.4, y: 1.75 }
const DOOR_COLOR = { idle: '#4ade80', near: '#f59e0b' } // 지점 문과 같은 색
const NO_KIOSK = { x: 1000, z: 1000 } // 회의실에는 키오스크가 없습니다. 걸어서 닿을 수 없는 자리를 줍니다.
const ARRIVAL_HEADING = Math.PI // 들어오면 문을 등지고 안쪽(-Z)을 봅니다.
const EXIT_HEADING = -Math.PI / 2 // 지점으로 돌아가면 회의실 문을 등지고 좌석 쪽(-X)을 봅니다.
const MESSAGE_MS = 4000 // 잠깐 보여 줄 안내(다른 사람이 먼저 앉음 등)

export function MeetingScene() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const slug = BRANCH_LAYOUTS[params.get('branch') ?? ''] ? (params.get('branch') as string) : DEFAULT_BRANCH
  const meetingId = Number(id)
  const { session } = useSession()
  const myId = session?.user.id
  if (!Number.isInteger(meetingId) || !myId) return <Notice text="없는 회의예요." slug={slug} />
  // key: 다른 회의로 옮기면 화면을 새로 그립니다.
  return <MeetingRoom key={meetingId} meetingId={meetingId} myId={myId} slug={slug} />
}

function MeetingRoom({ meetingId, myId, slug }: { meetingId: number; myId: string; slug: string }) {
  const navigate = useNavigate()
  // 내 위치·앉은 의자·고개·눈·팔. 회의 방(meeting:회의번호, 참석자만 들어오는 비공개 방)으로 0.25초마다 보냅니다. 지점과 같은 방식입니다.
  const me = useRef<PresenceState | null>(null)
  const others = useParticipants(`meeting:${meetingId}`, me, true)
  const presentKey = others.map((o) => o.userId).sort().join(',')
  const state = useMeeting(meetingId, myId, presentKey)
  useOnlinePlace(meetingPlace(slug)) // 친구 탭에 "별다방 회의 중"

  const leave = useCallback(async () => {
    const { error } = await supabase.rpc('leave_meeting')
    if (error) console.error('회의에서 나가지 못했습니다:', error.message) // 못 나가도 5분 뒤 DB 가 내보냅니다.
    navigate(`/space?branch=${slug}`, { state: { at: 'meeting', heading: EXIT_HEADING } })
  }, [navigate, slug])

  // L(설정에서 바꿈): 어디서든 회의 나가기
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== getKeymap().lobby || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      void leave()
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [leave])

  if (state.status === 'loading') return <Notice text="회의에 들어가는 중…" />
  if (state.status === 'error') return <Notice text={`회의를 불러오지 못했어요: ${state.message}`} slug={slug} />
  if (state.status === 'notMember') return <Notice text="끝났거나 들어 있지 않은 회의예요." slug={slug} />

  // 위쪽 참석자 목록: DB 에 있고 지금 방에 있는 사람 (창을 그냥 닫은 사람은 DB 에 5분 남아 있어도 빼고 보여 줌)
  const present = new Set(others.map((o) => o.userId))
  const people = state.people.filter((p) => p.userId === myId || present.has(p.userId))
  return <MeetingSpace info={state.info} people={people} others={others} myId={myId} meRef={me} onLeave={() => void leave()} />
}

type SpaceProps = {
  info: MeetingInfo
  people: MeetingPerson[]
  others: Participant[] // 실시간으로 받은 다른 참석자 (위치·앉은 의자·고개·눈·팔)
  myId: string
  meRef: RefObject<PresenceState | null> // 보낼 내 상태 (이름이 Ref 로 끝나야 React 규칙 검사가 ref 로 알아봄)
  onLeave: () => void
}

// 회의실 공간. 지점(BranchScene)과 같은 부품(Player·카메라·다른 참석자 그리기)으로 만듭니다.
function MeetingSpace({ info, people, others, myId, meRef, onLeave }: SpaceProps) {
  const chairs = useMemo(() => meetingChairs(info.capacity), [info.capacity])
  const obstacles = useMemo(() => meetingObstacles(info.capacity), [info.capacity])
  const radius = tableRadius(info.capacity)
  const { model: myModel } = useMyAvatar()
  const [near, setNear] = useState<number | null>(null) // 앉을 수 있는 의자 번호
  const [seat, setSeat] = useState<number | null>(null) // 앉아 있는 의자 번호
  const [nearExit, setNearExit] = useState(false) // 문 앞인지
  const [view, setView] = useWalkView() // 지점에서 쓰던 시점(1인칭·위에서)을 그대로 씁니다.
  const [locked, setLocked] = useState(false) // 1인칭에서 마우스가 잠겨 있는지
  const [message, setMessage] = useState('')
  const pos = useRef({ x: MEETING_ROOM.spawn.x, z: MEETING_ROOM.spawn.z })
  const heading = useRef(ARRIVAL_HEADING) // 1인칭에서 바라보는 방향
  const emote = useRef(newEmoteState())
  const suspendLook = useRef(false)
  const sitRequest = useRef<number | null>(null) // 의자를 잡은 뒤 "이 의자에 앉아라" 요청 (Player 가 읽음)
  const myTracking = useRef<MyTracking | null>(null)
  const myEyesClosed = useRef(false)
  const handleTracking = useCallback((tracking: MyTracking | null) => {
    myTracking.current = tracking
  }, [])

  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(''), MESSAGE_MS)
    return () => clearTimeout(t)
  }, [message])

  // 다른 사람이 앉아 있는 의자에는 앉을 수 없습니다.
  const taken = new Set(others.map((p) => p.seat).filter((no): no is number => no !== null))
  const freeChairs = chairs.filter((c) => !taken.has(c.no))

  // 빈 의자에서 E: DB 에 의자를 잡아 보고, 잡히면 Player 에게 앉으라고 알립니다.
  const claimSeat = async (no: number) => {
    const { error } = await supabase.rpc('sit_meeting_seat', { p_seat: no })
    if (error) {
      setMessage(error.message)
      return
    }
    sitRequest.current = no
  }
  const handleSeat = (no: number | null) => {
    if (no === null) void supabase.rpc('stand_meeting_seat') // 일어나면 의자를 놓습니다.
    setSeat(no)
  }

  // Player 가 매 프레임 알려 주는 위치로 보낼 값을 갱신합니다. 앉아 있을 때만 고개·눈·팔을 싣습니다(다른 사람 화면에서는 실제 방향).
  const handleMove = (x: number, z: number, h: number) => {
    pos.current.x = x
    pos.current.z = z
    const tracking = seat === null ? null : myTracking.current
    const face = tracking?.face.current ?? null
    const angles = face ? headAngles(face, false) : null
    myEyesClosed.current = face ? nextEyesClosed(myEyesClosed.current, face) : false
    const arms = tracking ? characterArms(tracking.arms.current, false) : null
    const vec = (d: Direction | null): [number, number, number] | null => (d ? [d.x, d.y, d.z] : null)
    meRef.current = {
      userId: myId,
      x,
      z,
      h,
      seat,
      status: 'idle', // 회의실에서는 집중 판정을 하지 않습니다(표시등 없음).
      ...(angles ? { head: [angles.yaw, angles.pitch, angles.roll], eyes: myEyesClosed.current } : {}),
      ...(arms ? { arms: [vec(arms.armLeft), vec(arms.armRight)] } : {}),
      ...(emote.current.playing ? { emote: emote.current.playing, emoteSeq: emote.current.seq } : {}),
    }
  }

  // V(설정에서 바꿈): 위에서 보기 ↔ 1인칭
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== getKeymap().view || e.repeat) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      setView((v) => (v === 'top' ? 'first' : 'top'))
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [setView])

  const keymap = useKeymap()
  const K = {
    view: keyLabel(keymap.view),
    interact: keyLabel(keymap.interact),
    emoteWheel: keyLabel(keymap.emoteWheel),
    recenter: keyLabel(keymap.recenter),
    lobby: keyLabel(keymap.lobby),
  }
  const viewHint = view === 'top' ? `${K.view} 1인칭으로` : locked ? `Esc 커서 보이기 · ${K.view} 위에서 보기` : `클릭해서 둘러보기 · ${K.view} 위에서 보기`
  const hint = message
    ? message
    : seat !== null
      ? `${seat}번 자리 · WASD·끌어서 둘러보기 · ${K.recenter} 정면 보기 · ${K.interact} 일어나기`
      : nearExit
        ? `문 · ${K.interact} 회의 나가기`
        : near !== null
          ? `${near}번 자리 · ${K.interact} 앉기`
          : `빈 의자에서 ${K.interact}로 앉기 · Shift 달리기 · ${K.emoteWheel} 감정표현 · ${viewHint}`
  const seatChair = chairs.find((c) => c.no === seat)

  return (
    <>
      <Canvas>
        {seatChair ? (
          <SeatCamera key={seatChair.no} spot={seatChair} onArrive={() => {}} paused={false} />
        ) : view === 'first' ? (
          <WalkCamera posRef={pos} headingRef={heading} onLockChange={setLocked} emoteRef={emote} suspendLookRef={suspendLook} />
        ) : (
          <TopDownCamera area={MEETING_ROOM.size} />
        )}
        <ambientLight intensity={1.2} />
        <directionalLight position={[6, 12, 4]} intensity={0.8} />

        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[MEETING_ROOM.size.w, MEETING_ROOM.size.d]} />
          <meshStandardMaterial color="#c9d6e3" />
        </mesh>
        {MEETING_ROOM.walls.map((w, i) => (
          <mesh key={i} position={[w.x, WALL_HEIGHT / 2, w.z]}>
            <boxGeometry args={[w.w, WALL_HEIGHT, w.d]} />
            <meshStandardMaterial color="#8a8f98" />
          </mesh>
        ))}

        {/* 문: 앞에서 E 를 누르면 회의에서 나갑니다. 표지판은 안쪽(-Z)을 보게 반 바퀴 돌립니다. */}
        <mesh position={[MEETING_ROOM.door.x, DOOR_HEIGHT / 2, MEETING_ROOM.door.z]}>
          <boxGeometry args={[MEETING_ROOM.door.w, DOOR_HEIGHT, MEETING_ROOM.door.d]} />
          <meshStandardMaterial color={nearExit ? DOOR_COLOR.near : DOOR_COLOR.idle} />
        </mesh>
        <mesh position={[MEETING_ROOM.door.x, DOOR_SIGN.y, MEETING_ROOM.door.z - MEETING_ROOM.door.d / 2 - 0.01]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[DOOR_SIGN.width, (DOOR_SIGN.width * LABEL_PX.h) / LABEL_PX.w]} />
          <meshBasicMaterial map={labelTexture('나가기', '#14532d')} transparent />
        </mesh>

        {/* 원형 테이블: 회의 인원에 맞춘 크기 */}
        <mesh position={[0, TABLE_HEIGHT - 0.03, 0]}>
          <cylinderGeometry args={[radius, radius, 0.06, 64]} />
          <meshStandardMaterial color="#b98a5a" />
        </mesh>
        <mesh position={[0, (TABLE_HEIGHT - 0.06) / 2, 0]}>
          <cylinderGeometry args={[0.15, 0.25, TABLE_HEIGHT - 0.06, 16]} />
          <meshStandardMaterial color="#7c5a3a" />
        </mesh>

        {chairs.map((c) => (
          <mesh key={c.no} position={[c.x, CHAIR.h / 2, c.z]} rotation={[0, c.rot, 0]}>
            <boxGeometry args={[CHAIR.w, CHAIR.h, CHAIR.d]} />
            <meshStandardMaterial color={c.no === seat || c.no === near ? '#f59e0b' : '#6b7280'} />
          </mesh>
        ))}

        {/* 다른 참석자: 앉은 사람은 의자에, 서 있는 사람은 받은 위치에 그립니다(지점과 같음). 표시등은 없습니다. */}
        <OtherParticipants others={others} spots={chairs} showStatus={false} />

        {myModel && (
          <Player
            model={myModel}
            obstacles={obstacles}
            spawn={MEETING_ROOM.spawn}
            spawnHeading={ARRIVAL_HEADING}
            emoteRef={emote}
            spots={freeChairs}
            kiosk={NO_KIOSK}
            frozen={false}
            onNear={setNear}
            onSeat={handleSeat}
            onNearKiosk={() => {}}
            onKiosk={() => {}}
            exit={MEETING_ROOM.door}
            onNearExit={setNearExit}
            onExit={onLeave}
            canSit={() => false} // 늘 DB 에 의자를 먼저 잡아 봅니다(onSitBlocked → claimSeat → sitRef).
            onSitBlocked={(no) => void claimSeat(no)}
            sitRef={sitRequest}
            onMove={handleMove}
            headingRef={view === 'first' ? heading : undefined}
          />
        )}
      </Canvas>

      <div style={styles.info}>
        <strong>{info.isPrivate && '🔒 '}{info.title}</strong>
        <span style={{ color: '#aab0bb' }}>
          {people.length}/{info.capacity}명 · {people.map((p) => p.nickname).join(', ')}
        </span>
      </div>
      <button type="button" style={styles.leave} onClick={onLeave}>
        회의 나가기 ({K.lobby})
      </button>
      <div style={styles.hint}>{hint}</div>
      {/* 앉아 있는 동안만 웹캠 트래킹과 오른쪽 아래 내 모습 화면 */}
      {seat !== null && <SeatedTracking onTracking={handleTracking} />}
      {/* 감정표현: 서 있을 때만 (지점과 같음) */}
      <EmoteControls emoteRef={emote} suspendLookRef={suspendLook} disabled={seat !== null} />
      <ChatOverlay /> {/* 친구 귓속말은 회의 중에도 받습니다 (#49) */}
    </>
  )
}

function Notice({ text, slug }: { text: string; slug?: string }) {
  const navigate = useNavigate()
  return (
    <div style={styles.notice}>
      <span>{text}</span>
      {slug && (
        <button type="button" style={styles.back} onClick={() => navigate(`/space?branch=${slug}`, { state: { at: 'meeting', heading: EXIT_HEADING } })}>
          지점으로 돌아가기
        </button>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  info: {
    position: 'fixed', top: 16, left: 16, display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 'calc(100vw - 200px)',
    padding: '8px 12px', borderRadius: 8, background: 'rgba(32,35,42,.85)', color: '#fff', font: '13px/1.5 system-ui, sans-serif',
  },
  leave: {
    position: 'fixed', top: 16, right: 16, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#ef4444',
    color: '#fff', font: '14px system-ui, sans-serif', fontWeight: 600, cursor: 'pointer',
  },
  back: {
    padding: '8px 14px', borderRadius: 8, border: '1px solid #4b5563', background: 'transparent', color: '#fff',
    font: '14px system-ui, sans-serif', cursor: 'pointer',
  },
  hint: {
    position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', padding: '8px 16px', borderRadius: 8,
    background: 'rgba(32,35,42,.85)', color: '#fff', font: '14px system-ui, sans-serif',
  },
  notice: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, height: '100%',
    background: '#16181d', color: '#fff', font: '15px system-ui, sans-serif',
  },
}
