// 회의 화면 (#45): 주소 /meeting/회의번호?branch=지점slug
//
// 회의를 만들 때 정한 인원만큼 원형 테이블 둘레에 의자가 놓여 있습니다(meetingLogic).
// 들어오면 남쪽 문 앞에 서 있고, 지점처럼 걸어 다니다(WASD, V 로 1인칭·위에서 보기) 빈 의자에서 E 를 누르면 앉습니다.
// 앉기 전에 DB 에 의자를 잡아 봅니다(sit_meeting_seat, 0022). 두 사람이 동시에 눌러도 한 명만 앉습니다(솔카페 자리와 같은 방식).
// 앉아 있는 동안만 웹캠 트래킹(고개·눈·팔)을 켜서 오른쪽 아래 내 모습 화면에 보이고, 다른 참석자에게도 보냅니다.
// 회의실에서는 공부 타이머·집중 판정을 하지 않습니다.
// 문 앞에서 E, 또는 L(어디서든)을 누르면 회의에서 나가고 지점 회의실 문 앞으로 돌아갑니다.
// 친구(F) 창에서 친구를 이 회의에 초대합니다(#45). 내 기록(R)·내 프로필(P)·설정(O) 창도 지점처럼 단축키로 열립니다.
// 방장(👑, 0023): 방장이 나가면 회의가 모두에게 끝납니다. 나가기 전에 다른 참석자에게 방장을 넘길 수 있습니다.
// 회의가 끝나면(방장이 끝냄, 오래 끊겨 내보내짐) 안내를 보여 주고 잠시 뒤 지점 회의실 문 앞으로 돌아갑니다.
// 음성(#46): 같은 회의 사람끼리 브라우저로 직접 목소리를 주고받습니다(useVoice). 마이크는 기본으로 꺼져 있고 M 으로 켭니다.
// 생김새는 들어온 지점의 테마를 따릅니다(#57): 바닥·벽·천장·조명·문·테이블·의자와 작은 소품 (meetingTheme.ts, MeetingDecor.tsx)
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Canvas } from '@react-three/fiber'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { useSession } from '../auth/useSession'
import { useMyAvatar } from '../profile/useMyAvatar'
import { BRANCH_LAYOUTS, DEFAULT_BRANCH } from '../space/branches'
import { Decor, ThemedDoor, ThemedFloor } from '../space/Decor'
import { ceilingHeightOf, colorsOf, decorBoxes } from '../space/theme'
import { SeatCamera } from '../space/SeatCamera'
import { WalkCamera } from '../space/WalkCamera'
import { Minimap } from '../space/Minimap'
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
import { useChatPort, useMeetingChat } from '../chat/useMeetingChat'
import { getKeymap, keyLabel, useKeymap } from '../menu/keymap'
import { InfoPanel } from '../menu/InfoPanel'
import { panelKey } from '../menu/panelTypes'
import type { PanelView } from '../menu/panelTypes'
import { useMenuShortcuts } from '../menu/useMenuShortcuts'
import { headAngles, mouthOpen, nextEyesClosed } from '../tracking/faceSync'
import { characterArms } from '../tracking/armLogic'
import type { Direction } from '../tracking/armLogic'
import type { MyTracking } from '../study/SeatedStudy'
import { MEETING_ROOM, elapsedLabel, meetingChairs, meetingObstacles, meetingPlace, tableRadius } from './meetingLogic'
import { SeatedTracking } from './SeatedTracking'
import { MeetingChair, MeetingTable } from './MeetingDecor'
import { chairKindOf, meetingRoomTheme } from './meetingTheme'
import { useMyTitle } from '../level/useMyTitle'
import { sharedLevel } from '../level/levelLogic'
import { useMeeting } from './useMeeting'
import { useSignalPort, useVoice } from './useVoice'
import type { MeetingInfo, MeetingPerson } from './useMeeting'

