// 전체 지도 (#300): 캠리단길과 캠빛 대학교를 한 장에 그립니다. 창(InfoPanel)에서 G 로 엽니다.
//
// 일러스트 지도: 3D 배치 데이터(world.json·campus.json·지점 JSON)를 그대로 읽어, 돌바닥·화단·나무·가로등·전구줄·분수,
// 캠퍼스 산책로·축구장·등불나무 광장까지 그립니다. 건물은 비스듬히 위에서 본 모양(지붕 + 앞벽, 층수만큼 높게)입니다.
// 두 월드는 다른 공간이라, 캠퍼스를 왼쪽으로 90도 돌려 캠리단길 서쪽에 놓고 두 정문을 곧은 "캠빛 대학교 가는 길"로 잇습니다(atlasLogic).
// 돌린 캠퍼스의 바닥(풀밭·길·운동장·화단)은 통째로 돌려 그리고, 건물·나무·이름표는 돌린 자리에 똑바로 세워 그립니다
// (건물 앞벽은 어느 월드든 지도 아래쪽에 보이게). 캠퍼스 모서리의 작은 나침반이 캠퍼스 안에서의 북쪽입니다.
// 휠·드래그로 확대·이동하고, 위 버튼으로 캠리단길·캠빛 대학교·전체를 맞춰 봅니다. 처음에는 내가 있는 월드를 보여 줍니다.
// 건물에 커서를 올리거나 누르면 지붕·벽이 투명해지며 1층 안(책상·좌석)이 보입니다. 이름표에는 층별 접속 인원을 모았습니다.
// 3D 를 쓰지 않고 SVG(벡터 그림)로 그립니다. 단위는 m 이고 지도의 위쪽이 -Z(북쪽)입니다.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react'
import world from '../world/world.json'
import campus from '../world/campus.json'
import { CAMPUS_PLACE } from '../realtime/online'
import { BENCH, gravelStrips, placeBuildings } from '../world/worldLogic'
import type { PlacedBuilding, PlazaLayout, WorldId } from '../world/worldLogic'
import { flowerBeds } from '../world/gardenLogic'
import type { PlantKind } from '../world/gardenLogic'
import { stringBulbs } from '../world/streetLightLogic'
import { BRANCH_LAYOUTS } from '../space/branches'
import { KIOSK, SEAT, CHAIR, spotsOf } from '../space/layout'
import type { Box } from '../space/layout'
import { MY_SEAT_COLOR } from '../space/MySeatMarker'
import { useOnline } from '../realtime/onlineContext'
import { keyLabel, useKeymap } from '../menu/keymap'
import { boxToMap, buildWorld, countByPlace, findPlace, toMap, turnWorld } from './mapLogic'
import type { MapBranch, MapPlace, Rect, WorldLayout } from './mapLogic'
import { CAMPUS_TURN, ZOOM, aspectFor, campusOffset, fitView, labelScale, linkRoad, panView, storyHeight, textWidth, turnPoint, turnRect, unionRect, withTitle, worldRect, zoomView } from './atlasLogic'
import type { Point, View } from './atlasLogic'

// 지도를 연 화면이 알려 주는 "지금 나": 있는 곳(접속 상태와 같은 이름), 그 공간 안 위치와 몸 방향, 이 지점의 내 자리
export type MapHere = {
  place: string
  pos: RefObject<{ x: number; z: number }>
  heading: RefObject<number> // 라디안, 0이면 +Z(남쪽)
  mySeat?: number | null
}

// ── 한 장에 놓을 두 월드 (배치 JSON 은 실행 중에 바뀌지 않으므로 한 번만) ──────────
// layout: 지도 좌표의 배치(turn 만큼 돌린 것), raw: 월드 배치 그대로(바닥을 돌려 그릴 때), turn: 돌린 각도(라디안), offset: 옮긴 자리
type AtlasWorld = { id: WorldId; layout: WorldLayout; raw: PlazaLayout; offset: Point; turn: number; placed: PlacedBuilding[]; ribbon: string }
const RAW: Record<WorldId, PlazaLayout> = { plaza: world as PlazaLayout, campus: campus as PlazaLayout }
const PLAZA_GATE = RAW.plaza.gates?.find((g) => g.to === 'campus')
const CAMPUS_GATE = RAW.campus.gates?.find((g) => g.to === 'plaza')
const CAMPUS_AT = PLAZA_GATE && CAMPUS_GATE ? campusOffset(RAW.plaza, PLAZA_GATE, CAMPUS_GATE) : { x: -70, z: 0 }
const ATLAS: AtlasWorld[] = [
  { id: 'plaza', layout: buildWorld(RAW.plaza, BRANCH_LAYOUTS), raw: RAW.plaza, offset: { x: 0, z: 0 }, turn: 0, placed: placeBuildings(RAW.plaza, BRANCH_LAYOUTS), ribbon: '#7a4b2a' },
  { id: 'campus', layout: turnWorld(buildWorld(RAW.campus, BRANCH_LAYOUTS, CAMPUS_PLACE), CAMPUS_TURN), raw: RAW.campus, offset: CAMPUS_AT, turn: CAMPUS_TURN, placed: placeBuildings(RAW.campus, BRANCH_LAYOUTS), ribbon: '#8a2f2f' },
]
const rectOf = (w: AtlasWorld) => worldRect(w.raw, w.offset, w.turn) // 지도에서 그 월드가 차지하는 사각형
const BOUNDS = unionRect(ATLAS.map(rectOf))
const ROAD = PLAZA_GATE && CAMPUS_GATE ? linkRoad(RAW.plaza, PLAZA_GATE, CAMPUS_GATE, CAMPUS_AT) : null

