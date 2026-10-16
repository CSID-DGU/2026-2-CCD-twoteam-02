import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from "three";
import type { PerspectiveCamera as PerspectiveCameraImpl } from "three";
import { BRANCH_LAYOUTS, DEFAULT_BRANCH } from "./branches";
import { CHAIR, KIOSK, SEAT, obstaclesOf, roomWalls, spotsOf } from "./layout";
import type { BranchLayout, Spot } from "./layout";
import { useBranchInfo } from "./useBranchInfo";
import type { BranchInfo } from "./useBranchInfo";
import { supabase } from "../lib/supabase";
import { LABEL_PX, labelTexture } from "./labelTexture";
import { FpsProbe, PerfReadout } from "./PerfReadout";
import KioskScreen from "../kiosk/KioskScreen";
import SeatTimeCorner from "../kiosk/SeatTimeCorner"; // 남은 시간·연장 (#38)
import type { Perf } from "./PerfReadout";
import { Player } from "./Player";
import { WalkCamera } from "./WalkCamera";
import { SeatedStudy } from "../study/SeatedStudy";
import { MY_SEAT_COLOR, MySeatMarker } from "./MySeatMarker";
import { useMySeat } from "./useMySeat";
import { useSession } from "../auth/useSession";
import { useMyAvatar } from "../profile/useMyAvatar";
import { useParticipants } from "../realtime/useParticipants";
import { OtherParticipants } from "../realtime/OtherParticipants";
import { useLocation } from "react-router";
import { currentCondition } from "../study/condition";
import { InfoPanel } from "../menu/InfoPanel";
import { SceneMenu } from "../menu/SceneMenu";
import type { PanelView } from "../menu/panelTypes";
import type { PresenceState } from "../realtime/participants";
import { headAngles, nextEyesClosed } from "../tracking/faceSync";
import { characterArms } from "../tracking/armLogic";
import type { Direction } from "../tracking/armLogic";
import type { MyTracking } from "../study/SeatedStudy";
import type { PresenceStatus } from "./status";

const initialPerf: Perf = { fps: null, minFps: null, transitionMs: null };
const VIEW_KEY = "KeyV"; // 위에서 보기 ↔ 1인칭 전환
const NO_KIOSK = { x: 1000, z: 1000 }; // 키오스크가 없는 지점(카페). 걸어서 닿을 수 없는 자리를 줘서 감지가 일어나지 않게 합니다.
const BAR_HEIGHT = 1.0; // 커피 바 카운터 높이