const FLOOR_COLOR = '#c9d6e3' // 테마가 없는 지점(별다방)의 회의실 바닥
const DOOR_HEIGHT = 2.2 // 지점 출입문과 같음
const DOOR_SIGN = { width: 1.4, y: 1.75 }
const DOOR_COLOR = { idle: '#4ade80', near: '#f59e0b' } // 지점 문과 같은 색
const NO_KIOSK = { x: 1000, z: 1000 } // 회의실에는 키오스크가 없습니다. 걸어서 닿을 수 없는 자리를 줍니다.
const ARRIVAL_HEADING = Math.PI // 들어오면 문을 등지고 안쪽(-Z)을 봅니다.
const EXIT_HEADING = -Math.PI / 2 // 지점으로 돌아가면 회의실 문을 등지고 좌석 쪽(-X)을 봅니다.
const MESSAGE_MS = 4000 // 잠깐 보여 줄 안내(다른 사람이 먼저 앉음 등)
const ENDED_RETURN_MS = 3000 // 회의가 끝났다는 안내를 보여 준 뒤 지점으로 돌아가기까지
const ELAPSED_TICK_MS = 1000 // 회의 진행 시간(초까지)을 다시 계산하는 간격
const VOICE_NOTICE_KEY = 'dooteum.voiceNoticeSeen' // 처음 마이크를 켤 때 보여 주는 안내를 봤는지 (이 브라우저에 기억)

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
  const signalRef = useSignalPort() // 같은 회의 방으로 음성 연결 신호도 주고받습니다 (#46)
  const chatPort = useChatPort() // 같은 회의 방으로 회의 채팅도 주고받습니다 (#298)
  const others = useParticipants(`meeting:${meetingId}`, me, true, signalRef, chatPort)
  useMeetingChat(meetingId, others, chatPort) // 채팅창 Tab 목록에 [회의]
  const voice = useVoice(myId, others.map((o) => o.userId).sort().join(','), signalRef)
  // 다시 읽기 신호: 내가 방장을 넘기면 1 올려 다른 참석자에게 보내고(PresenceState.sync), 나도 다시 읽습니다.
  const [sync, setSync] = useState(0)
  const bumpSync = useCallback(() => setSync((n) => n + 1), [])
  const presentKey = `${sync}|` + others.map((o) => `${o.userId}:${o.sync ?? 0}`).sort().join(',')
  const state = useMeeting(meetingId, myId, presentKey)
  useOnlinePlace(meetingPlace(slug)) // 친구 탭에 "별다방 회의 중"

  const backToBranch = useCallback(
    () => navigate(`/space?branch=${slug}`, { state: { at: 'meeting', heading: EXIT_HEADING } }),
    [navigate, slug],
  )
  // 나가기. 방장이면 DB 가 회의를 모두에게 끝냅니다(0023).
  const leave = useCallback(async () => {
    const { error } = await supabase.rpc('leave_meeting')
    if (error) console.error('회의에서 나가지 못했습니다:', error.message) // 못 나가도 5분 뒤 DB 가 내보냅니다.
    backToBranch()
  }, [backToBranch])

  // 회의가 끝났으면 잠시 안내를 보여 준 뒤 지점으로 돌아갑니다.
  const ended = state.status === 'ended'
  useEffect(() => {
    if (!ended) return
    const t = setTimeout(backToBranch, ENDED_RETURN_MS)
    return () => clearTimeout(t)
  }, [ended, backToBranch])

  if (state.status === 'loading') return <Notice text="회의에 들어가는 중…" />
  if (state.status === 'error') return <Notice text={`회의를 불러오지 못했어요: ${state.message}`} slug={slug} />
  if (state.status === 'notMember') return <Notice text="끝났거나 들어 있지 않은 회의예요." slug={slug} />
  if (state.status === 'ended') return <Notice text="회의가 끝났어요. 잠시 뒤 지점으로 돌아가요." slug={slug} />

  // 위쪽 참석자 목록: DB 에 있고 지금 방에 있는 사람 (창을 그냥 닫은 사람은 DB 에 5분 남아 있어도 빼고 보여 줌)
  const present = new Set(others.map((o) => o.userId))
  const people = state.people.filter((p) => p.userId === myId || present.has(p.userId))
  return (
    <MeetingSpace
      info={state.info}
      people={people}
      others={others}
      meetingId={meetingId}
      myId={myId}
      meRef={me}
      sync={sync}
      onHostChanged={bumpSync}
      onLeave={leave}
      voice={voice}
      place={meetingPlace(slug)}
      slug={slug}
    />
  )
}

