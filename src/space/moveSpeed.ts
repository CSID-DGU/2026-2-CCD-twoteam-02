// 캐릭터 이동 속도 (#118)
//
// 내 캐릭터(Player)와 다른 참여자 캐릭터(WalkingCharacter)가 같은 값을 씁니다.
// 다른 참여자는 실제 이동 빠르기를 WALK_SPEED 와 비교해 걷기 동작을 빠르게 재생합니다(달리면 다리도 빨리).
//
// 너무 빠르게 하면 안 되는 이유: 다른 사람 화면에는 위치가 0.25초마다 가는데, 그사이 TELEPORT_GAP(walkLogic.ts)보다
// 멀리 가면 걸어가지 않고 순간이동으로 그립니다. RUN_SPEED 6.5면 0.25초에 약 1.6m라 여유가 있습니다.

export const WALK_SPEED = 4 // 초당 이동 거리(m). 처음 3에서 조금 올림
export const RUN_SPEED = 6.5 // Shift 를 누르고 있을 때
export const RUN_KEYS = ['ShiftLeft', 'ShiftRight']
