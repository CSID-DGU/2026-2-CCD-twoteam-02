// 감정표현 (#162). 오버워치처럼 숫자키 1~8 또는 X 바퀴로 고르면 내 캐릭터가 잠깐 동작합니다.
//
// Kenney 캐릭터에 들어 있는 동작(끄덕·도리도리·발차기·쓰러지기)은 1초도 안 될 만큼 짧아서
// 몇 번 반복하거나 끝 자세를 잠깐 유지합니다. 손 흔들기·숙이기·기지개·화장실은 직접 만든 동작입니다.
// (Kenney 의 pick-up 은 숙였다 바로 일어나는 0.3초 동작이라 숙이기는 따로 만들었습니다)
//
// 직접 만드는 방법: 이 캐릭터는 머리·몸통·팔·다리가 각각 따로 도는 블록입니다(관절 = 각 블록의 붙은 곳).
// "몇 초에 어느 부위를 몇 도" 를 적어 three.js 키프레임 동작(AnimationClip)으로 만듭니다.
// 부위 이름은 GLB 안의 이름과 같아야 합니다: root, torso, head, arm-left, arm-right, leg-left, leg-right
//
// 각도 방향 (캐릭터는 +Z 를 봄, 왼쪽이 +X)
//   팔·다리 X축 회전: 음수면 앞으로 듦, 양수면 뒤로
//   왼팔 Z축 회전: 양수면 옆으로 벌림 / 오른팔 Z축: 음수면 옆으로 벌림 (약 ±2.9 이면 머리 위)
//   몸통·머리 X축 회전: 양수면 앞으로 숙임, 음수면 뒤로 젖힘
import { AnimationClip, Euler, LoopOnce, LoopRepeat, Quaternion, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three'
import type { AnimationAction } from 'three'

export type EmoteId = 'nod' | 'shake' | 'wave' | 'bend' | 'kick' | 'fall' | 'stretch' | 'toilet' | 'flick'

export type Emote = {
  id: EmoteId
  code: string // 바로 실행하는 숫자키 (KeyboardEvent.code)
  label: string
  icon: string // 바퀴에 보이는 그림
  clip: string // 재생할 동작 이름
  repeat?: number // 몇 번 반복할지 (짧은 기본 동작)
  hold?: number // 끝 자세를 유지할 시간(초). 쓰러지기·숙이기
}

// 바퀴에서는 위(12시)부터 시계 방향 순서로 놓입니다.
export const EMOTES: Emote[] = [
  { id: 'wave', code: 'Digit1', label: '손 흔들기', icon: '👋', clip: 'emote-wave' },
  { id: 'nod', code: 'Digit2', label: '끄덕끄덕', icon: '🙆', clip: 'emote-yes', repeat: 3 },
  { id: 'shake', code: 'Digit3', label: '도리도리', icon: '🙅', clip: 'emote-no', repeat: 3 },
  { id: 'bend', code: 'Digit4', label: '숙이기', icon: '🙇', clip: 'emote-bend' },
  { id: 'kick', code: 'Digit5', label: '발차기', icon: '🦵', clip: 'attack-kick-right', repeat: 2 },
  { id: 'fall', code: 'Digit6', label: '쓰러지기', icon: '😵', clip: 'die', hold: 2.2 },
  { id: 'stretch', code: 'Digit7', label: '기지개', icon: '🙆‍♂️', clip: 'emote-stretch' },
  { id: 'toilet', code: 'Digit8', label: '화장실', icon: '🚻', clip: 'emote-toilet' },
]

// 바퀴·숫자키에는 없고 다른 기능이 시키는 동작: 딱밤(#304, 친구 옆에서 Q). 다른 감정표현처럼 위치 메시지에 실려 주변 사람에게 보임
export const SPECIAL_EMOTES: Emote[] = [{ id: 'flick', code: '', label: '딱밤', icon: '👉', clip: 'emote-flick' }]

export const emoteById = (id: string | undefined) => EMOTES.find((e) => e.id === id) ?? SPECIAL_EMOTES.find((e) => e.id === id)

// ── 직접 만든 동작 ─────────────────────────────────────────────

type Pose = [number, number, number, number] // [시각(초), X, Y, Z 회전(라디안)]

const quat = (x: number, y: number, z: number) => new Quaternion().setFromEuler(new Euler(x, y, z)).toArray()

// 한 부위의 회전 키프레임
function turn(node: string, poses: Pose[]) {
  return new QuaternionKeyframeTrack(
    `${node}.quaternion`,
    poses.map((p) => p[0]),
    poses.flatMap((p) => quat(p[1], p[2], p[3])),
  )
}

// 👋 손 흔들기: 오른팔을 머리 위로 들고 좌우로 흔듭니다.
const wave = new AnimationClip('emote-wave', 2.0, [
  turn('arm-right', [
    [0, 0, 0, 0], [0.25, -0.2, 0, -2.6], [0.5, -0.2, 0, -2.95], [0.75, -0.2, 0, -2.35], [1.0, -0.2, 0, -2.95],
    [1.25, -0.2, 0, -2.35], [1.5, -0.2, 0, -2.95], [1.75, -0.2, 0, -2.6], [2.0, 0, 0, 0],
  ]),
  turn('head', [[0, 0, 0, 0], [0.4, 0, 0, -0.12], [1.6, 0, 0, -0.12], [2.0, 0, 0, 0]]),
])

// 🙇 숙이기: 몸을 앞으로 깊이 숙였다가 천천히 일어납니다. (꾸벅)
const bend = new AnimationClip('emote-bend', 1.8, [
  turn('torso', [[0, 0, 0, 0], [0.35, 0.75, 0, 0], [1.3, 0.75, 0, 0], [1.8, 0, 0, 0]]),
  turn('head', [[0, 0, 0, 0], [0.35, 0.25, 0, 0], [1.3, 0.25, 0, 0], [1.8, 0, 0, 0]]),
  turn('arm-left', [[0, 0, 0, 0], [0.35, -0.3, 0, 0], [1.3, -0.3, 0, 0], [1.8, 0, 0, 0]]),
  turn('arm-right', [[0, 0, 0, 0], [0.35, -0.3, 0, 0], [1.3, -0.3, 0, 0], [1.8, 0, 0, 0]]),
])

// 🙆 기지개: 두 팔을 머리 위로 쭉 뻗고 뒤로 젖혔다가 좌우로 늘입니다.
const stretch = new AnimationClip('emote-stretch', 2.6, [
  turn('arm-left', [[0, 0, 0, 0], [0.45, 0, 0, 2.9], [2.2, 0, 0, 2.9], [2.6, 0, 0, 0]]),
  turn('arm-right', [[0, 0, 0, 0], [0.45, 0, 0, -2.9], [2.2, 0, 0, -2.9], [2.6, 0, 0, 0]]),
  turn('torso', [
    [0, 0, 0, 0], [0.45, -0.18, 0, 0], [1.0, -0.12, 0, 0.16], [1.6, -0.12, 0, -0.16], [2.2, -0.15, 0, 0], [2.6, 0, 0, 0],
  ]),
  turn('head', [[0, 0, 0, 0], [0.45, -0.35, 0, 0], [2.2, -0.3, 0, 0], [2.6, 0, 0, 0]]),
])

// 🚻 화장실: 몸을 앞으로 숙이고 두 손을 모아 아래를 가린 채, 다리를 꼬고 동동거립니다. (화장실 표지판 자세)
// 다리를 번갈아 꼬며 동동거리는 순간들: [시각, 왼다리 Z, 오른다리 Z]
const shuffle: [number, number, number][] = [0.5, 0.8, 1.1, 1.4, 1.7, 2.0].map((t, i) => [t, i % 2 ? -0.2 : -0.08, i % 2 ? 0.06 : 0.18])
const toilet = new AnimationClip('emote-toilet', 2.4, [
  turn('torso', [[0, 0, 0, 0], [0.3, 0.28, 0, 0], [2.1, 0.28, 0, 0], [2.4, 0, 0, 0]]),
  turn('head', [[0, 0, 0, 0], [0.3, 0.15, 0, 0], [2.1, 0.15, 0, 0], [2.4, 0, 0, 0]]),
  turn('arm-left', [[0, 0, 0, 0], [0.3, -0.45, 0, -0.4], [2.1, -0.45, 0, -0.4], [2.4, 0, 0, 0]]),
  turn('arm-right', [[0, 0, 0, 0], [0.3, -0.45, 0, 0.4], [2.1, -0.45, 0, 0.4], [2.4, 0, 0, 0]]),
  turn('leg-left', [[0, 0, 0, 0], [0.3, 0, 0, -0.14], ...shuffle.map(([t, l]) => [t, 0, 0, l] as Pose), [2.4, 0, 0, 0]]),
  turn('leg-right', [[0, 0, 0, 0], [0.3, 0, 0, 0.12], ...shuffle.map(([t, , r]) => [t, 0, 0, r] as Pose), [2.4, 0, 0, 0]]),
  // 몸 전체를 살짝 위아래로 (동동)
  new VectorKeyframeTrack(
    'root.position',
    [0, 0.3, 0.65, 0.95, 1.25, 1.55, 1.85, 2.1, 2.4],
    [0, 0, 0, 0, -0.06, 0, 0, 0, 0, 0, -0.06, 0, 0, 0, 0, 0, -0.06, 0, 0, 0, 0, 0, -0.03, 0, 0, 0, 0],
  ),
])

// 👉 딱밤 (#304): 몸을 살짝 숙이며 오른팔을 앞으로 뻗고, 손끝을 튕기듯 짧게 들었다 내립니다.
const flick = new AnimationClip('emote-flick', 1.1, [
  turn('arm-right', [[0, 0, 0, 0], [0.3, -1.45, 0, -0.15], [0.45, -1.45, 0, -0.15], [0.52, -1.75, 0, -0.1], [0.6, -1.4, 0, -0.15], [0.85, -1.4, 0, -0.15], [1.1, 0, 0, 0]]),
  turn('torso', [[0, 0, 0, 0], [0.3, 0.18, 0, 0], [0.85, 0.18, 0, 0], [1.1, 0, 0, 0]]),
  turn('head', [[0, 0, 0, 0], [0.3, 0.1, 0, 0], [0.85, 0.1, 0, 0], [1.1, 0, 0, 0]]),
])

// 캐릭터의 기본 동작 목록에 더해 쓰는 직접 만든 동작들
export const EMOTE_CLIPS = [wave, bend, stretch, toilet, flick]

// 감정표현 한 번의 길이(초). 반복 횟수와 끝 자세 유지까지 포함합니다.
export function emoteSeconds(emote: Emote, clipSeconds: number): number {
  return clipSeconds * (emote.repeat ?? 1) + (emote.hold ?? 0)
}

// 감정표현 동작을 재생할 수 있게 설정합니다. (반복이면 그 횟수만큼, 아니면 한 번 하고 끝 자세 유지)
// 컴포넌트 안에서 동작 객체의 값을 직접 바꾸지 않도록 여기서 합니다.
export function prepareEmoteAction(action: AnimationAction, emote: Emote) {
  const times = emote.repeat ?? 1
  action.setLoop(times > 1 ? LoopRepeat : LoopOnce, times)
  action.clampWhenFinished = true
  action.setEffectiveTimeScale(1)
}

// ── 지금 감정표현 상태 (화면끼리 같이 쓰는 ref 에 담음) ────────────
// request: 고른 감정표현 (Player 가 다음 프레임에 받아 시작), playing: 지금 하는 것, until: 끝나는 시각(ms)
// seq: 시작할 때마다 1 올라감. 다른 참여자 화면이 "새로 시작했는지" 알아보는 데 씁니다.
// jump: 점프할 때마다 1 올라가는 번호(jumpLogic.ts). 감정표현과 같이 위치 메시지에 실어 보내므로 같은 상태에 둡니다.
// jumpAt: 마지막으로 뛴 시각(ms). 1인칭 카메라(WalkCamera)가 이 시각으로 눈높이를 같이 올립니다.
export type EmoteState = { request: EmoteId | null; playing: EmoteId | null; until: number; seq: number; jump: number; jumpAt: number }
export const newEmoteState = (): EmoteState => ({ request: null, playing: null, until: 0, seq: 0, jump: 0, jumpAt: -Infinity })

// 상태 바꾸기. (컴포넌트 안에서 ref 값을 직접 고치지 않도록 여기서 합니다)
export function clearEmoteRequest(s: EmoteState) {
  s.request = null
}
export function beginEmote(s: EmoteState, id: EmoteId, seconds: number) {
  s.playing = id
  s.until = performance.now() + seconds * 1000
  s.seq += 1
}
export function endEmote(s: EmoteState) {
  s.playing = null
}
export function requestEmote(s: EmoteState, id: EmoteId) {
  s.request = id
}
export function startJump(s: EmoteState, at: number) {
  s.jump += 1
  s.jumpAt = at
}
export function cancelJump(s: EmoteState) {
  s.jumpAt = -Infinity
}

// 감정표현 바퀴에서 마우스를 움직인 방향(dx, dy)으로 고른 칸. 너무 조금 움직였으면 null
// 위(12시)가 0번이고 시계 방향으로 번호가 늘어납니다.
export const WHEEL_DEADZONE = 24 // px
export function wheelIndex(dx: number, dy: number, count: number): number | null {
  if (Math.hypot(dx, dy) < WHEEL_DEADZONE) return null
  const angle = Math.atan2(dx, -dy) // 위가 0, 시계 방향으로 커짐
  const step = (Math.PI * 2) / count
  return ((Math.round(angle / step) % count) + count) % count
}
