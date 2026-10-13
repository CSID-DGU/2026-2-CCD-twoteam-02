// 공부 중: 집중 타이머를 돌리고, 공부 기록을 조각으로 나눠 저장합니다.
// 이 컴포넌트가 화면에 있는 동안이 "공부 중"입니다. 일어나거나 과목을 바꾸면 사라지면서 남은 조각을 저장합니다.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { useFocusState } from '../focus/useFocusState'
import type { FocusInput, FocusStatus } from '../focus/focusLogic'
import { supabase } from '../lib/supabase'
import { SAVE_INTERVAL_MS, devicesOf, formatDuration, startChunk, takeChunk } from './studyLogic'
import type { ChunkRow, ChunkState } from './studyLogic'
import type { StudyChoice } from './StartStudyDialog'
import type { StudyCondition } from './condition'

const LABEL: Record<FocusStatus, { color: string; text: string }> = {
  focus: { color: '#4ade80', text: '🟢 공부 중' },
  away: { color: '#facc15', text: '🟡 자리 이탈 의심' },
  drowsy: { color: '#facc15', text: '🟡 졸음 의심' },
  offscreen: { color: '#facc15', text: '🟡 다른 화면 사용 중' },
  outframe: { color: '#facc15', text: '🟡 가이드라인 이탈 의심' },
}

type Props = {
  face: RefObject<FocusInput>
  choice: StudyChoice
  userId: string
  sessionId: string // 지금 앉아 있는 좌석 이용 기록(seat_sessions.id)
  condition: StudyCondition // 사용자 실험 조건 (기록에 같이 남김)
  onStatus: (status: FocusStatus) => void // 집중 상태가 바뀔 때 (다른 참여자에게 보내는 표시등용)
  onChangeSubject: () => void
}

export function StudyRunner({ face, choice, userId, sessionId, condition, onStatus, onChangeSubject }: Props) {
  const focus = useFocusState(face, choice.allowDevices)
  const [saveError, setSaveError] = useState('')

  // 타이머 값은 매번 바뀌므로, 저장 타이머와 정리 함수가 최신 값을 읽도록 ref 에 둡니다.
  const studyMs = useRef(0)
  useEffect(() => {
    studyMs.current = focus.studyMs
  }, [focus.studyMs])

  useEffect(() => {
    onStatus(focus.status)
  }, [focus.status, onStatus])

  useEffect(() => {
    let chunk: ChunkState = startChunk(Date.now(), studyMs.current)
    const base = {
      user_id: userId,
      session_id: sessionId,
      subject_id: choice.subject.id,
      devices: devicesOf(choice.allowDevices),
    }
    const save = async (row: ChunkRow) => {
      const values = {
        ...base,
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
      if (!error) return
      console.error('공부 기록을 저장하지 못했습니다:', error.message)
      setSaveError('기록 저장 실패')
    }
    // 지금까지의 구간을 잘라 저장합니다.
    const flush = () => {
      const { row, next } = takeChunk(chunk, studyMs.current, Date.now())
      chunk = next
      if (row) void save(row)
    }

    const timer = setInterval(flush, SAVE_INTERVAL_MS)
    // 탭을 닫을 때도 남은 조각을 보내 봅니다. 브라우저가 요청을 끊으면 이 조각(최대 5분)만 잃습니다.
    window.addEventListener('pagehide', flush)
    return () => {
      clearInterval(timer)
      window.removeEventListener('pagehide', flush)
      flush() // 일어나기, 과목 바꾸기, 지점 나가기
    }
  }, [userId, sessionId, choice, condition])

  const { color, text } = LABEL[focus.status]
  return (
    <div style={styles.bar}>
      <span>📘 {choice.subject.name}</span>
      <span style={styles.time}>{formatDuration(focus.studyMs)}</span>
      <span style={{ color }}>{text}</span>
      {saveError && <span style={{ color: '#f87171' }}>{saveError}</span>}
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
  time: { fontVariantNumeric: 'tabular-nums', fontWeight: 600 }, // 숫자 폭을 같게 해서 시간이 흔들리지 않게
  button: {
    padding: '2px 8px', borderRadius: 6, border: '1px solid #4b5563', background: 'transparent',
    color: '#fff', cursor: 'pointer', font: 'inherit',
  },
}
