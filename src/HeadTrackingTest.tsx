// 6주 차 기술 검증: 웹캠 고개 각도 → 캐릭터 머리 회전, 눈 감김 감지
// 웹캠 영상은 이 브라우저 안에서만 처리되고 어디로도 전송되지 않습니다.
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import * as THREE from "three";

const MODEL_URL = "/models/character-a.glb";
const BLINK_TEXTURE_URL = "/models/Textures/texture-a-blink.png"; // 눈 감은 스킨
const HEAD_NODE = "head";
// package.json에 설치된 @mediapipe/tasks-vision 버전과 맞춰야 합니다.
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// 거울처럼 움직이게 하는 부호입니다. 방향이 반대로 보이면 1과 -1을 바꾸세요.
const YAW_SIGN = -1; // 좌우
const PITCH_SIGN = 1; // 위아래
const ROLL_SIGN = -1; // 갸웃
const BLINK_THRESHOLD = 0.5; // 이 값보다 크면 눈을 감은 것으로 봅니다.
const BLINK_OPEN_THRESHOLD = 0.35; // 이 값보다 작아져야 다시 뜬 것으로 봅니다. (깜빡거림 방지)

type FaceState = {
  found: boolean;
  yaw: number;
  pitch: number;
  roll: number;
  blink: number;
};

type Status = "loading" | "ready" | "error";

type EyeTextures = {
  material: THREE.MeshBasicMaterial;
  open: THREE.Texture;
  closed: THREE.Texture;
};

function useFaceTracking(videoRef: RefObject<HTMLVideoElement | null>) {
  const face = useRef<FaceState>({
    found: false,
    yaw: 0,
    pitch: 0,
    roll: 0,
    blink: 0,
  });
  const [status, setStatus] = useState<Status>("loading");
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

function Character({ face }: { face: RefObject<FaceState> }) {
  const { scene } = useGLTF(MODEL_URL);
  const eyes = useRef<EyeTextures | null>(null);
  const eyesClosed = useRef(false);

  // 눈 감은 스킨을 불러옵니다. 캐릭터 전체가 스킨 한 장을 같이 쓰므로 통째로 바꿔 끼웁니다.
  useEffect(() => {
    const head = scene.getObjectByName(HEAD_NODE);
    if (!(head instanceof THREE.Mesh)) return;
    const material = head.material as THREE.MeshBasicMaterial;
    const open = material.map;
    if (!open) return;

    const closed = new THREE.TextureLoader().load(BLINK_TEXTURE_URL, () => {
      eyes.current = { material, open, closed };
    });
    // 원래 스킨과 같은 방식으로 입혀지도록 설정을 그대로 맞춥니다.
    closed.flipY = open.flipY;
    closed.colorSpace = open.colorSpace;
    closed.wrapS = open.wrapS;
    closed.wrapT = open.wrapT;
    closed.minFilter = open.minFilter;
    closed.magFilter = open.magFilter;

    return () => {
      eyes.current = null;
      material.map = open;
      closed.dispose();
    };
  }, [scene]);

  useFrame((_, delta) => {
    const head = scene.getObjectByName(HEAD_NODE);
    if (!head) return;
    const state = face.current;

    // 눈: 감긴 정도에 따라 뜬 스킨과 감은 스킨을 바꿉니다.
    const limit = eyesClosed.current ? BLINK_OPEN_THRESHOLD : BLINK_THRESHOLD;
    eyesClosed.current = state.found && state.blink > limit;
    if (eyes.current) {
      const { material, open, closed } = eyes.current;
      const wanted = eyesClosed.current ? closed : open;
      if (material.map !== wanted) material.map = wanted;
    }

    // 얼굴을 놓치면 정면으로 천천히 돌아옵니다.
    const yaw = state.found ? state.yaw * YAW_SIGN : 0;
    const pitch = state.found ? state.pitch * PITCH_SIGN : 0;
    const roll = state.found ? state.roll * ROLL_SIGN : 0;
    // 떨림을 줄이기 위해 목표 각도로 부드럽게 따라갑니다.
    const follow = 1 - Math.exp(-12 * delta);
    head.rotation.order = "YXZ";
    head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, yaw, follow);
    head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, pitch, follow);
    head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, roll, follow);
  });

  return <primitive object={scene} />;
}

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
  const { face, status, message } = useFaceTracking(videoRef);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#20232a" }}>
      <Canvas camera={{ position: [0, 2.2, 5], fov: 35 }}>
        <ambientLight intensity={1.5} />
        <directionalLight position={[3, 5, 4]} intensity={1.5} />
        <Character face={face} />
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
      </div>

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

useGLTF.preload(MODEL_URL);
