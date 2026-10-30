// 조준점이 가리키는 것 (#354). 광장·지점 화면이 하나씩 씁니다.
//
// 사람(OtherParticipants)과 별자리(Constellations)가 따로 확인해서 set('person' | 'sign', 대상)으로 알려 줍니다.
// 둘 다 있으면 사람이 먼저입니다(별자리는 사람에 가려지면 어차피 고르지 않음).
//   current  Player 가 E 를 누른 순간 읽는 값 (매 프레임 바뀌어도 다시 그리지 않음)
//   target   화면 아래 안내("닉네임 · E 프로필 보기")에 쓰는 값. 대상이 바뀔 때만 다시 그립니다.
import { useCallback, useRef, useState } from 'react'
import { sameTarget } from './aimLogic'
import type { AimTarget } from './aimLogic'

export type AimSlot = 'person' | 'sign'

export function useAim() {
  const slots = useRef<Record<AimSlot, AimTarget | null>>({ person: null, sign: null })
  const current = useRef<AimTarget | null>(null)
  const [target, setTarget] = useState<AimTarget | null>(null)

  const set = useCallback((slot: AimSlot, t: AimTarget | null) => {
    if (sameTarget(slots.current[slot], t)) return
    slots.current[slot] = t
    const next = slots.current.person ?? slots.current.sign
    if (sameTarget(current.current, next)) return
    current.current = next
    setTarget(next)
  }, [])

  return { current, target, set }
}
