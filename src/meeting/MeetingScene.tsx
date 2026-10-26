// 회의 화면 (#45): 주소 /meeting/회의번호?branch=지점slug
//
// 원형 테이블 둘레에 지금 참석자 수만큼 의자를 놓고(meetingLogic), 나는 내 의자에서 테이블 가운데를 보는 1인칭입니다.
// 지점 좌석과 같은 카메라(SeatCamera)라 WASD·끌어서 좌우 60도씩 둘러보고, Space 로 정면을 봅니다.
// 회의실에서는 공부 타이머·집중 판정을 하지 않습니다.
// 나가기(버튼 또는 L)를 누르면 회의에서 나가고 지점 회의실 문 앞으로 돌아갑니다.
import { useCallback, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { useSession } from '../auth/useSession'
import { BRANCH_LAYOUTS, DEFAULT_BRANCH } from '../space/branches'
import { CHAIR } from '../space/layout'
import { SeatCamera } from '../space/SeatCamera'
import { SeatedCharacter } from '../space/SeatedCharacter'
import { NameTag } from '../realtime/NameTag'
import { useOnlinePlace } from '../realtime/onlineContext'
import { ChatOverlay } from '../chat/ChatOverlay'
import { getKeymap, keyLabel, useKeymap } from '../menu/keymap'
import { MEETING_CAPACITY, meetingPlace, meetingSpots, tableRadius } from './meetingLogic'
import { useMeeting } from './useMeeting'
import type { MeetingPerson } from './useMeeting'

const ROOM = 8 // 회의실 한 변 길이
const WALL_HEIGHT = 2.5
const TABLE_HEIGHT = 0.74 // 지점 책상과 같은 높이
const EXIT_HEADING = -Math.PI / 2 // 지점으로 돌아가면 회의실 문을 등지고 좌석 쪽(-X)을 봅니다.

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
  const state = useMeeting(meetingId, myId)
  useOnlinePlace(meetingPlace(slug)) // 친구 탭에 "별다방 회의 중"

  const backToBranch = useCallback(
    () => navigate(`/space?branch=${slug}`, { state: { at: 'meeting', heading: EXIT_HEADING } }),
    [navigate, slug],
  )
  const leave = useCallback(async () => {
    const { error } = await supabase.rpc('leave_meeting')
    if (error) console.error('회의에서 나가지 못했습니다:', error.message) // 못 나가도 5분 뒤 DB 가 내보냅니다.
    backToBranch()
  }, [backToBranch])

  // L(설정에서 바꿈): 회의 나가기
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== getKeymap().lobby || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      void leave()
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [leave])

  const keymap = useKeymap()

  if (state.status === 'loading') return <Notice text="회의에 들어가는 중…" />
  if (state.status === 'error') return <Notice text={`회의를 불러오지 못했어요: ${state.message}`} slug={slug} />
  if (state.status === 'notMember') return <Notice text="끝났거나 들어 있지 않은 회의예요." slug={slug} />

  const spots = meetingSpots(state.people)
  const mySpot = spots.find((s) => s.userId === myId)
  const byId = new Map<string, MeetingPerson>(state.people.map((p) => [p.userId, p]))
  const radius = tableRadius(state.people.length)

  return (
    <>
      <Canvas>
        {mySpot && (
          // key: 사람이 들어오거나 나가 내 의자 위치가 바뀌면 카메라를 새 자리로 옮깁니다.
          <SeatCamera key={`${mySpot.x.toFixed(3)},${mySpot.z.toFixed(3)}`} spot={mySpot} onArrive={() => {}} paused={false} />
        )}
        <ambientLight intensity={1.2} />
        <directionalLight position={[6, 12, 4]} intensity={0.8} />

        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[ROOM, ROOM]} />
          <meshStandardMaterial color="#c9d6e3" />
        </mesh>
        {[0, 1, 2, 3].map((i) => {
          const a = (i * Math.PI) / 2
          return (
            <mesh key={i} position={[Math.sin(a) * (ROOM / 2), WALL_HEIGHT / 2, Math.cos(a) * (ROOM / 2)]} rotation={[0, a, 0]}>
              <boxGeometry args={[ROOM, WALL_HEIGHT, 0.15]} />
              <meshStandardMaterial color="#8a8f98" />
            </mesh>
          )
        })}

        {/* 원형 테이블: 인원에 맞춰 크기가 바뀝니다. */}
        <mesh position={[0, TABLE_HEIGHT - 0.03, 0]}>
          <cylinderGeometry args={[radius, radius, 0.06, 64]} />
          <meshStandardMaterial color="#b98a5a" />
        </mesh>
        <mesh position={[0, (TABLE_HEIGHT - 0.06) / 2, 0]}>
          <cylinderGeometry args={[0.15, 0.25, TABLE_HEIGHT - 0.06, 16]} />
          <meshStandardMaterial color="#7c5a3a" />
        </mesh>

        {spots.map((s) => (
          <mesh key={`chair-${s.no}`} position={[s.x, CHAIR.h / 2, s.z]} rotation={[0, s.rot, 0]}>
            <boxGeometry args={[CHAIR.w, CHAIR.h, CHAIR.d]} />
            <meshStandardMaterial color={s.userId === myId ? '#f59e0b' : '#6b7280'} />
          </mesh>
        ))}

        {/* 나는 1인칭이라 그리지 않습니다. */}
        {spots
          .filter((s) => s.userId !== myId)
          .map((s) => {
            const p = byId.get(s.userId)
            if (!p) return null
            return (
              <group key={s.userId}>
                <SeatedCharacter spot={s} model={p.model} />
                <NameTag x={s.x} z={s.z} name={p.nickname} />
              </group>
            )
          })}
      </Canvas>

      <div style={styles.info}>
        <strong>{state.info.isPrivate && '🔒 '}{state.info.title}</strong>
        <span style={{ color: '#aab0bb' }}>
          {state.people.length}/{MEETING_CAPACITY}명 · {state.people.map((p) => p.nickname).join(', ')}
        </span>
      </div>
      <button type="button" style={styles.leave} onClick={() => void leave()}>
        회의 나가기 ({keyLabel(keymap.lobby)})
      </button>
      <div style={styles.hint}>
        WASD·끌어서 둘러보기 · {keyLabel(keymap.recenter)} 정면 보기 · {keyLabel(keymap.lobby)} 회의 나가기
      </div>
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
