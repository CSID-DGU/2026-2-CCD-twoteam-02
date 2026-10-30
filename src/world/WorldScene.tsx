// 광장 월드 (#315). 첫 화면입니다. 가운데 분수를 지점 건물 4채가 둘러싸고, 걸어가 건물 입구 앞에서 E를 누르면 그 지점으로 들어간다.
// (예전 로비 방 LobbyScene 을 옮겨 고친 파일. 다른 참여자·채팅·감정표현·메뉴·창은 로비 때와 같다)
//
// 배치는 world.json, 건물 자리·입구·장애물·방향 계산은 worldLogic.ts, 그리는 부품은 WorldDecor.tsx 에 있다.
// 지점 공간 파트의 Player 를 그대로 쓴다. 건물 입구 앞 자리를 Player 의 "앉는 자리"(spots)로 넘기면
// 가까이 갔을 때 onNear, E 를 누르면 onSeat 이 그 건물 번호로 불린다.
// (Player 는 "앉으면" 캐릭터를 숨기지만, 입구에 들어가면 곧바로 장면이 바뀌므로 보이지 않는다)
//
// 어느 건물이 실제로 열리는지는 DB의 branches 를 보고 정한다. 목록에 없는 건물은 준비 중이다.
// 여러 층 건물(올리브 테라스 위 이끼 정원·물결 라운지)은 입구로 1층에만 들어간다. 위층은 안의 엘리베이터로 간다.
//
// 방향: 실내는 입구가 늘 남쪽 벽이라, 들어갈 때 보던 방향에서 건물 입구 각도를 빼서 넘기고(toBranchHeading)
// 나올 때는 더한다(arrivalOf). 그래서 어느 건물에 들어가도 실내에서 안쪽을 보고 선다. (#150)
//
// 시점은 지점과 같다: 처음엔 1인칭으로 걸어 다니고, V 로 위에서 보기와 바꾼다. (#71)
// 광장은 넓어서 위에서 보기·미니맵이 전체 대신 내 둘레를 따라다니며 보여 준다.
// 하늘과 빛은 WorldSky 가 현실 시각(서울)을 따라 바꾼다(#316, 확인용 주소 ?time=21:30 · ?speed=600).
// 날씨는 실제 서울 날씨(Open-Meteo 시간별 예보, #317, 확인용 주소 ?weather=rain · snow · cloudy · clear).
import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useLocation } from 'react-router'
import { Player } from '../space/Player'
import { WalkCamera } from '../space/WalkCamera'
import { TopDownCamera } from '../space/TopDownCamera'
import { Minimap } from '../space/Minimap'
import { FpsProbe, PerfReadout } from '../space/PerfReadout'
import type { Perf } from '../space/PerfReadout'
import { useSession } from '../auth/useSession'
import { InfoPanel } from '../menu/InfoPanel'
import { SceneMenu } from '../menu/SceneMenu'
import type { PanelView } from '../menu/panelTypes'
import { panelKey } from '../menu/panelTypes'
import { useMenuShortcuts } from '../menu/useMenuShortcuts'
import { getKeymap, keyLabel, useKeymap } from '../menu/keymap'
import { supabase } from '../lib/supabase'
import { useMyAvatar } from '../profile/useMyAvatar'
import { passageOf } from '../space/passage'
import { useWalkView } from '../space/useWalkView'
import { BRANCH_LAYOUTS } from '../space/branches'
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
import { arrivalOf, placeBuildings, plazaObstacles, toBranchHeading } from './worldLogic'
import type { PlazaLayout } from './worldLogic'
import { Benches, Building, Fence, Fountain, Ground, Lamps, Trees } from './WorldDecor'
import { WorldSky } from './WorldSky'
import { FortunePanel } from './FortunePanel'
import { signOfBirthday } from './starLogic'
import { useMyBirthday } from '../profile/useMyBirthday'
import { useWorldWeather } from './useWorldWeather'
import world from './world.json'
import { useMyTitle } from '../level/useMyTitle'
import { sharedLevel } from '../level/levelLogic'

const NO_KIOSK = { x: 1000, z: 1000 } // 광장에는 키오스크가 없다. 아래 Player 주석 참고
const TOP_VIEW_SPAN = 30 // 위에서 보기: 내 둘레 이 거리(m)
const MINIMAP_SPAN = 40 // 미니맵: 내 둘레 이 거리(m)

