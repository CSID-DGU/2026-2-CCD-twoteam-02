import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from "three";
import type { PerspectiveCamera as PerspectiveCameraImpl } from "three";
import branch from "./branches/byeol.json";
import { CHAIR, KIOSK, SEAT, obstaclesOf, roomWalls, spotsOf } from "./layout";
import type { Spot } from "./layout";
import { FpsProbe, PerfReadout } from "./PerfReadout";
import KioskScreen from "../kiosk/KioskScreen";
import type { Perf } from "./PerfReadout";
import { Player } from "./Player";
import { WalkCamera } from "./WalkCamera";
import { SeatedStudy } from "../study/SeatedStudy";
import { MY_SEAT_COLOR, MySeatMarker } from "./MySeatMarker";
import { useMySeat } from "./useMySeat";
import { useSession } from "../auth/useSession";
import { useParticipants } from "../realtime/useParticipants";
import { OtherParticipants } from "../realtime/OtherParticipants";
import { useLocation } from "react-router";
import { currentCondition } from "../study/condition";
import { ProfileModal } from "../profile/ProfileModal";
import type { PresenceState } from "../realtime/participants";
import type { PresenceStatus } from "./status";

const obstacles = obstaclesOf(branch);
const initialPerf: Perf = { fps: null, minFps: null, transitionMs: null };
const spots = spotsOf(branch);
const VIEW_KEY = "KeyV"; // 위에서 보기 ↔ 1인칭 전환
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
const PITCH_UP = MathUtils.degToRad(15); // 앉아서 위로 볼 수 있는 각도
const PITCH_DOWN = MathUtils.degToRad(30); // 아래로 볼 수 있는 각도 (책상을 내려다보기 좋게 더 넓게)
const LOOK_SPEED = 0.005; // 마우스를 1픽셀 끌 때 도는 각도(라디안)
const KEY_LOOK_SPEED = 1.2; // WASD·방향키로 둘러볼 때 도는 빠르기(초당 라디안)
const LOOK_FOLLOW = 20; // 시점이 마우스를 따라가는 빠르기
const UP = new Vector3(0, 1, 0);

