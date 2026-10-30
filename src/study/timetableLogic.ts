// 강의실 공동 시간표 (캠빛 강의동). React·화면과 무관한 순수 로직입니다. (Node 로 검사)
//
// 실제 시계(한국 시간) 기준으로 모두 같은 시간표: 매시 정각부터 CLASS_MINUTES 분은 수업(공부),
// 그 뒤 정각까지는 쉬는 시간. 누가 언제 들어와도 같은 교시·남은 시간이 보이고, 서버가 시간을 맞출 필요가 없습니다.
// 쉬는 시간에는 타이머·기록만 멈추고(StudyRunner 의 breakNow), 수업 시작에 자동으로 이어 갑니다. (설계 6절)

export const CLASS_MINUTES = 50 // 매시 수업 분 (나머지는 쉬는 시간)
const HOUR_MINUTES = 60
export const KST_OFFSET_MIN = 9 * 60 // 한국 시간 = UTC + 9시간
const MIN = 60_000

export type ClassPhase = {
  phase: 'class' | 'break'
  period: number // 그날(한국 시간) 몇 교시: 0시대 = 1교시 … 23시대 = 24교시
  leftMs: number // 지금 구간(수업 또는 쉬는 시간)이 끝날 때까지
}

export function classPhase(nowMs: number): ClassPhase {
  const kstMs = nowMs + KST_OFFSET_MIN * MIN
  const intoHour = ((kstMs % (HOUR_MINUTES * MIN)) + HOUR_MINUTES * MIN) % (HOUR_MINUTES * MIN) // 이 시각의 정각부터 지난 ms
  const hour = Math.floor(kstMs / (HOUR_MINUTES * MIN)) % 24
  const period = ((hour + 24) % 24) + 1
  const classEnd = CLASS_MINUTES * MIN
  return intoHour < classEnd
    ? { phase: 'class', period, leftMs: classEnd - intoHour }
    : { phase: 'break', period, leftMs: HOUR_MINUTES * MIN - intoHour }
}

// 칠판 글씨. 남은 분은 올림(1분 미만도 1분)
export function boardText(p: ClassPhase): string {
  const minutes = Math.max(1, Math.ceil(p.leftMs / MIN))
  return p.phase === 'class' ? `${p.period}교시 · 남은 시간 ${minutes}분` : `쉬는 시간 · ${minutes}분`
}

// 웹캠을 끌지: 사용자가 누른 중지면 끔. 쉬는 시간이면 공부(StudyRunner)가 도는 동안만 끔 —
// 쉬는 시간에 막 앉아 공부 시작 창·자세 맞추기(보정)를 하는 중에는 카메라가 있어야 해서 켜 둡니다.
export const cameraOffNow = (s: { paused: boolean; onBreak: boolean; studying: boolean }) => s.paused || (s.onBreak && s.studying)
