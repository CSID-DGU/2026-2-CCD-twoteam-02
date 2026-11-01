import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { BRANCH_LAYOUTS, DEFAULT_BRANCH } from "./branches";
import { NOTE_BOARD_NO, elevatorFront, meetingDoorFront, noteBoardSpot, obstaclesOf, spotsOf, stairsFront } from "./layout";
import type { BranchLayout } from "./layout";
import { useBranchInfo } from "./useBranchInfo";
import type { BranchInfo } from "./useBranchInfo";
import { FpsProbe, PerfReadout } from "./PerfReadout";
import { SeatCamera } from "./SeatCamera";
import { TopDownCamera } from "./TopDownCamera";
import { MeetingDialog } from "../meeting/MeetingDialog";
import KioskScreen from "../kiosk/KioskScreen";
import SeatTimeCorner from "../kiosk/SeatTimeCorner"; // 남은 시간·연장 (#38), 영수증 모양 (#39)
import type { Perf } from "./PerfReadout";
import { Player } from "./Player";
import { WalkCamera } from "./WalkCamera";
import { SeatedStudy } from "../study/SeatedStudy";
import { MySeatMarker } from "./MySeatMarker";
import { useMySeat } from "./useMySeat";
import { useCafeSeat } from "./useCafeSeat";
import { CafeConflictDialog } from "./CafeConflictDialog";
import { useSession } from "../auth/useSession";
import { useMyAvatar } from "../profile/useMyAvatar";
import { useParticipants } from "../realtime/useParticipants";
import { OtherParticipants } from "../realtime/OtherParticipants";
import { useLocation, useNavigate } from "react-router";
import { passageOf } from "./passage";
import { useWalkView } from "./useWalkView";
import { useAim } from "./useAim";
import { useFollowArrival } from "../friends/useFollow";
import type { Teleport } from "../friends/useFollow";
import { useChat } from "../chat/chatContext";
import type { AimTarget } from "./aimLogic";
import { useOnlinePlace } from "../realtime/onlineContext";
import { ChatOverlay } from "../chat/ChatOverlay";
import { EmoteControls } from "./EmoteControls";
import { newEmoteState } from "./emotes";
import { AmbienceControl } from "./AmbienceControl";
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
import { emotesAllowed, entryNotice } from "./rulesLogic";
import { EntryNotice } from "./EntryNotice";
import { setQuietLock } from "../chat/quietLock";
import { worldOfBranch } from "../world/worldConfig";
import { CafeWindows } from "../world/CafeWindows";
import { RooftopWorld } from "../world/RooftopWorld";
import { BranchInterior } from "./BranchInterior";
import { BaristaNpc } from "./BaristaNpc";
import { OrderPanel } from "./OrderPanel";
import { DeskDrink, DrinkInView } from "./HeldDrink";
import { orderSpot } from "./baristaLogic";
import type { MenuItem } from "./baristaLogic";
import { heldItem, setHeldItem } from "./heldItem";
import { BoardPanel } from "../board/BoardPanel";
import { useBoardNotes } from "../board/useBoardNotes";
import { useClassPhase } from "../study/useClassPhase";
import { boardText } from "../study/timetableLogic";
import { ClassBellNotice } from "../study/ClassBellNotice";
import { toward } from "../lib/josa";
import { STUDY_ON_PC, useIsTouch } from "./useIsTouch";
import { TouchControls } from "./TouchControls";

const TOUCH_DPR = 1.5; // 폰 3D 화면 해상도 상한 (#377. 폰은 기기 해상도가 3배라 그대로 그리면 무거움)
const TOUCH_NOTE_MS = 4000; // 폰 안내를 보여 주는 시간