type SpaceProps = {
  info: MeetingInfo
  people: MeetingPerson[]
  others: Participant[] // 실시간으로 받은 다른 참석자 (위치·앉은 의자·고개·눈·팔)
  meetingId: number
  myId: string
  meRef: RefObject<PresenceState | null> // 보낼 내 상태 (이름이 Ref 로 끝나야 React 규칙 검사가 ref 로 알아봄)
  sync: number // 다시 읽기 신호 (보낼 내 상태에 실음)
  onHostChanged: () => void // 방장을 넘긴 뒤 부름 (다시 읽기 신호 올리기)
  voice: ReturnType<typeof useVoice> // 음성: 마이크 켜기·끄기, 말하는 사람
  onLeave: () => void | Promise<void>
  place: string // 전체 지도에서 내가 있는 곳 (meeting:지점slug, #300)
  slug: string // 들어온 지점. 회의실 생김새를 그 지점 테마로 (#57)
}

// 회의실 공간. 지점(BranchScene)과 같은 부품(Player·카메라·다른 참석자 그리기)으로 만듭니다.
function MeetingSpace({ info, people, others, meetingId, myId, meRef, sync, onHostChanged, onLeave, voice, place, slug }: SpaceProps) {
  const chairs = useMemo(() => meetingChairs(info.capacity), [info.capacity])
  // 내 칭호 (꽃 피는 칭호). 공개 범위가 '모두'일 때만 다른 참석자에게 단계를 보냅니다(sharedLevel).
  const myTitle = useMyTitle(myId)
  const myLv = sharedLevel(myTitle.visibility, myTitle.level)
  // 지점 테마를 회의실 크기에 맞춘 것 (없으면 기본 모습). 구석 화분·나무도 부딪힙니다.
  const branchLayout = BRANCH_LAYOUTS[slug]
  const theme = useMemo(() => meetingRoomTheme(branchLayout?.theme, info.capacity), [branchLayout, info.capacity])
  const chairKind = chairKindOf(branchLayout?.theme, branchLayout?.seats ?? [])
  const colors = colorsOf(theme)
  const wallH = ceilingHeightOf(theme)
  const obstacles = useMemo(() => [...meetingObstacles(info.capacity), ...decorBoxes(theme)], [info.capacity, theme])
  const radius = tableRadius(info.capacity)
  const { model: myModel } = useMyAvatar()
  const [near, setNear] = useState<number | null>(null) // 앉을 수 있는 의자 번호
  const [seat, setSeat] = useState<number | null>(null) // 앉아 있는 의자 번호
  const [nearExit, setNearExit] = useState(false) // 문 앞인지
  const [view, setView] = useWalkView() // 지점에서 쓰던 시점(1인칭·위에서)을 그대로 씁니다.
  const [locked, setLocked] = useState(false) // 1인칭에서 마우스가 잠겨 있는지
  const [message, setMessage] = useState('')
  const [voiceNotice, setVoiceNotice] = useState(false) // 처음 마이크를 켤 때의 안내 창
  // 지점 위 창과 같은 창(친구·내 기록·프로필·설정). 친구 창에는 "회의에 초대" 버튼이 보입니다.
  const [panel, setPanel] = useState<PanelView | null>(null)
  const [leaveAsk, setLeaveAsk] = useState(false) // 방장이 나가려 할 때 묻는 창
  const panelOpen = panel !== null || leaveAsk || voiceNotice // 창이 떠 있으면 캐릭터·시점·단축키를 멈춥니다
  const isHost = info.hostId === myId
  const pos = useRef({ x: MEETING_ROOM.spawn.x, z: MEETING_ROOM.spawn.z })
  const heading = useRef(ARRIVAL_HEADING) // 1인칭에서 바라보는 방향
  const bodyHeading = useRef(ARRIVAL_HEADING) // 몸이 바라보는 방향 (위에서 보기에서도 맞음). 전체 지도의 내 화살표 (#300)
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
  // 방장 넘기기 (방장만). 넘긴 뒤 다시 읽기 신호를 올려 모두가 새 방장을 알게 합니다.
  const transferHost = async (to: MeetingPerson) => {
    const { error } = await supabase.rpc('transfer_meeting_host', { p_user: to.userId })
    if (error) {
      setMessage(error.message)
      return false
    }
    onHostChanged()
    setMessage(`${to.nickname} 님이 이제 방장이에요.`)
    return true
  }
  // 참석자 목록의 음성 표시: 말하는 중 🔊, 마이크 끔 🔇 (#46)
  const micOf = (id: string) => (id === myId ? voice.micOn : others.find((o) => o.userId === id)?.mic === true)
  const voiceMark = (id: string) => (voice.speaking.has(id) ? '🔊 ' : micOf(id) ? '' : '🔇 ')

  // 마이크 켜기·끄기 (버튼·M). 처음 켤 때는 목소리가 어떻게 전달되는지 한 번 알려 줍니다.
  const turnMic = async (on: boolean) => {
    const error = await voice.setMic(on)
    if (error) setMessage(error)
  }
  const toggleMic = () => {
    if (voice.micOn) return void turnMic(false)
    let seen = false
    try {
      seen = localStorage.getItem(VOICE_NOTICE_KEY) === '1'
    } catch {
      // 기억하지 못하면 매번 안내합니다.
    }
    if (seen) void turnMic(true)
    else setVoiceNotice(true)
  }

  // 나가기(버튼·L·문 앞 E). 방장이고 다른 사람이 있으면 회의를 끝낼지, 넘기고 나갈지 묻습니다.
  const otherPeople = people.filter((p) => p.userId !== myId)
  const requestLeave = () => {
    if (isHost && otherPeople.length > 0) setLeaveAsk(true)
    else void onLeave()
  }

  const handleSeat = (no: number | null) => {
    if (no === null) void supabase.rpc('stand_meeting_seat') // 일어나면 의자를 놓습니다.
    setSeat(no)
  }

  // Player 가 매 프레임 알려 주는 위치로 보낼 값을 갱신합니다. 앉아 있을 때만 고개·눈·팔을 싣습니다(다른 사람 화면에서는 실제 방향).
  const handleMove = (x: number, z: number, h: number) => {
    pos.current.x = x
    pos.current.z = z
    bodyHeading.current = h
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
      ...(face ? { mouth: mouthOpen(face) } : {}), // 입 벌림 (회의실에서만 보냄, #61)
      ...(emote.current.playing ? { emote: emote.current.playing, emoteSeq: emote.current.seq } : {}),
      ...(sync ? { sync } : {}),
      mic: voice.micOn, // 다른 사람 목록에 🔇 표시 (#46)
      ...(myLv ? { lv: myLv } : {}), // 칭호 리본 (공개 범위 '모두'일 때만)
    }
  }

  // V(설정에서 바꿈): 위에서 보기 ↔ 1인칭 / L: 어디서든 회의 나가기. 창이 떠 있으면 쓰지 않습니다.
  const leaveKey = useRef(requestLeave) // 키 처리는 한 번만 걸고, 누른 순간의 최신 나가기·마이크를 부릅니다.
  const micKey = useRef(toggleMic)
  useEffect(() => {
    leaveKey.current = requestLeave
    micKey.current = toggleMic
  })
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || panelOpen) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === getKeymap().view) setView((v) => (v === 'top' ? 'first' : 'top'))
      if (e.code === getKeymap().lobby) leaveKey.current()
      if (e.code === getKeymap().mic) micKey.current()
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [setView, panelOpen])
  // R·F·P·O: 지점과 같은 창 단축키 (같은 키를 다시 누르면 닫힘). 방장 나가기 창이 떠 있으면 쓰지 않습니다.
  useMenuShortcuts({ myId, panel, setPanel, disabled: leaveAsk })

  const keymap = useKeymap()
  const K = {
    view: keyLabel(keymap.view),
    interact: keyLabel(keymap.interact),
    emoteWheel: keyLabel(keymap.emoteWheel),
    recenter: keyLabel(keymap.recenter),
    lobby: keyLabel(keymap.lobby),
    friends: keyLabel(keymap.friends),
    mic: keyLabel(keymap.mic),
  }
  const viewHint = view === 'top' ? `${K.view} 1인칭으로` : locked ? `Esc 커서 보이기 · ${K.view} 위에서 보기` : `클릭해서 둘러보기 · ${K.view} 위에서 보기`
  const hint = panelOpen
    ? ''
    : message
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
          <SeatCamera key={seatChair.no} spot={seatChair} onArrive={() => {}} paused={panelOpen} />
        ) : view === 'first' ? (
          <>
            <WalkCamera posRef={pos} headingRef={heading} paused={panelOpen} onLockChange={setLocked} emoteRef={emote} suspendLookRef={suspendLook} />
            <Minimap area={MEETING_ROOM.size} posRef={pos} headingRef={heading} /> {/* 걸을 때만 뜨는 미니맵 (#290) */}
          </>
        ) : (
          <TopDownCamera area={MEETING_ROOM.size} />
        )}
        <ambientLight intensity={colors.light.ambient} color={colors.light.color} />
        <directionalLight position={[6, 12, 4]} intensity={colors.light.sun} color={colors.light.color} />

        <ThemedFloor floor={theme?.floor} size={MEETING_ROOM.size} color={FLOOR_COLOR} />
        {MEETING_ROOM.walls.map((w, i) => (
          <mesh key={i} position={[w.x, wallH / 2, w.z]}>
            <boxGeometry args={[w.w, wallH, w.d]} />
            <meshStandardMaterial color={colors.wall} />
          </mesh>
        ))}
        {/* 천장·조명·러그·화분·액자 (테마가 있을 때만) */}
        <Decor theme={theme} size={MEETING_ROOM.size} />

        {/* 문: 앞에서 E 를 누르면 회의에서 나갑니다. 테마 문은 지점 출입문과 같은 모양, 아니면 초록 문 + 안쪽(-Z)을 보는 표지판 */}
        {theme?.door ? (
          <ThemedDoor box={MEETING_ROOM.door} height={DOOR_HEIGHT} near={nearExit} nearColor={DOOR_COLOR.near} label="나가기" door={theme.door} along="x" />
        ) : (
          <>
            <mesh position={[MEETING_ROOM.door.x, DOOR_HEIGHT / 2, MEETING_ROOM.door.z]}>
              <boxGeometry args={[MEETING_ROOM.door.w, DOOR_HEIGHT, MEETING_ROOM.door.d]} />
              <meshStandardMaterial color={nearExit ? DOOR_COLOR.near : DOOR_COLOR.idle} />
            </mesh>
            <mesh position={[MEETING_ROOM.door.x, DOOR_SIGN.y, MEETING_ROOM.door.z - MEETING_ROOM.door.d / 2 - 0.01]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[DOOR_SIGN.width, (DOOR_SIGN.width * LABEL_PX.h) / LABEL_PX.w]} />
              <meshBasicMaterial map={labelTexture('나가기', '#14532d')} transparent />
            </mesh>
          </>
        )}

        {/* 원형 테이블: 회의 인원에 맞춘 크기. 의자는 지점 의자 모양 (가까이·내 의자는 주황) */}
        <MeetingTable radius={radius} theme={theme} />
        {chairs.map((c) => (
          <MeetingChair key={c.no} chair={c} kind={chairKind} theme={theme} highlight={c.no === seat || c.no === near} />
        ))}

        {/* 다른 참석자: 앉은 사람은 의자에, 서 있는 사람은 받은 위치에 그립니다(지점과 같음). 표시등은 없고, 방장 이름 앞에 👑 */}
        <OtherParticipants
          others={others.map((o) => (o.userId === info.hostId ? { ...o, nickname: `👑 ${o.nickname}` } : o))}
          spots={chairs}
          showStatus={false}
        />

        {myModel && (
          <Player
            model={myModel}
            obstacles={obstacles}
            spawn={MEETING_ROOM.spawn}
            spawnHeading={ARRIVAL_HEADING}
            emoteRef={emote}
            spots={freeChairs}
            kiosk={NO_KIOSK}
            frozen={panelOpen}
            onNear={setNear}
            onSeat={handleSeat}
            onNearKiosk={() => {}}
            onKiosk={() => {}}
            exit={MEETING_ROOM.door}
            onNearExit={setNearExit}
            onExit={requestLeave}
            canSit={() => false} // 늘 DB 에 의자를 먼저 잡아 봅니다(onSitBlocked → claimSeat → sitRef).
            onSitBlocked={(no) => void claimSeat(no)}
            sitRef={sitRequest}
            onMove={handleMove}
            headingRef={view === 'first' ? heading : undefined}
          />
        )}
      </Canvas>

      {/* 회의 이름과 참석자. 방장에게는 다른 사람 옆에 "방장 넘기기" 버튼이 보입니다. */}
      <div style={styles.info}>
        <strong>{info.isPrivate && '🔒 '}{info.title}</strong>
        <span style={{ color: '#aab0bb' }}>
          {people.length}/{info.capacity}명 · <Elapsed startedAt={info.createdAt} />
        </span>
        {people.map((p) => (
          <div key={p.userId} style={styles.person}>
            <span>
              {voiceMark(p.userId)}
              {p.userId === info.hostId && '👑 '}
              {p.nickname}
              {p.userId === myId && ' (나)'}
            </span>
            {isHost && p.userId !== myId && (
              <button
                type="button"
                style={styles.small}
                onClick={() => {
                  if (window.confirm(`${p.nickname} 님에게 방장을 넘길까요?`)) void transferHost(p)
                }}
              >
                방장 넘기기
              </button>
            )}
          </div>
        ))}
      </div>
      <div style={styles.corner}>
        <button type="button" style={styles.leave} onClick={requestLeave}>
          회의 나가기 ({K.lobby})
        </button>
        <button type="button" style={voice.micOn ? styles.micOn : styles.friends} onClick={toggleMic}>
          {voice.micOn ? `🎤 마이크 끄기 (${K.mic})` : `🔇 마이크 켜기 (${K.mic})`}
        </button>
        <button type="button" style={styles.friends} onClick={() => setPanel(panel?.kind === 'friends' ? null : { kind: 'friends' })}>
          친구 초대 ({K.friends})
        </button>
        {voice.blocked && (
          // 브라우저가 화면을 누르기 전 소리 재생을 막았을 때
          <button type="button" style={styles.friends} onClick={voice.unlock}>
            🔈 눌러서 목소리 듣기
          </button>
        )}
      </div>
      {hint && <div style={styles.hint}>{hint}</div>}
      {/* 앉아 있는 동안만 웹캠 트래킹과 오른쪽 아래 내 모습 화면 */}
      {seat !== null && <SeatedTracking onTracking={handleTracking} />}
      {/* 감정표현: 서 있을 때만 (지점과 같음) */}
      <EmoteControls emoteRef={emote} suspendLookRef={suspendLook} disabled={seat !== null || panelOpen} />
      {/* key: 단축키로 다른 창으로 바꾸면 새 창으로 엽니다 */}
      {panel && (
        <InfoPanel
          key={panelKey(panel)}
          initial={panel}
          myId={myId}
          invite={{ meetingId, memberIds: people.map((p) => p.userId) }} // 이미 이 회의에 있는 친구는 초대 버튼 대신 "이 회의에 있음"
          here={{ place, pos, heading: bodyHeading }} // 전체 지도의 내 위치 (#300)
          onClose={() => setPanel(null)}
        />
      )}
      {voiceNotice && (
        // 처음 마이크를 켤 때 한 번: 목소리가 어떻게 전달되는지 알려 주고 동의를 받습니다.
        <div style={styles.backdrop} onClick={() => setVoiceNotice(false)}>
          <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: 0 }}>
              마이크를 켜면 내 목소리가 이 회의에 있는 사람에게만 브라우저끼리 바로 전달돼요. 서버를 거치지 않고, 녹음하거나 저장하지 않아요.
            </p>
            <button
              type="button"
              style={styles.confirm}
              onClick={() => {
                try {
                  localStorage.setItem(VOICE_NOTICE_KEY, '1')
                } catch {
                  // 기억하지 못해도 이번에는 켭니다.
                }
                setVoiceNotice(false)
                void turnMic(true)
              }}
            >
              마이크 켜기
            </button>
            <button type="button" style={styles.ghost} onClick={() => setVoiceNotice(false)}>
              취소
            </button>
          </div>
        </div>
      )}
      {leaveAsk && (
        // 방장이 나가려 할 때: 회의를 끝내거나, 다른 사람에게 방장을 넘기고 나가거나, 취소
        <div style={styles.backdrop} onClick={() => setLeaveAsk(false)}>
          <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: 0 }}>방장이 나가면 회의가 모두에게 끝나요.</p>
            <button type="button" style={styles.danger} onClick={() => void onLeave()}>
              회의 끝내기
            </button>
            <span style={{ color: '#aab0bb', fontSize: 13 }}>또는 방장을 넘기고 나가기</span>
            {otherPeople.map((p) => (
              <button
                key={p.userId}
                type="button"
                style={styles.ghost}
                onClick={async () => {
                  if (await transferHost(p)) void onLeave()
                }}
              >
                {p.nickname} 님에게 넘기고 나가기
              </button>
            ))}
            <button type="button" style={styles.ghost} onClick={() => setLeaveAsk(false)}>
              취소
            </button>
          </div>
        </div>
      )}
      <ChatOverlay /> {/* 친구 귓속말·그룹 채팅은 회의 중에도 받고, 회의 채팅도 여기서 합니다 (#49, #298) */}
    </>
  )
}

