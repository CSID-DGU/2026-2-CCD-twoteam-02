// 웹캠 트래킹을 한 곳에서 합니다: 얼굴(고개·눈)과 몸(Pose: 팔·카메라 가이드라인).
// 웹캠은 한 번만 켜고, 반복 하나에서 얼굴은 새 프레임마다, Pose는 초당 POSE_HZ번 인식합니다.
// 다른 탭으로 가서 페이지가 숨겨지면 화면 반복(requestAnimationFrame)이 멈추므로, 그동안은 워커 신호로
// HIDDEN_TICK_MS마다 한 번씩 인식합니다. (다른 탭·앱 사용함 + 다른 탭에서도 자리 이탈·졸음을 판정하기 위해)
// 휴대폰 감지(물체 감지)는 options.phone이 켜져 있을 때만 초당 PHONE_HZ번 합니다. (휴대폰·학습기기 사용함이 아닐 때만 필요)
// options.paused(공부 중지, #236)이면 웹캠을 완전히 끄고(카메라 불 꺼짐) 인식을 멈춥니다. 모델은 그대로 두고, 풀리면 웹캠만 다시 켭니다.
// 결과는 매 프레임 바뀌므로 state가 아니라 ref에 담고, 쓰는 곳(캐릭터·집중 판정·가이드라인)이 필요한 값만 가져갑니다.
// 웹캠 영상은 이 브라우저 안에서만 처리되고 어디로도 전송되지 않습니다.
// 배경 확인(카메라가 돌아갔는지)은 1초마다 영상을 작게 줄여 칸별 평균 밝기 숫자로만 읽고, 그림은 남기지 않습니다.
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { FaceLandmarker, FilesetResolver, ObjectDetector, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark, NormalizedLandmark } from "@mediapipe/tasks-vision";
import * as THREE from "three";
import { POSE_HZ, armDirection, pickTarget } from "./armLogic";
import { earOf } from "./eyeMetrics";
import type { ArmJoints, ArmTarget, Joint } from "./armLogic";
import { initialArmMotion, latestMotionMs, nextArmMotion } from "./bodyMotion";
import type { ArmMotion } from "./bodyMotion";
import { GUIDE_POINTS, isFramed } from "./poseFrame";
import { BG_SAMPLE_HEIGHT, BG_SAMPLE_WIDTH, cellMeans, compareBackground, personCells } from "./background";
import type { PosePoint } from "./poseFrame";
import { workerInterval } from "../lib/workerInterval";
import { MODEL_LOAD_ERROR } from "./cameraHelp";

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
// 숨긴 탭에서 인식하는 간격. 자리 이탈(60초)·졸음(21초)을 재기엔 1초면 충분하고, 한 번에 15~19ms라 부담이 적습니다. (시험 2026-10-16)
const HIDDEN_TICK_MS = 1000;
// 휴대폰 감지: MediaPipe 물체 감지 EfficientDet-Lite0 (COCO의 "cell phone"). 근거: docs/판정-기준-근거.md 8절, 측정 2026-10-16
// Lite0은 화면에 보이게 든 휴대폰을 96% 잡았고 Lite2(95%)와 비슷한데 더 가벼워서 골랐습니다.
const PHONE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite";
const PHONE_HZ = 1; // 제안서: 물체 인식은 초당 1~2회
const PHONE_MIN_SCORE = 0.3; // 보이게 든 휴대폰 96% 잡음, 휴대폰이 없을 때 잘못 잡은 것은 가장 길어도 1초 (0.5면 82%로 떨어짐)

export type FaceState = {
  found: boolean;
  yaw: number;
  pitch: number;
  roll: number;
  blink: number;
  jaw: number; // 입 벌린 정도(blendshape jawOpen, 0~1). 회의실 입 트래킹용 (#61)
  ear: number | null; // 눈 크기(EAR). 보정·눈 감음 판정용
  updatedAt: number | null; // 마지막으로 인식한 시각(Date.now). 오래되면 판정에서 "안 보임"으로 봅니다
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
  wristsInView: boolean; // 손목이 화면 아래쪽 안에 보이는지 (책상이 보이는 구도인지)
  lastMotionMs: number | null; // 팔이 마지막으로 움직인 시각(Date.now 기준, 집중 판정의 lastInputMs와 같은 시계). null = 아직 없음·Pose 없음
};

