// 내 자리에 앉아 있는 동안의 화면: 웹캠 트래킹, 내 모습 화면, 공부 시작 창, 집중 타이머.
//
// 트래킹(얼굴·팔)을 여기서 한 번만 켜고, 내 모습 화면과 집중 타이머가 같은 결과를 같이 씁니다.
// 앉으면 공부 시작 창이 뜨고, 과목을 고르면 그때부터 타이머가 돌며 기록이 저장됩니다.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useTracking } from '../tracking/useTracking'
import { SelfView } from '../space/SelfView'
import type { PresenceStatus } from '../space/status'
import { useSubjects } from './useSubjects'
import { StartStudyDialog } from './StartStudyDialog'
import type { StudyChoice } from './StartStudyDialog'
import { StudyRunner } from './StudyRunner'
import type { StudyCondition } from './condition'

type Props = {
  userId: string
  sessionId: string | null // 좌석 이용 기록. 아직 못 읽었으면 null
  condition: StudyCondition // 사용자 실험 조건
  onStatus: (status: PresenceStatus) => void // 다른 참여자에게 보낼 내 상태
  onDialogChange: (open: boolean) => void // 창이 떠 있는 동안 캐릭터 조작을 막기 위해 알립니다.
}

export function SeatedStudy({ userId, sessionId, condition, onStatus, onDialogChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { face, pose, status, message } = useTracking(videoRef) // 얼굴·팔을 같은 웹캠 영상으로 한 번에 추적합니다.
  const { subjects, loading, loadError, addSubject } = useSubjects(userId)
  const [dialogOpen, setDialogOpen] = useState(true) // 앉자마자 공부 시작 창을 띄웁니다.
  const [choice, setChoice] = useState<StudyChoice | null>(null) // null 이면 아직 공부 전

  useEffect(() => {
    onDialogChange(dialogOpen)
  }, [dialogOpen, onDialogChange])

  // 공부를 시작하기 전에는 앉아 있어도 노란불(공부하지 않음)입니다.
  useEffect(() => {
    if (!choice) onStatus('idle')
  }, [choice, onStatus])
  // 일어나서 이 화면이 사라지면 창도 닫힌 것으로 알립니다.
  useEffect(() => () => onDialogChange(false), [onDialogChange])

  return (
    <>
      <SelfView videoRef={videoRef} face={face} pose={pose} status={status} message={message} />

      {choice && sessionId ? (
        // key: 과목을 바꾸면 새 타이머로 다시 시작하고, 이전 타이머는 사라지면서 남은 기록을 저장합니다.
        <StudyRunner
          key={`${choice.subject.id}-${choice.allowDevices}`}
          face={face}
          choice={choice}
          userId={userId}
          sessionId={sessionId}
          condition={condition}
          onStatus={onStatus}
          onChangeSubject={() => {
            setChoice(null)
            setDialogOpen(true)
          }}
        />
      ) : choice ? (
        <div style={{ ...startButton, background: 'rgba(32,35,42,.9)', color: '#fff' }}>자리 정보를 확인하는 중…</div>
      ) : (
        !dialogOpen && (
          <button type="button" style={startButton} onClick={() => setDialogOpen(true)}>
            📘 공부 시작하기
          </button>
        )
      )}

      {dialogOpen && (
        <StartStudyDialog
          subjects={subjects}
          loading={loading}
          loadError={loadError}
          addSubject={addSubject}
          onStart={(c) => {
            setChoice(c)
            setDialogOpen(false)
          }}
          onCancel={() => setDialogOpen(false)}
        />
      )}
    </>
  )
}

const startButton: CSSProperties = {
  position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10,
  padding: '6px 14px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#0b1a10',
  font: '14px system-ui, sans-serif', fontWeight: 600, cursor: 'pointer',
}