// 창 크기가 바뀌어도 지점 전체가 화면에 들어오도록 배율을 맞춥니다.
function TopDownCamera({ area }: { area: { w: number; d: number } }) {
  const size = useThree((s) => s.size);
  const zoom = Math.min(
    size.width / (area.w + 1),
    size.height / (area.d + 1)
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

// 지점 화면: 주소의 ?branch= 값(별다방 byeol, 솔카페 sol)으로 배치와 DB 지점 정보를 찾아 그립니다. (#44)
export function BranchScene() {
  const { search } = useLocation();
  const slug = new URLSearchParams(search).get("branch") ?? DEFAULT_BRANCH;
  const layout = BRANCH_LAYOUTS[slug];
  const { info, loading, error } = useBranchInfo(slug);

  if (!layout || (!loading && !info)) {
    return <Notice text={!layout ? "없는 지점이에요." : error} />;
  }
  if (!info) return <Notice text="지점에 들어가는 중…" />;
  // key: 지점이 바뀌면 화면을 새로 그립니다(위치·자리·실시간 연결을 지점마다 따로).
  return <BranchSpace key={slug} branch={layout} info={info} />;
}

function Notice({ text }: { text: string }) {
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%", background: "#16181d", color: "#fff", font: "15px system-ui, sans-serif" }}>
      {text}
    </div>
  );
}

function BranchSpace({ branch, info }: { branch: BranchLayout; info: BranchInfo }) {
  const BRANCH_ID = info.id;
  const isCafe = info.kind === "cafe"; // 카페: 키오스크 없이 빈자리에 앉으면 내 자리, 일어나면 놓음
  const obstacles = useMemo(() => obstaclesOf(branch), [branch]);
  const spots = useMemo(() => spotsOf(branch), [branch]);
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
  // 지점 위에 띄운 창(내 기록·친구·프로필). 페이지를 옮기지 않아 닫으면 자리·타이머가 그대로입니다. (#70)
  const [panel, setPanel] = useState<PanelView | null>(null);
  const panelOpen = panel !== null;
  const { session } = useSession();
  const { model: myModel } = useMyAvatar(); // 내 프로필에서 고른 캐릭터 (#131). 읽기 전에는 null
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

  // 앉아 있는 동안 내 트래킹 결과. 고개 각도·눈 감김·팔을 다른 참여자에게 보내는 데 씁니다. (#129)
  const myTracking = useRef<MyTracking | null>(null);
  const myEyesClosed = useRef(false);
  const handleTracking = useCallback((tracking: MyTracking | null) => {
    myTracking.current = tracking;
  }, []);

  // Player 가 매 프레임 알려 주는 위치로 내 상태를 갱신합니다. 보내는 주기는 훅이 알아서 늦춥니다.
  // 상태: 돌아다니면 idle(노란불), 앉아 있으면 집중 판정 결과(공부 시작 전에는 idle).
  const handleMove = (x: number, z: number, h: number) => {
    pos.current.x = x;
    pos.current.z = z;
    const id = session?.user.id;
    if (!id) return;
    // 앉아 있을 때만 고개·눈(얼굴을 찾았을 때)과 팔을 싣습니다. 다른 사람 화면에서는 거울이 아니라 실제 방향입니다.
    const tracking = seat === null ? null : myTracking.current;
    const face = tracking?.face.current ?? null;
    const angles = face ? headAngles(face, false) : null;
    myEyesClosed.current = face ? nextEyesClosed(myEyesClosed.current, face) : false;
    const arms = tracking ? characterArms(tracking.arms.current, false) : null;
    const vec = (d: Direction | null): [number, number, number] | null => (d ? [d.x, d.y, d.z] : null);
    me.current = {
      userId: id,
      x,
      z,
      h,
      seat,
      status: seat === null ? "idle" : studyStatus,
      ...(angles ? { head: [angles.yaw, angles.pitch, angles.roll], eyes: myEyesClosed.current } : {}),
      ...(arms ? { arms: [vec(arms.armLeft), vec(arms.armRight)] } : {}),
    };
  };

  // ── 카페: 빈자리에 앉으면 내 자리, 일어나면 놓기 (#44) ──
  // 앉기 전에 DB에 자리를 잡아 봅니다(sit_cafe_seat, 0014). 두 사람이 동시에 눌러도 DB가 한 명만 통과시킵니다.
  // 잡히면 Player 에게 앉으라고 알리고(sitRequest), 실패하면 안내를 띄웁니다.
  const sitRequest = useRef<number | null>(null);
  const [cafeMessage, setCafeMessage] = useState(""); // 잠깐 보여 줄 안내 (다른 사람이 먼저 앉음 등)
  const [conflict, setConflict] = useState<{ message: string; seatNo: number } | null>(null); // 다른 자리를 쓰는 중
  const claimSeat = async (no: number) => {
    const { error } = await supabase.rpc("sit_cafe_seat", { p_branch_id: BRANCH_ID, p_seat_number: no });
    if (error) {
      // DT001: 다른 자리(예: 별다방 7번)를 이용 중. 반납하고 앉기 버튼을 띄웁니다.
      if (error.code === "DT001") setConflict({ message: error.message, seatNo: no });
      else setCafeMessage(error.message);
      return;
    }
    setCafeMessage("");
    setMySeat(no);
    sitRequest.current = no;
  };
  const releaseAndSit = async () => {
    if (!conflict) return;
    const no = conflict.seatNo;
    setConflict(null);
    const { error } = await supabase.rpc("release_my_place"); // 0008: 쓰고 있던 자리 반납
    if (error) {
      setCafeMessage(`반납하지 못했어요: ${error.message}`);
      return;
    }
    await claimSeat(no);
  };
  useEffect(() => {
    if (!cafeMessage) return;
    const t = setTimeout(() => setCafeMessage(""), 4000);
    return () => clearTimeout(t);
  }, [cafeMessage]);

  // 카페 자리는 앉아 있는 동안만 내 것입니다. 지점을 나가거나 창을 닫으면 놓고,
  // 들어올 때는 지난번에 놓지 못한 자리가 남아 있으면 정리합니다.
  const seatedRef = useRef(false);
  useEffect(() => {
    seatedRef.current = seat !== null;
  }, [seat]);
  useEffect(() => {
    if (!isCafe) return;
    void supabase.rpc("leave_cafe_seat").then(() => setMySeat(null));
    const leave = () => {
      if (seatedRef.current) void supabase.rpc("leave_cafe_seat");
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [isCafe, setMySeat]);

  const handleSeat = (no: number | null) => {
    if (no !== null) seatedAt.current = performance.now();
    // 카페에서 일어나면 자리를 놓습니다.
    if (no === null && isCafe) void supabase.rpc("leave_cafe_seat").then(() => setMySeat(null));
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
      if (e.code !== VIEW_KEY || e.repeat || kioskOpen || panelOpen) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      setView((v) => (v === "top" ? "first" : "top"));
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [kioskOpen, panelOpen]);

  const seatSpot = spots.find((c) => c.no === seat);
  const viewHint =
    view === "top" ? "V 1인칭으로" : locked ? "Esc 커서 보이기 · V 위에서 보기" : "클릭해서 둘러보기 · V 위에서 보기";
  const walkHint =
    seat !== null
      ? `${seat}번 좌석 · WASD·끌어서 둘러보기 · E 일어나기`
      : isCafe
        ? near !== null
          ? `${near}번 좌석 · E 앉기`
          : "빈자리에서 E로 앉기"
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
  const hint = kioskOpen || panelOpen || conflict ? "" : cafeMessage ? cafeMessage : seat !== null ? walkHint : `${walkHint} · Shift 달리기 · ${viewHint}`;

  return (
    <>
    <Canvas>
      {seatSpot ? (
        <SeatCamera
          key={seatSpot.no}
          spot={seatSpot}
          onArrive={handleArrive}
          paused={studyDialogOpen || panelOpen}
        />
      ) : view === "first" ? (
        <WalkCamera
          posRef={pos}
          headingRef={heading}
          paused={kioskOpen || panelOpen || conflict !== null}
          onLockChange={setLocked}
        />
      ) : (
        <TopDownCamera area={branch.size} />
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

      {branch.kiosk && (
        <mesh position={[branch.kiosk.x, 0.6, branch.kiosk.z]}>
          <boxGeometry args={[KIOSK.w, 1.2, KIOSK.d]} />
          <meshStandardMaterial color="#22c55e" />
        </mesh>
      )}

      {/* 커피 바(카페): 보이고 부딪히기만 하고 기능은 아직 없습니다. */}
      {branch.bar && (
        <group>
          <mesh position={[branch.bar.x, BAR_HEIGHT / 2, branch.bar.z]}>
            <boxGeometry args={[branch.bar.w, BAR_HEIGHT, branch.bar.d]} />
            <meshStandardMaterial color="#7c5a3a" />
          </mesh>
          <Billboard position={[branch.bar.x, BAR_HEIGHT + 0.6, branch.bar.z]}>
            <mesh>
              <planeGeometry args={[1.4, (1.4 * LABEL_PX.h) / LABEL_PX.w]} />
              <meshBasicMaterial map={labelTexture("커피 바", "#5b3d22")} transparent />
            </mesh>
          </Billboard>
        </group>
      )}

      {/* 앉아 있을 때는 내 자리 표시가 시야를 가리므로 숨깁니다. 카페는 앉아 있는 동안만 내 자리라 표시하지 않습니다. */}
      {!isCafe && mySeat !== null && seat === null && (() => {
        const desk = branch.seats.find((s) => s.no === mySeat);
        return desk && <MySeatMarker x={desk.x} z={desk.z} />;
      })()}

      {condition === "visible" && <OtherParticipants others={others} spots={spots} onSelect={(userId) => setPanel({ kind: "profile", userId })} />}

      {/* 내 캐릭터를 읽은 뒤에 그립니다. (기본 캐릭터가 잠깐 보였다가 바뀌지 않게) */}
      {myModel && (
        <Player
          model={myModel}
          obstacles={obstacles}
          spawn={branch.spawn}
          spots={freeSpots}
          kiosk={branch.kiosk ?? NO_KIOSK}
          frozen={kioskOpen || panelOpen || conflict !== null || (seat !== null && studyDialogOpen)}
          onNear={setNear}
          onSeat={handleSeat}
          onNearKiosk={setNearKiosk}
          onKiosk={() => setKioskOpen(true)}
          canSit={(no) => no === mySeat}
          onSitBlocked={isCafe ? (no) => void claimSeat(no) : undefined}
          sitRef={sitRequest}
          onMove={handleMove}
          headingRef={view === "first" ? heading : undefined}
        />
      )}
    </Canvas>
    {seat !== null && session && (
      <SeatedStudy
        userId={session.user.id}
        sessionId={sessionId}
        condition={condition}
        onStatus={setStudyStatus}
        onDialogChange={setStudyDialogOpen}
        onTracking={handleTracking}
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
    {session && <SceneMenu top={96} myId={session.user.id} onOpen={setPanel} />}
    {session && <SeatTimeCorner />}
    {panel && session && <InfoPanel initial={panel} myId={session.user.id} onClose={() => setPanel(null)} />}
    {conflict && (
      // 다른 자리를 이용 중일 때: 반납하고 바로 이 자리에 앉을 수 있게 합니다.
      <div style={{ position: "fixed", inset: 0, zIndex: 20, display: "grid", placeItems: "center", background: "rgba(0,0,0,.45)" }}>
        <div style={{ width: "min(380px, calc(100vw - 32px))", padding: 20, borderRadius: 12, background: "#20232a", color: "#fff", font: "14px/1.6 system-ui, sans-serif" }}>
          <p style={{ margin: "0 0 16px" }}>{conflict.message}</p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" style={dialogButton} onClick={() => setConflict(null)}>닫기</button>
            <button type="button" style={{ ...dialogButton, ...dialogPrimary }} onClick={() => void releaseAndSit()}>반납하고 앉기</button>
          </div>
        </div>
      </div>
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

const dialogButton: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 6, border: "1px solid #4b5563", background: "transparent",
  color: "#fff", cursor: "pointer", font: "inherit",
};
const dialogPrimary: React.CSSProperties = { border: "none", background: "#22c55e", color: "#0b1a10", fontWeight: 600 };
