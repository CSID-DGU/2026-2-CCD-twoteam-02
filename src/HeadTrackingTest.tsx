// 6주 차 기술 검증: 웹캠 고개 각도 → 캐릭터 머리 회전, 눈 감김 감지
// 트래킹은 src/tracking, 집중 상태 판정은 src/focus에 있습니다.
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useFocusState } from "./focus/useFocusState";
import FocusBadge from "./focus/FocusBadge";
import { useTracking } from "./tracking/useTracking";
import { CameraGuideNotice } from "./tracking/CameraGuideNotice";
import { CalibrationDialog } from "./study/CalibrationDialog";
import type { Baseline } from "./focus/calibration";
import { MeasureRecorder } from "./tracking/MeasureRecorder";
import { FocusLogRecorder } from "./focus/FocusLogRecorder";
import PoseReadout from "./tracking/PoseReadout";
import type { FaceState } from "./tracking/useTracking";
import { TrackedCharacter } from "./tracking/TrackedCharacter";
import { useMyAvatar } from "./profile/useMyAvatar";
import { BLINK_THRESHOLD } from "./tracking/faceSync";

function Readout({ face }: { face: RefObject<FaceState> }) {
  const [text, setText] = useState("");

  useEffect(() => {
    const toDeg = (rad: number) => Math.round(THREE.MathUtils.radToDeg(rad));
    const id = setInterval(() => {
      const s = face.current;
      setText(
        s.found
          ? `좌우 ${toDeg(s.yaw)}° / 위아래 ${toDeg(s.pitch)}° / 갸웃 ${toDeg(
              s.roll
            )}° / 눈 ${
              s.blink > BLINK_THRESHOLD ? "감음" : "뜸"
            } (감긴 정도 ${Math.round(s.blink * 100)}%)`
          : "얼굴을 찾지 못했어요"
      );
    }, 100);
    return () => clearInterval(id);
  }, [face]);

  return <div>{text}</div>;
}

export default function HeadTrackingTest() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { face, pose, phone, status, message, poseStatus } = useTracking(videoRef, { phone: true }); // 얼굴·팔·가이드라인·휴대폰 (src/tracking)
  const { model } = useMyAvatar(); // 내 프로필에서 고른 캐릭터 (#131)
  const [baseline, setBaseline] = useState<Baseline | null>(null); // 보정 기준 (확인용)
  const [calibrating, setCalibrating] = useState(false);
  const focus = useFocusState(face, false, pose, { body: pose, baseline, phone }); // 집중 상태 판정 (src/focus)

  return (
    <div style={{ position: "fixed", inset: 0, background: "#20232a" }}>
      <Canvas camera={{ position: [0, 2.2, 5], fov: 35 }}>
        <ambientLight intensity={1.5} />
        <directionalLight position={[3, 5, 4]} intensity={1.5} />
        {model && <TrackedCharacter face={face} pose={pose} model={model} />}
        <OrbitControls target={[0, 1.6, 0]} />
      </Canvas>

      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          color: "#fff",
          font: "14px/1.6 system-ui, sans-serif",
          textAlign: "left",
        }}
      >
        {status === "loading" && (
          <div>웹캠과 얼굴 인식 모델을 불러오는 중…</div>
        )}
        {status === "error" && <div>오류: {message}</div>}
        {status === "ready" && <Readout face={face} />}
        {status === "ready" && <FocusBadge state={focus} guide={poseStatus} />}
        {status === "ready" && (
          <button type="button" onClick={() => setCalibrating(true)}>
            {baseline ? "다시 맞추기" : "보정하기 (눈 감음 판정 켜기)"}
          </button>
        )}
        {status === "ready" && <PoseReadout pose={pose} />}
        {poseStatus === "loading" && <div>팔 인식 모델을 불러오는 중…</div>}
        {poseStatus === "error" && <div>팔 인식을 시작하지 못했어요. (고개·눈은 그대로 동작)</div>}
      </div>

      <CameraGuideNotice pose={pose} />
      {calibrating && (
        <CalibrationDialog
          face={face}
          pose={pose}
          onDone={(b) => {
            setBaseline(b);
            setCalibrating(false);
          }}
          onSkip={() => setCalibrating(false)}
          skipLabel={baseline !== null ? "취소 (기존 기준 유지)" : undefined}
        />
      )}
      {status === "ready" && <MeasureRecorder pose={pose} />}
      {status === "ready" && <FocusLogRecorder face={face} pose={pose} focus={focus} />}

      <video
        ref={videoRef}
        muted
        playsInline
        style={{
          position: "absolute",
          right: 16,
          bottom: 16,
          width: 200,
          borderRadius: 8,
          transform: "scaleX(-1)",
        }}
      />
    </div>
  );
}
