// 3D 좌석 모드의 "내 모습 화면": 웹캠 트래킹(고개·눈·팔)이 반영된 내 캐릭터를 구석에 작게 보여 줍니다.
// 웹캠 영상 자체는 화면에 나오지 않고, 이 브라우저 밖으로 전송되지도 않습니다.
// 다만 기록 모드(?record=, #190)에서는 팀원이 녹화되는 구도를 보며 맞출 수 있게 캐릭터 왼쪽에 카메라 화면을 함께 띄웁니다.
//
// 트래킹은 바깥(src/study/SeatedStudy)에서 켜서 넘겨받습니다. 집중 타이머도 같은 결과를 쓰기 때문입니다.
import { Canvas } from "@react-three/fiber";
import type { CSSProperties, RefObject } from "react";
import { TrackedCharacter } from "../tracking/TrackedCharacter";
import { useMyAvatar } from "../profile/useMyAvatar";
import type { FaceState, PoseState, TrackingStatus } from "../tracking/useTracking";

const SIZE = 200; // 화면 크기(픽셀)
const CAMERA_WIDTH = Math.round((SIZE * 4) / 3); // 카메라 화면 너비. 웹캠이 640×480(4:3)이라 높이를 캐릭터 화면과 맞춥니다
const LOOK_AT_Y = 2.0; // 카메라가 바라보는 높이 (가슴과 머리 사이)
const CAMERA_DISTANCE = 4.5; // 팔을 옆으로 벌리거나 들어도 화면 안에 들어오는 거리

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>; // 트래킹이 읽는 웹캠 영상을 붙일 곳
  face: RefObject<FaceState>;
  pose: RefObject<PoseState>;
  status: TrackingStatus;
  message: string;
  showCamera?: boolean; // 기록 모드: 카메라 화면도 보여 줌
};

export function SelfView({ videoRef, face, pose, status, message, showCamera = false }: Props) {
  const { model } = useMyAvatar(); // 내 프로필에서 고른 캐릭터 (#131)
  // 트래킹이 읽는 영상 요소 하나를 그대로 씁니다. 기록 모드에서만 보이게 하고, 평소에는 화면에 보이지 않게 둡니다.
  const video = (
    <video ref={videoRef} muted playsInline style={showCamera ? styles.cameraVideo : styles.hiddenVideo} />
  );
  return (
    <div style={styles.wrap}>
      {showCamera && (
        <div style={{ ...styles.box, width: CAMERA_WIDTH }}>
          {video}
          {/* 거울처럼 좌우를 뒤집어 보여 줍니다. 녹화되는 영상은 뒤집지 않은 그대로입니다. */}
          <div style={styles.label}>카메라 (녹화되는 구도)</div>
        </div>
      )}
      <div style={{ ...styles.box, width: SIZE }}>
        {/* 머리부터 가슴, 양팔까지 보이도록 정면에서 비춥니다. */}
        <Canvas
          camera={{ position: [0, LOOK_AT_Y, CAMERA_DISTANCE], fov: 35 }}
          onCreated={({ camera }) => camera.lookAt(0, LOOK_AT_Y, 0)}
        >
          <ambientLight intensity={1.5} />
          <directionalLight position={[3, 5, 4]} intensity={1.5} />
          {model && <TrackedCharacter face={face} pose={pose} model={model} />}
        </Canvas>

        <div style={styles.label}>내 모습</div>
        {status !== "ready" && (
          <div
            style={{
              position: "absolute",
              inset: "auto 0 0 0",
              padding: "6px 10px",
              background: "rgba(0,0,0,.6)",
            }}
          >
            {status === "loading"
              ? "웹캠을 준비하는 중…"
              : `웹캠을 쓸 수 없어요. 브라우저의 카메라 권한을 확인해 주세요. (${message})`}
          </div>
        )}

        {/* 얼굴·팔 인식에만 쓰는 영상이라 평소에는 화면에 보이지 않게 둡니다. */}
        {!showCamera && video}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { position: "fixed", right: 16, bottom: 16, display: "flex", gap: 8 },
  box: {
    position: "relative",
    height: SIZE,
    borderRadius: 12,
    overflow: "hidden",
    background: "#20232a",
    boxShadow: "0 2px 8px rgba(0,0,0,.4)",
    color: "#fff",
    font: "12px/1.5 system-ui, sans-serif",
  },
  label: { position: "absolute", top: 6, left: 10, textShadow: "0 1px 2px rgba(0,0,0,.8)" },
  cameraVideo: { width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", display: "block" },
  hiddenVideo: { position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" },
};
