import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from "three";
import type { PerspectiveCamera as PerspectiveCameraImpl } from "three";
import branch from "./branches/byeol.json";
import { CHAIR, KIOSK, SEAT, obstaclesOf, roomWalls, spotsOf } from "./layout";
import type { Spot } from "./layout";
import { DUMMIES } from "./dummies";
import { FpsProbe, PerfReadout } from "./PerfReadout";
import KioskScreen from "../kiosk/KioskScreen";
import type { Perf } from "./PerfReadout";
import { Player } from "./Player";
import { SeatedCharacter } from "./SeatedCharacter";
import { SelfView } from "./SelfView";
import { StatusMarker } from "./StatusMarker";
import { MY_SEAT_COLOR, MySeatMarker } from "./MySeatMarker";
import { useMySeat } from "./useMySeat";

const obstacles = obstaclesOf(branch);
const initialPerf: Perf = { fps: null, minFps: null, transitionMs: null };
const spots = spotsOf(branch);
const BRANCH_ID = 1; // DB의 별다방 지점 번호. 지점이 늘어나면 바깥에서 받습니다.

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
const LOOK_LIMIT = Math.PI / 3; // 좌우로 60도씩, 합쳐서 120도까지 둘러볼 수 있습니다.
const LOOK_SPEED = 0.005; // 마우스를 1픽셀 끌 때 도는 각도(라디안)
const LOOK_FOLLOW = 20; // 시점이 마우스를 따라가는 빠르기
const UP = new Vector3(0, 1, 0);