// 회의 진행 시간. 1초마다 이 글자만 다시 그립니다(회의 화면 전체가 매초 다시 그려지지 않게).
function Elapsed({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ELAPSED_TICK_MS)
    return () => clearInterval(t)
  }, [])
  return <span title="회의 진행 시간">{elapsedLabel(startedAt, now)}</span>
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
  person: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  small: {
    padding: '1px 8px', borderRadius: 6, border: '1px solid #4b5563', background: 'transparent', color: '#fff',
    font: '12px system-ui, sans-serif', cursor: 'pointer',
  },
  backdrop: { position: 'fixed', inset: 0, zIndex: 20, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.45)' },
  dialog: {
    width: 'min(360px, calc(100vw - 32px))', padding: 20, borderRadius: 12, background: '#20232a', color: '#fff',
    font: '14px/1.6 system-ui, sans-serif', display: 'flex', flexDirection: 'column', gap: 8,
  },
  confirm: { padding: '8px 12px', borderRadius: 6, border: 'none', background: '#22c55e', color: '#0b1a10', font: 'inherit', fontWeight: 600, cursor: 'pointer' },
  micOn: {
    padding: '8px 14px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#0b1a10',
    font: '14px system-ui, sans-serif', fontWeight: 600, cursor: 'pointer',
  },
  danger: { padding: '8px 12px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', font: 'inherit', fontWeight: 600, cursor: 'pointer' },
  ghost: { padding: '8px 12px', borderRadius: 6, border: '1px solid #4b5563', background: 'transparent', color: '#fff', font: 'inherit', cursor: 'pointer' },
  corner: { position: 'fixed', top: 16, right: 16, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  leave: {
    padding: '8px 14px', borderRadius: 8, border: 'none', background: '#ef4444',
    color: '#fff', font: '14px system-ui, sans-serif', fontWeight: 600, cursor: 'pointer',
  },
  friends: {
    padding: '8px 14px', borderRadius: 8, border: 'none', background: 'rgba(32,35,42,.85)',
    color: '#fff', font: '14px system-ui, sans-serif', cursor: 'pointer',
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