// 있는 곳(접속 상태 이름)이 어느 월드의 어느 공간인지
function locate(place: string): { w: AtlasWorld; p: MapPlace } | null {
  for (const w of ATLAS) {
    const p = findPlace(w.layout, place)
    if (p) return { w, p }
  }
  return null
}

// ── 색 ─────────────────────────────────────────────────────
const C = {
  paper: '#efe8d6',
  paperLine: '#e2d9c3',
  hedge: '#3f6e2f',
  gravel: '#dccfb3',
  stoneEdge: '#a8987a',
  water: '#7cc4e6',
  waterDeep: '#4fa3cf',
  path: '#dcd0b4',
  pathEdge: '#bfae8b',
  floor: '#f3efe6',
  desk: '#b98a5a',
  chair: '#4a5160',
  door: '#2e9e4f',
  lamp: '#2d3036',
  glow: 'rgba(255,214,140,.38)',
  bulb: '#ffd58a',
  bench: '#8a5a3a',
  pitch: ['#5ea84b', '#6ab657'],
  deck: '#9a7653',
}
const FLOWER: Record<PlantKind, string> = { rose: '#e8648c', lavender: '#9b7fd1', daisy: '#fff7d6', bush: '#4f8f3f', fern: '#5aa04a' }
const ARROW = 1.8 // 내 화살표 길이 (m)

