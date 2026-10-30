// 전체 지도 (#300): 광장과 지점 건물을 한 장에 그립니다. 창(InfoPanel)에서 G 로 엽니다.
//
// 배치는 mapLogic.ts 가 광장 배치(world.json)와 지점 JSON 으로 계산하므로 3D 광장과 같은 모양입니다. (#315)
// 처음에는 건물 지붕과 이름·접속 인원만 보이고, 커서를 올리거나 누르면 지붕이 투명해지며 안(책상·좌석 등)이 보입니다.
// 3D 를 쓰지 않고 SVG(벡터 그림)로 그립니다. 단위는 m 이고 viewBox 가 지도 전체라 창 크기에 맞춰 늘고 줄어듭니다.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import world from '../world/world.json'
import campus from '../world/campus.json'
import { CAMPUS_PLACE } from '../realtime/online'
import { toward } from '../lib/josa'
import type { PlazaLayout } from '../world/worldLogic'
import { BRANCH_LAYOUTS } from '../space/branches'
import { KIOSK, SEAT, CHAIR, spotsOf } from '../space/layout'
import type { Box } from '../space/layout'
import { MY_SEAT_COLOR } from '../space/MySeatMarker'
import { useOnline } from '../realtime/onlineContext'
import { keyLabel, useKeymap } from '../menu/keymap'
import { boxToMap, buildWorld, countByPlace, findPlace, mapWorldFor, toMap } from './mapLogic'
import type { MapBranch, MapPlace, Rect, WorldLayout } from './mapLogic'

// 지도를 연 화면이 알려 주는 "지금 나": 있는 곳(접속 상태와 같은 이름), 그 공간 안 위치와 몸 방향, 이 지점의 내 자리
export type MapHere = {
  place: string
  pos: RefObject<{ x: number; z: number }>
  heading: RefObject<number> // 라디안, 0이면 +Z(남쪽)
  mySeat?: number | null
}

// 배치 JSON 은 실행 중에 바뀌지 않으므로 한 번만. 광장과 캠빛 대학교 캠퍼스, 지금 있는 곳의 월드를 그립니다.
const WORLDS = { plaza: buildWorld(world as PlazaLayout, BRANCH_LAYOUTS), campus: buildWorld(campus as PlazaLayout, BRANCH_LAYOUTS, CAMPUS_PLACE) }

const WALL = '#5d4a3a'
const FLOOR = '#e8e2d6' // 3D 바닥과 같은 색
const DESK = '#b98a5a' // 3D 책상과 같은 색
const CHAIR_COLOR = '#4a5160'
const DOOR = '#2e9e4f' // 3D 문과 비슷한 초록
const WATER = '#6fbbe0' // 분수 물
const STONE = '#a9a196' // 분수 테두리
const ARROW = 1.8 // 내 화살표 길이 (m)
const MEETING_LABEL_GAP = 2.6 // 건물 이름표 아래 "회의 중" 이름표까지 (m)
const FLOOR_LABEL_GAP = 2 // 여러 층 건물: 건물 이름표 위로 층 이름표를 쌓는 간격 (m, 건물 8m 안에 들게)