// 3D 좌석 모드: 앉은 자리에서 책상 쪽을 바라보는 1인칭 카메라.
// 자리 뒤쪽 위에서 시작해 눈높이로 내려앉으며 전환합니다.
// 마우스로 끌면 좌우 120도 범위에서 둘러봅니다.
function SeatCamera({ spot, onArrive }: { spot: Spot; onArrive: () => void }) {
  const cam = useRef<PerspectiveCameraImpl>(null!);
  const progress = useRef(0); // 0(시작) → 1(전환 끝)
  const yaw = useRef(0); // 정면에서 좌우로 돌린 각도
  const canvas = useThree((s) => s.gl.domElement);
  const pose = useMemo(() => {
    const fx = Math.sin(spot.rot), fz = Math.cos(spot.rot); // 책상 쪽 방향
    const endPos = new Vector3(spot.x, EYE_HEIGHT, spot.z);
    // 카메라는 기본으로 -Z를 보므로 반 바퀴 돌려 좌석 방향(+Z 기준)에 맞춥니다.
    const endQuat = new Quaternion().setFromEuler(new Euler(0, spot.rot + Math.PI, 0));
    const startPos = new Vector3(spot.x - fx * START_BACK, START_HEIGHT, spot.z - fz * START_BACK);
    const desk = new Vector3(spot.x + fx, SEAT_HEIGHT, spot.z + fz);
    const startQuat = new Quaternion().setFromRotationMatrix(
      new Matrix4().lookAt(startPos, desk, UP)
    );
    // 매 프레임 새로 만들지 않도록 계산용 값을 미리 만들어 둡니다.
    return { startPos, startQuat, endPos, endQuat, turn: new Quaternion(), target: new Quaternion() };
  }, [spot]);

  // 화면을 끌면 끄는 쪽으로 장면이 따라오도록 시점을 돌립니다.
  useEffect(() => {
    let dragging = false;
    const down = (e: PointerEvent) => {
      dragging = true;
      canvas.setPointerCapture(e.pointerId); // 화면 밖으로 나가도 끌기가 이어지게
      canvas.style.setProperty("cursor", "grabbing");
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      yaw.current = MathUtils.clamp(
        yaw.current + e.movementX * LOOK_SPEED,
        -LOOK_LIMIT,
        LOOK_LIMIT
      );
    };
    const up = () => {
      dragging = false;
      canvas.style.setProperty("cursor", "grab");
    };
    canvas.style.setProperty("cursor", "grab");
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      canvas.style.setProperty("cursor", "");
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, [canvas]);

  useFrame((_, delta) => {
    // 바라볼 방향 = 좌석 정면에서 yaw만큼 좌우로 돌린 방향
    pose.turn.setFromAxisAngle(UP, yaw.current);
    pose.target.multiplyQuaternions(pose.turn, pose.endQuat);

    if (progress.current < 1) {
      progress.current = Math.min(1, progress.current + delta / TRANSITION);
      if (progress.current === 1) onArrive(); // 전환이 끝난 순간을 알립니다. (측정용)
      const k = 1 - (1 - progress.current) ** 3; // 처음엔 빠르게, 끝에서 천천히
      cam.current.position.lerpVectors(pose.startPos, pose.endPos, k);
      cam.current.quaternion.slerpQuaternions(pose.startQuat, pose.target, k);
    } else {
      cam.current.quaternion.slerp(pose.target, 1 - Math.exp(-LOOK_FOLLOW * delta));
    }
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
  const [nearKiosk, setNearKiosk] = useState(false); // 키오스크를 쓸 수 있는 거리인지
  const [kioskOpen, setKioskOpen] = useState(false); // 키오스크 화면이 떠 있는지
  const { mySeat, setMySeat } = useMySeat(BRANCH_ID); // 키오스크에서 배정받은 내 자리
  // 임시 참여자는 DB에 없으므로, 내가 배정받은 자리에 앉아 있으면 비켜 줍니다.
  const dummies = DUMMIES.filter((d) => d.seat !== mySeat);
  // 다른 참여자가 앉아 있는 자리에는 앉을 수 없습니다.
  const taken = new Set(dummies.map((d) => d.seat));
  const freeSpots = spots.filter((c) => !taken.has(c.no));
  const [perf, setPerf] = useState<Perf>(initialPerf); // 측정용 수치
  const seatedAt = useRef(0); // 앉기 키를 누른 시각

  const handleSeat = (no: number | null) => {
    if (no !== null) seatedAt.current = performance.now();
    setSeat(no);
  };
  const handleArrive = () => {
    const transitionMs = performance.now() - seatedAt.current;
    setPerf((p) => ({ ...p, transitionMs }));
  };
  const handleFps = (fps: number, warm: boolean) => {
    setPerf((p) => ({
      ...p,
      fps,
      minFps: warm ? Math.min(p.minFps ?? fps, fps) : p.minFps,
    }));
  };
  const seatSpot = spots.find((c) => c.no === seat);
  const hint = kioskOpen
    ? ""
    : seat !== null
      ? `${seat}번 좌석 · 끌어서 둘러보기 · E 일어나기`
      : near !== null
        ? near === mySeat
          ? `${near}번 좌석 (내 자리) · E 앉기`
          : mySeat === null
            ? `${near}번 좌석 · 키오스크에서 자리를 먼저 지정하세요`
            : `${near}번 좌석 · 내 자리(${mySeat}번)가 아니에요`
        : nearKiosk
          ? "키오스크 · E 사용하기"
          : mySeat === null
            ? "키오스크에서 자리를 지정하세요"
            : `${mySeat}번 좌석이 내 자리예요 · 파란 의자로 가세요`;

  return (
    <>
    <Canvas>
      {seatSpot ? (
        <SeatCamera key={seatSpot.no} spot={seatSpot} onArrive={handleArrive} />
      ) : (
        <TopDownCamera />
      )}
      <FpsProbe onSample={handleFps} />
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
            color={
              c.no === seat || c.no === near
                ? "#f59e0b"
                : c.no === mySeat
                  ? MY_SEAT_COLOR
                  : "#6b7280"
            }
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

      {/* 앉아 있을 때는 내 자리 표시가 시야를 가리므로 숨깁니다. */}
      {mySeat !== null && seat === null && (() => {
        const desk = branch.seats.find((s) => s.no === mySeat);
        return desk && <MySeatMarker x={desk.x} z={desk.z} />;
      })()}

      {dummies.map((d) => {
        const spot = spots.find((c) => c.no === d.seat);
        if (!spot) return null;
        return (
          <group key={d.seat}>
            <SeatedCharacter spot={spot} model={d.model} />
            <StatusMarker x={spot.x} z={spot.z} status={d.status} />
          </group>
        );
      })}

      <Player
        obstacles={obstacles}
        spawn={branch.spawn}
        spots={freeSpots}
        kiosk={branch.kiosk}
        frozen={kioskOpen}
        onNear={setNear}
        onSeat={handleSeat}
        onNearKiosk={setNearKiosk}
        onKiosk={() => setKioskOpen(true)}
        canSit={(no) => no === mySeat}
      />
    </Canvas>
    {seat !== null && <SelfView />}
    <PerfReadout perf={perf} />
    {/* 지점이 지금은 별다방 하나라 KioskScreen 의 기본 지점(branchId 1)을 씁니다. */}
    {kioskOpen && (
      <KioskScreen
        branchId={BRANCH_ID}
        onClose={() => setKioskOpen(false)}
        onAssigned={setMySeat}
      />
    )}
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
