// 같은 지점에 있는 다른 참여자들을 그립니다. Canvas 안에서 씁니다.
//
// 앉아 있는 사람은 좌석 좌표에 고정해 그리고(SeatedCharacter), 돌아다니는 사람은
// 실시간으로 오는 위치를 따라가게 그립니다(WalkingCharacter).
// 머리 위에는 닉네임과 상태 표시등을 같이 올립니다.
import { StatusMarker } from '../space/StatusMarker'
import { SeatedCharacter } from '../space/SeatedCharacter'
import type { Spot } from '../space/layout'
import { WalkingCharacter } from './WalkingCharacter'
import { NameTag } from './NameTag'
import type { Participant } from './participants'

export function OtherParticipants({
  others,
  spots,
}: {
  others: Participant[]
  spots: Spot[]
}) {
  return (
    <>
      {others.map((p) => {
        const spot = p.seat === null ? undefined : spots.find((s) => s.no === p.seat)
        // 앉아 있다고 알려 왔는데 그 좌석을 못 찾으면 서 있는 것으로 그립니다.
        const x = spot ? spot.x : p.x
        const z = spot ? spot.z : p.z
        return (
          <group key={p.userId}>
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
