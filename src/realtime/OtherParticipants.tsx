// 같은 지점에 있는 다른 참여자들을 그립니다. Canvas 안에서 씁니다.
//
// 이 파일은 "받은 목록을 그리기만" 합니다. 누가 보이고 안 보이는지는
// useParticipants 가 정합니다. 안 보이는 문제를 쫓을 때는 거기부터 보세요.
//
// 앉아 있는 사람은 좌석 좌표에 고정해 그리고(SeatedCharacter), 돌아다니는 사람은
// 실시간으로 오는 위치를 따라가게 그립니다(WalkingCharacter).
// 머리 위에는 닉네임과 상태 표시등을 같이 올립니다.
// 위에서 보는 시점에서 캐릭터를 누르면 onSelect, 1인칭에서 조준점이 캐릭터를 가리키면 onAim 으로 그 사람을 알립니다. (프로필 창 열기)
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Raycaster, Vector3 } from 'three'
import type { Object3D } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { StatusMarker } from '../space/StatusMarker'
import { SeatedCharacter } from '../space/SeatedCharacter'
import type { Spot } from '../space/layout'
import { WalkingCharacter } from './WalkingCharacter'
import { NameTag } from './NameTag'
import type { Participant } from './participants'
import { AIM_HZ, BODY, pickAimPerson } from '../space/aimLogic'
import type { AimPerson, AimTarget } from '../space/aimLogic'

// 누른 뒤 이만큼(px) 넘게 움직였으면 클릭이 아니라 화면 끌기(둘러보기)로 봅니다.
const CLICK_TOLERANCE = 5
const NEAR_IGNORE = 0.3 // 이보다 가까이 맞은 것은 가리는 물체로 치지 않음 (카메라 바로 앞)
const SURFACE_GAP = 0.05 // 사람 몸에 닿기 직전까지만 가리는 물체를 찾음 (발밑 바닥이 가렸다고 하지 않게)

// 조준 확인에 쓰는 계산용 물체 (매번 새로 만들지 않음. 한 프레임 안에서만 씀)
const probe = { caster: new Raycaster(), origin: new Vector3(), dir: new Vector3() }

// 부모까지 모두 보이는 물체인지 (숨은 물체에 가려졌다고 하지 않게)
const shown = (o: Object3D | null): boolean => !o || (o.visible && shown(o.parent))

export function OtherParticipants({
  others,
  spots,
  onSelect,
  showStatus = true,
  aimOn = false,
  onAim,
}: {
  others: Participant[]
  spots: Spot[]
  showStatus?: boolean // 상태 표시등. 로비에서는 모두 공부 전이라 끕니다. (#166)
  onSelect?: (userId: string) => void // 커서로 캐릭터를 눌렀을 때 (위에서 보는 시점)
  aimOn?: boolean // 조준점으로 사람 고르기를 켤지 (1인칭으로 서 있고 창이 없을 때)
  onAim?: (target: AimTarget | null) => void // 조준점이 가리키는 사람이 바뀔 때. 바뀌지 않는 함수를 넘깁니다.
}) {
  // 커서 클릭(onSelect): 위에서 보는 시점처럼 커서가 보일 때만 화면에서 넘겨 줍니다. 마우스를 올리면 손가락 커서로 알립니다.
  // 1인칭에서 마우스가 잠겨 있으면 클릭으로는 열지 않고, 조준점이 가리키는 사람을 onAim 으로 알립니다(E 로 프로필).
  // 시점을 돌리다 잘못 눌려 프로필이 열리지 않게 하려는 것입니다. (#354)
  const groups = useRef(new Map<string, Object3D>()) // 계정 번호 → 캐릭터 묶음
  const nextProbe = useRef(0) // 다음에 조준을 확인할 시각(초)
  // 조준을 끄거나 화면을 떠나면 조준 대상을 비웁니다.
  useEffect(() => {
    if (!aimOn || !onAim) return
    return () => onAim(null)
  }, [aimOn, onAim])
  useFrame(({ clock, camera, gl, scene }) => {
    if (!aimOn || !onAim) return
    if (clock.elapsedTime < nextProbe.current) return
    nextProbe.current = clock.elapsedTime + 1 / AIM_HZ
    if (document.pointerLockElement !== gl.domElement) return onAim(null)
    camera.getWorldPosition(probe.origin)
    camera.getWorldDirection(probe.dir)
    // 그려지는 위치: 앉은 사람은 자리, 걷는 사람은 보간된 캐릭터 위치(묶음의 첫 자식)
    const people: AimPerson[] = []
    for (const p of others) {
      const spot = p.seat === null ? undefined : spots.find((s) => s.no === p.seat)
      const body = groups.current.get(p.userId)?.children[0]
      const x = spot ? spot.x : (body?.position.x ?? p.x)
      const z = spot ? spot.z : (body?.position.z ?? p.z)
      people.push({ id: p.userId, name: p.nickname, x, z, y0: spot ? (spot.y ?? 0) : 0, height: spot ? BODY.seated : BODY.standing })
    }
    const hit = pickAimPerson(probe.origin, probe.dir, people)
    if (!hit) return onAim(null)
    // 사이에 벽·건물이 있으면 고르지 않습니다. 사람들과 숨은 내 캐릭터는 빼고 장면에 광선을 쏩니다.
    probe.caster.set(probe.origin, probe.dir)
    probe.caster.far = Math.max(0, hit.dist - SURFACE_GAP)
    const solid = scene.children.filter((o) => o.visible && !o.userData.userId)
    const blocked = probe.caster.intersectObjects(solid, true).some((h) => h.distance > NEAR_IGNORE && shown(h.object))
    onAim(blocked ? null : { kind: 'person', id: hit.person.id, name: hit.person.name })
  })

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
              if (document.pointerLockElement) return // 잠긴 동안은 클릭으로 열지 않습니다(조준점 + E).
              if (!onSelect || e.delta > CLICK_TOLERANCE) return
              e.stopPropagation() // 뒤에 겹친 다른 캐릭터까지 열리지 않게
              onSelect(p.userId)
            }}
            onPointerOver={onSelect ? hoverIn : undefined}
            onPointerOut={onSelect ? hoverOut : undefined}
          >
            {spot ? (
              <>
                <SeatedCharacter spot={spot} model={p.model} head={p.head} eyes={p.eyes} arms={p.arms} mouth={p.mouth} />
                <NameTag x={x} z={z} name={p.nickname} level={p.lv} />
                {showStatus && <StatusMarker x={x} z={z} status={p.status} />}
              </>
            ) : (
              // 돌아다니는 사람은 닉네임·표시등이 캐릭터를 따라 부드럽게 움직이도록 안에 넣습니다.
              <WalkingCharacter x={p.x} z={p.z} h={p.h} model={p.model} emote={p.emote} emoteSeq={p.emoteSeq} jump={p.jump}>
                <NameTag x={0} z={0} name={p.nickname} level={p.lv} />
                {showStatus && <StatusMarker x={0} z={0} status={p.status} />}
              </WalkingCharacter>
            )}
          </group>
        )
      })}
    </>
  )
}
