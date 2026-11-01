// 공부 중: 집중 타이머를 돌리고, 공부 기록을 조각으로 나눠 저장합니다.
// 같은 때에 상태 구간(내 기록의 하루 띠, #235)도 모아 study_segments 에 저장합니다.
// 이 컴포넌트가 화면에 있는 동안이 "공부 중"입니다. 일어나거나 과목을 바꾸면 사라지면서 남은 조각을 저장합니다.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { useFocusState } from '../focus/useFocusState'
import { HOLD_LABEL, holdReason, shownStudyMs } from '../focus/focusLogic'
import type { FocusInput, FocusStatus } from '../focus/focusLogic'
import type { PresenceStatus } from '../space/status'
import { supabase } from '../lib/supabase'
import { SAVE_INTERVAL_MS, canCutChunk, devicesOf, formatDuration, startChunk, takeChunk } from './studyLogic'
import type { ChunkRow, ChunkState } from './studyLogic'
import { breakSegments, endSegments, pauseSegments, resumeSegments, startSegments, stepSegments, takeSegments } from './segmentLogic'
import type { Segment, SegmentState } from './segmentLogic'
import type { StudyChoice } from './StartStudyDialog'
import type { StudyCondition } from './condition'
import type { Baseline } from '../focus/calibration'
import type { PhoneState, PoseState } from '../tracking/useTracking'
import { useSampleRecorder } from '../report/useSampleRecorder'
import { levelCrossed } from '../level/levelLogic'
import { setLiveSeconds } from '../level/liveTitle'

// 빨강 = 기준을 넘겨 시간이 안 올라감, 노랑 = 아직 올라가는 중 (표시등 색과 같은 규칙, space/status.ts)
const LABEL: Record<FocusStatus, { color: string; text: string }> = {
  focus: { color: '#4ade80', text: '🟢 공부 중' },
  away: { color: '#f87171', text: '🔴 자리 이탈' },
  drowsy: { color: '#f87171', text: '🔴 졸음' },
  offscreen: { color: '#f87171', text: '🔴 다른 화면 사용 중' },
  outframe: { color: '#facc15', text: '🟡 가이드라인 이탈 의심' },
  phone: { color: '#f87171', text: '🔴 휴대폰 사용' },
}

type Props = {
  face: RefObject<FocusInput>
  pose: RefObject<PoseState> // 몸 인식 (얼굴을 놓쳐도 자리에 있는지)
  phone: RefObject<PhoneState> // 휴대폰 감지 (휴대폰·학습기기 사용함이 아닐 때만 판정에 씀)
  baseline: Baseline | null // 보정 기준 (건너뛰면 null)
  onRecalibrate: () => void
  paused: boolean // 중지 중 (#236). 바뀌면 웹캠·판정을 끄고 켜는 것은 바깥(SeatedStudy)이 합니다.
  onPausedChange: (paused: boolean) => void
  choice: StudyChoice
  userId: string
  sessionId: string // 지금 앉아 있는 좌석 이용 기록(seat_sessions.id)
  condition: StudyCondition // 사용자 실험 조건 (기록에 같이 남김)
  onStatus: (status: PresenceStatus) => void // 집중 상태가 바뀔 때 (다른 참여자에게 보내는 표시등용). 보류 중이면 hold
  onChangeSubject: () => void
  // 꽃 피는 칭호: 이 공부 전 누적(초, 못 읽었으면 null — 넘김을 잡지 않음), 단계가 오르면 알림, 공부가 끝날 때 확정 공부 시간(ms)
  titleBaseSeconds?: number | null
  onLevelUp?: (level: number) => void
  onRunEnd?: (studyMs: number) => void
  // 강의실 공동 시간표(캠빛 강의동)의 쉬는 시간: 남은 시간. 있으면 타이머·기록·판정만 멈추고, 캐릭터·버튼은 사용자 중지와 따로 (#설계 6절)
  breakTime?: { leftMs: number } | null
}