export function WorldMap({ here }: { here?: MapHere }) {
  const people = useOnline()
  const counts = useMemo(() => countByPlace([...people.values()].map((p) => p.place)), [people])
  const keys = useKeymap()
  const where = useMemo(() => (here ? locate(here.place) : null), [here])
  const [aspect] = useState(() => aspectFor(window.innerWidth)) // 폰은 정사각형 지도
  const [screenW, setScreenW] = useState(() => Math.min(1036, window.innerWidth - 72)) // 지도 화면 폭(px). 이름표 크기를 맞춤
  const [view, setView] = useState<View>(() => fitView(withTitle(rectOf(where?.w ?? ATLAS[0])), aspect))
  const [hovered, setHovered] = useState<string | null>(null)
  // 눌러서 열어 둔 건물 (터치 화면용). 처음에는 내가 있는 건물을 열어 둡니다. (광장은 지붕이 없음, 회의실은 그 지점 건물)
  const [pinned, setPinned] = useState<string | null>(() => {
    if (!where) return null
    const p = where.p
    return where.w.layout.branches.find((b) => b === p || b.meeting === p || b.floors.some((f) => f === p || f.meeting === p))?.place ?? null
  })
  const open = (place: string) => hovered === place || pinned === place
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean } | null>(null)
  const dragged = useRef(false) // 방금 끌었으면 그 뒤 클릭(건물 열기·닫기)은 무시

  // 휠로 확대·축소: 커서 자리를 그대로 둠. (React 의 onWheel 은 기본 동작을 막을 수 없어 직접 붙임)
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const at = toSvg(el, e.clientX, e.clientY)
      setView((v) => zoomView(v, Math.exp(-e.deltaY * 0.0015), at, BOUNDS, aspect))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    // 창 크기가 바뀌면 지도 화면 폭을 다시 잼
    const ro = new ResizeObserver(() => setScreenW(el.clientWidth))
    ro.observe(el)
    return () => {
      el.removeEventListener('wheel', onWheel)
      ro.disconnect()
    }
  }, [aspect])

  // 내 화살표: 위치·방향은 ref 라서 그릴 때마다 읽어 옮깁니다. (지도를 연 동안은 캐릭터가 멈춰 있지만, 열린 순간의 값을 읽으려고)
  const arrow = useRef<SVGGElement>(null)
  useEffect(() => {
    if (!here || !where) return
    let raf = 0
    const tick = () => {
      const p = toMap(where.p, here.pos.current.x, here.pos.current.z, here.heading.current)
      arrow.current?.setAttribute('transform', `translate(${p.x + where.w.offset.x} ${p.z + where.w.offset.z}) rotate(${(-p.heading * 180) / Math.PI})`)
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [here, where])

  const down = (e: ReactPointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, view, moved: false }
  }
  const move = (e: ReactPointerEvent) => {
    const d = drag.current
    const el = svg.current
    if (!d || !el || e.buttons === 0) return
    const px = e.clientX - d.x
    const py = e.clientY - d.y
    if (!d.moved && Math.hypot(px, py) < 5) return
    d.moved = true
    const k = d.view.w / el.clientWidth // 화면 1px = 지도 몇 m (가로 기준, 비율이 같아 세로도 같음)
    setView(panView(d.view, -px * k, -py * k, BOUNDS))
  }
  const up = () => {
    if (drag.current?.moved) dragged.current = true
    drag.current = null
  }
  const zoomBy = (factor: number) => setView((v) => zoomView(v, factor, { x: v.x + v.w / 2, z: v.z + v.d / 2 }, BOUNDS, aspect))
  // "전체"보다 더 멀리 축소하면 이름표도 지도와 같이 작아지고 이름만 보임 (겹치지 않게)
  const fullW = fitView(withTitle(BOUNDS), aspect).w
  const ls = labelScale(view.w, screenW) * Math.min(1, fullW / view.w)
  const compact = view.w > fullW * 1.1

  return (
    <div style={styles.wrap}>
      <div style={styles.bar}>
        {ATLAS.map((w) => (
          <button key={w.id} type="button" style={styles.button} onClick={() => setView(fitView(withTitle(rectOf(w)), aspect))}>
            {w.layout.lobby.name}
          </button>
        ))}
        <button type="button" style={styles.button} onClick={() => setView(fitView(withTitle(BOUNDS), aspect))}>
          전체
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" style={styles.button} onClick={() => zoomBy(1 / ZOOM.step)} aria-label="축소">
          −
        </button>
        <button type="button" style={styles.button} onClick={() => zoomBy(ZOOM.step)} aria-label="확대">
          +
        </button>
      </div>
      <svg
        ref={svg}
        viewBox={`${view.x} ${view.z} ${view.w} ${view.d}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ ...styles.svg, aspectRatio: String(aspect) }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        onClickCapture={(e) => {
          if (!dragged.current) return
          dragged.current = false
          e.stopPropagation()
        }}
        onClick={() => setPinned(null)}
      >
        <Defs />
        <rect x={BOUNDS.x - BOUNDS.w} y={BOUNDS.z - BOUNDS.d} width={BOUNDS.w * 3} height={BOUNDS.d * 3} fill="url(#map-paper)" />
        {ROAD && <Road points={ROAD} />}

        {ATLAS.map((w) => (
          <g key={w.id} transform={`translate(${w.offset.x} ${w.offset.z})`}>
            <Island w={w}>
              {(b) => (
                <Branch
                  key={b.place}
                  branch={b}
                  open={open(b.place)}
                  mySeat={here && here.place === b.place ? (here.mySeat ?? null) : null}
                  onHover={(on) => setHovered(on ? b.place : null)}
                  onPin={() => setPinned((p) => (p === b.place ? null : b.place))}
                />
              )}
            </Island>
          </g>
        ))}

        {/* 이름표는 맨 위 (건물·나무에 가려지지 않게) */}
        {ATLAS.map((w) => (
          <g key={w.id} transform={`translate(${w.offset.x} ${w.offset.z})`} style={{ pointerEvents: 'none' }}>
            <WorldTitle w={w} count={counts.get(w.layout.lobby.place) ?? 0} scale={ls} compact={compact} />
            {w.layout.branches.map((b) => (
              <BranchLabel key={b.place} branch={b} counts={counts} scale={ls} compact={compact} />
            ))}
          </g>
        ))}
        {ROAD && !compact && (
          <Pill
            x={(ROAD[0].x + ROAD[1].x) / 2}
            z={ROAD[0].z - 2.2}
            scale={ls}
            bg="rgba(60,48,32,.82)"
            lines={[{ text: `${ATLAS[1].layout.lobby.name} ↔ ${ATLAS[0].layout.lobby.name}`, size: 0.9 }]}
          />
        )}

        {/* 내 위치: 노란 화살표 + 퍼지는 원 */}
        {where && (
          <g ref={arrow} style={{ pointerEvents: 'none' }}>
            <circle r="1.2" fill="none" stroke="#facc15" strokeWidth="0.25">
              <animate attributeName="r" values="1;2.4" dur="1.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.9;0" dur="1.4s" repeatCount="indefinite" />
            </circle>
            <polygon points={arrowPoints(ARROW * 1.3)} fill="#111" transform={`translate(0 ${-ARROW * 0.05})`} />
            <polygon points={arrowPoints(ARROW)} fill="#facc15" />
          </g>
        )}
        <Compass view={view} />
      </svg>
      <p style={styles.hint}>
        {where ? '노란 화살표가 지금 나예요. ' : '지금 있는 곳은 지도에 없어요. '}
        휠·끌기로 확대·이동 · 건물에 마우스를 올리면 안이 보여요 · {keyLabel(keys.map)} 또는 Esc 로 닫기
      </p>
    </div>
  )
}

// 화면 좌표 → 지도 좌표
function toSvg(el: SVGSVGElement, clientX: number, clientY: number): Point {
  const m = el.getScreenCTM()
  if (!m) return { x: 0, z: 0 }
  const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse())
  return { x: p.x, z: p.y }
}

// 끝이 +Z(지도 아래)를 향하는 화살표. 회전으로 바라보는 쪽을 맞춥니다.
function arrowPoints(l: number) {
  return [[0, l * 0.6], [l * 0.4, -l * 0.4], [0, -l * 0.15], [-l * 0.4, -l * 0.4]].map(([x, z]) => `${x},${z}`).join(' ')
}

const rectProps = (r: Rect) => ({ x: r.x - r.w / 2, y: r.z - r.d / 2, width: r.w, height: r.d })

// ── 무늬 ────────────────────────────────────────────────────
function Defs() {
  return (
    <defs>
      {/* 바탕 종이: 8m 격자 */}
      <pattern id="map-paper" width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" fill={C.paper} />
        <path d="M0 0H8M0 0V8" stroke={C.paperLine} strokeWidth="0.12" />
      </pattern>
      {/* 풀밭: 4m 마다 조금씩 다른 풀 */}
      <pattern id="map-grass" width="4" height="4" patternUnits="userSpaceOnUse">
        <rect width="4" height="4" fill="#86bf5e" />
        <path d="M0.4 0.9l0.15-0.35M0.7 0.95l0.1-0.3M2.6 2.7l0.15-0.35M2.9 2.75l0.1-0.3M1.6 3.5l0.12-0.3M3.4 0.6l0.12-0.3" stroke="#74ab4e" strokeWidth="0.09" strokeLinecap="round" />
        <circle cx="1.8" cy="1.4" r="0.1" fill="#9dd171" />
        <circle cx="3.3" cy="3.4" r="0.08" fill="#9dd171" />
        <circle cx="0.6" cy="2.6" r="0.08" fill="#7bb453" />
      </pattern>
      {/* 돌바닥: 둥근 돌 */}
      <pattern id="map-cobble" width="1.2" height="1.2" patternUnits="userSpaceOnUse">
        <rect width="1.2" height="1.2" fill="#c4b392" />
        <rect x="0.05" y="0.05" width="0.5" height="0.5" rx="0.16" fill="#d9caa9" />
        <rect x="0.65" y="0.05" width="0.5" height="0.5" rx="0.16" fill="#d3c3a0" />
        <rect x="0.35" y="0.65" width="0.5" height="0.5" rx="0.16" fill="#dccdae" />
        <rect x="-0.25" y="0.65" width="0.5" height="0.5" rx="0.16" fill="#cfbf9c" />
        <rect x="0.95" y="0.65" width="0.5" height="0.5" rx="0.16" fill="#cfbf9c" />
      </pattern>
      {/* 지붕 기와 줄 */}
      <pattern id="map-shingle" width="1" height="0.7" patternUnits="userSpaceOnUse">
        <path d="M0 0.68H1" stroke="rgba(0,0,0,.18)" strokeWidth="0.08" />
        <path d="M0.5 0V0.68" stroke="rgba(0,0,0,.08)" strokeWidth="0.05" />
      </pattern>
      {/* 루프탑 원목 데크 */}
      <pattern id="map-deck" width="1.6" height="0.32" patternUnits="userSpaceOnUse">
        <rect width="1.6" height="0.32" fill={C.deck} />
        <path d="M0 0.3H1.6M1.1 0V0.3" stroke="#6f5338" strokeWidth="0.04" />
      </pattern>
      {/* 축구장 잔디 줄무늬 */}
      <pattern id="map-pitch" width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="6" height="3" fill={C.pitch[0]} />
        <rect y="3" width="6" height="3" fill={C.pitch[1]} />
      </pattern>
      <radialGradient id="map-water">
        <stop offset="0" stopColor={C.water} />
        <stop offset="1" stopColor={C.waterDeep} />
      </radialGradient>
    </defs>
  )
}

// ── 월드 한 곳 ──────────────────────────────────────────────

// 바닥·길·화단·분수·운동장 위에, 나무와 건물을 남쪽(아래)일수록 나중에 그려 앞에 오게 합니다.
function Island({ w, children }: { w: AtlasWorld; children: (b: MapBranch) => ReactNode }) {
  const raw = w.raw
  const size = raw.size
  const spin = `rotate(${(-w.turn * 180) / Math.PI})` // 바닥을 돌리는 SVG 변환 (SVG 는 시계 방향이 + 라 부호 반대)
  const gravel = useMemo(() => gravelStrips(raw, w.placed.map((b) => b.rect)), [raw, w.placed])
  const flowers = useMemo(() => flowerBeds(raw, w.placed), [raw, w.placed])
  const bulbs = useMemo(() => stringBulbs(raw.strings ?? []), [raw])
  // 남쪽일수록 앞: 건물은 바닥 앞 끝, 나무는 줄기 자리
  const standing = [
    ...w.layout.branches.map((b) => ({ z: b.rect.z + b.rect.d / 2, el: children(b) })),
    ...w.layout.trees.map((t, i) => ({ z: t.z, el: <Tree key={`t${i}`} x={t.x} z={t.z} i={i} /> })),
  ].sort((a, b) => a.z - b.z)
  return (
    <g>
      <g transform={spin}>
      {/* 울타리 생울타리와 풀밭 */}
      <rect x={-size.w / 2 - 0.6} y={-size.d / 2 - 0.6} width={size.w + 1.2} height={size.d + 1.2} rx={2.4} fill={C.hedge} />
      <rect x={-size.w / 2} y={-size.d / 2} width={size.w} height={size.d} rx={1.8} fill="url(#map-grass)" />

      {raw.ground !== 'lawn' && (
        <>
          {gravel.map((g, i) => (
            <rect key={i} {...rectProps(g)} fill={C.gravel} />
          ))}
          {raw.paths.map((p, i) => (
            <rect key={i} {...rectProps(p)} fill="url(#map-cobble)" />
          ))}
          <rect {...rectProps({ x: 0, z: 0, ...raw.plaza })} fill="url(#map-cobble)" stroke={C.stoneEdge} strokeWidth={0.25} />
        </>
      )}
      {raw.walks?.map((wk, i) => {
        const d = wk.points.map(([x, z], k) => `${k ? 'L' : 'M'}${x} ${z}`).join('')
        return (
          <g key={i} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d={d} stroke={C.pathEdge} strokeWidth={wk.w + 0.35} />
            <path d={d} stroke={C.path} strokeWidth={wk.w} />
          </g>
        )
      })}
      {raw.pitch && <Pitch p={raw.pitch} />}
      {raw.courtyard && <Courtyard c={raw.courtyard} />}
      {raw.rests?.map((r, i) =>
        r.kind === 'mat' ? (
          <rect key={i} x={r.x - 0.8} y={r.z - 0.55} width={1.6} height={1.1} rx={0.15} fill={i % 2 ? '#e9c46a' : '#e76f51'} opacity={0.9} transform={`rotate(${(-r.rot * 180) / Math.PI} ${r.x} ${r.z})`} />
        ) : (
          <circle key={i} cx={r.x} cy={r.z} r={0.45} fill="#6c8ebf" />
        ),
      )}
      {flowers.map((f, i) => (
        <circle key={i} cx={f.x} cy={f.z} r={(f.kind === 'bush' || f.kind === 'fern' ? 0.32 : 0.2) * f.s} fill={FLOWER[f.kind]} />
      ))}
      {raw.fountain && <Fountain f={raw.fountain} />}
      {raw.benches.map((b, i) => {
        const side = b.facing === 'east' || b.facing === 'west'
        return <rect key={i} {...rectProps({ x: b.x, z: b.z, w: side ? BENCH.d : BENCH.w, d: side ? BENCH.w : BENCH.d })} rx={0.1} fill={C.bench} stroke="#5e3b22" strokeWidth={0.08} />
      })}
      {raw.board && <rect {...rectProps({ x: raw.board.x, z: raw.board.z, w: 3.4, d: 0.5 })} fill="#4a3424" stroke="#c9a24a" strokeWidth={0.12} />}
      {(raw.gates ?? []).map((g, i) => (
        <Gate key={i} x={g.x} z={g.z} sideways={g.facing === 'east' || g.facing === 'west'} w={g.w} />
      ))}
      </g>

      {standing.map((s) => s.el)}

      <g transform={spin}>
      {/* 가로등 불빛과 전구줄 (나무·건물 위로 살짝) */}
      {(raw.strings ?? []).map((s, i) => (
        <path key={i} d={`M${s.from.x} ${s.from.z}L${s.to.x} ${s.to.z}`} stroke="#3a3f47" strokeWidth={0.06} />
      ))}
      {bulbs.map((b, i) => (
        <circle key={i} cx={b.x} cy={b.z} r={0.12} fill={C.bulb} />
      ))}
      {raw.lamps.map((l, i) => (
        <g key={i}>
          <circle cx={l.x} cy={l.z} r={0.5} fill={C.glow} />
          <circle cx={l.x} cy={l.z} r={0.2} fill={C.lamp} />
        </g>
      ))}
      </g>
      {w.turn !== 0 && <WorldNorth w={w} />}
    </g>
  )
}

// 돌려 놓은 월드의 북쪽: 왼쪽 위 모서리 안쪽에 작은 화살표 (그 월드 안에서 보는 위쪽 = 3D 위에서 보기의 위쪽)
function WorldNorth({ w }: { w: AtlasWorld }) {
  const r = turnRect({ x: 0, z: 0, w: w.raw.size.w, d: w.raw.size.d }, w.turn)
  const deg = (-w.turn * 180) / Math.PI
  const tip = turnPoint({ x: 0, z: -2.7 }, w.turn)
  return (
    <g transform={`translate(${-r.w / 2 + 3.6} ${-r.d / 2 + 3.6})`} style={{ pointerEvents: 'none' }}>
      <circle r={2.1} fill="rgba(255,255,255,.85)" stroke="#5d4a3a" strokeWidth={0.12} />
      <g transform={`rotate(${deg})`}>
        <polygon points="0,-1.6 0.5,0 0,-0.25 -0.5,0" fill="#b91c1c" />
        <polygon points="0,1.6 0.5,0 0,0.25 -0.5,0" fill="#5d4a3a" />
      </g>
      {/* N 글자는 똑바로, 화살표 끝 바깥에 */}
      <text x={tip.x} y={tip.z + 0.35} fontSize={0.9} textAnchor="middle" fontWeight={700} fill="#5d4a3a">
        N
      </text>
    </g>
  )
}

function Tree({ x, z, i }: { x: number; z: number; i: number }) {
  const r = 0.8 + ((i * 37) % 10) / 22 // 나무마다 조금씩 다른 크기
  const dark = i % 3 === 0
  return (
    <g transform={`translate(${x} ${z})`}>
      <ellipse cx={0.35} cy={0.45} rx={r * 1.05} ry={r * 0.85} fill="rgba(30,50,20,.22)" />
      <circle r={r} fill={dark ? '#2f6f37' : '#38813f'} />
      <circle cx={-r * 0.3} cy={-r * 0.3} r={r * 0.55} fill={dark ? '#3f8a45' : '#4c9a4f'} />
      <circle cx={r * 0.35} cy={-r * 0.05} r={r * 0.3} fill={dark ? '#3a7f40' : '#459349'} />
    </g>
  )
}

function Fountain({ f }: { f: { x: number; z: number; r: number } }) {
  return (
    <g>
      <circle cx={f.x + 0.3} cy={f.z + 0.4} r={f.r + 0.2} fill="rgba(0,0,0,.15)" />
      <circle cx={f.x} cy={f.z} r={f.r} fill="#e6dfd2" stroke="#b9ad97" strokeWidth={0.2} />
      <circle cx={f.x} cy={f.z} r={f.r * 0.82} fill="url(#map-water)" />
      <circle cx={f.x} cy={f.z} r={f.r * 0.3} fill="#e6dfd2" />
      <circle cx={f.x} cy={f.z} r={f.r * 0.14} fill="#d9f1fb" />
    </g>
  )
}

function Pitch({ p }: { p: NonNullable<PlazaLayout['pitch']> }) {
  const line = { fill: 'none', stroke: '#f4f7f0', strokeWidth: 0.18 }
  return (
    <g>
      <rect {...rectProps({ x: p.x, z: p.z, w: p.w, d: p.d })} fill="url(#map-pitch)" />
      <rect {...rectProps({ x: p.x, z: p.z, w: p.w - 1, d: p.d - 1 })} {...line} />
      <path d={`M${p.x - p.w / 2 + 0.5} ${p.z}H${p.x + p.w / 2 - 0.5}`} {...line} />
      <circle cx={p.x} cy={p.z} r={2} {...line} />
      {[-1, 1].map((k) => (
        <g key={k}>
          <rect {...rectProps({ x: p.x, z: p.z + k * (p.d / 2 - 2), w: p.goal + 3, d: 3 })} {...line} />
          <rect {...rectProps({ x: p.x, z: p.z + k * (p.d / 2 - 0.2), w: p.goal, d: 0.5 })} fill="#f4f7f0" />
        </g>
      ))}
    </g>
  )
}

function Courtyard({ c }: { c: NonNullable<PlazaLayout['courtyard']> }) {
  return (
    <g>
      <circle cx={c.x} cy={c.z} r={c.r + 1.4} fill="#d8cbb0" />
      <circle cx={c.x} cy={c.z} r={c.r} fill="#a0703f" stroke="#7a5230" strokeWidth={0.2} />
      <circle cx={c.x} cy={c.z} r={c.r * 0.75} fill="#3b7f3e" />
      <circle cx={c.x - 0.5} cy={c.z - 0.5} r={c.r * 0.4} fill="#4f9a50" />
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <circle key={k} cx={c.x + Math.cos(k) * c.r * 0.6} cy={c.z + Math.sin(k) * c.r * 0.6} r={0.16} fill={C.bulb} />
      ))}
      {c.bags.map((b, i) => (
        <circle key={i} cx={b.x} cy={b.z} r={0.42} fill={['#d97757', '#6c8ebf', '#e9c46a', '#8fb996'][i % 4]} />
      ))}
    </g>
  )
}

// 정문: 벽돌 기둥 둘과 문 위 아치
function Gate({ x, z, w, sideways }: { x: number; z: number; w: number; sideways: boolean }) {
  const half = w / 2 + 0.6
  const posts = sideways ? [{ x, z: z - half }, { x, z: z + half }] : [{ x: x - half, z }, { x: x + half, z }]
  return (
    <g>
      <path d={`M${posts[0].x} ${posts[0].z}L${posts[1].x} ${posts[1].z}`} stroke="#3a3f47" strokeWidth={0.35} strokeDasharray="0.4 0.3" />
      {posts.map((p, i) => (
        <rect key={i} {...rectProps({ x: p.x, z: p.z, w: 1.2, d: 1.2 })} fill="#9b4a35" stroke="#5e2a1d" strokeWidth={0.12} />
      ))}
    </g>
  )
}

// 두 월드를 잇는 길
function Road({ points }: { points: Point[] }) {
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.z}`).join('')
  return (
    <g fill="none" strokeLinejoin="round" strokeLinecap="round">
      <path d={d} stroke={C.pathEdge} strokeWidth={4.4} />
      <path d={d} stroke={C.path} strokeWidth={3.8} />
      <path d={d} stroke="#fffaf0" strokeWidth={0.18} strokeDasharray="1 0.9" />
    </g>
  )
}

// ── 건물 ────────────────────────────────────────────────────

type BranchProps = { branch: MapBranch; open: boolean; mySeat: number | null; onHover: (on: boolean) => void; onPin: () => void }

// 비스듬히 위에서 본 건물: 바닥 그림자, 앞(남쪽)벽(층수만큼 높게, 층마다 창), 그만큼 올라간 지붕.
// 열면 지붕·벽이 투명해지고 바닥 자리에 1층 안(책상·의자·키오스크·커피 바)이 보입니다.
function Branch({ branch, open, mySeat, onHover, onPin }: BranchProps) {
  const { layout } = branch
  const r = branch.rect
  const stories = 1 + branch.floors.filter((f) => !f.roof).length
  const H = storyHeight(stories)
  const deck = branch.floors.some((f) => f.roof)
  const box = (bx: Box) => rectProps(boxToMap(branch, bx))
  const x0 = r.x - r.w / 2
  const front = r.z + r.d / 2
  const top = r.z - r.d / 2 - H // 올라간 지붕 위 끝
  const cover: CSSProperties = { opacity: open ? 0.1 : 1, transition: 'opacity .25s' }
  const doors = [layout.door, layout.meetingDoor].filter((d): d is Box => !!d).map((d) => boxToMap(branch, d))
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
      <rect x={x0 + 0.8} y={r.z - r.d / 2 + 0.3} width={r.w} height={r.d + 0.5} fill="rgba(30,40,20,.25)" />
      {/* 1층 안 (열었을 때 보임) */}
      <rect {...rectProps(r)} fill={C.floor} stroke="#5d4a3a" strokeWidth={0.3} />
      {layout.seats.map((s) => (
        <rect key={s.no} {...box({ x: s.x, z: s.z, ...SEAT })} fill={C.desk} />
      ))}
      {spotsOf(layout).map((c) => (
        <rect key={c.no} {...box({ x: c.x, z: c.z, w: CHAIR.w, d: CHAIR.d })} fill={c.no === mySeat ? MY_SEAT_COLOR : C.chair} />
      ))}
      {layout.kiosk && <rect {...box({ ...layout.kiosk, ...KIOSK })} fill="#2b6cb0" />}
      {layout.bar && <rect {...box(layout.bar)} fill="#7a4e2d" />}

      <g style={cover}>
        {/* 앞벽: 층마다 창 줄 */}
        <rect x={x0} y={front - H} width={r.w} height={H} fill={branch.wall} stroke="rgba(0,0,0,.35)" strokeWidth={0.15} />
        {Array.from({ length: stories }, (_, k) => {
          const y = front - H + k * (H / stories)
          const n = Math.max(2, Math.floor(r.w / 1.8))
          return (
            <g key={k}>
              {k > 0 && <path d={`M${x0} ${y}H${x0 + r.w}`} stroke="rgba(0,0,0,.25)" strokeWidth={0.1} />}
              {Array.from({ length: n }, (_, j) => (
                <rect key={j} x={x0 + ((j + 0.5) * r.w) / n - 0.35} y={y + H / stories / 2 - 0.3} width={0.7} height={0.6} rx={0.08} fill="#fff4d6" opacity={0.85} />
              ))}
            </g>
          )
        })}
        {/* 지붕 */}
        <rect x={x0} y={top} width={r.w} height={r.d} fill={branch.roof} />
        <rect x={x0} y={top} width={r.w} height={r.d} fill="url(#map-shingle)" />
        <path d={`M${x0 + 0.1} ${top + r.d - 0.1}V${top + 0.1}H${x0 + r.w - 0.1}`} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth={0.18} />
        <rect x={x0} y={top} width={r.w} height={r.d} fill="none" stroke="rgba(0,0,0,.4)" strokeWidth={0.2} />
        {deck && <RoofDeck x={x0} y={top} w={r.w} d={r.d} />}
      </g>
      {/* 문: 앞벽(남쪽)에 있으면 벽 아래, 아니면 올라간 지붕 가장자리에 (들어가는 쪽 표시) */}
      {doors.map((d, i) => {
        const south = d.z > front - 0.6
        return south ? (
          <rect key={i} x={d.x - Math.max(d.w, 1.2) / 2} y={front - 1.0} width={Math.max(d.w, 1.2)} height={1.0} rx={0.1} fill={C.door} stroke="#1f6b35" strokeWidth={0.08} />
        ) : (
          <rect key={i} {...rectProps({ ...d, z: d.z - H, w: Math.max(d.w, 0.5), d: Math.max(d.d, 0.5) })} rx={0.1} fill={C.door} />
        )
      })}
    </g>
  )
}

