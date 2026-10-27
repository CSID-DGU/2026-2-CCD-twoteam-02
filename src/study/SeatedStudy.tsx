// 내 자리에 앉아 있는 동안의 화면: 웹캠 트래킹, 내 모습 화면, 공부 시작 창, 집중 타이머.
//
// 트래킹(얼굴·팔)을 여기서 한 번만 켜고, 내 모습 화면과 집중 타이머가 같은 결과를 같이 씁니다.
// 앉으면 공부 시작 창이 뜨고, 과목을 고르면 그때부터 타이머가 돌며 기록이 저장됩니다.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { useTracking } from '../tracking/useTracking'
import type { FaceState } from '../tracking/useTracking'
import { useArmDirections } from '../tracking/useArmDirections'
import type { UserArms } from '../tracking/armLogic'
import { CameraGuideNotice } from '../tracking/CameraGuideNotice'
import { SelfView } from '../space/SelfView'
import type { PresenceStatus } from '../space/status'
import { useSubjects } from './useSubjects'
import { StartStudyDialog } from './StartStudyDialog'
import type { StudyChoice } from './StartStudyDialog'
import { StudyRunner } from './StudyRunner'
import { CalibrationDialog } from './CalibrationDialog'
import type { Baseline } from '../focus/calibration'
import type { StudyCondition } from './condition'

// 다른 참여자에게 보낼 내 트래킹 결과. 지점 화면이 읽어 고개·눈·팔을 보냅니다.
// video: 트래킹이 켠 웹캠 화면. 기록 모드(#190)가 같은 영상을 함께 녹화하는 데 씁니다.
export type MyTracking = { face: RefObject<FaceState>; arms: RefObject<UserArms>; video: RefObject<HTMLVideoElement | null> }

type Props = {
  userId: string
  sessionId: string | null // 좌석 이용 기록. 아직 못 읽었으면 null
  condition: StudyCondition // 사용자 실험 조건
  lockOtherScreen?: boolean // 실험 지점: 공부 시작 창의 다른 탭·앱 사용함을 켠 채 잠금 (#193)
  onStatus: (status: PresenceStatus) => void // 다른 참여자에게 보낼 내 상태
  onDialogChange: (open: boolean) => void // 창이 떠 있는 동안 캐릭터 조작을 막기 위해 알립니다.
  // 내 트래킹 결과를 알립니다. 지점 화면이 다른 참여자에게 내 고개·눈·팔을 보내는 데 씁니다. (#129) 일어나면 null
  onTracking?: (tracking: MyTracking | null) => void
  showCamera?: boolean // 기록 모드(#190): 내 모습 화면에 카메라 화면도 띄웁니다
}

export function SeatedStudy({ userId, sessionId, condition, lockOtherScreen, onStatus, onDialogChange, onTracking, showCamera }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [choice, setChoice] = useState<StudyChoice | null>(null) // null 이면 아직 공부 전
  // 얼굴·팔을 같은 웹캠 영상으로 한 번에 추적합니다. 휴대폰 감지는 휴대폰·학습기기 사용함이 아닐 때만 켭니다.
  const { face, pose, phone, status, message } = useTracking(videoRef, { phone: choice !== null && !choice.allowDevices })
  const arms = useArmDirections(pose) // 떨림을 걸러낸 팔 방향 (다른 참여자에게 보냄)
  const { subjects, loading, loadError, addSubject } = useSubjects(userId)
  const [dialogOpen, setDialogOpen] = useState(true) // 앉자마자 공부 시작 창을 띄웁니다.
  // 보정: 처음 공부를 시작할 때 한 번 하고, 자리에 있는 동안 기준을 유지합니다. (과목을 바꿔도 다시 재지 않음)
  const [calibrating, setCalibrating] = useState(false)
  const [calibrated, setCalibrated] = useState(false) // 보정을 마쳤거나 건너뛰었는지
  const [baseline, setBaseline] = useState<Baseline | null>(null) // 건너뛰면 null (눈 감음 판정 없음)

  useEffect(() => {
    onDialogChange(dialogOpen || calibrating)
  }, [dialogOpen, calibrating, onDialogChange])

  // 공부를 시작하기 전에는 앉아 있어도 idle(표시등 없음)입니다.
  useEffect(() => {
    if (!choice || !calibrated) onStatus('idle')
  }, [choice, calibrated, onStatus])
  useEffect(() => {
    onTracking?.({ face, arms, video: videoRef })
    return () => onTracking?.(null)
  }, [face, arms, onTracking])
  // 일어나서 이 화면이 사라지면 창도 닫힌 것으로 알립니다.
  useEffect(() => () => onDialogChange(false), [onDialogChange])

  return (
    <>
      <SelfView videoRef={videoRef} face={face} pose={pose} status={status} message={message} showCamera={showCamera} />
      {/* 앉는 순간부터 카메라 구도를 확인합니다. (공부 시작 전·공부 중 모두) */}
      <CameraGuideNotice pose={pose} />

      {choice && sessionId && calibrated ? (
        // key: 과목을 바꾸면 새 타이머로 다시 시작하고, 이전 타이머는 사라지면서 남은 기록을 저장합니다.
        <StudyRunner
          key={`${choice.subject.id}-${choice.allowOtherScreen}-${choice.allowDevices}`}
          face={face}
          pose={pose}
          phone={phone}
          baseline={baseline}
          onRecalibrate={() => setCalibrating(true)}
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
      ) : choice && calibrated ? (
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
          lockOtherScreen={lockOtherScreen}
          onStart={(c) => {
            setChoice(c)
            setDialogOpen(false)
            if (!calibrated) setCalibrating(true)
          }}
          onCancel={() => setDialogOpen(false)}
        />
      )}

      {calibrating && (
        <CalibrationDialog
          face={face}
          pose={pose}
          onDone={(b) => {
            setBaseline(b)
            setCalibrated(true)
            setCalibrating(false)
          }}
          onSkip={() => {
            setCalibrated(true)
            setCalibrating(false)
          }}
          skipLabel={calibrated && baseline !== null ? '취소 (기존 기준 유지)' : undefined}
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