// 3D 좌석 모드: 앉은 자리에서 책상 쪽을 바라보는 1인칭 카메라.
// 자리 뒤쪽 위에서 시작해 눈높이로 내려앉으며 전환합니다.
// WASD·방향키나 마우스 끌기로 좌우 120도, 위 15도·아래 30도 범위에서 둘러봅니다. (#73)
// 앉아 있을 때는 몸이 움직이지 않으니 WASD 를 시점에 씁니다. 마우스는 잠그지 않습니다(타이머 버튼 등을 눌러야 해서).
function SeatCamera({ spot, onArrive, paused }: { spot: Spot; onArrive: () => void; paused: boolean }) {
  const cam = useRef<PerspectiveCameraImpl>(null!);
  const progress = useRef(0); // 0(시작) → 1(전환 끝)
  const yaw = useRef(0); // 정면에서 좌우로 돌린 각도 (+ 가 왼쪽)
  const pitch = useRef(0); // 위(+)·아래(-)로 기울인 각도
  const keys = useRef(new Set<string>());
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  const canvas = useThree((s) => s.gl.domElement);
  const pose = useMemo(() => {
    const fx = Math.sin(spot.rot), fz = Math.cos(spot.rot); // 책상 쪽 방향
    const endPos = new Vector3(spot.x, EYE_HEIGHT, spot.z);
    const startPos = new Vector3(spot.x - fx * START_BACK, START_HEIGHT, spot.z - fz * START_BACK);
    const desk = new Vector3(spot.x + fx, SEAT_HEIGHT, spot.z + fz);
    const startQuat = new Quaternion().setFromRotationMatrix(
      new Matrix4().lookAt(startPos, desk, UP)
    );
    // 매 프레임 새로 만들지 않도록 계산용 값을 미리 만들어 둡니다.
    return { startPos, startQuat, endPos, target: new Quaternion(), euler: new Euler(0, 0, 0, "YXZ") };
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
      yaw.current = MathUtils.clamp(yaw.current + e.movementX * LOOK_SPEED, -LOOK_LIMIT, LOOK_LIMIT);
      pitch.current = MathUtils.clamp(pitch.current + e.movementY * LOOK_SPEED, -PITCH_DOWN, PITCH_UP);
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

  // WASD·방향키로 둘러보기. 글자를 입력하는 중이면 무시하고, 창이 떠 있으면 돌지 않습니다.
  useEffect(() => {
    const pressed = keys.current;
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      pressed.add(e.code);
    };
    const up = (e: KeyboardEvent) => pressed.delete(e.code);
    const clear = () => pressed.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);

  useFrame((_, delta) => {
    const k = keys.current;
    if (!pausedRef.current) {
      const dt = Math.min(delta, 0.05);
      const turn = +(k.has("KeyA") || k.has("ArrowLeft")) - +(k.has("KeyD") || k.has("ArrowRight")); // 왼쪽 +
      const tilt = +(k.has("KeyW") || k.has("ArrowUp")) - +(k.has("KeyS") || k.has("ArrowDown")); // 위 +
      yaw.current = MathUtils.clamp(yaw.current + turn * KEY_LOOK_SPEED * dt, -LOOK_LIMIT, LOOK_LIMIT);
      pitch.current = MathUtils.clamp(pitch.current + tilt * KEY_LOOK_SPEED * dt, -PITCH_DOWN, PITCH_UP);
    }
    // 바라볼 방향 = 좌석 정면에서 좌우(yaw)로 돌리고 위아래(pitch)로 기울인 방향.
    // 카메라는 기본으로 -Z를 보므로 반 바퀴 돌려 좌석 방향(+Z 기준)에 맞춥니다.
    pose.euler.set(pitch.current, spot.rot + Math.PI + yaw.current, 0);
    pose.target.setFromEuler(pose.euler);

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
  // 걸어 다닐 때의 시점. 처음에는 1인칭으로 걷고, V 로 위에서 보기와 바꿉니다. (#71)
  const [view, setView] = useState<"top" | "first">("first");
  const pos = useRef({ x: branch.spawn.x, z: branch.spawn.z }); // 1인칭 카메라가 따라갈 내 위치
  const heading = useRef(Math.PI); // 1인칭에서 바라보는 방향. 처음에는 입구에서 안쪽(-Z)을 봅니다.
  const [locked, setLocked] = useState(false); // 1인칭에서 마우스가 잠겨 있는지 (마우스로 바라보는 중)
  const { mySeat, sessionId, setMySeat } = useMySeat(BRANCH_ID); // 키오스크에서 배정받은 내 자리
  const [studyStatus, setStudyStatus] = useState<PresenceStatus>("idle"); // 앉아 있을 때의 집중 상태
  const [studyDialogOpen, setStudyDialogOpen] = useState(false); // 공부 시작 창이 떠 있는지
  const [profileId, setProfileId] = useState<string | null>(null); // 캐릭터를 눌러 연 프로필 (계정 번호)
  const { session } = useSession();
  // 내 위치·상태를 담아 두는 곳. 매 프레임 바뀌므로 state 가 아니라 ref 에 둡니다.
  const me = useRef<PresenceState | null>(null);
  const others = useParticipants(BRANCH_ID, me); // 같은 지점의 다른 참여자 (실시간)
  // 사용자 실험 조건. hidden(캐릭터 숨김 모드)이면 다른 참여자를 그리지 않고 접속 인원 수만 보여 줍니다.
  // 실시간 연결·좌석 점유·내 트래킹·타이머·기록은 그대로 동작합니다.
  const { search } = useLocation();
  const [condition] = useState(() => currentCondition(search)); // 지점에 들어올 때 한 번 정합니다.
  useEffect(() => {
    console.info(`[실험 조건] ${condition === "hidden" ? "hidden (캐릭터 숨김 모드)" : "visible (캐릭터 보임)"}`);
  }, [condition]);
  // 다른 참여자가 앉아 있는 자리에는 앉을 수 없습니다.
  const taken = new Set(
    others.map((p) => p.seat).filter((no): no is number => no !== null),
  );
  const freeSpots = spots.filter((c) => !taken.has(c.no));
  const [perf, setPerf] = useState<Perf>(initialPerf); // 측정용 수치
  const seatedAt = useRef(0); // 앉기 키를 누른 시각

  // Player 가 매 프레임 알려 주는 위치로 내 상태를 갱신합니다. 보내는 주기는 훅이 알아서 늦춥니다.
  // 상태: 돌아다니면 idle(노란불), 앉아 있으면 집중 판정 결과(공부 시작 전에는 idle).
  const handleMove = (x: number, z: number) => {
    pos.current.x = x;
    pos.current.z = z;
    const id = session?.user.id;
    if (!id) return;
    me.current = {
      userId: id,
      x,
      z,
      seat,
      status: seat === null ? "idle" : studyStatus,
    };
  };

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
  // V 키로 시점을 바꿉니다. 글자를 입력하는 중이거나 키오스크가 떠 있으면 무시합니다.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== VIEW_KEY || e.repeat || kioskOpen || profileId) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      setView((v) => (v === "top" ? "first" : "top"));
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [kioskOpen, profileId]);

  const seatSpot = spots.find((c) => c.no === seat);
  const viewHint =
    view === "top" ? "V 1인칭으로" : locked ? "Esc 커서 보이기 · V 위에서 보기" : "클릭해서 둘러보기 · V 위에서 보기";
  const walkHint =
    seat !== null
      ? `${seat}번 좌석 · WASD·끌어서 둘러보기 · E 일어나기`
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
  const hint = kioskOpen || profileId ? "" : seat !== null ? walkHint : `${walkHint} · ${viewHint}`;

  return (
    <>
    <Canvas>
      {seatSpot ? (
        <SeatCamera
          key={seatSpot.no}
          spot={seatSpot}
          onArrive={handleArrive}
          paused={studyDialogOpen || profileId !== null}
        />
      ) : view === "first" ? (
        <WalkCamera
          posRef={pos}
          headingRef={heading}
          paused={kioskOpen || profileId !== null}
          onLockChange={setLocked}
        />
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

      {condition === "visible" && <OtherParticipants others={others} spots={spots} onSelect={setProfileId} />}

      <Player
        obstacles={obstacles}
        spawn={branch.spawn}
        spots={freeSpots}
        kiosk={branch.kiosk}
        frozen={kioskOpen || profileId !== null || (seat !== null && studyDialogOpen)}
        onNear={setNear}
        onSeat={handleSeat}
        onNearKiosk={setNearKiosk}
        onKiosk={() => setKioskOpen(true)}
        canSit={(no) => no === mySeat}
        onMove={handleMove}
        headingRef={view === "first" ? heading : undefined}
      />
    </Canvas>
    {seat !== null && session && (
      <SeatedStudy
        userId={session.user.id}
        sessionId={sessionId}
        condition={condition}
        onStatus={setStudyStatus}
        onDialogChange={setStudyDialogOpen}
      />
    )}
    <PerfReadout perf={perf} />
    {locked && seat === null && (
      // 조준점: 마우스가 잠겨 커서가 없을 때 화면 가운데가 클릭 위치입니다. (캐릭터를 누르면 프로필)
      <div
        style={{
          position: "fixed",
          left: "50%",
          top: "50%",
          width: 6,
          height: 6,
          marginLeft: -3,
          marginTop: -3,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 0 0 1.5px rgba(0,0,0,.6)",
          pointerEvents: "none",
        }}
      />
    )}
    {condition === "hidden" && (
      // 숨김 모드: 다른 사람은 안 보이고 몇 명이 있는지만 알 수 있습니다. (나 포함)
      <div
        style={{
          position: "fixed",
          top: 76,
          left: 16,
          padding: "6px 10px",
          borderRadius: 8,
          background: "rgba(32,35,42,.85)",
          color: "#fff",
          font: "13px system-ui, sans-serif",
        }}
      >
        이 지점 접속 인원 {others.length + 1}명
      </div>
    )}
    {/* 지점이 지금은 별다방 하나라 KioskScreen 의 기본 지점(branchId 1)을 씁니다. */}
    {profileId && session && (
      <ProfileModal userId={profileId} myId={session.user.id} onClose={() => setProfileId(null)} />
    )}
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