// 지붕 위 루프탑 (이끼 루프탑): 원목 데크, 밝은 난간, 전구줄, 화분 나무
function RoofDeck({ x, y, w, d }: { x: number; y: number; w: number; d: number }) {
  const i = 0.45
  return (
    <g>
      <rect x={x + i} y={y + i} width={w - i * 2} height={d - i * 2} fill="url(#map-deck)" stroke="#e6e1d6" strokeWidth={0.35} />
      {[0.25, 0.5, 0.75].map((t) => (
        <g key={t}>
          <path d={`M${x + i} ${y + i + (d - i * 2) * t}L${x + w - i} ${y + i + (d - i * 2) * (1 - t)}`} stroke="#2d2d2d" strokeWidth={0.05} />
          {[0.2, 0.4, 0.6, 0.8].map((s) => (
            <circle key={s} cx={x + i + (w - i * 2) * s} cy={y + i + (d - i * 2) * (t + (1 - 2 * t) * s)} r={0.13} fill={C.bulb} />
          ))}
        </g>
      ))}
      <circle cx={x + w * 0.7} cy={y + d * 0.28} r={0.9} fill="#3f8a45" />
    </g>
  )
}

// ── 이름표 ──────────────────────────────────────────────────

type Line = { text: string; size: number; bold?: boolean; color?: string }
const countLine = (n: number, prefix = ''): Line => (n > 0 ? { text: `● ${prefix}${n}명`, size: 0.85, color: '#86efac' } : { text: `${prefix}비어 있음`, size: 0.85, color: '#cbd5e1' })

