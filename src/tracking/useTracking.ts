// 웹캠 트래킹을 한 곳에서 합니다: 얼굴(고개·눈)과 몸(Pose: 팔·카메라 가이드라인).
// 웹캠은 한 번만 켜고, 반복 하나에서 얼굴은 새 프레임마다, Pose는 초당 POSE_HZ번 인식합니다.
// 결과는 매 프레임 바뀌므로 state가 아니라 ref에 담고, 쓰는 곳(캐릭터·집중 판정·가이드라인)이 필요한 값만 가져갑니다.
// 웹캠 영상은 이 브라우저 안에서만 처리되고 어디로도 전송되지 않습니다.
// 배경 확인(카메라가 돌아갔는지)은 1초마다 영상을 작게 줄여 칸별 평균 밝기 숫자로만 읽고, 그림은 남기지 않습니다.
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { FaceLandmarker, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark, NormalizedLandmark } from "@mediapipe/tasks-vision";
import * as THREE from "three";
import { POSE_HZ } from "./armLogic";
import type { ArmJoints, Joint } from "./armLogic";
import { GUIDE_POINTS, isFramed } from "./poseFrame";
import { BG_SAMPLE_HEIGHT, BG_SAMPLE_WIDTH, cellMeans, compareBackground, personCells } from "./background";
import type { PosePoint } from "./poseFrame";

// package.json에 설치된 @mediapipe/tasks-vision 버전과 맞춰야 합니다.
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
// 가벼운(lite) 모델. 얼굴 인식과 같이 돌리므로 정확도보다 속도를 택했습니다.
const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// MediaPipe Pose 관절 번호 (사용자 기준 왼쪽·오른쪽)
const LEFT = { shoulder: 11, elbow: 13, wrist: 15 };
const RIGHT = { shoulder: 12, elbow: 14, wrist: 16 };
const BG_INTERVAL_MS = 1000; // 배경 확인 간격 (제안서: 가이드라인 확인은 초당 1~2회)

export type FaceState = {
  found: boolean;
  yaw: number;
  pitch: number;
  roll: number;
  blink: number;
};

export type PoseState = {
  found: boolean; // 사람(몸)을 찾았는지
  left: ArmJoints | null; // 사용자 왼팔
  right: ArmJoints | null; // 사용자 오른팔
  framed: boolean | null; // 머리~가슴(코·양 어깨)이 화면 안인지. null = Pose 준비 전·오류 → 판정에서 무시
  guidePoints: (PosePoint | undefined)[] | null; // 확인용: 코·양 어깨 화면 좌표 (GUIDE_POINTS 순서)
  bgSame: boolean | null; // 배경이 기준과 같은지. null = 믿을 수 없음(기준 없음·무늬 없음)
  bgScore: number | null; // 확인용: 기준 배경과 닮은 정도(상관계수)
  bgSpread: number | null; // 확인용: 기준 배경 무늬의 퍼짐(밝기 표준편차)
  bgCells: number; // 확인용: 사람 칸을 빼고 실제로 비교한 칸 수
};

export type TrackingStatus = "loading" | "ready" | "error";

