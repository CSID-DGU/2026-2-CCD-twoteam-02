// 같은 지점에 있는 다른 참여자들을 그립니다. Canvas 안에서 씁니다.
//
// 이 파일은 "받은 목록을 그리기만" 합니다. 누가 보이고 안 보이는지는
// useParticipants 가 정합니다. 안 보이는 문제를 쫓을 때는 거기부터 보세요.
//
// 앉아 있는 사람은 좌석 좌표에 고정해 그리고(SeatedCharacter), 돌아다니는 사람은
// 실시간으로 오는 위치를 따라가게 그립니다(WalkingCharacter).
// 머리 위에는 닉네임과 상태 표시등을 같이 올립니다.
// 캐릭터를 누르면 onSelect 로 그 사람을 알립니다. (지점에서 프로필 창 열기)
import { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Raycaster, Vector2 } from 'three'
import type { Object3D } from 'three'
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
  showStatus = true,
}: {
  others: Participant[]
  spots: Spot[]
  showStatus?: boolean // 상태 표시등. 로비에서는 모두 공부 전이라 끕니다. (#166)
  onSelect?: (userId: string) => void
}) {
  // 캐릭터에 마우스를 올리면 누를 수 있다는 걸 손가락 커서로 알립니다. 나가면 원래 커서로 돌립니다.
  // 1인칭에서 마우스가 잠겨 있으면(#73) 커서 위치가 아니라 화면 가운데(조준점)로 누른 캐릭터를 찾습니다.
  // R3F 의 onClick 은 마지막 커서 위치를 쓰므로 잠긴 동안에는 쓰지 않습니다.
  const get = useThree((s) => s.get)
  const groups = useRef(new Map<string, Object3D>()) // 계정 번호 → 캐릭터 묶음
  const ray = useMemo(() => ({ caster: new Raycaster(), center: new Vector2(0, 0) }), [])
  useEffect(() => {
    if (!onSelect) return
    const click = () => {
      const { camera, gl } = get()
      if (document.pointerLockElement !== gl.domElement) return
      ray.caster.setFromCamera(ray.center, camera)
      const hit = ray.caster.intersectObjects([...groups.current.values()], true)[0]
      // 맞은 물체에서 위로 올라가며 어느 참여자의 것인지 찾습니다.
      for (let o: Object3D | null = hit?.object ?? null; o; o = o.parent) {
        const id = o.userData.userId as string | undefined
        if (id) {
          onSelect(id)
          return
        }
      }
    }
    window.addEventListener('click', click)
    return () => window.removeEventListener('click', click)
  }, [get, onSelect, ray])

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
            userData={{ userId: p.userId }}
            ref={(o) => {
              if (o) groups.current.set(p.userId, o)
              else groups.current.delete(p.userId)
            }}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              if (document.pointerLockElement) return // 잠긴 동안은 위의 조준점 클릭이 처리합니다.
              if (!onSelect || e.delta > CLICK_TOLERANCE) return
              e.stopPropagation() // 뒤에 겹친 다른 캐릭터까지 열리지 않게
              onSelect(p.userId)
            }}
            onPointerOver={onSelect ? hoverIn : undefined}
            onPointerOut={onSelect ? hoverOut : undefined}
          >
            {spot ? (
              <>
                <SeatedCharacter spot={spot} model={p.model} head={p.head} eyes={p.eyes} arms={p.arms} />
                <NameTag x={x} z={z} name={p.nickname} />
                {showStatus && <StatusMarker x={x} z={z} status={p.status} />}
              </>
            ) : (
              // 돌아다니는 사람은 닉네임·표시등이 캐릭터를 따라 부드럽게 움직이도록 안에 넣습니다.
              <WalkingCharacter x={p.x} z={p.z} h={p.h} model={p.model} emote={p.emote} emoteSeq={p.emoteSeq}>
                <NameTag x={0} z={0} name={p.nickname} />
                {showStatus && <StatusMarker x={0} z={0} status={p.status} />}
              </WalkingCharacter>
            )}
          </group>
        )
      })}
    </>
  )
}