// 건물 이름표: 이름, 1층 인원, 위층·루프탑 인원(한 줄씩), 회의 중 인원. 지붕 위에 띄움
// compact: 멀리 축소했을 때 이름만
function BranchLabel({ branch, counts, scale, compact }: { branch: MapBranch; counts: Map<string, number>; scale: number; compact: boolean }) {
  const stories = 1 + branch.floors.filter((f) => !f.roof).length
  const top = branch.rect.z - branch.rect.d / 2 - storyHeight(stories)
  const meeting = [branch.meeting, ...branch.floors.map((f) => f.meeting)].reduce((n, m) => n + (m ? (counts.get(m.place) ?? 0) : 0), 0)
  const n = (place: string) => counts.get(place) ?? 0
  const lines: Line[] = [
    { text: branch.name, size: 1.25, bold: true },
    countLine(n(branch.place)),
    ...branch.floors.map((f) => {
      const c = n(f.place)
      // 층 이름에 이미 "2F"·"루프탑"이 들어 있으면 앞에 또 붙이지 않음
      const tag = f.roof ? '' : f.name.includes(`${f.level}F`) ? '' : `${f.level}F `
      return { text: `${tag}${f.name} · ${c > 0 ? `${c}명` : '비어 있음'}`, size: 0.75, color: c > 0 ? '#86efac' : '#cbd5e1' }
    }),
    ...(meeting > 0 ? [{ text: `회의 중 ${meeting}명`, size: 0.75, color: '#fcd34d' }] : []),
  ]
  return <Pill x={branch.rect.x} z={top + branch.rect.d / 2} scale={scale} lines={compact ? lines.slice(0, 1) : lines} middle />
}