export function WorldMap({ here }: { here?: MapHere }) {
  const people = useOnline()
  const counts = useMemo(() => countByPlace([...people.values()].map((p) => p.place)), [people])
  const keys = useKeymap()
  const WORLD = mapWorldFor(WORLDS, here?.place ?? '')
  const me = here ? findPlace(WORLD, here.place) : null
  const [hovered, setHovered] = useState<string | null>(null)
  // 눌러서 열어 둔 건물 (터치 화면용). 처음에는 내가 있는 건물을 열어 둡니다. (광장은 지붕이 없음, 회의실은 그 지점 건물)
  const [pinned, setPinned] = useState<string | null>(
    () => WORLD.branches.find((b) => b === me || b.meeting === me || b.floors.some((f) => f === me || f.meeting === me))?.place ?? null,
  )
  const open = (place: string) => hovered === place || pinned === place

  // 내 화살표: 위치·방향은 ref 라서 그릴 때마다 읽어 옮깁니다. (지도를 연 동안은 캐릭터가 멈춰 있지만, 열린 순간의 값을 읽으려고)
  const arrow = useRef<SVGGElement>(null)
  useEffect(() => {
    if (!here || !me) return
    let raf = 0
    const tick = () => {
      const p = toMap(me, here.pos.current.x, here.pos.current.z, here.heading.current)
      arrow.current?.setAttribute('transform', `translate(${p.x} ${p.z}) rotate(${(-p.heading * 180) / Math.PI})`)
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [here, me])

  const b = WORLD.bounds
  const viewBox = `${b.x - b.w / 2} ${b.z - b.d / 2} ${b.w} ${b.d}`
  return (
    <div style={styles.wrap}>
      <svg viewBox={viewBox} style={styles.svg} onClick={() => setPinned(null)}>
        <defs>
          {/* 풀밭: 2m 마다 반복되는 무늬 */}
          <pattern id="map-grass" width="2" height="2" patternUnits="userSpaceOnUse">
            <rect width="2" height="2" fill="#78b04a" />
            <rect x="0.2" y="0.3" width="0.25" height="0.25" fill="#6a9f3f" />
            <rect x="1.2" y="1.1" width="0.25" height="0.25" fill="#6a9f3f" />
            <rect x="1.5" y="0.2" width="0.2" height="0.2" fill="#8cc35a" />
            <rect x="0.6" y="1.5" width="0.2" height="0.2" fill="#8cc35a" />
          </pattern>
          {/* 광장: 1m 돌바닥 */}
          <pattern id="map-plaza" width="1" height="1" patternUnits="userSpaceOnUse">
            <rect width="1" height="1" fill="#cdbb9a" />
            <path d="M0 0H1M0 0V1" stroke="#b5a27f" strokeWidth="0.06" />
          </pattern>
          {/* 지붕: 기와 줄 */}
          <pattern id="map-shingle" width="1" height="0.7" patternUnits="userSpaceOnUse">
            <path d="M0 0.68H1" stroke="rgba(0,0,0,.22)" strokeWidth="0.08" />
          </pattern>
        </defs>

        <rect x={b.x - b.w / 2} y={b.z - b.d / 2} width={b.w} height={b.d} fill="url(#map-grass)" />

        {/* 광장 돌바닥과 건물 입구로 가는 돌길 */}
        <Plaza world={WORLD} count={counts.get(WORLD.lobby.place) ?? 0} />

        {WORLD.trees.map((t, i) => (
          <g key={i} transform={`translate(${t.x} ${t.z})`}>
            <ellipse cx="0.15" cy="0.25" rx="0.85" ry="0.75" fill="rgba(0,0,0,.18)" />
            <circle r="0.8" fill="#2f7a3a" />
            <circle cx="-0.2" cy="-0.22" r="0.45" fill="#46994d" />
          </g>
        ))}

        {WORLD.branches.map((br) => (
          <Branch
            key={br.place}
            branch={br}
            count={counts.get(br.place) ?? 0}
            meetingCount={[br.meeting, ...br.floors.map((f) => f.meeting)].reduce((n, m) => n + (m ? (counts.get(m.place) ?? 0) : 0), 0)}
            floorCounts={br.floors.map((f) => counts.get(f.place) ?? 0)}
            open={open(br.place)}
            mySeat={here && here.place === br.place ? (here.mySeat ?? null) : null}
            onHover={(on) => setHovered(on ? br.place : null)}
            onPin={() => setPinned((p) => (p === br.place ? null : br.place))}
          />
        ))}

        {/* 내 위치: 노란 화살표 + 퍼지는 원 */}
        {me && (
          <g ref={arrow} style={{ pointerEvents: 'none' }}>
            <circle r="1.2" fill="none" stroke="#facc15" strokeWidth="0.25">
              <animate attributeName="r" values="1;2.4" dur="1.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.9;0" dur="1.4s" repeatCount="indefinite" />
            </circle>
            <polygon points={arrowPoints(ARROW * 1.3)} fill="#111" transform={`translate(0 ${-ARROW * 0.05})`} />
            <polygon points={arrowPoints(ARROW)} fill="#facc15" />
          </g>
        )}
      </svg>
      <p style={styles.hint}>
        {me ? '노란 화살표가 지금 나예요. ' : '지금 있는 곳은 지도에 없어요. '}
        건물에 마우스를 올리면 안이 보여요 · 누르면 열어 둬요 · {keyLabel(keys.map)} 또는 Esc 로 닫기
      </p>
    </div>
  )
}

// 끝이 +Z(지도 아래)를 향하는 화살표. 회전으로 바라보는 쪽을 맞춥니다.
function arrowPoints(l: number) {
  return [[0, l * 0.6], [l * 0.4, -l * 0.4], [0, -l * 0.15], [-l * 0.4, -l * 0.4]].map(([x, z]) => `${x},${z}`).join(' ')
}

const rectProps = (r: Rect) => ({ x: r.x - r.w / 2, y: r.z - r.d / 2, width: r.w, height: r.d })

// 광장: 돌바닥, 돌길, 가운데 분수, 이름표
function Plaza({ world: WORLD, count }: { world: WorldLayout; count: number }) {
  const l = WORLD.lobby
  const f = WORLD.fountain
  return (
    <g>
      {WORLD.paths.map((p, i) => (
        <rect key={i} {...rectProps(p)} fill="url(#map-plaza)" />
      ))}
      <rect {...rectProps(l.rect)} fill="url(#map-plaza)" stroke="#8a7a5e" strokeWidth="0.3" />
      {f && <circle cx={f.x} cy={f.z} r={f.r} fill={STONE} />}
      {f && <circle cx={f.x} cy={f.z} r={f.r * 0.85} fill={WATER} />}
      {/* 다른 월드로 가는 정문 */}
      {WORLD.gates.map((g, i) => (
        <g key={i}>
          <rect {...rectProps({ x: g.x, z: g.z, w: g.sideways ? 1.2 : 2.4, d: g.sideways ? 2.4 : 1.2 })} fill="#8a4b35" stroke="#2f7a3a" strokeWidth="0.4" />
          <text x={g.x} y={g.z - 1.8} fontSize={1.4} textAnchor="middle" fill="#fff" stroke="#3b2a1a" strokeWidth={0.3} paintOrder="stroke">
            {toward(WORLDS[g.to].lobby.name)} 가는 문
          </text>
        </g>
      ))}
      <Label x={l.rect.x} z={l.rect.z + l.rect.d / 2 - 2.6} name={l.name} count={count} />
    </g>
  )
}

type BranchProps = {
  branch: MapBranch
  count: number
  meetingCount: number // 이 건물 모든 층의 회의실 인원
  floorCounts: number[] // 위층 지점별 인원 (branch.floors 순서)
  open: boolean
  mySeat: number | null
  onHover: (on: boolean) => void
  onPin: () => void
}

function Branch({ branch, count, meetingCount, floorCounts, open, mySeat, onHover, onPin }: BranchProps) {
  const { layout } = branch
  const roof = branch.roof // 3D 광장의 지붕 색과 같음
  const box = (bx: Box) => rectProps(boxToMap(branch, bx))
  return (
    <g
      style={{ cursor: 'pointer' }}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onClick={(e) => {
        e.stopPropagation()
        onPin()
      }}
    >
      <Building place={branch} roof={roof} open={open} sprite={layout.mapSprite}>
        {layout.seats.map((s) => (
          <rect key={s.no} {...box({ x: s.x, z: s.z, ...SEAT })} fill={DESK} />
        ))}
        {spotsOf(layout).map((c) => (
          <rect key={c.no} {...box({ x: c.x, z: c.z, w: CHAIR.w, d: CHAIR.d })} fill={c.no === mySeat ? MY_SEAT_COLOR : CHAIR_COLOR} />
        ))}
        {layout.kiosk && <rect {...box({ ...layout.kiosk, ...KIOSK })} fill="#2b6cb0" />}
        {layout.bar && <rect {...box(layout.bar)} fill="#7a4e2d" />}
      </Building>
      {/* 문은 지붕 위에도 보이게 (어디로 들어가는지) */}
      {layout.door && <rect {...box(layout.door)} fill={DOOR} />}
      {layout.meetingDoor && <rect {...box(layout.meetingDoor)} fill={DOOR} />}
      <Label x={branch.rect.x} z={branch.rect.z} name={branch.name} count={count} />
      {/* 위층 지점: 지도에는 1층 안만 그리고, 건물 이름표 위에 층 이름표를 쌓습니다. */}
      {branch.floors.map((f, i) => (
        <Label key={f.place} x={branch.rect.x} z={branch.rect.z - FLOOR_LABEL_GAP * (branch.floors.length - i)} name={`${f.level}F ${f.name}`} count={floorCounts[i]} small />
      ))}
      {meetingCount > 0 && (
        // 회의실은 광장·지도에 따로 없어서, 그 지점 건물 이름표 아래에 회의 인원만 띄웁니다.
        <Label x={branch.rect.x} z={branch.rect.z + MEETING_LABEL_GAP} name="회의 중" count={meetingCount} small />
      )}
    </g>
  )
}

// 건물: 그림자, 벽, 바닥과 안의 물건(children), 그 위를 덮는 지붕. 열리면 지붕이 투명해집니다.
// sprite(지점 JSON 의 mapSprite)가 있으면 그 그림을 지붕으로 씁니다. 그림은 입구가 아래(남쪽)인 모습이라
// 건물이 돌아간 만큼(rot) 같이 돌립니다. (SVG rotate 는 화면 시계 방향이라 -rot)
function Building({ place, roof, open, sprite, children }: { place: MapPlace; roof: string; open: boolean; sprite?: string; children: ReactNode }) {
  const r = place.rect
  const roofStyle: CSSProperties = { opacity: open ? 0.12 : 1, transition: 'opacity .25s' }
  return (
    <g>
      <rect {...rectProps({ ...r, x: r.x + 0.5, z: r.z + 0.7 })} fill="rgba(0,0,0,.25)" />
      <rect {...rectProps(r)} fill={WALL} />
      <rect {...rectProps({ ...r, w: r.w - 0.5, d: r.d - 0.5 })} fill={FLOOR} />
      {children}
      {sprite ? (
        <image
          href={sprite}
          {...rectProps(Math.abs(Math.sin(place.rot)) > 0.5 ? { ...r, w: r.d, d: r.w } : r)}
          transform={`rotate(${(-place.rot * 180) / Math.PI} ${r.x} ${r.z})`}
          preserveAspectRatio="none"
          style={roofStyle}
        />
      ) : (
        <g style={roofStyle}>
          <rect {...rectProps(r)} fill={roof} />
          <rect {...rectProps(r)} fill="url(#map-shingle)" />
          {/* 용마루(지붕 가운데 줄)와 가장자리 */}
          <path d={`M${r.x - r.w / 2 + 0.6} ${r.z}H${r.x + r.w / 2 - 0.6}`} stroke="rgba(0,0,0,.3)" strokeWidth="0.35" />
          <rect {...rectProps(r)} fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="0.3" />
        </g>
      )}
    </g>
  )
}

// 이름표: 흰 글씨에 진한 테두리, 밑줄. 아래에 접속 인원
function Label({ x, z, name, count, small = false }: { x: number; z: number; name: string; count: number; small?: boolean }) {
  const size = small ? 0.9 : 1.4
  const width = name.length * size * 0.95
  return (
    <g style={{ pointerEvents: 'none' }} textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight={700}>
      <text x={x} y={z} fontSize={size} fill="#fff" stroke="#3b2a1a" strokeWidth={size * 0.22} paintOrder="stroke">
        {name}
      </text>
      <path d={`M${x - width / 2} ${z + size * 0.3}H${x + width / 2}`} stroke="#fff" strokeWidth={size * 0.09} />
      <text x={x} y={z + size * 1.3} fontSize={size * 0.7} fill="#fff" stroke="#3b2a1a" strokeWidth={size * 0.16} paintOrder="stroke">
        {count > 0 ? `● ${count}명` : '비어 있음'}
      </text>
    </g>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 8 },
  svg: { width: '100%', maxHeight: 'calc(100vh - 160px)', borderRadius: 10, background: '#78b04a', display: 'block' },
  hint: { margin: 0, fontSize: 13, opacity: 0.75 },
}
