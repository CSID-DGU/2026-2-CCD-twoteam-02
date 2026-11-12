// 광장의 캠빛 대학교 문 너머 풍경. 예전에는 가짜 건물과 원뿔 나무를 따로 그려 들어갔을 때의 캠퍼스와 달랐습니다.
// 이제 캠퍼스 부품과 campus.json 을 그대로 씁니다. 캠퍼스를 고치면 문 너머 모습도 같이 바뀝니다.
// 걸어갈 수는 없습니다(울타리 부딪힘 그대로). 문으로 들어가야 실제 캠퍼스로 넘어갑니다.
import { useMemo } from 'react'
import { CampusCourt } from './CampusCourt'
import { Walks } from './CampusField'
import { CampusHall, MainGate } from './CampusHall'
import { CampusProps } from './CampusProps'
import { CampusTrees } from './CampusTrees'
import { LanternCourtyard } from './LanternTree'
import { Lamps } from './WorldDecor'
import { CAMPUS_WORLD, computedOf } from './worldConfig'
import type { PlacedGate } from './worldLogic'
import { MAT as WMAT } from './worldMaterials'
import { TILE, tiledPlane } from './worldTextures'

// 잔디 범위(m): 문 기준 가로 폭과 안쪽 깊이. 본관 뒤 나무까지 덮습니다.
const LAWN = { width: 64, depth: 68 }
const WALK_BELOW = 0.01 // 문 너머 캠퍼스 길을 광장 길보다 이만큼 낮게 (겹친 곳 깜빡임 방지)

// limit: 옆 문 풍경과 겹치지 않는 가로 범위 (gateViewSpan). 잔디는 이 범위까지만 깝니다.
export function CampusGateView({ gate, limit = [-Infinity, Infinity] }: { gate: PlacedGate; limit?: [number, number] }) {
  const layout = CAMPUS_WORLD.layout
  // 캠퍼스 정문: 광장 문과 캠퍼스 문이 같은 자리에 겹치도록 캠퍼스 전체를 옮깁니다.
  const entrance = layout.gates?.find((g) => g.to === 'plaza')
  const halls = useMemo(() => computedOf(CAMPUS_WORLD).placed.filter((b) => b.spec.shape === 'hall' && b.spec.z < 0), [])
  const span = [Math.max(limit[0], -LAWN.width / 2), Math.min(limit[1], LAWN.width / 2)]
  // 옆 문 쪽 나무는 그리지 않음: 해변 문 너머에서 벚꽃·느티나무가 해변 야자수와 겹쳐 보였습니다
  const [limitLeft, limitRight] = limit
  const entranceX = entrance?.x ?? 0
  const trees = useMemo(() => layout.trees.filter((t) => t.x - entranceX >= limitLeft && t.x - entranceX <= limitRight), [layout.trees, entranceX, limitLeft, limitRight])
  if (!entrance) return null
  return (
    <group position={[gate.spec.x, 0, gate.spec.z]} rotation-y={gate.angle}>
      {/* 잔디 (월드 땅보다 살짝 아래라 겹쳐도 깜빡이지 않음) */}
      <mesh rotation-x={-Math.PI / 2} position={[(span[0] + span[1]) / 2, -0.02, -LAWN.depth / 2 - 1]} material={WMAT.grass} geometry={tiledPlane(span[1] - span[0], LAWN.depth, TILE.grass)} />
      <group position={[-entrance.x, 0, -entrance.z]}>
        {/* 캠퍼스 길은 광장 길(높이 0.02)과 같은 높이라, 문 앞에서 겹친 곳의 벽돌이 섞여 보였습니다.
            시작 부분이 둥글게 광장 쪽으로 나오므로 1cm 낮춰, 겹친 곳은 광장 길이 덮게 합니다 */}
        {layout.walks && (
          <group position-y={-WALK_BELOW}>
            <Walks walks={layout.walks} />
          </group>
        )}
        {layout.court && <CampusCourt court={layout.court} />}
        {layout.courtyard && <LanternCourtyard courtyard={layout.courtyard} />}
        <CampusTrees trees={trees} />
        <Lamps lamps={layout.lamps} />
        {layout.props && <CampusProps props={layout.props} />}
        {layout.mainGate && <MainGate gate={layout.mainGate} />}
        {halls.map((b) => (
          <CampusHall key={b.slug} b={b} open near={false} />
        ))}
      </group>
    </group>
  )
}