// 월드 이름표: 섬 왼쪽 위 모서리 바깥 (건물 이름표와 겹치지 않게). 아래 줄은 건물 밖(거리·캠퍼스)에 있는 사람 수
function WorldTitle({ w, count, scale, compact }: { w: AtlasWorld; count: number; scale: number; compact: boolean }) {
  const s = scale * 1.15
  const lines: Line[] = [{ text: w.layout.lobby.name, size: 1.5, bold: true }, count > 0 ? { text: `● ${count}명 돌아다니는 중`, size: 0.85, color: '#bbf7d0' } : { text: '돌아다니는 사람 없음', size: 0.85, color: '#f1e3d3' }]
  if (compact) lines.pop()
  const width = Math.max(...lines.map((l) => textWidth(l.text, l.size * s))) + 0.9 * s
  const r = rectOf(w)
  return <Pill x={-r.w / 2 + width / 2} z={-r.d / 2 - 1.2} scale={s} bg={w.ribbon} lines={lines} />
}

// 알약 모양 이름표. (x, z) 가 아래 가운데(꼬리 끝). middle 이면 (x, z) 가 한가운데이고 꼬리가 없음. scale 은 지도 확대에 따른 크기 배율
function Pill({ x, z: at, lines, scale, bg = 'rgba(24,28,36,.82)', middle = false }: { x: number; z: number; lines: Line[]; scale: number; bg?: string; middle?: boolean }) {
  const pad = 0.45 * scale
  const gap = 0.25 * scale
  const sizes = lines.map((l) => l.size * scale)
  const w = Math.max(...lines.map((l, i) => textWidth(l.text, sizes[i]))) + pad * 2
  const h = sizes.reduce((a, s) => a + s, 0) + gap * (lines.length - 1) + pad * 2
  const z = middle ? at + h / 2 : at // 이름표 아래 끝
  // 줄마다 글자 아래 끝 높이: 위 줄들 크기·간격을 더해 나감
  const baselines = sizes.map((s, i) => z - h + pad + sizes.slice(0, i + 1).reduce((a, v) => a + v, 0) + gap * i - s * 0.15)
  return (
    <g fontFamily="system-ui, sans-serif" textAnchor="middle">
      <rect x={x - w / 2} y={z - h} width={w} height={h} rx={Math.min(h / 2, 1.1 * scale)} fill={bg} />
      {!middle && <path d={`M${x - 0.5 * scale} ${z}L${x} ${z + 0.6 * scale}L${x + 0.5 * scale} ${z}Z`} fill={bg} />}
      {lines.map((l, i) => (
        <text key={i} x={x} y={baselines[i]} fontSize={sizes[i]} fontWeight={l.bold ? 700 : 500} fill={l.color ?? '#fff'}>
          {l.text}
        </text>
      ))}
    </g>
  )
}

