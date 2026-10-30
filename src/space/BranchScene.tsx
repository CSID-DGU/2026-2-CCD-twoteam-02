import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { BRANCH_LAYOUTS, DEFAULT_BRANCH } from "./branches";
import { CHAIR, KIOSK, SEAT, elevatorFront, meetingDoorFront, obstaclesOf, spotsOf } from "./layout";
import type { BranchLayout } from "./layout";
import { useBranchInfo } from "./useBranchInfo";
import type { BranchInfo } from "./useBranchInfo";
import { supabase } from "../lib/supabase";
import { LABEL_PX, labelTexture } from "./labelTexture";
import { DEFAULT_COLORS, DINER_DESK, TALL_STOOL_LEG, ceilingHeightOf, colorsOf, insideTable } from "./theme";
import { BarTable, Carrel, ComputerDesk, Counter, Decor, DinerDesk, ElevatorDoor, Lounger, LowTable, RingTable, RoundTable, SeatPad, Sofa, Stool, ThemedDoor, ThemedFloor, TubChair, WoodBooth, WoodChair } from "./Decor";
import { FpsProbe, PerfReadout } from "./PerfReadout";
import { SeatCamera } from "./SeatCamera";
import { TopDownCamera } from "./TopDownCamera";
import { MeetingDialog } from "../meeting/MeetingDialog";
import KioskScreen from "../kiosk/KioskScreen";
import SeatTimeCorner from "../kiosk/SeatTimeCorner"; // 남은 시간·연장 (#38), 영수증 모양 (#39)
import type { Perf } from "./PerfReadout";
import { Player } from "./Player";
import { WalkCamera } from "./WalkCamera";
import { Minimap } from "./Minimap";
import { SeatedStudy } from "../study/SeatedStudy";
import { MY_SEAT_COLOR, MySeatMarker } from "./MySeatMarker";
import { useMySeat } from "./useMySeat";
import { useSession } from "../auth/useSession";
import { useMyAvatar } from "../profile/useMyAvatar";
import { useParticipants } from "../realtime/useParticipants";
import { OtherParticipants } from "../realtime/OtherParticipants";
import { useLocation, useNavigate } from "react-router";
import { passageOf } from "./passage";
import { useWalkView } from "./useWalkView";
import { useOnlinePlace } from "../realtime/onlineContext";
import { ChatOverlay } from "../chat/ChatOverlay";
import { EmoteControls } from "./EmoteControls";
import { newEmoteState } from "./emotes";
import { currentCondition } from "../study/condition";
import { InfoPanel } from "../menu/InfoPanel";
import { SceneMenu } from "../menu/SceneMenu";
import type { PanelView } from "../menu/panelTypes";
import { panelKey } from "../menu/panelTypes";
import { useMenuShortcuts } from "../menu/useMenuShortcuts";
import { getKeymap, keyLabel, useKeymap } from "../menu/keymap";
import { channelName } from "../realtime/participants";
import type { PresenceState } from "../realtime/participants";
import { headAngles, nextEyesClosed } from "../tracking/faceSync";
import { characterArms } from "../tracking/armLogic";
import type { Direction } from "../tracking/armLogic";
import type { MyTracking } from "../study/SeatedStudy";
import type { PresenceStatus } from "./status";
import { FloorPicker } from "../world/FloorPicker";
import { buildingOf, placeBuildings } from "../world/worldLogic";
import type { PlazaLayout } from "../world/worldLogic";
import world from "../world/world.json";
import { useMyTitle } from "../level/useMyTitle";
import { sharedLevel } from "../level/levelLogic";
import { LevelUpCard } from "../level/LevelUpCard";
import { emotesAllowed } from "./rulesLogic";
import { setQuietLock } from "../chat/quietLock";
import { worldOfBranch } from "../world/worldConfig";
import { toward } from "../lib/josa";

const initialPerf: Perf = { fps: null, minFps: null, transitionMs: null };
const DOOR_HEIGHT = 2.2; // 출입문 높이 (로비 문과 같음)
const DOOR_SIGN = { width: 1.4, y: 1.75 }; // 출입문 위 "광장" 표지판
const DOOR_COLOR = { idle: "#4ade80", near: "#f59e0b" }; // 로비 문과 같은 색
const NO_KIOSK = { x: 1000, z: 1000 }; // 키오스크가 없는 지점(카페). 걸어서 닿을 수 없는 자리를 줘서 감지가 일어나지 않게 합니다.
const BAR_HEIGHT = 1.0; // 커피 바 카운터 높이

