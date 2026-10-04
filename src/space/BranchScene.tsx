import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { PerspectiveCamera as PerspectiveCameraImpl } from "three";
import branch from "./branches/byeol.json";
import { CHAIR, KIOSK, SEAT, obstaclesOf, roomWalls, spotsOf } from "./layout";
import type { Spot } from "./layout";
import { Player } from "./Player";

const obstacles = obstaclesOf(branch);
const spots = spotsOf(branch);

// 창 크기가 바뀌어도 지점 전체가 화면에 들어오도록 배율을 맞춥니다.
function TopDownCamera() {
  const size = useThree((s) => s.size);
  const zoom = Math.min(
    size.width / (branch.size.w + 1),
    size.height / (branch.size.d + 1)
  );
  return (
    <OrthographicCamera
      makeDefault
      position={[0, 20, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      zoom={zoom}
    />
  );
}

const EYE_HEIGHT = 1.1; // 앉았을 때 눈높이
const SEAT_FOV = 60; // 1인칭 화면의 세로 시야각
const TRANSITION = 0.8; // 2D → 3D 전환 시간(초). 목표는 1초 이내입니다.
const START_HEIGHT = 7; // 전환을 시작하는 카메라 높이
const START_BACK = 3; // 전환을 시작할 때 자리 뒤로 물러난 거리
const SEAT_HEIGHT = 0.74; // 책상 높이

// 3D 좌석 모드: 앉은 자리에서 책상 쪽을 바라보는 1인칭 카메라.
// 자리 뒤쪽 위에서 시작해 눈높이로 내려앉으며 전환합니다.
function SeatCamera({ spot }: { spot: Spot }) {
  const cam = useRef<PerspectiveCameraImpl>(null!);
  const progress = useRef(0); // 0(시작) → 1(전환 끝)
  const pose = useMemo(() => {
    const fx = Math.sin(spot.rot), fz = Math.cos(spot.rot); // 책상 쪽 방향
    const endPos = new Vector3(spot.x, EYE_HEIGHT, spot.z);
    // 카메라는 기본으로 -Z를 보므로 반 바퀴 돌려 좌석 방향(+Z 기준)에 맞춥니다.
    const endQuat = new Quaternion().setFromEuler(new Euler(0, spot.rot + Math.PI, 0));
    const startPos = new Vector3(spot.x - fx * START_BACK, START_HEIGHT, spot.z - fz * START_BACK);
    const desk = new Vector3(spot.x + fx, SEAT_HEIGHT, spot.z + fz);
    const startQuat = new Quaternion().setFromRotationMatrix(
      new Matrix4().lookAt(startPos, desk, new Vector3(0, 1, 0))
    );
    return { startPos, startQuat, endPos, endQuat };
  }, [spot]);

  useFrame((_, delta) => {
    if (progress.current >= 1) return;
    progress.current = Math.min(1, progress.current + delta / TRANSITION);
    const k = 1 - (1 - progress.current) ** 3; // 처음엔 빠르게, 끝에서 천천히
    cam.current.position.lerpVectors(pose.startPos, pose.endPos, k);
    cam.current.quaternion.slerpQuaternions(pose.startQuat, pose.endQuat, k);
  });

  return (
    <PerspectiveCamera
      ref={cam}
      makeDefault
      fov={SEAT_FOV}
      near={0.05}
      position={pose.startPos}
      quaternion={pose.startQuat}
    />
  );
}

export function BranchScene() {
  const [near, setNear] = useState<number | null>(null); // 앉을 수 있는 좌석 번호
  const [seat, setSeat] = useState<number | null>(null); // 앉아 있는 좌석 번호
  const seatSpot = spots.find((c) => c.no === seat);
  const hint =
    seat !== null
      ? `${seat}번 좌석 · E 일어나기`
      : near !== null
        ? `${near}번 좌석 · E 앉기`
        : "";

  return (
    <>
    <Canvas>
      {seatSpot ? <SeatCamera key={seatSpot.no} spot={seatSpot} /> : <TopDownCamera />}
      <ambientLight intensity={1.2} />
      {/* 1인칭에서 면이 구분되도록 비스듬한 빛을 더합니다. */}
      <directionalLight position={[6, 12, 4]} intensity={0.8} />

      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[branch.size.w, branch.size.d]} />
        <meshStandardMaterial color="#e8e2d6" />
      </mesh>

      {[...branch.walls, ...branch.rooms.flatMap(roomWalls)].map((w, i) => (
        <mesh key={i} position={[w.x, 1.25, w.z]}>
          <boxGeometry args={[w.w, 2.5, w.d]} />
          <meshStandardMaterial color="#8a8f98" />
        </mesh>
      ))}

      {branch.seats.map((s) => (
        <mesh key={s.no} position={[s.x, 0.37, s.z]}>
          <boxGeometry args={[SEAT.w, 0.74, SEAT.d]} />
          <meshStandardMaterial color="#b98a5a" />
        </mesh>
      ))}

      {spots.map((c) => (
        <mesh key={c.no} position={[c.x, CHAIR.h / 2, c.z]}>
          <boxGeometry args={[CHAIR.w, CHAIR.h, CHAIR.d]} />
          <meshStandardMaterial
            color={c.no === seat || c.no === near ? "#f59e0b" : "#6b7280"}
          />
        </mesh>
      ))}

      {branch.rooms.map((r) => (
        <mesh
          key={r.no}
          position={[r.x, 0.01, r.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[r.w, r.d]} />
          <meshStandardMaterial color="#c9d6e3" />
        </mesh>
      ))}

      <mesh position={[branch.kiosk.x, 0.6, branch.kiosk.z]}>
        <boxGeometry args={[KIOSK.w, 1.2, KIOSK.d]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>

      <Player
        obstacles={obstacles}
        spawn={branch.spawn}
        spots={spots}
        onNear={setNear}
        onSeat={setSeat}
      />
    </Canvas>
    {hint && (
      <div
        style={{
          position: "fixed",
          left: "50%",
          bottom: 24,
          transform: "translateX(-50%)",
          padding: "8px 16px",
          borderRadius: 8,
          background: "rgba(32,35,42,.85)",
          color: "#fff",
          font: "14px system-ui, sans-serif",
        }}
      >
        {hint}
      </div>
    )}
    </>
  );
}