// 나침반 (지도 오른쪽 위에 늘 같은 크기로)
function Compass({ view }: { view: View }) {
  const s = view.w / 40
  const x = view.x + view.w - s * 2.2
  const z = view.z + s * 2.4
  return (
    <g transform={`translate(${x} ${z}) scale(${s})`} style={{ pointerEvents: 'none' }}>
      <circle r={1.5} fill="rgba(255,255,255,.85)" stroke="#5d4a3a" strokeWidth={0.08} />
      <polygon points="0,-1.2 0.35,0 0,-0.15 -0.35,0" fill="#b91c1c" />
      <polygon points="0,1.2 0.35,0 0,0.15 -0.35,0" fill="#5d4a3a" />
      <text y={-1.75} fontSize={0.8} textAnchor="middle" fontWeight={700} fill="#5d4a3a">
        N
      </text>
    </g>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 8 },
  bar: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  button: { padding: '4px 10px', borderRadius: 6, border: '1px solid #4b5563', background: 'transparent', color: '#fff', cursor: 'pointer', font: 'inherit', fontSize: 13 },
  svg: { width: '100%', maxHeight: 'calc(100vh - 210px)', borderRadius: 10, background: C.paper, display: 'block', touchAction: 'none', userSelect: 'none' },
  hint: { margin: 0, fontSize: 13, opacity: 0.75 },
}
