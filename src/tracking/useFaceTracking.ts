// 웹캠 얼굴 트래킹: 고개 각도와 눈 감김 정도를 읽어 옵니다.
// 웹캠 영상은 이 브라우저 안에서만 처리되고 어디로도 전송되지 않습니다.
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import * as THREE from "three";

// package.json에 설치된 @mediapipe/tasks-vision 버전과 맞춰야 합니다.
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export type FaceState = {
  found: boolean;
  yaw: number;
  pitch: number;
  roll: number;
  blink: number;
};

export type TrackingStatus = "loading" | "ready" | "error";

export function useFaceTracking(videoRef: RefObject<HTMLVideoElement | null>) {
  const face = useRef<FaceState>({
    found: false,
    yaw: 0,
    pitch: 0,
    roll: 0,
    blink: 0,
  });
  const [status, setStatus] = useState<TrackingStatus>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    let frameId = 0;
    let stream: MediaStream | undefined;
    let landmarker: FaceLandmarker | undefined;
    const matrix = new THREE.Matrix4();
    const euler = new THREE.Euler();

    async function start() {
      const video = videoRef.current;
      if (!video) return;

      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
      if (cancelled) return;
      video.srcObject = stream;
      await video.play();

      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
      if (cancelled) return;
      setStatus("ready");

      let lastVideoTime = -1;
      const loop = () => {
        if (cancelled || !landmarker) return;
        if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          const result = landmarker.detectForVideo(video, performance.now());
          const transform = result.facialTransformationMatrixes?.[0];
          const state = face.current;
          if (transform) {
            matrix.fromArray(transform.data);
            euler.setFromRotationMatrix(matrix, "YXZ");
            state.found = true;
            state.yaw = euler.y;
            state.pitch = euler.x;
            state.roll = euler.z;
            const shapes = result.faceBlendshapes?.[0]?.categories ?? [];
            const left =
              shapes.find((c) => c.categoryName === "eyeBlinkLeft")?.score ?? 0;
            const right =
              shapes.find((c) => c.categoryName === "eyeBlinkRight")?.score ??
              0;
            state.blink = (left + right) / 2;
          } else {
            state.found = false;
          }
        }
        frameId = requestAnimationFrame(loop);
      };
      loop();
    }

    start().catch((error: unknown) => {
      if (cancelled) return;
      setStatus("error");
      setMessage(error instanceof Error ? error.message : String(error));
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      stream?.getTracks().forEach((track) => track.stop());
      landmarker?.close();
    };
  }, [videoRef]);

  return { face, status, message };
}
