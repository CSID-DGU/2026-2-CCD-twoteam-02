// 내 자리에 앉아 있는 동안의 화면: 웹캠 트래킹, 내 모습 화면, 공부 시작 창, 집중 타이머.
//
// 트래킹(얼굴·팔)을 여기서 한 번만 켜고, 내 모습 화면과 집중 타이머가 같은 결과를 같이 씁니다.
// 앉으면 공부 시작 창이 뜨고, 과목을 고르면 그때부터 타이머가 돌며 기록이 저장됩니다.
import { applyRules } from '../space/rulesLogic'
import type { BranchRules } from '../space/rulesLogic'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { useTracking } from '../tracking/useTracking'
import type { FaceState } from '../tracking/useTracking'
import { useArmDirections } from '../tracking/useArmDirections'
import { useStudyingFlag } from '../realtime/onlineContext'
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
export type MyTracking = { face: RefObject<FaceState>; arms: RefObject<UserArms> }

type Props = {
  userId: string
  sessionId: string | null // 좌석 이용 기록. 아직 못 읽었으면 null
  condition: StudyCondition // 사용자 실험 조건
  onStatus: (status: PresenceStatus) => void // 다른 참여자에게 보낼 내 상태
  onDialogChange: (open: boolean) => void // 창이 떠 있는 동안(중지 중 포함) 캐릭터 조작을 막기 위해 알립니다.
  onPausedChange?: (paused: boolean) => void // 공부 중지 중인지 (지점 화면의 안내 문구·메뉴용, #236)
  // 내 트래킹 결과를 알립니다. 지점 화면이 다른 참여자에게 내 고개·눈·팔을 보내는 데 씁니다. (#129) 일어나면 null
  onTracking?: (tracking: MyTracking | null) => void
  rules?: BranchRules // 건물별 규칙: 공부 시작 창 잠금 + 실제 판정 값 (applyRules)
  breakTime?: { leftMs: number } | null // 강의실 쉬는 시간 (있으면 웹캠·판정·기록 멈춤, 캐릭터는 자유)
  // 꽃 피는 칭호: 이 공부 전 누적(초, 못 읽었으면 null — 넘김을 잡지 않음), 단계가 오르면 알림, 공부가 끝날 때 확정 공부 시간(ms)
  titleBaseSeconds?: number | null
  onLevelUp?: (level: number) => void
  onRunEnd?: (studyMs: number) => void
}

export function SeatedStudy({ userId, sessionId, condition, onStatus, onDialogChange, onPausedChange, onTracking, titleBaseSeconds, onLevelUp, onRunEnd, rules, breakTime = null }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [choice, setChoice] = useState<StudyChoice | null>(null) // null 이면 아직 공부 전
  // 중지(#236): 웹캠을 끄고 타이머를 멈춘 채 아무것도 못 움직이게 합니다. 다시 시작하면 같은 과목·설정으로 이어 갑니다.
  const [paused, setPaused] = useState(false)
  // 공부 세션이 도는 동안 "공부 중"으로 표시합니다. 귓속말 방해금지가 자동으로 켜지고, 친구에게도 공부 중으로 보입니다. (#49)
  useStudyingFlag(choice !== null)
  // 얼굴·팔을 같은 웹캠 영상으로 한 번에 추적합니다. 휴대폰 감지는 휴대폰·학습기기 사용함이 아닐 때만 켭니다.
  // 쉬는 시간에도 웹캠을 끕니다(사용자 중지와 같음). 창·캐릭터 얼림(onDialogChange)에는 넣지 않습니다.
  const cameraOff = paused || breakTime !== null
  const { face, pose, phone, status, message } = useTracking(videoRef, { phone: choice !== null && !choice.allowDevices, paused: cameraOff })
  const arms = useArmDirections(pose) // 떨림을 걸러낸 팔 방향 (다른 참여자에게 보냄)
  const { subjects, loading, loadError, addSubject } = useSubjects(userId)
  const [dialogOpen, setDialogOpen] = useState(true) // 앉자마자 공부 시작 창을 띄웁니다.
  // 보정: 처음 공부를 시작할 때 한 번 하고, 자리에 있는 동안 기준을 유지합니다. (과목을 바꿔도 다시 재지 않음)
  const [calibrating, setCalibrating] = useState(false)
  const [calibrated, setCalibrated] = useState(false) // 보정을 마쳤거나 건너뛰었는지
  const [baseline, setBaseline] = useState<Baseline | null>(null) // 건너뛰면 null (눈 감음 판정 없음)

  useEffect(() => {
    onDialogChange(dialogOpen || calibrating || paused)
  }, [dialogOpen, calibrating, paused, onDialogChange])
  useEffect(() => {
    onPausedChange?.(paused)
  }, [paused, onPausedChange])

  // 공부를 시작하기 전에는 앉아 있어도 idle(표시등 없음)입니다.
  useEffect(() => {
    if (!choice || !calibrated) onStatus('idle')
  }, [choice, calibrated, onStatus])
  useEffect(() => {
    onTracking?.({ face, arms })
    return () => onTracking?.(null)
  }, [face, arms, onTracking])
  // 일어나서 이 화면이 사라지면 창도 닫힌 것으로 알립니다.
  useEffect(() => () => onDialogChange(false), [onDialogChange])
  useEffect(() => () => onPausedChange?.(false), [onPausedChange])

  return (
    <>
      <SelfView videoRef={videoRef} face={face} pose={pose} status={status} message={message} paused={cameraOff} />
      {/* 앉는 순간부터 카메라 구도를 확인합니다. (공부 시작 전·공부 중 모두) */}
      {!paused && <CameraGuideNotice pose={pose} />}

      {choice && sessionId && calibrated ? (
        // key: 과목을 바꾸면 새 타이머로 다시 시작하고, 이전 타이머는 사라지면서 남은 기록을 저장합니다.
        <StudyRunner
          key={`${choice.subject.id}-${choice.allowOtherScreen}-${choice.allowDevices}`}
          face={face}
          pose={pose}
          phone={phone}
          baseline={baseline}
          onRecalibrate={() => setCalibrating(true)}
          paused={paused}
          onPausedChange={setPaused}
          choice={choice}
          userId={userId}
          sessionId={sessionId}
          condition={condition}
          onStatus={onStatus}
          titleBaseSeconds={titleBaseSeconds}
          onLevelUp={onLevelUp}
          onRunEnd={onRunEnd}
          breakTime={breakTime}
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
          rules={rules}
          onStart={(c) => {
            setChoice(applyRules(c, rules)) // 창에서 잠갔더라도 판정에 들어가는 값은 여기서 한 번 더 맞춤
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
