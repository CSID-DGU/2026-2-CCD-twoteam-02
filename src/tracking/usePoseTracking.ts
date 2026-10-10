// 웹캠 Pose 트래킹: 양팔의 어깨·팔꿈치·손목 위치를 읽어 옵니다.
// 웹캠은 새로 켜지 않고 useFaceTracking 이 켜 둔 같은 <video> 를 읽습니다.
// 영상은 이 브라우저 안에서만 처리되고 어디로도 전송되지 않습니다.
//
// 결과는 매 프레임 바뀌므로 state 가 아니라 ref 에 담습니다. (useFaceTracking 과 같은 방식)
// 카메라 가이드라인(머리~가슴이 화면에 있는지)을 만들 때도 이 훅의 결과를 같이 쓰면
// Pose 를 두 번 돌리지 않아도 됩니다.
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { NormalizedLandmark, Landmark } from "@mediapipe/tasks-vision";
import { POSE_HZ } from "./armLogic";
import type { ArmJoints, Joint } from "./armLogic";

// package.json 에 설치된 @mediapipe/tasks-vision 버전과 맞춰야 합니다.
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
// 가벼운(lite) 모델. 얼굴 인식과 같이 돌리므로 정확도보다 속도를 택했습니다.
const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// MediaPipe Pose 관절 번호 (사용자 기준 왼쪽·오른쪽)
const LEFT = { shoulder: 11, elbow: 13, wrist: 15 };
const RIGHT = { shoulder: 12, elbow: 14, wrist: 16 };

export type PoseState = {
  found: boolean;
  left: ArmJoints | null; // 사용자 왼팔
  right: ArmJoints | null; // 사용자 오른팔
};

export type PoseStatus = "loading" | "ready" | "error";

export function usePoseTracking(videoRef: RefObject<HTMLVideoElement | null>) {
  const pose = useRef<PoseState>({ found: false, left: null, right: null });
  const [status, setStatus] = useState<PoseStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    let frameId = 0;
    let landmarker: PoseLandmarker | undefined;

    async function start() {
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      if (cancelled) return;
      setStatus("ready");

      let lastRun = 0;
      const loop = () => {
        if (cancelled || !landmarker) return;
        const video = videoRef.current;
        const now = performance.now();
        // 초당 POSE_HZ 번만 인식합니다. 웹캠이 아직 안 켜졌으면 기다립니다.
        if (video && video.readyState >= 2 && now - lastRun >= 1000 / POSE_HZ) {
          lastRun = now;
          const result = landmarker.detectForVideo(video, now);
          const world = result.worldLandmarks?.[0]; // 3D 위치(미터)
          const image = result.landmarks?.[0]; // 화면 위치. 잘 보이는 정도(visibility)를 여기서 읽습니다.
          const state = pose.current;
          if (world && image) {
            const joint = (i: number): Joint => toJoint(world[i], image[i]);
            const arm = (idx: typeof LEFT): ArmJoints => ({
              shoulder: joint(idx.shoulder),
              elbow: joint(idx.elbow),
              wrist: joint(idx.wrist),
            });
            state.found = true;
            state.left = arm(LEFT);
            state.right = arm(RIGHT);
          } else {
            state.found = false;
            state.left = null;
            state.right = null;
          }
        }
        frameId = requestAnimationFrame(loop);
      };
      loop();
    }

    start().catch((error: unknown) => {
      if (cancelled) return;
      // Pose 가 실패해도 얼굴 트래킹은 그대로 동작해야 하므로 화면을 멈추지 않고 알리기만 합니다.
      console.warn("팔 트래킹(Pose)을 시작하지 못했습니다:", error);
      setStatus("error");
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      landmarker?.close();
    };
  }, [videoRef]);

  return { pose, status };
}

function toJoint(world: Landmark, image: NormalizedLandmark): Joint {
  return { x: world.x, y: world.y, z: world.z, visibility: image.visibility ?? 0 };
}