// 여러 층 건물의 층 목록을 찾으려고 광장 배치를 한 번 계산합니다. (엘리베이터: 같은 건물의 다른 층으로)
const PLACED = placeBuildings(world as PlazaLayout, BRANCH_LAYOUTS);

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
  // 휴식방(숨 라운지): DB 에서는 카페와 같고, 누우면 공부 시작 창·트래킹·타이머 없이 쉬기만 합니다.
  const isRest = branch.rest === true;
  // 건물 규칙(캠빛 대학교 도서관): 이 지점에 있는 동안 방해금지를 켠 채로 고정, 나가면 풂
  useEffect(() => {
    if (!branch.rules?.quiet) return;
    setQuietLock(true);
    return () => setQuietLock(false);
  }, [branch]);
  const obstacles = useMemo(() => obstaclesOf(branch), [branch]);
  const spots = useMemo(() => spotsOf(branch), [branch]);
  const colors = colorsOf(branch.theme); // 지점 테마(#57). 없으면 기본색
  const floorPattern = branch.theme?.floor; // 체크 바닥이면 텍스처, 아니면 기본색
  const furniture = branch.theme?.furniture; // 다이너 테이블·소파 (없으면 상자 책상·의자)
  // 공용 테이블로 보는 둥근 범위: 고리 테이블 + 원형 부스의 대리석 테이블(그 안의 자리는 개별 책상을 그리지 않음)
  const sharedRings = [
    ...(furniture?.rings ?? []),
    ...(branch.theme?.booths ?? []).map((b) => ({ x: b.x, z: b.z, inner: 0, outer: 0.5 })),
    ...(branch.theme?.bars ?? []).map((b) => ({ x: b.x, z: b.z, inner: b.inner, outer: b.outer })), // 곡선 바 상판 위 자리
  ];
  const wallH = ceilingHeightOf(branch.theme); // 벽·천장 높이 (테마에 없으면 2.5)
  const [near, setNear] = useState<number | null>(null); // 앉을 수 있는 좌석 번호
  const [seat, setSeat] = useState<number | null>(null); // 앉아 있는 좌석 번호
  const [nearKiosk, setNearKiosk] = useState(false); // 키오스크를 쓸 수 있는 거리인지
  const [kioskOpen, setKioskOpen] = useState(false); // 키오스크 화면이 떠 있는지
  const [nearExit, setNearExit] = useState(false); // 출입문 앞인지 (E 로 로비로, #150)
  const [nearMeeting, setNearMeeting] = useState(false); // 회의실 문 앞인지 (#45)
  const [meetingOpen, setMeetingOpen] = useState(false); // 회의 목록·만들기 창이 떠 있는지 (#45)
  const meetingFront = useMemo(() => (branch.meetingDoor ? meetingDoorFront(branch.meetingDoor) : undefined), [branch]);
  // 엘리베이터: 지점 JSON 에 문이 있고, 광장에서 여러 층 건물에 든 지점일 때만. 앞에서 E 를 누르면 층 고르는 창
  const floors = useMemo(() => buildingOf(PLACED, branch.id)?.floors ?? [], [branch]);
  const elevatorSpot = useMemo(() => (branch.elevator && floors.length > 1 ? elevatorFront(branch.elevator) : undefined), [branch, floors]);
  const [nearElevator, setNearElevator] = useState(false); // 엘리베이터 문 앞인지
  const [elevatorOpen, setElevatorOpen] = useState(false); // 층 고르는 창이 떠 있는지
  // 걸어 다닐 때의 시점. 처음에는 1인칭으로 걷고, V 로 위에서 보기와 바꿉니다. (#71)
  const [view, setView] = useWalkView(); // 로비에서 바꾼 시점을 그대로 이어서 씁니다.
  // 문을 지나 왔으면 그때 보던 방향 그대로 섭니다(#150). 주소로 바로 들어오면 입구에서 안쪽(-Z)을 봅니다.
  // 회의에서 나왔으면 출입문 대신 회의실 문 앞에 섭니다(#45).
  const location = useLocation();
  const navigate = useNavigate();
  // 엘리베이터로 왔으면 그 층 엘리베이터 문 앞에서 엘리베이터를 등지고 섭니다.
  const [arrival] = useState(() => {
    const p = passageOf(location.state);
    return p.at === "elevator" && elevatorSpot ? elevatorSpot.heading : p.heading ?? Math.PI;
  });
  const [startAt] = useState(() => {
    const at = passageOf(location.state).at;
    return (at === "meeting" && meetingFront) || (at === "elevator" && elevatorSpot) || branch.spawn;
  });
  const pos = useRef({ x: startAt.x, z: startAt.z }); // 1인칭 카메라가 따라갈 내 위치
  const heading = useRef(arrival); // 1인칭에서 바라보는 방향
  const bodyHeading = useRef(arrival); // 몸이 바라보는 방향 (위에서 보기에서도 맞음). 나갈 때 로비로 넘깁니다.
  const [locked, setLocked] = useState(false); // 1인칭에서 마우스가 잠겨 있는지 (마우스로 바라보는 중)
  const { mySeat, sessionId, setMySeat } = useMySeat(BRANCH_ID); // 키오스크에서 배정받은 내 자리
  const [studyStatus, setStudyStatus] = useState<PresenceStatus>("idle"); // 앉아 있을 때의 집중 상태
  const [studyDialogOpen, setStudyDialogOpen] = useState(false); // 공부 시작 창이 떠 있는지 (중지 중 포함: 캐릭터·시점·단축키를 막음)
  const [studyPaused, setStudyPaused] = useState(false); // 공부 중지 중 (#236). 안내 문구와 메뉴의 나가기 버튼에 씀
  // 지점 위에 띄운 창(내 기록·친구·프로필). 페이지를 옮기지 않아 닫으면 자리·타이머가 그대로입니다. (#70)
  const [panel, setPanel] = useState<PanelView | null>(null);
  const panelOpen = panel !== null;
  const { session } = useSession();
  // 내 칭호 (꽃 피는 칭호). 공개 범위가 '모두'일 때만 다른 참여자에게 단계를 보냅니다(sharedLevel).
  const myTitle = useMyTitle(session?.user.id, false); // 실시간 구독 끔: 공부 중 오른 단계는 liveLevel 로
  // 이 지점에서 끝난 공부들의 확정 공부 시간(ms). 과목을 바꾸면 StudyRunner 가 새로 만들어지므로, 다음 공부의 누적에 더합니다.
  const [titleDoneMs, setTitleDoneMs] = useState(0);
  const [liveLevel, setLiveLevel] = useState(0); // 공부 중에 오른 단계 (다시 들어오면 저장된 누적에서 다시 계산)
  const [levelUp, setLevelUp] = useState<number | null>(null); // 축하 카드에 띄울 단계
  const myLevel = Math.max(myTitle.level, liveLevel);
  const titleBaseSeconds = myTitle.savedSeconds === null ? null : myTitle.savedSeconds + titleDoneMs / 1000;
  const handleLevelUp = useCallback((level: number) => {
    setLiveLevel((v) => Math.max(v, level));
    setLevelUp(level);
  }, [setLiveLevel, setLevelUp]);
  const handleRunEnd = useCallback((ms: number) => setTitleDoneMs((v) => v + ms), []);
  const { model: myModel } = useMyAvatar(); // 내 프로필에서 고른 캐릭터 (#131). 읽기 전에는 null
  // 내 위치·상태를 담아 두는 곳. 매 프레임 바뀌므로 state 가 아니라 ref 에 둡니다.
  const me = useRef<PresenceState | null>(null);
  // 감정표현 (#162): 고른 것·하는 중인 것. Player 가 동작하고, 1인칭 카메라는 그동안 앞으로 빠져 나를 비춥니다.
  const emote = useRef(newEmoteState());
  const suspendLook = useRef(false); // 감정표현 바퀴를 고르는 동안 마우스로 시점이 돌지 않게
  const others = useParticipants(channelName(BRANCH_ID), me); // 같은 지점의 다른 참여자 (실시간)
  useOnlinePlace(branch.id); // 사이트 전체 접속 상태에 "이 지점에 있음"으로 표시 (친구 탭 활동 중, #176)
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
  // 상태: 돌아다니면 idle(표시등 없음), 앉아 있으면 집중 판정 결과(공부 시작 전에는 idle).
  const handleMove = (x: number, z: number, h: number) => {
    pos.current.x = x;
    pos.current.z = z;
    bodyHeading.current = h;
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
      // 서서 감정표현 중이면 같이 실어 보냅니다. 보고 있는 사람 화면에서도 같은 동작을 합니다. (#162)
      ...(emote.current.playing ? { emote: emote.current.playing, emoteSeq: emote.current.seq } : {}),
      ...(sharedLevel(myTitle.visibility, myLevel) ? { lv: sharedLevel(myTitle.visibility, myLevel) } : {}), // 칭호
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
      if (e.code !== getKeymap().view || e.repeat || kioskOpen || panelOpen || meetingOpen || elevatorOpen) return; // 위에서 보기 ↔ 1인칭 (키는 설정에서 바꿈, #250)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      setView((v) => (v === "top" ? "first" : "top"));
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [kioskOpen, panelOpen, meetingOpen, elevatorOpen, setView]);

  // 광장으로 나가기: 출입문에서 E, 또는 서 있을 때 L 키(#205). 보던 방향 그대로 광장의 이 건물 입구 앞에 섭니다(#150, #315).
  // 이 지점이 있는 바깥 공간: 광장 지점이면 광장(/), 캠빛 대학교 건물이면 캠퍼스(/campus)로 돌아갑니다.
  const outside = worldOfBranch(branch.id);
  const goLobby = () => navigate(outside.path, { state: { from: branch.id, heading: bodyHeading.current } });
  // 트래킹 검증 화면으로 (#250). 다른 주소라 지점 화면이 닫히므로 키는 서 있을 때만 받습니다.
  const goTracking = () => navigate("/tracking");
  // 오른쪽 위 버튼 단축키 R·F·P·L (#205). 키오스크·확인 창·공부 시작 창이 떠 있으면 쓰지 않습니다.
  useMenuShortcuts({
    myId: session?.user.id ?? null,
    panel,
    setPanel,
    disabled: kioskOpen || conflict !== null || studyDialogOpen || meetingOpen || elevatorOpen,
    onLobby: seat === null ? goLobby : undefined, // 앉아 있을 때는 L 로 나가지 않음 (공부 중 실수 방지)
    onTracking: seat === null ? goTracking : undefined, // T 도 같은 이유로 서 있을 때만
  });

  const seatSpot = spots.find((c) => c.no === seat);
  // 안내 문구에 보일 키 글자 (설정에서 바꾼 키를 따라감, #250)
  const keymap = useKeymap();
  const K = { view: keyLabel(keymap.view), interact: keyLabel(keymap.interact), emoteWheel: keyLabel(keymap.emoteWheel), recenter: keyLabel(keymap.recenter) };
  const viewHint =
    view === "top" ? `${K.view} 1인칭으로` : locked ? `Esc 커서 보이기 · ${K.view} 위에서 보기` : `클릭해서 둘러보기 · ${K.view} 위에서 보기`;
  const walkHint =
    seat !== null
      ? isRest
        ? `${seat}번 소파 · 누워서 쉬는 중 · WASD·끌어서 둘러보기 · ${K.interact} 일어나기`
        : `${seat}번 좌석 · WASD·끌어서 둘러보기 · ${K.recenter} 정면 보기 · ${K.interact} 일어나기`
      : nearMeeting // 회의실 문 앞 (#45)
        ? `회의실 · ${K.interact} 들어가기`
      : nearElevator // 엘리베이터 문 앞 (여러 층 건물)
        ? `엘리베이터 · ${K.interact} 층 고르기`
      : nearExit // 출입문 앞 (의자·키오스크가 더 가까우면 그쪽이 먼저라 여기 오지 않음, #150)
        ? `출입문 · ${K.interact} ${toward(outside.title)} 나가기`
      : isRest
        ? near !== null
          ? `${near}번 소파 · ${K.interact} 눕기`
          : `빈 소파에서 ${K.interact}로 눕기 · 여기서는 공부 기록 없이 쉬어요`
      : isCafe
        ? near !== null
          ? `${near}번 좌석 · ${K.interact} 앉기`
          : `빈자리에서 ${K.interact}로 앉기`
      : near !== null
        ? near === mySeat
          ? `${near}번 좌석 (내 자리) · ${K.interact} 앉기`
          : mySeat === null
            ? `${near}번 좌석 · 키오스크에서 자리를 먼저 지정하세요`
            : `${near}번 좌석 · 내 자리(${mySeat}번)가 아니에요`
        : nearKiosk
          ? `키오스크 · ${K.interact} 사용하기`
          : mySeat === null
            ? "키오스크에서 자리를 지정하세요"
            : `${mySeat}번 좌석이 내 자리예요 · 파란 의자로 가세요`;
  const hint = kioskOpen || panelOpen || conflict || meetingOpen || elevatorOpen ? "" : studyPaused ? "⏸ 중지 중 · 다시 시작을 누르면 이어서 공부해요" : cafeMessage ? cafeMessage : seat !== null ? walkHint : `${walkHint} · Shift 달리기 · ${K.emoteWheel} 감정표현 · ${viewHint}`;

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
        <>
          <WalkCamera
            posRef={pos}
            headingRef={heading}
            paused={kioskOpen || panelOpen || conflict !== null || meetingOpen || elevatorOpen}
            onLockChange={setLocked}
            emoteRef={emote}
            suspendLookRef={suspendLook}
          />
          <Minimap area={branch.size} posRef={pos} headingRef={heading} /> {/* 걸을 때만 뜨는 미니맵 (#290) */}
        </>
      ) : (
        <TopDownCamera area={branch.size} />
      )}
      <FpsProbe onSample={handleFps} />
      {/* 조명·바닥·벽·책상 색은 지점 테마(#57)에서 읽습니다. 테마가 없으면 전과 같은 기본색입니다. */}
      <ambientLight intensity={colors.light.ambient} color={colors.light.color} />
      {/* 1인칭에서 면이 구분되도록 비스듬한 빛을 더합니다. */}
      <directionalLight position={[6, 12, 4]} intensity={colors.light.sun} color={colors.light.color} />

      <ThemedFloor floor={floorPattern} size={branch.size} color={colors.floor} />

      {branch.walls.map((w, i) => (
        <mesh key={i} position={[w.x, wallH / 2, w.z]}>
          <boxGeometry args={[w.w, wallH, w.d]} />
          <meshStandardMaterial color={colors.wall} />
        </mesh>
      ))}

      {/* 천장·팬·네온·액자 (테마가 있을 때만) */}
      <Decor theme={branch.theme} size={branch.size} />

      {/* 책상: 테마에 가구 모양(furniture)이 있으면 크롬 테두리·다리 테이블, 없으면 상자 */}
      {furniture?.tables?.map((t, i) => (
        <BarTable key={i} table={t} color={colors.desk} chrome={furniture.chrome} trim={furniture.trim} /> // 여러 자리가 같이 쓰는 바 테이블
      ))}
      {furniture?.rings?.map((r, i) => (
        <RingTable key={i} ring={r} color={colors.desk} height={DINER_DESK.height} /> // 나무를 둘러싼 고리 테이블
      ))}
      {branch.seats.map((s) => {
        // 계단식 단 위 자리(강의실, rise)는 책상째 그만큼 올립니다.
        const deskEl = s.chair === "lounger" ? null : furniture ? ( // 라운지 소파는 책상이 없음
          insideTable(s, furniture.tables, sharedRings) ? null : s.desk === "carrel" ? (
            <Carrel key={s.no} x={s.x} z={s.z} rot={s.rot} color={colors.desk} /> // 도서관 칸막이 책상
          ) : s.desk === "computer" ? (
            <ComputerDesk key={s.no} x={s.x} z={s.z} rot={s.rot} color={colors.desk} /> // 정보관 컴퓨터 책상
          ) : s.desk === "round" ? ( // 공용 테이블 안의 자리는 개별 책상을 안 그림
            <RoundTable key={s.no} x={s.x} z={s.z} color={colors.desk} marble={branch.theme?.booth?.marble} />
          ) : s.desk === "low" ? (
            <LowTable key={s.no} x={s.x} z={s.z} color={colors.desk} />
          ) : (
            <DinerDesk key={s.no} x={s.x} z={s.z} size={SEAT} color={colors.desk} chrome={furniture.chrome} trim={furniture.trim} metal={furniture.style !== "wood"} />
          )
        ) : (
          <mesh key={s.no} position={[s.x, 0.37, s.z]}>
            <boxGeometry args={[SEAT.w, 0.74, SEAT.d]} />
            <meshStandardMaterial color={colors.desk} />
          </mesh>
        );
        return s.rise ? <group key={s.no} position-y={s.rise}>{deskEl}</group> : deskEl;
      })}

      {/* 의자: 가까이·내 자리 강조색은 테마와 무관하게 그대로, 기본색만 테마를 따릅니다 */}
      {spots.map((c) => {
        const chairColor = c.no === seat || c.no === near ? "#f59e0b" : c.no === mySeat ? MY_SEAT_COLOR : colors.chair;
        const desk = branch.seats.find((s) => s.no === c.no); // 바 테이블 안인지는 의자가 아니라 책상 자리로 봅니다 (의자는 테이블 바깥쪽에 있음)
        const chairEl = c.chair === "lounger" ? (
          // 누워 쉬는 라운지 소파 (숨 라운지): 강조색은 쿠션 색으로
          <Lounger
            key={c.no}
            x={c.x}
            z={c.z}
            rot={c.rot}
            color={c.no === seat || c.no === near || c.no === mySeat ? chairColor : branch.theme?.lounger?.cushion ?? colors.chair}
            base={branch.theme?.lounger?.base ?? colors.chair}
            pillow={branch.theme?.lounger?.pillow ?? colors.chair}
          />
        ) : furniture?.style === "wood" ? (
          // 원목 테마: 자리마다 원목 부스 또는 원목 의자. 강조색(주황·내 자리)은 방석 색으로
          c.chair === "stool" ? (
            // 높은 원목 스툴 (곡선 바 자리): 방석은 테마 강조색(겨자색 등)
            <Stool key={c.no} x={c.x} z={c.z} legH={TALL_STOOL_LEG} color={c.no === seat || c.no === near || c.no === mySeat ? chairColor : furniture.accent} legColor={furniture.chrome} />
          ) : c.chair === "tub" ? (
            <TubChair key={c.no} x={c.x} z={c.z} rot={c.rot} color={chairColor} />
          ) : c.chair === "none" ? (
            // 원형 부스 안 자리: 의자 대신 방석 위 표시판 (가까이·내 자리면 강조색)
            <SeatPad key={c.no} x={c.x} z={c.z} color={c.no === seat || c.no === near || c.no === mySeat ? chairColor : branch.theme?.booth?.leather ?? colors.chair} />
          ) : c.chair === "booth" ? (
            <WoodBooth key={c.no} x={c.x} z={c.z} rot={c.rot} color={c.no === seat || c.no === near || c.no === mySeat ? chairColor : furniture.accent} wood={colors.chair} cushion={furniture.accent} />
          ) : (
            <WoodChair key={c.no} x={c.x} z={c.z} rot={c.rot} color={chairColor} wood={furniture.chrome} />
          )
        ) : furniture ? (
          c.tall && desk && insideTable(desk, furniture.tables) ? ( // 바 테이블 자리는 둥근 스툴, 그 밖은 부스 소파(높은 자리면 받침 위에)
            <Stool key={c.no} x={c.x} z={c.z} legH={TALL_STOOL_LEG} color={chairColor} /> // 커피 바 앞과 같은 둥근 스툴, 높이만 높게
          ) : (
            <Sofa key={c.no} x={c.x} z={c.z} rot={c.rot} color={chairColor} accent={furniture.accent} raise={c.y ?? 0} />
          )
        ) : (
          <mesh key={c.no} position={[c.x, CHAIR.h / 2, c.z]}>
            <boxGeometry args={[CHAIR.w, CHAIR.h, CHAIR.d]} />
            <meshStandardMaterial color={chairColor} />
          </mesh>
        );
        return c.rise ? <group key={c.no} position-y={c.rise}>{chairEl}</group> : chairEl; // 계단식 단 위 의자
      })}

      {/* 엘리베이터 문 (여러 층 건물): 표시판에 지금 층 */}
      {branch.elevator && elevatorSpot && (
        <ElevatorDoor
          box={branch.elevator}
          height={DOOR_HEIGHT}
          near={nearElevator}
          nearColor={DOOR_COLOR.near}
          label={`${floors.find((f) => f.slug === branch.id)?.level ?? 1}F`}
        />
      )}

      {/* 회의실 문 (#45): 동쪽 벽에 붙은 문과 "회의실" 표지판. 앞에서 E 를 누르면 회의 창이 뜹니다. 방은 로비처럼 문 너머라 그리지 않습니다. */}
      {branch.meetingDoor && branch.theme?.door ? (
        // 테마 문 (#57): 색·크롬 테두리·양철 간판. 앞에 서면 주황은 그대로
        <ThemedDoor box={branch.meetingDoor} height={DOOR_HEIGHT} near={nearMeeting} nearColor={DOOR_COLOR.near} label="회의실" door={branch.theme.door} along="z" />
      ) : branch.meetingDoor && (
        <group>
          <mesh position={[branch.meetingDoor.x, DOOR_HEIGHT / 2, branch.meetingDoor.z]}>
            <boxGeometry args={[branch.meetingDoor.w, DOOR_HEIGHT, branch.meetingDoor.d]} />
            <meshStandardMaterial color={nearMeeting ? DOOR_COLOR.near : DOOR_COLOR.idle} />
          </mesh>
          {/* 표지판은 지점 안쪽(-X)을 보게 돌립니다. */}
          <mesh
            position={[branch.meetingDoor.x - branch.meetingDoor.w / 2 - 0.01, DOOR_SIGN.y, branch.meetingDoor.z]}
            rotation={[0, -Math.PI / 2, 0]}
          >
            <planeGeometry args={[DOOR_SIGN.width, (DOOR_SIGN.width * LABEL_PX.h) / LABEL_PX.w]} />
            <meshBasicMaterial map={labelTexture("회의실", "#14532d")} transparent />
          </mesh>
        </group>
      )}

      {/* 출입문: 남쪽 벽에 붙은 문과 바깥 이름("광장"·"캠빛 대학교") 표지판. 앞에서 E 를 누르면 광장으로 나갑니다. (#150, #315) */}
      {branch.door && branch.theme?.door ? (
        <ThemedDoor box={branch.door} height={DOOR_HEIGHT} near={nearExit} nearColor={DOOR_COLOR.near} label={outside.title} door={branch.theme.door} along="x" />
      ) : branch.door && (
        <group>
          <mesh position={[branch.door.x, DOOR_HEIGHT / 2, branch.door.z]}>
            <boxGeometry args={[branch.door.w, DOOR_HEIGHT, branch.door.d]} />
            <meshStandardMaterial color={nearExit ? DOOR_COLOR.near : DOOR_COLOR.idle} />
          </mesh>
          {/* 표지판은 문 안쪽 면(지점 쪽, -Z)을 보게 반 바퀴 돌립니다. */}
          <mesh position={[branch.door.x, DOOR_SIGN.y, branch.door.z - branch.door.d / 2 - 0.01]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[DOOR_SIGN.width, (DOOR_SIGN.width * LABEL_PX.h) / LABEL_PX.w]} />
            <meshBasicMaterial map={labelTexture(outside.title, "#14532d")} transparent />
          </mesh>
        </group>
      )}

      {branch.kiosk && (
        <mesh position={[branch.kiosk.x, 0.6, branch.kiosk.z]}>
          <boxGeometry args={[KIOSK.w, 1.2, KIOSK.d]} />
          <meshStandardMaterial color="#22c55e" />
        </mesh>
      )}

      {/* 커피 바(카페): 보이고 부딪히기만 하고 기능은 아직 없습니다. */}
      {branch.bar && (
        <group>
          {branch.theme?.counter ? (
            // 테마가 있으면 타일 카운터와 스툴 (#57)
            <Counter bar={branch.bar} counter={branch.theme.counter} height={BAR_HEIGHT} neon={branch.theme.wall?.neon} />
          ) : (
            <mesh position={[branch.bar.x, BAR_HEIGHT / 2, branch.bar.z]}>
              <boxGeometry args={[branch.bar.w, BAR_HEIGHT, branch.bar.d]} />
              <meshStandardMaterial color={DEFAULT_COLORS.bar} />
            </mesh>
          )}
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
          spawn={startAt}
          spawnHeading={arrival}
          emoteRef={emote}
          spots={freeSpots}
          kiosk={branch.kiosk ?? NO_KIOSK}
          frozen={kioskOpen || panelOpen || conflict !== null || meetingOpen || elevatorOpen || (seat !== null && studyDialogOpen)}
          onNear={setNear}
          onSeat={handleSeat}
          onNearKiosk={setNearKiosk}
          exit={branch.door}
          onNearExit={setNearExit}
          onExit={goLobby}
          meeting={meetingFront}
          onNearMeeting={setNearMeeting}
          onMeeting={() => setMeetingOpen(true)}
          elevator={elevatorSpot}
          onNearElevator={setNearElevator}
          onElevator={() => setElevatorOpen(true)}
          onKiosk={() => setKioskOpen(true)}
          canSit={(no) => no === mySeat}
          onSitBlocked={isCafe ? (no) => void claimSeat(no) : undefined}
          sitRef={sitRequest}
          onMove={handleMove}
          headingRef={view === "first" ? heading : undefined}
        />
      )}
    </Canvas>
    {seat !== null && session && !isRest && ( // 휴식방에서는 공부 시작 창·트래킹을 띄우지 않음
      <SeatedStudy
        userId={session.user.id}
        sessionId={sessionId}
        condition={condition}
        onStatus={setStudyStatus}
        onDialogChange={setStudyDialogOpen}
        onPausedChange={setStudyPaused}
        onTracking={handleTracking}
        titleBaseSeconds={titleBaseSeconds}
        onLevelUp={handleLevelUp}
        onRunEnd={handleRunEnd}
        rules={branch.rules}
      />
    )}
    {/* 칭호가 오르면 잠깐 뜨는 축하 카드. 누를 것도 초점도 없어 공부(타이머·판정)를 끊지 않습니다. */}
    {levelUp !== null && <LevelUpCard key={levelUp} level={levelUp} onDone={() => setLevelUp(null)} />}
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
    {/* 이 지점 접속 인원 (나 포함, #176). 숨김 모드에서는 다른 사람은 안 보이고 이 인원만 알 수 있습니다. */}
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
    <ChatOverlay /> {/* 친구 귓속말 로그창 (#49) */}
    {/* 감정표현: 숫자키 1~8, X 바퀴 (#162). 창이 떠 있거나 앉아 있으면 쓰지 않습니다. */}
    <EmoteControls
      emoteRef={emote}
      suspendLookRef={suspendLook}
      disabled={kioskOpen || panelOpen || conflict !== null || meetingOpen || elevatorOpen || seat !== null || !emotesAllowed(branch.rules)}
    />
    {session && <SceneMenu myId={session.user.id} onOpen={setPanel} onLobby={studyPaused ? undefined : goLobby} lobbyLabel={toward(outside.title)} onTracking={studyPaused ? undefined : goTracking} />}
    {session && <SeatTimeCorner onLost={() => setMySeat(null)} placeKey={mySeat} />}
    {/* key: 단축키로 다른 창으로 바꾸면 새 창으로 엽니다 */}
    {panel && session && <InfoPanel key={panelKey(panel)} initial={panel} myId={session.user.id} here={{ place: branch.id, pos, heading: bodyHeading, mySeat }} onClose={() => setPanel(null)} />}
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
    {elevatorOpen && (
      // 층 고르는 창. 고르면 그 층 지점으로 옮겨 엘리베이터 문 앞에 섭니다(지점 화면은 새로 그려짐).
      <FloorPicker
        floors={floors}
        current={branch.id}
        onPick={(slug) => navigate(`/space?branch=${slug}`, { state: { at: "elevator" } })}
        onClose={() => setElevatorOpen(false)}
      />
    )}
    {meetingOpen && (
      // 회의 목록·만들기 (#45). 들어가면 회의 화면으로 옮깁니다(지점 화면은 닫히고 내 캐릭터도 지점에서 사라짐).
      <MeetingDialog
        branchId={BRANCH_ID}
        onClose={() => setMeetingOpen(false)}
        onEnter={(id) => navigate(`/meeting/${id}?branch=${branch.id}`)}
      />
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