export type PhoneState = {
  found: boolean | null; // 휴대폰이 화면에 잡혔는지. null = 감지를 안 함(꺼짐·준비 전·오류) → 판정에서 무시
};

export type TrackingStatus = "loading" | "ready" | "error";

// options.phone: 휴대폰 감지를 켤지. 바꿔도 웹캠을 다시 켜지 않습니다(ref로 읽음).
// options.paused: 웹캠을 끄고 인식을 멈출지 (공부 중지)
export function useTracking(videoRef: RefObject<HTMLVideoElement | null>, options: { phone?: boolean; paused?: boolean } = {}) {
  const face = useRef<FaceState>({ found: false, yaw: 0, pitch: 0, roll: 0, blink: 0, jaw: 0, ear: null, updatedAt: null });
  const phone = useRef<PhoneState>({ found: null });
  const phoneWanted = useRef(false);
  const wantPhone = options.phone ?? false;
  useEffect(() => {
    phoneWanted.current = wantPhone;
  }, [wantPhone]);
  // 중지: 아래 반복이 읽는 값(pausedRef)과, 웹캠을 끄고 켜는 함수(camera, 반복을 준비할 때 채움)
  const pausedRef = useRef(false);
  const camera = useRef<{ pause: () => void; resume: () => void } | null>(null);
  const wantPaused = options.paused ?? false;
  useEffect(() => {
    pausedRef.current = wantPaused;
    if (wantPaused) camera.current?.pause();
    else camera.current?.resume();
  }, [wantPaused]);
  const pose = useRef<PoseState>({
    found: false, left: null, right: null, framed: null, guidePoints: null,
    bgSame: null, bgScore: null, bgSpread: null, bgCells: 0, wristsInView: false, lastMotionMs: null,
  });
  const [status, setStatus] = useState<TrackingStatus>("loading");
  const [message, setMessage] = useState("");
  const [errorName, setErrorName] = useState(""); // 웹캠을 못 켰을 때 오류 이름 (NotAllowedError 등, cameraHelp 가 원인을 나눔 #376)
  const [attempt, setAttempt] = useState(0); // 올리면 웹캠부터 인식 모델까지 처음부터 다시 준비 (#376 [다시 시도])
  const [poseStatus, setPoseStatus] = useState<TrackingStatus>("loading");

  useEffect(() => {
    const faceState = face.current;
    const poseState = pose.current;
    const phoneState = phone.current;
    let cancelled = false;
    let phoneDetector: ObjectDetector | undefined;
    let phoneLoading = false; // 모델을 불러오는 중이거나 실패해서 다시 시도하지 않음
    let frameId = 0;
    let stopHidden: (() => void) | undefined;
    let stream: MediaStream | undefined;
    let faceLandmarker: FaceLandmarker | undefined;
    let poseLandmarker: PoseLandmarker | undefined;
    const matrix = new THREE.Matrix4();
    const euler = new THREE.Euler();

    // 얼굴: 변환 행렬 → 고개 각도, blendshape → 눈 감긴 정도·입 벌린 정도
    function readFace(landmarker: FaceLandmarker, video: HTMLVideoElement, now: number) {
      const result = landmarker.detectForVideo(video, now);
      faceState.updatedAt = Date.now();
      const transform = result.facialTransformationMatrixes?.[0];
      if (!transform) {
        faceState.found = false;
        faceState.jaw = 0;
        faceState.ear = null;
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
      faceState.jaw = shapes.find((c) => c.categoryName === "jawOpen")?.score ?? 0; // 같은 결과에 이미 들어 있어 계산이 늘지 않음 (#61)
      faceState.ear = earOf(result.faceLandmarks?.[0], video.videoWidth || 640, video.videoHeight || 480);
    }

    // 팔 움직임(깨어 있음 신호): 팔마다 기준 관절(손목/팔꿈치)과 움직임 기록. 캐릭터 팔(useArmDirections)과 같은 관절 선택 규칙을 씁니다.
    const motionTargets: Record<"left" | "right", ArmTarget> = { left: null, right: null };
    const motions: Record<"left" | "right", ArmMotion> = { left: initialArmMotion, right: initialArmMotion };
    function readMotion() {
      const nowMs = Date.now(); // 집중 판정(Date.now)과 비교하므로 영상 시각(performance.now)이 아니라 이 시계를 씁니다.
      for (const side of ["left", "right"] as const) {
        const joints = poseState[side];
        motionTargets[side] = pickTarget(joints, motionTargets[side]);
        motions[side] = nextArmMotion(motions[side], armDirection(joints, motionTargets[side]), motionTargets[side], nowMs);
      }
      poseState.lastMotionMs = latestMotionMs(motions.left.lastMotionMs, motions.right.lastMotionMs);
    }

    // Pose: 팔 관절(3D 위치) + 가이드라인(코·양 어깨 화면 좌표) + 팔 움직임
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
      // 손목(15·16)이 화면 아래쪽 안에 있으면 책상이 보이는 구도 (보정 때 기록만 함)
      poseState.wristsInView =
        !!image && [image[15], image[16]].some((p) => p && p.x >= 0 && p.x <= 1 && p.y >= 0.5 && p.y <= 1);
      poseState.framed = isFramed(image);
      poseState.guidePoints = image ? GUIDE_POINTS.map((i) => image[i]) : null;
      readMotion();
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
      // 기준은 Pose와 얼굴 인식이 둘 다 사람을 볼 때만 바꿉니다.
      // Pose만 보면 벽 무늬를 사람으로 착각한 순간에 벽이 기준이 되어, 카메라가 돌아간 것을 놓칠 수 있습니다. (2026-10-15 측정)
      if (poseState.framed && faceState.found) {
        bgRef = cells;
        bgRefSkip = skip;
      }
    }

    // 웹캠 켜기. 켜는 동안 취소·중지되면 바로 다시 끕니다.
    async function openCamera(video: HTMLVideoElement) {
      const opened = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
      if (cancelled || pausedRef.current) {
        opened.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = opened;
      video.srcObject = stream;
      await video.play();
    }

    // 중지 동안 남은 인식 값으로 판정·표시하지 않게 "모름"으로 비웁니다.
    function clearResults() {
      faceState.found = false;
      faceState.jaw = 0;
      faceState.ear = null;
      faceState.updatedAt = null;
      poseState.found = false;
      poseState.left = null;
      poseState.right = null;
      poseState.framed = null;
      poseState.guidePoints = null;
      poseState.bgSame = null;
      poseState.lastMotionMs = null;
      phoneState.found = null;
    }

    async function start() {
      const video = videoRef.current;
      if (!video) return;

      let opening: Promise<void> | null = null;
      camera.current = {
        pause() {
          stream?.getTracks().forEach((track) => track.stop()); // 카메라 불이 꺼집니다.
          stream = undefined;
          video.srcObject = null;
          clearResults();
        },
        resume() {
          if (stream || opening) return;
          opening = openCamera(video)
            .catch((error: unknown) => {
              if (cancelled) return;
              setStatus("error");
              setMessage(error instanceof Error ? error.message : String(error));
              setErrorName(error instanceof Error ? error.name : "");
            })
            .finally(() => {
              opening = null;
            });
        },
      };

      if (!pausedRef.current) await openCamera(video);
      if (cancelled) return;

      // 인식 모델(인터넷에서 받음)을 못 불러오면 카메라 문제와 구분해 알립니다(#376, cameraHelp 의 'model')
      let fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
      try {
        fileset = await FilesetResolver.forVisionTasks(WASM_URL);
        faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        });
      } catch (error) {
        const wrapped = new Error(error instanceof Error ? error.message : String(error));
        wrapped.name = MODEL_LOAD_ERROR;
        throw wrapped;
      }
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
      // 인식 한 번. 보일 때는 화면 반복(loop)이, 숨겨졌을 때는 워커 신호가 부릅니다.
      const step = () => {
        if (cancelled || !faceLandmarker || pausedRef.current) return;
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
            poseState.lastMotionMs = null; // 움직임을 더 못 보므로 지난 값으로 깨어 있음을 주장하지 않게
            setPoseStatus("error");
          }
          readPhone(video, now);
        }
      };

      // 휴대폰: 켜져 있을 때만 초당 PHONE_HZ번. 모델은 처음 켜질 때 불러오고, 실패해도 다른 트래킹은 그대로 둡니다.
      let lastPhone = 0;
      const readPhone = (video: HTMLVideoElement, now: number) => {
        if (!phoneWanted.current) {
          phoneState.found = null;
          return;
        }
        if (!phoneDetector) {
          if (phoneLoading) return;
          phoneLoading = true;
          ObjectDetector.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: PHONE_MODEL_URL, delegate: "GPU" },
            runningMode: "VIDEO",
            categoryAllowlist: ["cell phone"],
            scoreThreshold: PHONE_MIN_SCORE,
            maxResults: 1,
          })
            .then((created) => {
              if (cancelled) created.close();
              else {
                phoneDetector = created;
                phoneLoading = false;
              }
            })
            .catch((error: unknown) => console.warn("휴대폰 감지를 시작하지 못했습니다. 다른 트래킹은 계속합니다:", error));
          return;
        }
        if (now - lastPhone < 1000 / PHONE_HZ) return;
        lastPhone = now;
        try {
          phoneState.found = phoneDetector.detectForVideo(video, now).detections.length > 0;
        } catch (error: unknown) {
          console.warn("휴대폰 감지가 멈췄습니다. 다른 트래킹은 계속합니다:", error);
          phoneDetector.close();
          phoneDetector = undefined; // phoneLoading은 true로 남겨 다시 시도하지 않습니다.
          phoneLoading = true;
          phoneState.found = null;
        }
      };
      const loop = () => {
        if (cancelled || !faceLandmarker) return;
        if (!document.hidden) step();
        frameId = requestAnimationFrame(loop);
      };
      loop();
      stopHidden = workerInterval(HIDDEN_TICK_MS, () => {
        if (document.hidden) step();
      });
    }

    start().catch((error: unknown) => {
      if (cancelled) return;
      setStatus("error");
      setMessage(error instanceof Error ? error.message : String(error));
      setErrorName(error instanceof Error ? error.name : "");
    });

    return () => {
      cancelled = true;
      camera.current = null;
      cancelAnimationFrame(frameId);
      stopHidden?.();
      stream?.getTracks().forEach((track) => track.stop());
      faceLandmarker?.close();
      poseLandmarker?.close();
      phoneDetector?.close();
      phoneState.found = null;
      poseState.framed = null; // 꺼진 뒤 남은 값으로 판정하지 않게
      poseState.guidePoints = null;
      poseState.bgSame = null;
      poseState.lastMotionMs = null;
    };
  }, [videoRef, attempt]);

  // 다시 시도 (#376): 권한을 허용했거나 다른 앱을 닫은 뒤 일어나지 않고 웹캠을 다시 켭니다.
  const retry = () => {
    setStatus("loading");
    setMessage("");
    setErrorName("");
    setAttempt((a) => a + 1);
  };

  return { face, pose, phone, status, message, errorName, retry, poseStatus };
}

function toJoint(world: Landmark, image: NormalizedLandmark): Joint {
  return { x: world.x, y: world.y, z: world.z, visibility: image.visibility ?? 0 };
}
