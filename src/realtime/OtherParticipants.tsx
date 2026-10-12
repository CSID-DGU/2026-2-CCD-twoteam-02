// 같은 지점에 있는 다른 참여자들을 그립니다. Canvas 안에서 씁니다.
//
// 앉아 있는 사람은 좌석 좌표에 고정해 그리고(SeatedCharacter), 돌아다니는 사람은
// 실시간으로 오는 위치를 따라가게 그립니다(WalkingCharacter).
// 머리 위에는 닉네임과 상태 표시등을 같이 올립니다.
// 캐릭터를 누르면 onSelect 로 그 사람을 알립니다. (지점에서 프로필 창 열기)
import { useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { StatusMarker } from '../space/StatusMarker'
import { SeatedCharacter } from '../space/SeatedCharacter'
import type { Spot } from '../space/layout'
import { WalkingCharacter } from './WalkingCharacter'
import { NameTag } from './NameTag'
import type { Participant } from './participants'

// 누른 뒤 이만큼(px) 넘게 움직였으면 클릭이 아니라 화면 끌기(둘러보기)로 봅니다.
const CLICK_TOLERANCE = 5

export function OtherParticipants({
  others,
  spots,
  onSelect,
}: {
  others: Participant[]
  spots: Spot[]
  onSelect?: (userId: string) => void
}) {
  // 캐릭터에 마우스를 올리면 누를 수 있다는 걸 손가락 커서로 알립니다. 나가면 원래 커서로 돌립니다.
  // 참여자 목록이 0.1초마다 바뀌며 다시 그려져도 원래 커서를 잃지 않게 ref 에 둡니다.
  const savedCursor = useRef('')
  // 이벤트가 일어난 곳(지점 화면 캔버스)의 커서를 바꿉니다.
  const canvasOf = (e: ThreeEvent<PointerEvent>) => e.nativeEvent.target as HTMLElement
  const hoverIn = (e: ThreeEvent<PointerEvent>) => {
    savedCursor.current = canvasOf(e).style.cursor
    canvasOf(e).style.cursor = 'pointer'
  }
  const hoverOut = (e: ThreeEvent<PointerEvent>) => {
    canvasOf(e).style.cursor = savedCursor.current
  }

  return (
    <>
      {others.map((p) => {
        const spot = p.seat === null ? undefined : spots.find((s) => s.no === p.seat)
        // 앉아 있다고 알려 왔는데 그 좌석을 못 찾으면 서 있는 것으로 그립니다.
        const x = spot ? spot.x : p.x
        const z = spot ? spot.z : p.z
        return (
          <group
            key={p.userId}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              if (!onSelect || e.delta > CLICK_TOLERANCE) return
              e.stopPropagation() // 뒤에 겹친 다른 캐릭터까지 열리지 않게
              onSelect(p.userId)
            }}
            onPointerOver={onSelect ? hoverIn : undefined}
            onPointerOut={onSelect ? hoverOut : undefined}
          >
            {spot ? (
              <SeatedCharacter spot={spot} model={p.model} />
            ) : (
              <WalkingCharacter x={p.x} z={p.z} model={p.model} />
            )}
            <NameTag x={x} z={z} name={p.nickname} />
            <StatusMarker x={x} z={z} status={p.status} />
          </group>
        )
      })}
    </>
  )
}