export function useTracking(videoRef: RefObject<HTMLVideoElement | null>) {
  const face = useRef<FaceState>({ found: false, yaw: 0, pitch: 0, roll: 0, blink: 0 });
  const pose = useRef<PoseState>({
    found: false, left: null, right: null, framed: null, guidePoints: null,
    bgSame: null, bgScore: null, bgSpread: null, bgCells: 0,
  });
  const [status, setStatus] = useState<TrackingStatus>("loading");
  const [message, setMessage] = useState("");
  const [poseStatus, setPoseStatus] = useState<TrackingStatus>("loading");

  useEffect(() => {
    const faceState = face.current;
    const poseState = pose.current;
    let cancelled = false;
    let frameId = 0;
    let stream: MediaStream | undefined;
    let faceLandmarker: FaceLandmarker | undefined;
    let poseLandmarker: PoseLandmarker | undefined;
    const matrix = new THREE.Matrix4();
    const euler = new THREE.Euler();

    // 얼굴: 변환 행렬 → 고개 각도, blendshape → 눈 감긴 정도
    function readFace(landmarker: FaceLandmarker, video: HTMLVideoElement, now: number) {
      const result = landmarker.detectForVideo(video, now);
      const transform = result.facialTransformationMatrixes?.[0];
      if (!transform) {
        faceState.found = false;
        return;
      }
      matrix.fromArray(transform.data);
      euler.setFromRotationMatrix(matrix, "YXZ");
      faceState.found = true;
      faceState.yaw = euler.y;
      faceState.pitch = euler.x;
      faceState.roll = euler.z;
      const shapes = result.faceBlendshapes?.[0]?.categories ?? [];
      const left = shapes.find((c) => c.categoryName === "eyeBlinkLeft")?.score ?? 0;
      const right = shapes.find((c) => c.categoryName === "eyeBlinkRight")?.score ?? 0;
      faceState.blink = (left + right) / 2;
    }

    // Pose: 팔 관절(3D 위치) + 가이드라인(코·양 어깨 화면 좌표)
    function readPose(landmarker: PoseLandmarker, video: HTMLVideoElement, now: number) {
      const result = landmarker.detectForVideo(video, now);
      const world = result.worldLandmarks?.[0]; // 3D 위치(미터)
      const image = result.landmarks?.[0]; // 화면 위치(0~1)
      if (world && image) {
        const joint = (i: number): Joint => toJoint(world[i], image[i]);
        const arm = (idx: typeof LEFT): ArmJoints => ({
          shoulder: joint(idx.shoulder),
          elbow: joint(idx.elbow),
          wrist: joint(idx.wrist),
        });
        poseState.found = true;
        poseState.left = arm(LEFT);
        poseState.right = arm(RIGHT);
      } else {
        poseState.found = false;
        poseState.left = null;
        poseState.right = null;
      }
      poseState.framed = isFramed(image);
      poseState.guidePoints = image ? GUIDE_POINTS.map((i) => image[i]) : null;
    }

    // 배경: 영상을 작게 줄여 칸별 밝기만 읽고, 머리~가슴이 화면 안인 동안은 그 배경을 기준으로 삼습니다.
    // (사용자가 카메라를 옮긴 뒤 다시 제대로 앉으면 새 배경이 기준이 됨)
    const canvas = document.createElement("canvas");
    canvas.width = BG_SAMPLE_WIDTH;
    canvas.height = BG_SAMPLE_HEIGHT;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    let bgRef: number[] | null = null;
    let bgRefSkip: boolean[] | null = null;

    function readBackground(video: HTMLVideoElement) {
      if (!context) return;
      context.drawImage(video, 0, 0, BG_SAMPLE_WIDTH, BG_SAMPLE_HEIGHT);
      const { data } = context.getImageData(0, 0, BG_SAMPLE_WIDTH, BG_SAMPLE_HEIGHT);
      const cells = cellMeans(data, BG_SAMPLE_WIDTH, BG_SAMPLE_HEIGHT);
      const skip = personCells(poseState.found ? poseState.guidePoints : null);
      const result = compareBackground(bgRef, bgRefSkip, cells, skip);
      poseState.bgSame = result.same;
      poseState.bgScore = result.score;
      poseState.bgSpread = result.spread;
      poseState.bgCells = result.cells;
      if (poseState.framed) {
        bgRef = cells;
        bgRefSkip = skip;
      }
    }

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
      faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
      if (cancelled) return;
      setStatus("ready");

      // Pose는 따로 준비합니다. 실패해도 얼굴 트래킹은 그대로 동작해야 하므로 기다리지 않고 알리기만 합니다.
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
      })
        .then((created) => {
          if (cancelled) {
            created.close();
            return;
          }
          poseLandmarker = created;
          setPoseStatus("ready");
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          console.warn("Pose(팔·가이드라인)를 시작하지 못했습니다:", error);
          setPoseStatus("error");
        });

      let lastVideoTime = -1;
      let lastPose = 0;
      let lastBackground = 0;
      const loop = () => {
        if (cancelled || !faceLandmarker) return;
        if (video.readyState >= 2) {
          const now = performance.now();
          if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            readFace(faceLandmarker, video, now);
          }
          // Pose·배경은 오류가 나도 얼굴 트래킹(같은 반복)이 멈추지 않게 따로 잡아서 Pose만 끕니다.
          try {
            // Pose는 초당 POSE_HZ번만 인식합니다.
            if (poseLandmarker && now - lastPose >= 1000 / POSE_HZ) {
              lastPose = now;
              readPose(poseLandmarker, video, now);
            }
            // 배경은 Pose 결과(사람 위치)가 있어야 비교할 수 있어 Pose가 준비된 뒤에만 봅니다.
            if (poseLandmarker && now - lastBackground >= BG_INTERVAL_MS) {
              lastBackground = now;
              readBackground(video);
            }
          } catch (error: unknown) {
            console.warn("Pose(팔·가이드라인)가 멈췄습니다. 얼굴 트래킹은 계속합니다:", error);
            poseLandmarker?.close();
            poseLandmarker = undefined;
            poseState.found = false;
            poseState.left = null;
            poseState.right = null;
            poseState.framed = null; // 판정·팝업에서 빼기
            poseState.guidePoints = null;
            poseState.bgSame = null;
            setPoseStatus("error");
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
      faceLandmarker?.close();
      poseLandmarker?.close();
      poseState.framed = null; // 꺼진 뒤 남은 값으로 판정하지 않게
      poseState.guidePoints = null;
      poseState.bgSame = null;
    };
  }, [videoRef]);

  return { face, pose, status, message, poseStatus };
}

function toJoint(world: Landmark, image: NormalizedLandmark): Joint {
  return { x: world.x, y: world.y, z: world.z, visibility: image.visibility ?? 0 };
}