const initialPerf: Perf = { fps: null, minFps: null, transitionMs: null };
const NO_KIOSK = { x: 1000, z: 1000 }; // 키오스크가 없는 지점(카페). 걸어서 닿을 수 없는 자리를 줘서 감지가 일어나지 않게 합니다.

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
  // 들어서는 순간 그곳의 규칙을 몇 초 알려 줍니다 (도서관·강의동·정보관·휴식방). 앉기 전에 알 수 있게
  const [entry, setEntry] = useState(() => entryNotice(branch));
  // 강의실 공동 시간표 (캠빛 강의동): 칠판 글씨, 쉬는 시간엔 타이머·기록 멈춤(breakTime), 바뀌는 순간 종 알림
  const classNow = useClassPhase(branch.rules?.timetable === true);
  const [bell, setBell] = useState<"class" | "break" | null>(null);
  const [seenPhase, setSeenPhase] = useState(classNow?.phase ?? null);
  if ((classNow?.phase ?? null) !== seenPhase) {
    // 처음 읽을 때(null → 값)는 알리지 않고, 수업 ↔ 쉬는 시간이 바뀔 때만 (렌더 중 이전 값과 비교하는 React 권장 방식)
    if (seenPhase !== null && classNow) setBell(classNow.phase);
    setSeenPhase(classNow?.phase ?? null);
  }
  // 건물 규칙(캠빛 대학교 도서관): 이 지점에 있는 동안 방해금지를 켠 채로 고정, 나가면 풂
  useEffect(() => {
    if (!branch.rules?.quiet) return;
    setQuietLock(true);
    return () => setQuietLock(false);
  }, [branch]);
  const obstacles = useMemo(() => obstaclesOf(branch), [branch]);
  const spots = useMemo(() => spotsOf(branch), [branch]);
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
  // 계단이면 계단 끝 (긴 계단의 옆면 가운데는 다가가는 자리가 아니라서)
  const elevatorSpot = useMemo(
    () => (branch.elevator && floors.length > 1 ? (branch.stairs ? stairsFront(branch.elevator, branch.stairs) : elevatorFront(branch.elevator)) : undefined),
    [branch, floors],
  );
  const [nearElevator, setNearElevator] = useState(false); // 엘리베이터 문 앞인지
  const [elevatorOpen, setElevatorOpen] = useState(false); // 층 고르는 창이 떠 있는지
  const [boardOpen, setBoardOpen] = useState(false); // 코르크 게시판 창이 떠 있는지
  // 카페 바리스타 (baristaLogic): 카운터 앞(키오스크 자리를 빌려 씀)에서 E 로 주문 창, 고르면 잠시 뒤 내 손에 컵
  const barista = branch.barista;
  const [orderOpen, setOrderOpen] = useState(false);
  const [baristaSay, setBaristaSay] = useState<string | null>(null); // 바리스타 말풍선
  const [greet, setGreet] = useState({ seq: 0, emote: "wave" }); // 바리스타 동작 (손 흔들기·끄덕이기)
  // 받은 음료·빵을 듦. 같은 건물 다른 층으로 가도 들고 가도록 지점 화면 밖(heldItem)에도 기억
  const [holding, setHoldingState] = useState(heldItem);
  const setHolding = (item: MenuItem | null) => {
    setHeldItem(item);
    setHoldingState(item);
  };
  const sayTimer = useRef<number[]>([]);
  const say = (text: string | null, ms = 0) => {
    sayTimer.current.push(window.setTimeout(() => setBaristaSay(text), ms));
  };
  useEffect(() => () => sayTimer.current.forEach((t) => window.clearTimeout(t)), []);
  // 카운터 앞에 오면 인사
  const [greetedNear, setGreetedNear] = useState(false);
  if (barista && nearKiosk !== greetedNear) {
    setGreetedNear(nearKiosk);
    if (nearKiosk && !orderOpen) {
      setGreet((g) => ({ seq: g.seq + 1, emote: "wave" }));
      setBaristaSay(barista.greeting ?? "어서오세요! 😊");
    } else if (!nearKiosk && !orderOpen) setBaristaSay(null);
  }
  const orderPicked = (item: MenuItem) => {
    const { name, icon } = item;
    setOrderOpen(false);
    setGreet((g) => ({ seq: g.seq + 1, emote: "nod" }));
    setBaristaSay(`${icon} ${name} 준비할게요!`);
    say(`주문하신 ${name} 나왔어요! ${icon}`, 2600);
    sayTimer.current.push(window.setTimeout(() => setHolding(item), 2600));
    say(null, 6000);
  };
  const board = useBoardNotes(branch.noteBoard ? branch.id : null); // 게시판 쪽지 (판에 그리려고 창을 닫아도 읽음)
  // 걸어 다닐 때의 시점. 처음에는 1인칭으로 걷고, V 로 위에서 보기와 바꿉니다. (#71)
  const [view, setView] = useWalkView(); // 로비에서 바꾼 시점을 그대로 이어서 씁니다.
  const touch = useIsTouch(); // 폰 화면 조작 (#377)
  // 폰에서 공부 자리·키오스크·회의실을 누르면 잠깐 띄우는 안내 (#377 1단계: 공부는 PC에서). 쉬는 방(소파)은 그대로
  const [touchNote, setTouchNote] = useState("");
  useEffect(() => {
    if (!touchNote) return;
    const t = setTimeout(() => setTouchNote(""), TOUCH_NOTE_MS);
    return () => clearTimeout(t);
  }, [touchNote]);
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
  // 친구 따라가기·부르기: 요청이 있으면 친구 옆으로 옮김 (src/friends/useFollow)
  const teleport = useRef<Teleport | null>(null);
  const chat = useChat();
  useFollowArrival({
    place: branch.id,
    others,
    spots,
    obstacles,
    bounds: branch.size,
    teleportRef: teleport,
    onArrive: (friendId, reason, found, nickname) => {
      if (!found) {
        chat?.note("친구 위치를 찾지 못해 입구로 왔어요.");
        return;
      }
      chat?.note(`${nickname ?? "친구"} 님 옆으로 왔어요.`);
      chat?.tellArrived(friendId, reason);
    },
  });
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
  // 코르크 게시판 앞 자리도 같이 넘겨 E 를 받습니다 (앉지 않고 게시판 창을 엶)
  const boardSpot = useMemo(() => (branch.noteBoard ? noteBoardSpot(branch.noteBoard) : null), [branch]);
  const freeSpots = [...spots.filter((c) => !taken.has(c.no)), ...(boardSpot ? [boardSpot] : [])];
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
      ...(emote.current.jump ? { jump: emote.current.jump } : {}), // 점프 번호 (바뀌면 보는 사람 화면에서도 뜀)
      ...(sharedLevel(myTitle.visibility, myLevel) ? { lv: sharedLevel(myTitle.visibility, myLevel) } : {}), // 칭호
    };
  };

  // ── 카페: 빈자리에 앉으면 내 자리, 일어나면 놓기 (#44, useCafeSeat) ──
  const cafe = useCafeSeat(isCafe ? BRANCH_ID : null, seat !== null, setMySeat);
  const { conflict, message: cafeMessage } = cafe;

  const handleSeat = (no: number | null) => {
    if (no !== null) seatedAt.current = performance.now();
    // 카페에서 일어나면 자리를 놓습니다.
    if (no === null && isCafe) cafe.leave();
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
      if (e.code !== getKeymap().view || e.repeat || kioskOpen || orderOpen || panelOpen || meetingOpen || elevatorOpen || boardOpen) return; // 위에서 보기 ↔ 1인칭 (키는 설정에서 바꿈, #250)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      setView((v) => (v === "top" ? "first" : "top"));
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [kioskOpen, orderOpen, panelOpen, meetingOpen, elevatorOpen, boardOpen, setView]);

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
    disabled: kioskOpen || conflict !== null || studyDialogOpen || meetingOpen || elevatorOpen || boardOpen,
    onLobby: seat === null ? goLobby : undefined, // 앉아 있을 때는 L 로 나가지 않음 (공부 중 실수 방지)
    onTracking: seat === null ? goTracking : undefined, // T 도 같은 이유로 서 있을 때만
  });

  const seatSpot = spots.find((c) => c.no === seat);
  const seatDesk = branch.seats.find((c) => c.no === seat); // 앉은 자리 책상 가운데 (음료 내려놓기)
  // 조준점이 가리키는 사람 (#354): 1인칭으로 서 있고 창이 없을 때만. 앉아 있으면 E 는 일어나기뿐
  const aim = useAim();
  const { set: setAim } = aim;
  const aimOn = view === "first" && seat === null && !(kioskOpen || orderOpen || panelOpen || conflict || meetingOpen || elevatorOpen || boardOpen);
  const aimPerson = useCallback((t: AimTarget | null) => setAim("person", t), [setAim]);
  // 안내 문구에 보일 키 글자 (설정에서 바꾼 키를 따라감, #250)
  const keymap = useKeymap();
  const K = { view: keyLabel(keymap.view), interact: keyLabel(keymap.interact), emoteWheel: keyLabel(keymap.emoteWheel), recenter: keyLabel(keymap.recenter) };
  const viewHint = touch
    ? view === "top" ? "👁 1인칭으로" : "오른쪽을 끌어 둘러보기 · 👁 위에서 보기"
    : view === "top" ? `${K.view} 1인칭으로` : locked ? `Esc 커서 보이기 · ${K.view} 위에서 보기` : `클릭해서 둘러보기 · ${K.view} 위에서 보기`;
  const wasd = touch ? "" : "WASD·"; // 앉아 있을 때 안내: 폰은 화면 끌기만
  const walkHint =
    seat !== null
      ? isRest
        ? `${seat}번 소파 · 누워서 쉬는 중 · ${wasd}끌어서 둘러보기 · ${K.interact} 일어나기`
        : `${seat}번 좌석 · ${wasd}끌어서 둘러보기 · ${K.recenter} 정면 보기 · ${K.interact} 일어나기`
      : near === NOTE_BOARD_NO // 코르크 게시판 앞
        ? `코르크 게시판 · ${K.interact} 쪽지 보기·붙이기`
      : nearMeeting // 회의실 문 앞 (#45)
        ? `회의실 · ${K.interact} 들어가기`
      : nearElevator // 엘리베이터 문 앞 (여러 층 건물). 계단이면 두 층 사이를 바로 오감
        ? branch.stairs
          ? `계단 · ${K.interact} ${branch.stairs === "up" ? "위층으로 올라가기" : "아래층으로 내려가기"}`
          : `엘리베이터 · ${K.interact} 층 고르기`
      : nearExit // 출입문 앞 (의자·키오스크가 더 가까우면 그쪽이 먼저라 여기 오지 않음, #150)
        ? `출입문 · ${K.interact} ${toward(outside.title)} 나가기`
      : isRest
        ? near !== null
          ? `${near}번 소파 · ${K.interact} 눕기`
          : `빈 소파에서 ${K.interact}로 눕기 · 여기서는 공부 기록 없이 쉬어요`
      : isCafe
        ? near !== null
          ? `${near}번 좌석 · ${K.interact} 앉기`
          : nearKiosk && barista
            ? `카운터 · ${K.interact} 주문하기`
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
  const hint = kioskOpen || orderOpen || panelOpen || conflict || meetingOpen || elevatorOpen || boardOpen ? "" : studyPaused ? "⏸ 중지 중 · 다시 시작을 누르면 이어서 공부해요" : cafeMessage ? cafeMessage : touchNote ? touchNote : aimOn && aim.target ? `${aim.target.name} · ${K.interact} 프로필 보기` : seat !== null ? walkHint : touch ? `${walkHint} · ${viewHint}` : `${walkHint} · Shift 달리기 · ${K.emoteWheel} 감정표현 · ${viewHint}`;

  return (
    <>
    {/* 폰은 화면 해상도를 낮춰 가볍게, 화면 끌기가 확대·스크롤로 새지 않게 (#377) */}
    <Canvas dpr={touch ? [1, TOUCH_DPR] : undefined} style={{ touchAction: "none" }}>
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
            paused={kioskOpen || orderOpen || panelOpen || conflict !== null || meetingOpen || elevatorOpen || boardOpen}
            onLockChange={setLocked}
            emoteRef={emote}
            suspendLookRef={suspendLook}
          />
          {holding && <DrinkInView item={holding} emoteRef={emote} />} {/* 1인칭에선 내 몸이 숨겨지므로 받은 음료를 화면에 띄움 */}
        </>
      ) : (
        <TopDownCamera area={branch.size} />
      )}
      <FpsProbe onSample={handleFps} />
      {/* 지점 실내 (조명·바닥·벽·천장·가구·문·키오스크·커피 바). 광장에서 가게 창으로 보이는 실내도 같은 부품 (BranchInterior) */}
      {/* 받은 음료: 앉으면 그 자리 책상에 내려놓음 (소파 자리는 책상이 없어 그대로 듦) */}
      {holding && seatSpot && seatDesk && seatSpot.chair !== "lounger" && <DeskDrink key={seatSpot.no} item={holding} desk={seatDesk} rot={seatSpot.rot} />}
      {/* 카페 바리스타 (카운터 뒤) */}
      {barista && <BaristaNpc barista={barista} bubble={baristaSay} greetSeq={greet.seq} emote={greet.emote} />}
      <BranchInterior
        branch={branch}
        seat={seat}
        near={near}
        mySeat={mySeat}
        nearExit={nearExit}
        nearMeeting={nearMeeting}
        nearElevator={nearElevator}
        elevatorLabel={elevatorSpot ? `${floors.find((f) => f.slug === branch.id)?.level ?? 1}F` : null}
        exitLabel={outside.title}
        boardText={classNow ? boardText(classNow) : undefined}
        boardNotes={board.notes}
      />

      {/* 캠리단길 지점: 출입문 벽 문 양옆 통창으로 실제 거리가 보임 (캠빛 대학교 건물은 없음) */}
      {/* 루프탑(이끼 루프탑)은 천장이 없어 거리·하늘을 같은 장면에 루프탑 높이로 그림 (RooftopWorld) */}
      {branch.theme?.rooftop ? <RooftopWorld slug={branch.id} showPeople={condition === "visible"} /> : <CafeWindows layout={branch} showPeople={condition === "visible"} />}

      {/* 앉아 있을 때는 내 자리 표시가 시야를 가리므로 숨깁니다. 카페는 앉아 있는 동안만 내 자리라 표시하지 않습니다. */}
      {!isCafe && mySeat !== null && seat === null && (() => {
        const desk = branch.seats.find((s) => s.no === mySeat);
        return desk && <MySeatMarker x={desk.x} z={desk.z} />;
      })()}

      {/* 다른 참여자의 프로필 창: 1인칭은 조준점 + E, 위에서 보면 클릭. 앉아 있으면 열지 않음 */}
      {condition === "visible" && (
        <OtherParticipants
          others={others}
          spots={spots}
          onSelect={view === "top" && seat === null ? (userId) => setPanel({ kind: "profile", userId }) : undefined}
          aimOn={aimOn}
          onAim={aimPerson}
        />
      )}

      {/* 내 캐릭터를 읽은 뒤에 그립니다. (기본 캐릭터가 잠깐 보였다가 바뀌지 않게) */}
      {myModel && (
        <Player
          model={myModel}
          obstacles={obstacles}
          spawn={startAt}
          spawnHeading={arrival}
          emoteRef={emote}
          spots={freeSpots}
          kiosk={branch.kiosk ?? (barista ? orderSpot(barista) : NO_KIOSK)}
          frozen={kioskOpen || orderOpen || panelOpen || conflict !== null || meetingOpen || elevatorOpen || boardOpen || (seat !== null && studyDialogOpen)}
          onNear={setNear}
          onSeat={handleSeat}
          onNearKiosk={setNearKiosk}
          exit={branch.door}
          onNearExit={setNearExit}
          onExit={goLobby}
          meeting={meetingFront}
          onNearMeeting={setNearMeeting}
          onMeeting={() => (touch ? setTouchNote(STUDY_ON_PC) : setMeetingOpen(true))}
          elevator={elevatorSpot}
          onNearElevator={setNearElevator}
          onElevator={() => {
            // 계단: 두 층뿐이라 층 고르는 창 없이 바로 다른 층으로. 그 층 계단 앞에 섭니다
            const other = branch.stairs ? floors.find((f) => f.slug !== branch.id) : undefined;
            if (other && floors.length === 2) navigate(`/space?branch=${other.slug}`, { state: { at: "elevator" } });
            else setElevatorOpen(true);
          }}
          onKiosk={() => (barista ? setOrderOpen(true) : touch ? setTouchNote(STUDY_ON_PC) : setKioskOpen(true))}
          canSit={(no) => no !== NOTE_BOARD_NO && !(touch && !isRest) && no === mySeat}
          onSitBlocked={(no) => {
            if (no === NOTE_BOARD_NO) setBoardOpen(true); // 게시판은 폰에서도 읽고 쓸 수 있음
            else if (touch && !isRest) setTouchNote(STUDY_ON_PC);
            else if (isCafe) void cafe.claim(no);
          }}
          sitRef={cafe.sitRequest}
          aimRef={aim.current}
          onAim={(t) => setPanel({ kind: "profile", userId: t.id })}
          onMove={handleMove}
          teleportRef={teleport}
          holding={holding}
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
        breakTime={classNow?.phase === "break" ? { leftMs: classNow.leftMs } : null}
      />
    )}
    {bell && <ClassBellNotice key={bell} phase={bell} onDone={() => setBell(null)} />}
    {entry && !bell && <EntryNotice text={entry} onDone={() => setEntry(null)} />}
    {/* 칭호가 오르면 잠깐 뜨는 축하 카드. 누를 것도 초점도 없어 공부(타이머·판정)를 끊지 않습니다. */}
    {levelUp !== null && <LevelUpCard key={levelUp} level={levelUp} onDone={() => setLevelUp(null)} />}
    {!touch && <PerfReadout perf={perf} />}
    {(locked || (touch && view === "first")) && seat === null && (
      // 조준점: 마우스가 잠겨 커서가 없을 때 화면 가운데. 사람을 가리키고 E 를 누르면 프로필
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
    {/* 배경 소리 (휴식방 물소리). 지점 JSON 의 ambience 가 있는 곳에서만, 나가면 꺼짐 */}
    {branch.ambience && <AmbienceControl kind={branch.ambience} />}
    <ChatOverlay /> {/* 친구 귓속말 로그창 (#49) */}
    {/* 감정표현: 숫자키 1~8, X 바퀴 (#162). 창이 떠 있거나 앉아 있으면 쓰지 않습니다. */}
    <EmoteControls
      emoteRef={emote}
      suspendLookRef={suspendLook}
      disabled={kioskOpen || orderOpen || panelOpen || conflict !== null || meetingOpen || elevatorOpen || boardOpen || seat !== null || !emotesAllowed(branch.rules)}
    />
    {session && <SceneMenu myId={session.user.id} onOpen={setPanel} onLobby={studyPaused ? undefined : goLobby} lobbyLabel={toward(outside.title)} onTracking={studyPaused ? undefined : goTracking} />}
    {session && <SeatTimeCorner onLost={() => setMySeat(null)} placeKey={mySeat} />}
    {/* key: 단축키로 다른 창으로 바꾸면 새 창으로 엽니다 */}
    {panel && session && <InfoPanel key={panelKey(panel)} initial={panel} myId={session.user.id} here={{ place: branch.id, pos, heading: bodyHeading, mySeat }} onClose={() => setPanel(null)} />}
    {conflict && <CafeConflictDialog message={conflict.message} onClose={cafe.closeConflict} onReleaseAndSit={() => void cafe.releaseAndSit()} />}
    {boardOpen && (
      <BoardPanel notes={board.notes} myId={session?.user.id ?? null} onPost={board.post} onRemove={(id) => void board.remove(id)} onClose={() => setBoardOpen(false)} />
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
    {orderOpen && barista && (
      <OrderPanel title={info.name} menu={barista.menu} onPick={orderPicked} onClose={() => setOrderOpen(false)} />
    )}
    {kioskOpen && (
      <KioskScreen
        branchId={BRANCH_ID}
        onClose={() => setKioskOpen(false)}
        onAssigned={setMySeat}
      />
    )}
    {/* 폰 조작: 조이스틱·끌어서 둘러보기·[E]·점프·시점 (#377). 창이 떠 있으면 숨김 */}
    {touch && !(kioskOpen || orderOpen || panelOpen || conflict || meetingOpen || elevatorOpen || boardOpen) && (
      <TouchControls
        look={view === "first" && seat === null}
        move={seat === null}
        interactLabel={K.interact}
        onToggleView={() => setView((v) => (v === "top" ? "first" : "top"))}
      />
    )}
    {hint && (
      <div
        style={{
          position: "fixed",
          left: "50%",
          bottom: touch ? "calc(env(safe-area-inset-bottom) + 156px)" : 24, // 폰: 조이스틱·버튼 위로
          maxWidth: "calc(100vw - 32px)",
          textAlign: "center",
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