export function StudyRunner({ face, pose, phone, baseline, onRecalibrate, paused, onPausedChange, choice, userId, sessionId, condition, onStatus, onChangeSubject, titleBaseSeconds = null, onLevelUp, onRunEnd, breakTime = null }: Props) {
  // 멈춤 = 사용자가 누른 중지(paused) 또는 강의실 쉬는 시간(breakTime). 판정·기록·표시등은 둘 다 멈추고,
  // 화면(다시 시작 버튼·캐릭터 얼림)은 사용자 중지만 따릅니다. 쉬는 시간이 끝나면 저절로 이어 갑니다.
  const breakNow = breakTime !== null
  const halted = paused || breakNow
  const focus = useFocusState(face, { allowOtherScreen: choice.allowOtherScreen, allowDevices: choice.allowDevices }, undefined, { body: pose, baseline, phone, paused: halted })
  const [saveError, setSaveError] = useState('')

  // 타이머 값은 매번 바뀌므로, 저장 타이머와 정리 함수가 최신 값을 읽도록 ref 에 둡니다.
  const studyMs = useRef(0)
  useEffect(() => {
    studyMs.current = focus.studyMs
  }, [focus.studyMs])

  // 꽃 피는 칭호: "이 공부 전 누적 + 이번 확정분(보류분 제외)"이 지금까지 본 가장 큰 누적을 넘을 때만 비교해,
  // 단계가 오르면 알립니다. 보류분은 버려질 수 있어 넣지 않습니다. (같은 규칙을 levelLogic.runCrossings 로 검사)
  const titleBest = useRef<number | null>(null)
  useEffect(() => {
    if (titleBaseSeconds === null) return
    const now = titleBaseSeconds + focus.studyMs / 1000
    setLiveSeconds(userId, Math.floor(now)) // 프로필·내 기록 창이 저장 전에도 지금 칭호를 보이게 (초 단위로만 알림)
    const best = titleBest.current ?? titleBaseSeconds
    if (now <= best) {
      titleBest.current = best
      return
    }
    titleBest.current = now
    const crossed = levelCrossed(best, now)
    if (crossed !== null) onLevelUp?.(crossed)
  }, [focus.studyMs, titleBaseSeconds, onLevelUp, userId])
  // 공부가 끝나면(일어나기·과목 바꾸기·나가기) 확정 공부 시간을 바깥에 알려, 다음 공부의 "이 공부 전 누적"에 더하게 합니다.
  const runEnd = useRef(onRunEnd)
  useEffect(() => {
    runEnd.current = onRunEnd
  }, [onRunEnd])
  useEffect(() => () => runEnd.current?.(studyMs.current), [])

  // 보류 중(의심)이면 다른 참여자에게도 노란불로 보입니다. 산만하면 내 화면에만 보이게 되돌릴 수 있습니다. (2026-10-21)
  // 중지한 시각(경과 시간 표시용)과 다시 시작한 시각.
  // 다시 시작한 직후 첫 판정(0.1초)이 나오기 전까지는 중지 직전의 판정 값이 남아 있어(stale) 쓰지 않습니다.
  // 그대로 쓰면 노란불이 잠깐 남에게 보이거나, 띠가 중지 전 노란불에서 이어집니다.
  const [pausedAt, setPausedAt] = useState<number | null>(null)
  // 다시 시작한 순간의 마지막 판정 시각. 그 뒤 새 판정이 나오기 전까지가 stale 입니다.
  // (멈춤이 풀리는 것을 렌더 중에 이전 값과 비교해 기록하는 React 권장 방식. 쉬는 시간이 끝나 저절로 풀려도 같음)
  const [resumeMark, setResumeMark] = useState<number | null>(null)
  const [seenHalted, setSeenHalted] = useState(halted)
  if (halted !== seenHalted) {
    setSeenHalted(halted)
    if (!halted) setResumeMark(focus.lastMs ?? 0)
  }
  const stale = resumeMark !== null && (focus.lastMs ?? 0) <= resumeMark
  const judging = !halted && !stale

  // 중지 중에는 표시등을 끕니다(idle, 앉기만 하고 공부 전과 같음). 남에게는 쉬는 이유를 보이지 않습니다.
  const hold = judging ? holdReason(focus) : null
  useEffect(() => {
    onStatus(halted ? 'idle' : hold ? 'hold' : stale ? 'focus' : focus.status)
  }, [halted, stale, focus.status, hold, onStatus])

  // 신고 창이 꺼내 쓸 최근 30초 수치 (#121). 영상은 없고 판정 수치만 1초마다 남깁니다.
  useSampleRecorder({ face, pose, phone, focus, hold, paused: halted, allowOtherScreen: choice.allowOtherScreen, allowDevices: choice.allowDevices, sessionId })

  // 이 화면이 중지 중에 사라지면(창 닫기 등) 중지도 풀어 둡니다. 남아 있으면 다음 공부의 웹캠이 꺼진 채 시작됩니다.
  useEffect(() => () => onPausedChange(false), [onPausedChange])

  // 중지 중에는 1초마다 다시 그려 경과 시간을 올립니다.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!paused) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [paused])

  // 판정이 새로 나올 때마다(0.1초) 상태 구간을 이어 갑니다. (저장은 아래 5분 저장과 같이)
  // 값이 바뀔 때만 부르면 안 됩니다. 빨간불 동안은 값이 그대로라 불리지 않고, 돌아왔을 때 컴퓨터가 잠든 것으로 보여
  // 빨강이 빈칸이 되고 띠가 끊겼습니다(2026-10-26). focus 는 판정마다 새 객체라 매번 불립니다.
  // 중지 중과 다시 시작한 직후(stale)에는 모으지 않습니다. 그 사이는 pauseSegments·resumeSegments 가 맡습니다.
  const segments = useRef<SegmentState | null>(null)

  // 5분 저장 때 보류 중(노란불)이면 자르기를 미룹니다(canCutChunk). 보류가 끝나거나 멈추면 그때 자릅니다.
  const pendingNow = useRef(0)
  const haltedNow = useRef(halted)
  const cutIfDue = useRef<(() => void) | null>(null) // 아래 저장 effect 가 채움
  useEffect(() => {
    pendingNow.current = focus.pendingMs
    haltedNow.current = halted
    cutIfDue.current?.()
  }, [focus.pendingMs, halted])
  useEffect(() => {
    if (!segments.current || !judging) return
    segments.current = stepSegments(segments.current, {
      now: Date.now(), status: focus.status, studyMs: focus.studyMs, pendingMs: focus.pendingMs, hold,
    })
  }, [focus, hold, judging])

  useEffect(() => {
    let chunk: ChunkState = startChunk(Date.now(), studyMs.current)
    // 공부하는 중에 설정에서 이 과목을 지우면 과목 번호가 없어져 저장이 외래 키 오류(23503)로 실패합니다.
    // 그때부터는 과목을 비워(null) 저장합니다. 공부 시간은 남고 내 기록에서 "(지운 과목)"으로 보입니다. (#369, 0047)
    let subjectId: number | null = choice.subject.id
    const FK_MISSING = '23503'
    const base = () => ({
      user_id: userId,
      session_id: sessionId,
      subject_id: subjectId,
      devices: devicesOf(choice),
    })
    const save = async (row: ChunkRow) => {
      const values = {
        ...base(),
        started_at: new Date(row.startedAt).toISOString(),
        ended_at: new Date(row.endedAt).toISOString(),
        focused_seconds: row.focusedSeconds,
      }
      let { error } = await supabase.from('study_logs').insert({ ...values, condition })
      // PGRST204: DB에 condition 칸이 아직 없음(0011 실행 전). 조건 없이 다시 저장해서 기록은 지킵니다.
      if (error?.code === 'PGRST204') {
        console.warn('study_logs.condition 칸이 없어 실험 조건 없이 저장합니다. 0011 마이그레이션을 실행해 주세요.')
        ;({ error } = await supabase.from('study_logs').insert(values))
      }
      if (error?.code === FK_MISSING && subjectId !== null) {
        subjectId = null
        ;({ error } = await supabase.from('study_logs').insert({ ...values, subject_id: null, condition }))
      }
      if (!error) return
      console.error('공부 기록을 저장하지 못했습니다:', error.message)
      setSaveError('기록 저장 실패')
    }
    // 상태 구간은 여러 줄을 한 번에 보냅니다. 실패해도 공부 시간(study_logs)은 따로 저장됩니다.
    const saveSegments = async (rows: Segment[]) => {
      if (rows.length === 0) return
      const insert = () =>
        supabase.from('study_segments').insert(
          rows.map((r) => ({
            user_id: userId,
            session_id: sessionId,
            subject_id: subjectId,
            kind: r.kind,
            started_at: new Date(r.startedAt).toISOString(),
            ended_at: new Date(r.endedAt).toISOString(),
          })),
        )
      let { error } = await insert()
      if (error?.code === FK_MISSING && subjectId !== null) {
        subjectId = null // 위 study_logs 와 같은 까닭
        ;({ error } = await insert())
      }
      if (error) console.error('상태 구간을 저장하지 못했습니다:', error.message)
    }
    // 지금까지의 구간을 잘라 저장합니다.
    let due = false // 5분이 되어 자를 차례인데 보류가 끝나기를 기다리는 중
    const flush = () => {
      due = false
      const now = Date.now()
      const { row, next } = takeChunk(chunk, studyMs.current, now)
      chunk = next
      if (row) void save(row)
      if (segments.current) {
        const taken = takeSegments(segments.current, now)
        segments.current = taken.next
        void saveSegments(taken.rows)
      }
    }
    // 창을 닫을 때·공부를 끝낼 때: 노란불인 채로 끝나면 그 시간은 타이머에 안 들어가므로 빨강으로 닫아 보냅니다.
    const finish = () => {
      flush()
      if (!segments.current) return
      const now = Date.now()
      void saveSegments(endSegments(segments.current, now))
      segments.current = startSegments(now, studyMs.current) // 창이 실제로 닫히지 않으면(뒤로 가기 캐시 등) 이어서 모읍니다.
    }

    segments.current = startSegments(Date.now(), studyMs.current)

    const cut = () => {
      if (due && canCutChunk(pendingNow.current, haltedNow.current)) flush()
    }
    cutIfDue.current = cut
    const timer = setInterval(() => {
      due = true
      cut()
    }, SAVE_INTERVAL_MS)
    // 탭을 닫을 때도 남은 조각을 보내 봅니다. 브라우저가 요청을 끊으면 이 조각(최대 5분)만 잃습니다.
    window.addEventListener('pagehide', finish)
    return () => {
      clearInterval(timer)
      cutIfDue.current = null
      window.removeEventListener('pagehide', finish)
      finish() // 일어나기, 과목 바꾸기, 지점 나가기
      segments.current = null
    }
  }, [userId, sessionId, choice, condition])

  // 상태 구간(하루 띠)은 멈춘 까닭이 바뀌는 순간에 끊고 잇습니다.
  //   사용자 중지 → 빨강 '중지' 구간 (#236), 강의실 쉬는 시간 → 빈칸 (누르지 않은 멈춤이라), 다시 공부 → 새로 모음
  // 쉬는 시간 중에 사용자가 중지하거나 풀어도 그 순간에 맞춰 바꿉니다.
  const mode = paused ? 'paused' : breakNow ? 'break' : 'run'
  const lastMode = useRef(mode)
  useEffect(() => {
    if (lastMode.current === mode) return
    lastMode.current = mode
    const at = Date.now()
    if (!segments.current) return
    if (mode === 'paused') segments.current = pauseSegments(segments.current, at)
    else if (mode === 'break') segments.current = breakSegments(segments.current, at)
    else segments.current = resumeSegments(segments.current, at, studyMs.current)
  }, [mode])
  const pause = () => {
    const at = Date.now()
    setPausedAt(at)
    setNow(at)
    onPausedChange(true)
  }
  const resume = () => {
    setPausedAt(null)
    onPausedChange(false)
  }

  if (paused) {
    // 중지 중: 보류 시간은 버려지므로 확정 시간만 보여 줍니다. 다시 맞추기·과목 바꾸기는 숨깁니다.
    return (
      <div style={styles.bar}>
        <span>📘 {choice.subject.name}</span>
        <span style={styles.time}>{formatDuration(focus.studyMs)}</span>
        <span style={{ color: '#f87171' }}>
          ⏸ 중지 중 · <span style={styles.time}>{formatDuration(Math.max(now - (pausedAt ?? now), 0))}</span>
        </span>
        {saveError && <span style={{ color: '#f87171' }}>{saveError}</span>}
        <button type="button" style={{ ...styles.button, ...styles.resume }} onClick={resume}>
          ▶ 다시 시작
        </button>
      </div>
    )
  }

  if (breakTime) {
    // 강의실 쉬는 시간: 타이머·기록만 멈춤. 다시 시작 버튼 없이 수업 시작에 저절로 이어 갑니다. 일어나 쉬러 가도 됩니다.
    return (
      <div style={styles.bar}>
        <span>📘 {choice.subject.name}</span>
        <span style={styles.time}>{formatDuration(focus.studyMs)}</span>
        <span style={{ color: '#fbbf24' }}>☕ 쉬는 시간 · 다음 수업까지 {Math.max(1, Math.ceil(breakTime.leftMs / 60_000))}분</span>
        {saveError && <span style={{ color: '#f87171' }}>{saveError}</span>}
      </div>
    )
  }

  const { color, text } = hold ? { color: '#facc15', text: HOLD_LABEL[hold] } : LABEL[stale ? 'focus' : focus.status]
  return (
    <div style={styles.bar}>
      <span>📘 {choice.subject.name}</span>
      <span style={styles.time}>{formatDuration(stale ? focus.studyMs : shownStudyMs(focus))}</span>
      <span style={{ color }}>{text}</span>
      {saveError && <span style={{ color: '#f87171' }}>{saveError}</span>}
      <button type="button" style={styles.button} onClick={pause}>
        ⏸ 중지
      </button>
      <button type="button" style={styles.button} onClick={onRecalibrate}>
        다시 맞추기
      </button>
      <button type="button" style={styles.button} onClick={onChangeSubject}>
        과목 바꾸기
      </button>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  bar: {
    position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10,
    display: 'flex', alignItems: 'center', gap: 12, padding: '6px 14px', borderRadius: 8,
    background: 'rgba(32,35,42,.9)', color: '#fff', font: '14px system-ui, sans-serif',
  },
  resume: { borderColor: '#22c55e', color: '#4ade80', fontWeight: 600 },
  time: { fontVariantNumeric: 'tabular-nums', fontWeight: 600 }, // 숫자 폭을 같게 해서 시간이 흔들리지 않게
  button: {
    padding: '2px 8px', borderRadius: 6, border: '1px solid #4b5563', background: 'transparent',
    color: '#fff', cursor: 'pointer', font: 'inherit',
  },
}
