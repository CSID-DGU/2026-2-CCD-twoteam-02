// 카메라 가이드라인: 머리~가슴(코·양 어깨)이 화면 안에 있는지 MediaPipe Pose로 확인합니다.
// 웹캠은 useFaceTracking이 연 <video>를 같이 쓰고, 영상은 이 브라우저 밖으로 나가지 않습니다.
// 자세는 자주 바뀌지 않으므로 0.5초마다만 확인해 연산 부담을 줄입니다.
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { GUIDE_POINTS, isFramed } from "./poseFrame";
import type { PosePoint } from "./poseFrame";

// package.json에 설치된 @mediapipe/tasks-vision 버전과 맞춰야 합니다.
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
export const POSE_INTERVAL_MS = 500; // Pose 확인 간격 (제안서: 초당 1~2회)

export type PoseGuideState = {
  framed: boolean | null; // null = 아직 확인 못 함(모델 로딩 중·오류) → 판정에서 무시
  // 확인용: 마지막으로 본 코·양 어깨 (GUIDE_POINTS 순서). 사람을 못 찾으면 null
  points: (PosePoint | undefined)[] | null;
};

export type PoseGuideStatus = "loading" | "ready" | "error";

export function usePoseGuide(videoRef: RefObject<HTMLVideoElement | null>) {
  const pose = useRef<PoseGuideState>({ framed: null, points: null });
  const [status, setStatus] = useState<PoseGuideStatus>("loading");

  useEffect(() => {
    const state = pose.current;
    let cancelled = false;
    let timer = 0;
    let landmarker: PoseLandmarker | undefined;

    async function start() {
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      const created = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      if (cancelled) {
        created.close();
        return;
      }
      landmarker = created;
      setStatus("ready");

      timer = window.setInterval(() => {
        const video = videoRef.current;
        if (!landmarker || !video || video.readyState < 2) return; // 영상 준비 전엔 건너뜀
        const result = landmarker.detectForVideo(video, performance.now());
        const landmarks = result.landmarks[0];
        state.framed = isFramed(landmarks);
        state.points = landmarks ? GUIDE_POINTS.map((i) => landmarks[i]) : null;
      }, POSE_INTERVAL_MS);
    }

    start().catch(() => {
      if (cancelled) return;
      state.framed = null; // 모델 문제로 공부 시간이 멈추지 않게 판정에서 빼기
      state.points = null;
      setStatus("error");
    });

    return () => {
      cancelled = true;
      clearInterval(timer);
      landmarker?.close();
      state.framed = null;
      state.points = null;
    };
  }, [videoRef]);

  return { pose, status };
}