// JSON 은 facing 이 string 으로 읽혀 타입만 맞춥니다. (값은 worldLogic 검사로 확인)
const PLAZA = world as PlazaLayout
// 배치는 실행 중에 바뀌지 않으므로 한 번만 계산합니다.
const PLACED = placeBuildings(PLAZA, BRANCH_LAYOUTS, console.warn)
const OBSTACLES = plazaObstacles(PLAZA, PLACED)
const ENTRIES = PLACED.map((b) => b.entry)
const LIT_LAMPS = PLAZA.lamps.filter((l) => l.light) // 밤에 점광원을 켜는 가로등 (world.json 의 light)
const initialPerf: Perf = { fps: null, minFps: null, transitionMs: null }

type Branch = { id: number; slug: string; name: string }

// 열린 지점 목록 (DB branches.is_open)
const fetchOpenBranches = () => supabase.from('branches').select('id, slug, name').eq('is_open', true)

type Props = {
  onEnter: (branch: Branch, heading: number) => void // heading: 실내에서 볼 방향 (건물 입구 각도를 뺀 값, #150)
}

export default function WorldScene({ onEnter }: Props) {
  const [near, setNear] = useState<number | null>(null)
  const [branches, setBranches] = useState<Branch[] | null>(null)
  const [message, setMessage] = useState('')
  // 처음엔 1인칭. V 로 바꾸면 지점에 다녀와도 유지합니다. (useWalkView)
  const [view, setView] = useWalkView()
  // 지점에서 나왔으면 그 건물 입구 앞에 건물을 등지고 섭니다(#150). 주소로 바로 들어오면 분수 남쪽 시작 위치.
  const location = useLocation()
  const [arrival] = useState(() => {
    const { from, heading } = passageOf(location.state)
    return arrivalOf(PLAZA, PLACED, from, heading)
  })
  const pos = useRef({ x: arrival.spawn.x, z: arrival.spawn.z }) // 1인칭 카메라·위에서 보기·미니맵이 따라갈 내 위치
  const heading = useRef(arrival.heading) // 1인칭에서 바라보는 방향
  const bodyHeading = useRef(arrival.heading) // 몸이 바라보는 방향 (위에서 보기에서도 맞음). 입구에 들어갈 때 넘깁니다.
  const [locked, setLocked] = useState(false) // 1인칭에서 마우스가 잠겨 있는지 (마우스로 바라보는 중, #73)
  // 광장 위에 띄운 창(내 기록·친구·프로필). 페이지를 옮기지 않아 닫으면 서 있던 위치가 그대로입니다. (#70)
  const [panel, setPanel] = useState<PanelView | null>(null)
  // 오늘의 별자리 운세 창 (#321): 밤하늘에서 누른 별자리 id. 다른 창이 떠 있으면 열지 않음
  const [fortune, setFortune] = useState<string | null>(null)
  const [perf, setPerf] = useState<Perf>(initialPerf) // 측정용 FPS
  const { session } = useSession()
  // 내 칭호 (꽃 피는 칭호). 공개 범위가 '모두'일 때만 다른 참여자에게 단계를 보냅니다(sharedLevel).
  const myTitle = useMyTitle(session?.user.id)
  const myLv = sharedLevel(myTitle.visibility, myTitle.level)
  // 내 생일 → 내 별자리 (#321). 밤하늘에서 금색으로 보여 줍니다. 생일이 없으면 null
  const { birthday } = useMyBirthday(session?.user.id)
  const mySign = birthday ? signOfBirthday(birthday.month, birthday.day) : null
  const weather = useWorldWeather() // 실제 서울 날씨 (#317). ref 라 받아도 다시 그리지 않음
  const { model: myModel } = useMyAvatar() // 내 프로필에서 고른 캐릭터 (#131). 읽기 전에는 null
  // 광장에 있는 다른 참여자 (실시간, #166). 내 위치·방향은 매 프레임 바뀌므로 ref 에 담아 두면 훅이 주기적으로 보냅니다.
  // 실시간 방 이름은 예전 로비와 같은 LOBBY_CHANNEL 그대로입니다(experiment 와 어긋나지 않게).
  const me = useRef<PresenceState | null>(null)
  // 감정표현 (#162): Player 가 동작하고, 1인칭 카메라는 그동안 앞으로 빠져 나를 비춥니다.
  const emote = useRef(newEmoteState())
  const suspendLook = useRef(false) // 감정표현 바퀴를 고르는 동안 마우스로 시점이 돌지 않게
  const others = useParticipants(LOBBY_CHANNEL, me)
  // 캐릭터 숨김 모드(실험 B 조건)면 광장에서도 다른 참여자를 그리지 않습니다.
  const [condition] = useState(() => currentCondition(location.search))
  // 사이트 전체 접속 상태에 "광장에 있음"(내부 이름은 lobby 그대로)으로 표시하고, 전체 접속자 수를 읽습니다. (#176)
  useOnlinePlace(LOBBY_PLACE)
  const onlineCount = useOnline().size
  // 오른쪽 위 버튼 단축키 R·F·P (#205)
  useMenuShortcuts({ myId: session?.user.id ?? null, panel, setPanel, disabled: fortune !== null })
  const panelRef = useRef<unknown>(panel) // V 키 처리(한 번만 등록)에서 최신 값을 읽기 위해. 운세 창이 떠 있어도 막음
  useEffect(() => {
    panelRef.current = panel ?? fortune
  }, [panel, fortune])

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
    const { data, error } = await fetchOpenBranches()
    if (error) {
      setMessage(`지점 목록을 불러오지 못했습니다: ${error.message}`)
      return [] as Branch[]
    }
    const list = (data ?? []) as Branch[]
    setBranches(list)
    return list
  }, [])
  // 들어오자마자 한 번 읽어 둡니다. 광장은 넓어서, 안 연 건물 문이 E 를 누르기 전까지 초록으로 보이면
  // 멀리서 걸어간 뒤에야 "준비 중"을 알게 됩니다. 못 읽었으면 조용히 두고, E 를 누를 때 tryEnter 가 다시 읽어 안내합니다.
  useEffect(() => {
    let cancelled = false
    void fetchOpenBranches().then(({ data, error }) => {
      if (!cancelled && !error) setBranches((data ?? []) as Branch[])
    })
    return () => {
      cancelled = true
    }
  }, [])

  // 들어갈 수 있는 건물인지 확인하고 들어간다. 목록을 아직 안 읽었으면 이때 읽는다.
  // 여러 층 건물도 입구로는 1층(건물 slug)에만 들어갑니다. 위층은 안의 엘리베이터로.
  async function tryEnter(no: number | null) {
    if (no === null) return
    // E 를 누른 순간 보던 방향. 입구 앞에서 몸이 돌거나 지점 목록을 읽는 동안 바뀌기 전에 붙잡아 둔다. (#150)
    const enteringHeading = bodyHeading.current
    const b = PLACED.find((p) => p.no === no)
    if (!b) return
    const list = branches ?? (await loadBranches())
    const found = list.find((x) => x.slug === b.slug)
    if (!found) {
      setMessage(`${b.name}은 아직 준비 중입니다.`)
      return
    }
    setMessage('')
    onEnter(found, toBranchHeading(enteringHeading, b.spec.facing))
  }

  const handleFps = (fps: number, warm: boolean) => {
    setPerf((p) => ({ ...p, fps, minFps: warm ? Math.min(p.minFps ?? fps, fps) : p.minFps }))
  }

  // 열린 건물인지. 목록을 아직 못 읽었으면 열린 것으로 보고, E 를 누를 때 tryEnter 가 다시 확인합니다.
  const isOpen = (slug: string) => branches === null || branches.some((x) => x.slug === slug)
  // 안 연 건물 입구에서는 Player 가 입구 자리에 앉히지(숨기지) 않게 하고 "준비 중"만 띄웁니다.
  // (앉히면 캐릭터가 사라지고 E 를 다시 누를 때까지 움직일 수 없음)
  const canEnter = (no: number) => {
    const b = PLACED.find((p) => p.no === no)
    return !b || isOpen(b.slug)
  }
  const blockedEnter = (no: number) => {
    const b = PLACED.find((p) => p.no === no)
    if (b) setMessage(`${b.name}은 아직 준비 중입니다.`)
  }

  const nearBuilding = PLACED.find((b) => b.no === near)
  // 안내 문구에 보일 키 글자 (설정에서 바꾼 키를 따라감, #250)
  const keymap = useKeymap()
  const K = { view: keyLabel(keymap.view), interact: keyLabel(keymap.interact), emoteWheel: keyLabel(keymap.emoteWheel) }
  const viewHint = view === 'top' ? `${K.view} 1인칭으로` : locked ? `Esc 커서 보이기 · ${K.view} 위에서 보기` : `클릭해서 둘러보기 · ${K.view} 위에서 보기`
  const hint = panel
    ? ''
    : nearBuilding
      ? nearBuilding.floors.length > 1
        ? `${nearBuilding.name} · ${K.interact} 입장 (위층은 안에서 엘리베이터)`
        : `${nearBuilding.name} · ${K.interact} 입장`
      : `WASD로 움직여 건물 입구로 가세요 · Shift 달리기 · ${K.emoteWheel} 감정표현 · ${viewHint}`

  return (
    <>
      <Canvas>
        {view === 'first' ? (
          <>
            <WalkCamera posRef={pos} headingRef={heading} paused={panel !== null || fortune !== null} onLockChange={setLocked} emoteRef={emote} suspendLookRef={suspendLook} />
            {/* 걸을 때만 뜨는 미니맵 (#290). 광장은 넓어서 내 둘레만 */}
            <Minimap area={PLAZA.size} posRef={pos} headingRef={heading} follow={MINIMAP_SPAN} />
          </>
        ) : (
          <TopDownCamera area={PLAZA.size} followRef={pos} span={TOP_VIEW_SPAN} />
        )}
        <FpsProbe onSample={handleFps} />
        {/* 하늘·해·달·별과 빛 (#316), 별자리를 누르면 운세 창 (#321), 구름·비·눈 (#317) */}
        <WorldSky lamps={LIT_LAMPS} mySign={mySign} onPickSign={(id) => panel === null && setFortune(id)} weatherRef={weather} followRef={pos} />

        <Ground plaza={PLAZA} />
        <Fence size={PLAZA.size} />
        {PLAZA.fountain && <Fountain fountain={PLAZA.fountain} />}
        <Trees trees={PLAZA.trees} />
        <Benches benches={PLAZA.benches} />
        <Lamps lamps={PLAZA.lamps} />
        {PLACED.map((b) => (
          // 목록을 아직 안 읽었으면 열린 것으로 그립니다(지금 로비와 같음).
          <Building key={b.slug} b={b} open={isOpen(b.slug)} near={near === b.no} />
        ))}

        {/* 광장의 다른 참여자. 누르면 프로필 창 (#166). 광장에서는 모두 공부 전이라 상태 표시등은 끕니다. */}
        {condition === 'visible' && (
          <OtherParticipants others={others} spots={[]} showStatus={false} onSelect={(userId) => setPanel({ kind: 'profile', userId })} />
        )}

        {/* 내 캐릭터를 읽은 뒤에 그립니다. (기본 캐릭터가 잠깐 보였다가 바뀌지 않게) */}
        {myModel && (
          <Player
            model={myModel}
            obstacles={OBSTACLES}
            spawn={arrival.spawn}
            spawnHeading={arrival.heading}
            emoteRef={emote}
            spots={ENTRIES}
            // 광장에는 키오스크가 없다. Player 가 키오스크 좌표를 반드시 받으므로,
            // 걸어서 닿을 수 없는 자리를 줘서 감지가 일어나지 않게 한다. (광장은 56×56 크기다)
            kiosk={NO_KIOSK}
            frozen={panel !== null || fortune !== null}
            onNearKiosk={() => {}}
            onKiosk={() => {}}
            onNear={(no) => {
              setNear(no)
              if (no === null) setMessage('') // 입구에서 벗어나면 "준비 중" 안내를 내림
            }}
            onSeat={(no) => void tryEnter(no)}
            canSit={canEnter}
            onSitBlocked={blockedEnter}
            onMove={(x, z, h) => {
              pos.current.x = x
              pos.current.z = z
              bodyHeading.current = h
              // 광장에서는 앉는 자리가 없고 모두 공부 전(idle)입니다.
              // 서서 감정표현 중이면 같이 실어 보냅니다. (#162)
              const e = emote.current
              if (session) me.current = { userId: session.user.id, x, z, h, seat: null, status: 'idle', ...(e.playing ? { emote: e.playing, emoteSeq: e.seq } : {}), ...(myLv ? { lv: myLv } : {}) }
            }}
            headingRef={view === 'first' ? heading : undefined}
          />
        )}
      </Canvas>

      {(message || hint) && <div style={hintBox}>{message || hint}</div>}
      {/* 전체 접속자 수 (나 포함). 숨김 모드(실험 B)에서는 인원도 보여 주지 않습니다. (#176) */}
      {condition === 'visible' && onlineCount > 0 && <div style={onlineBox}>🟢 지금 {onlineCount}명 접속 중</div>}
      <PerfReadout perf={perf} />
      <ChatOverlay /> {/* 친구 귓속말 로그창 (#49) */}
      <EmoteControls emoteRef={emote} suspendLookRef={suspendLook} disabled={panel !== null || fortune !== null} /> {/* 감정표현: 1~8, X 바퀴 (#162) */}
      {/* 조준점: 마우스가 잠겨 커서가 없을 때 화면 가운데가 클릭 위치입니다. (캐릭터를 누르면 프로필, #166) */}
      {locked && <div style={crosshair} />}
      {session && <SceneMenu myId={session.user.id} onOpen={setPanel} />}
      {/* key: 단축키로 다른 창으로 바꾸면 새 창으로 엽니다 */}
      {fortune && <FortunePanel picked={fortune} myId={session?.user.id ?? null} onClose={() => setFortune(null)} />}
      {panel && session && <InfoPanel key={panelKey(panel)} initial={panel} myId={session.user.id} here={{ place: LOBBY_PLACE, pos, heading: bodyHeading }} onClose={() => setPanel(null)} />}
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
