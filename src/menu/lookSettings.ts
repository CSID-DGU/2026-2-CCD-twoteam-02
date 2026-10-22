// 1인칭 마우스 감도 (#222). 화면·React와 무관한 값과 계산입니다.
//
// 마우스마다 알맞은 빠르기가 달라서 계정이 아니라 이 브라우저에 기억합니다(게임들과 같은 방식).
// 1인칭 카메라(WalkCamera)는 마우스를 움직일 때마다 지금 값을 읽으므로, 설정 창에서 바꾸면 바로 적용됩니다.

export const SENSITIVITY = { min: 0.2, max: 3, step: 0.1, default: 1 } // 배율 (1 = 원래 빠르기)
const STORAGE_KEY = 'dooteum.mouseSensitivity'

// 범위 안으로 맞추고 0.1 단위로 반올림합니다. 숫자가 아니면 기본값
export function clampSensitivity(value: number): number {
  if (!Number.isFinite(value)) return SENSITIVITY.default
  const clamped = Math.min(SENSITIVITY.max, Math.max(SENSITIVITY.min, value))
  return Number((Math.round(clamped / SENSITIVITY.step) * SENSITIVITY.step).toFixed(1)) // 0.30000000000000004 같은 꼬리 없애기
}

function load(): number {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === null ? SENSITIVITY.default : clampSensitivity(Number(saved))
  } catch {
    return SENSITIVITY.default // 저장소를 못 쓰는 브라우저(사생활 보호 모드 등)
  }
}

let current = load()

export const getMouseSensitivity = () => current

export function setMouseSensitivity(value: number): number {
  current = clampSensitivity(value)
  try {
    localStorage.setItem(STORAGE_KEY, String(current))
  } catch {
    // 기억하지 못해도 이번 접속에서는 바뀐 값을 씁니다.
  }
  return current
}

// 화면에 보일 글자: "1.0배"
export const sensitivityLabel = (value: number) => `${value.toFixed(1)}배`
