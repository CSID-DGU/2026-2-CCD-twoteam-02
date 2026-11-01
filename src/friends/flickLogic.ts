// 딱밤으로 깨우기 (#304). React·화면과 무관한 순수 로직입니다. (Node 로 검사)
//
// 같은 지점(또는 광장·캠퍼스 벤치)에서 빨간불(자리 이탈·졸음·다른 화면·휴대폰)인 채 앉아 있는 친구에게 다가가 조준하고
// 딱밤 키(기본 Q)를 누르면, 실시간 방으로 신호를 보냅니다(DB 에 저장하지 않음). 맞은 사람은 화면이 흔들리고 "딱!" 소리가 납니다.
//
//   canFlick    보내는 쪽: 지금 이 사람에게 딱밤을 보낼 수 있는지 (친구·앉아 있음·빨간불·받기 켬·가까움·대기 시간)
//   acceptFlick 받는 쪽: 온 신호를 받아들일지. 신호는 누구나 보낼 수 있으므로 받는 쪽이 다시 확인합니다
//               (보낸 사람이 친구인지, 내 둘레에 있는지, 내가 빨간불인지, 받기를 켰는지, 너무 잦지 않은지)
//   shakeOffset 맞은 화면이 흔들리는 정도 (시간에 따라 줄어듦)
import { lightOf } from '../space/status'
import type { PresenceStatus } from '../space/status'

// 보내려면 조준한 사람이 바로 옆(aimLogic 의 CLOSE_RANGE 1.5m 안, 조준 광선이 닿은 거리)이어야 함
// accept: 받는 쪽이 보는 거리(보낸 사람 위치가 0.25초마다 오므로 조금 넉넉히)
// cooldownMs: 같은 사람에게 다시 보내기까지, popMs: 맞은 사람 머리 위 "딱!" 말풍선, shakeMs·shakePx: 화면 흔들림 길이·세기, toastMs: 맞은 사람 안내 문구
export const FLICK = { accept: 2.5, cooldownMs: 30_000, popMs: 1000, shakeMs: 500, shakePx: 10, toastMs: 2500 }

export const isRedLight = (status: PresenceStatus) => lightOf(status) === 'red'

// close: 조준한 사람이 바로 옆인지 (aimLogic CLOSE_RANGE)
export type FlickTarget = { friend: boolean; seated: boolean; status: PresenceStatus; receiving: boolean; close: boolean }

// 보내는 쪽: 이 사람에게 지금 딱밤을 보낼 수 있는지. lastSentAt: 이 사람에게 마지막으로 보낸 시각(ms, 없으면 undefined)
export function canFlick(t: FlickTarget, now: number, lastSentAt?: number): boolean {
  if (!t.friend || !t.seated || !t.receiving || !isRedLight(t.status)) return false
  if (!t.close) return false
  return lastSentAt === undefined || now - lastSentAt >= FLICK.cooldownMs
}

// 보낼 수 있게 되기까지 남은 시간(초, 올림). 보낼 수 있으면 0
export function cooldownLeft(now: number, lastSentAt?: number): number {
  if (lastSentAt === undefined) return 0
  return Math.max(0, Math.ceil((FLICK.cooldownMs - (now - lastSentAt)) / 1000))
}

export type FlickArrival = { fromFriend: boolean; dist: number | null; myStatus: PresenceStatus; receiving: boolean }

// 받는 쪽: 나에게 온 딱밤을 받아들일지. dist 는 보낸 사람이 내 둘레 몇 m 에 있는지(위치를 모르면 null). lastAt: 이 사람에게 마지막으로 맞은 시각
export function acceptFlick(a: FlickArrival, now: number, lastAt?: number): boolean {
  if (!a.fromFriend || !a.receiving || !isRedLight(a.myStatus)) return false
  if (a.dist === null || a.dist > FLICK.accept) return false
  return lastAt === undefined || now - lastAt >= FLICK.cooldownMs
}

// 흔들림: 맞은 뒤 지난 시간(ms) → 화면을 옮길 px. 점점 줄어들다가 shakeMs 뒤 0
export function shakeOffset(elapsedMs: number): { x: number; y: number } {
  if (elapsedMs < 0 || elapsedMs >= FLICK.shakeMs) return { x: 0, y: 0 }
  const k = 1 - elapsedMs / FLICK.shakeMs
  const t = elapsedMs / 1000
  return { x: Math.round(Math.sin(t * 90) * FLICK.shakePx * k * 10) / 10, y: Math.round(Math.cos(t * 70) * FLICK.shakePx * 0.6 * k * 10) / 10 }
}
