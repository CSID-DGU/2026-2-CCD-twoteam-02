// 3D 좌석 모드의 "내 모습 화면": 웹캠 트래킹(고개·눈·팔)이 반영된 내 캐릭터를 구석에 작게 보여 줍니다.
// 웹캠 영상 자체는 화면에 나오지 않고, 이 브라우저 밖으로 전송되지도 않습니다.
//
// 트래킹은 바깥(src/study/SeatedStudy)에서 켜서 넘겨받습니다. 집중 타이머도 같은 결과를 쓰기 때문입니다.
import { Canvas } from "@react-three/fiber";
import type { RefObject } from "react";
import { TrackedCharacter } from "../tracking/TrackedCharacter";
import type { FaceState, TrackingStatus } from "../tracking/useFaceTracking";
import type { PoseState } from "../tracking/usePoseTracking";

const SIZE = 200; // 화면 크기(픽셀)
const LOOK_AT_Y = 2.0; // 카메라가 바라보는 높이 (가슴과 머리 사이)
const CAMERA_DISTANCE = 4.5; // 팔을 옆으로 벌리거나 들어도 화면 안에 들어오는 거리

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>; // 트래킹이 읽는 웹캠 영상을 붙일 곳
  face: RefObject<FaceState>;
  pose: RefObject<PoseState>;
  status: TrackingStatus;
  message: string;
};

export function SelfView({ videoRef, face, pose, status, message }: Props) {
  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        width: SIZE,
        height: SIZE,
        borderRadius: 12,
        overflow: "hidden",
        background: "#20232a",
        boxShadow: "0 2px 8px rgba(0,0,0,.4)",
        color: "#fff",
        font: "12px/1.5 system-ui, sans-serif",
      }}
    >
      {/* 머리부터 가슴, 양팔까지 보이도록 정면에서 비춥니다. */}
      <Canvas
        camera={{ position: [0, LOOK_AT_Y, CAMERA_DISTANCE], fov: 35 }}
        onCreated={({ camera }) => camera.lookAt(0, LOOK_AT_Y, 0)}
      >
        <ambientLight intensity={1.5} />
        <directionalLight position={[3, 5, 4]} intensity={1.5} />
        <TrackedCharacter face={face} pose={pose} />
      </Canvas>

      <div style={{ position: "absolute", top: 6, left: 10 }}>내 모습</div>
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

      {/* 얼굴·팔 인식에만 쓰는 영상이라 화면에는 보이지 않게 둡니다. */}
      <video
        ref={videoRef}
        muted
        playsInline
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />
    </div>
  );
}
