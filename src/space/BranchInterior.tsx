// 지점 실내 그리기: 조명, 바닥, 벽(캠리단길 지점은 통창 구멍), 천장·장식(Decor), 책상, 의자, 엘리베이터·회의실·출입문, 키오스크, 커피 바.
// 지점 화면(BranchScene)과 광장에서 가게 창으로 들여다보는 실내(world/ShopInteriors)가 같이 씁니다.
// 화면 상태(가까이 선 자리·내 자리·문 앞인지)는 props 로 받고, 광장에서 볼 때는 모두 기본 모습(강조 없음)입니다.
import { useMemo } from "react";
import { Billboard } from "@react-three/drei";
import type { BranchLayout } from "./layout";
import { CHAIR, KIOSK, SEAT, spotsOf } from "./layout";
import { LABEL_PX, labelTexture } from "./labelTexture";
import { DEFAULT_COLORS, DINER_DESK, TALL_STOOL_LEG, ceilingHeightOf, colorsOf, insideTable } from "./theme";
import { BarTable, Carrel, ComputerDesk, Counter, Decor, DinerDesk, ElevatorDoor, Lounger, LowTable, RingTable, RoundTable, SeatPad, Sofa, Stool, ThemedDoor, ThemedFloor, TubChair, WoodBooth, WoodChair } from "./Decor";
import { MY_SEAT_COLOR } from "./MySeatMarker";
import { cafeWallPieces } from "../world/cafeWindowsOf";
import { Cubicles, OfficeChair, ShellChair, Staircase } from "./StudyCafeDecor";
import { plasterTexture } from "./studyCafeTextures";
import { CorkBoard } from "../board/CorkBoard";
import type { BoardNote } from "../board/boardLogic";

const DOOR_HEIGHT = 2.2; // 출입문 높이 (로비 문과 같음)
const DOOR_SIGN = { width: 1.4, y: 1.75 }; // 출입문 위 "광장" 표지판
const DOOR_COLOR = { idle: "#4ade80", near: "#f59e0b" }; // 로비 문과 같은 색
const BAR_HEIGHT = 1.0; // 커피 바 카운터 높이

type Props = {
  branch: BranchLayout;
  seat?: number | null; // 앉아 있는 자리 (강조색)
  near?: number | null; // 앉을 수 있는 가까운 자리 (강조색)
  mySeat?: number | null; // 내 자리 (파란 의자)
  nearExit?: boolean;
  nearMeeting?: boolean;
  nearElevator?: boolean;
  elevatorLabel?: string | null; // 엘리베이터 표시판 글자 ("2F"). null 이면 엘리베이터 문을 안 그림(단층 건물)
  exitLabel: string; // 출입문 위 바깥 이름 ("캠리단길")
  boardText?: string; // 강의실 칠판 글자
  lights?: boolean; // 지점 조명(주변광·비스듬한 빛)을 같이 둘지
  boardNotes?: BoardNote[]; // 코르크 게시판에 꽂힌 쪽지 (광장에서 볼 때는 없음 = 빈 게시판)
};

export function BranchInterior({ branch, seat = null, near = null, mySeat = null, nearExit = false, nearMeeting = false, nearElevator = false, elevatorLabel = null, exitLabel, boardText, lights = true, boardNotes = [] }: Props) {
  const spots = spotsOf(branch);
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
  const cubicleSeats = useMemo(() => branch.seats.filter((s) => s.desk === "cubicle"), [branch]); // Cam Study Cafe 칸막이 책상 (한 번에 그림)
  return (
    <>
      {/* 조명·바닥·벽·책상 색은 지점 테마(#57)에서 읽습니다. 테마가 없으면 전과 같은 기본색입니다. */}
      {lights && <ambientLight intensity={colors.light.ambient} color={colors.light.color} />}
      {/* 1인칭에서 면이 구분되도록 비스듬한 빛을 더합니다. */}
      {lights && <directionalLight position={[6, 12, 4]} intensity={colors.light.sun} color={colors.light.color} />}

      <ThemedFloor floor={floorPattern} size={branch.size} color={colors.floor} />

      {/* 벽. 캠리단길 지점의 출입문 벽은 통창 자리를 비운 조각으로 그림 (부딪힘은 벽 그대로) */}
      {branch.walls.map((w, i) =>
        (cafeWallPieces(branch, w, wallH) ?? [{ x: w.x, y: wallH / 2, z: w.z, w: w.w, h: wallH, d: w.d }]).map((p, j) => (
          <mesh key={`${i}-${j}`} position={[p.x, p.y, p.z]}>
            <boxGeometry args={[p.w, p.h, p.d]} />
            {branch.theme?.wall?.texture === "plaster" ? (
              // 회벽 질감 (Cam Study Cafe): 색은 텍스처에 들어 있음
              <meshStandardMaterial map={plasterTexture(colors.wall, { x: 2, y: 1 })} roughness={0.95} />
            ) : (
              <meshStandardMaterial color={colors.wall} />
            )}
          </mesh>
        )),
      )}

      {/* 천장·팬·네온·액자 (테마가 있을 때만) */}
      <Decor theme={branch.theme} size={branch.size} boardText={boardText} />

      {/* 책상: 테마에 가구 모양(furniture)이 있으면 크롬 테두리·다리 테이블, 없으면 상자 */}
      {furniture?.tables?.map((t, i) => (
        <BarTable key={i} table={t} color={colors.desk} chrome={furniture.chrome} trim={furniture.trim} /> // 여러 자리가 같이 쓰는 바 테이블
      ))}
      {furniture?.rings?.map((r, i) => (
        <RingTable key={i} ring={r} color={colors.desk} height={DINER_DESK.height} /> // 나무를 둘러싼 고리 테이블
      ))}
      {branch.noteBoard && <CorkBoard board={branch.noteBoard} notes={boardNotes} />}

      {/* Cam Study Cafe 칸막이 책상: 자리가 많아 한 번에 찍어 그림 (아래 자리별 책상에서는 건너뜀) */}
      <Cubicles seats={cubicleSeats} />
      {branch.seats.map((s) => {
        if (s.desk === "cubicle" || s.desk === "bar") return null; // 창가 바 상판은 테마 소품(studyCafe)이 그림
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
        const chairEl = c.chair === "office" ? (
          <OfficeChair key={c.no} x={c.x} z={c.z} rot={c.rot} color={c.no === seat || c.no === near || c.no === mySeat ? chairColor : "#3a3b3e"} /> // 메시 사무용 의자 (칸막이 책상)
        ) : c.chair === "shell" ? (
          <ShellChair key={c.no} x={c.x} z={c.z} rot={c.rot} color={c.no === seat || c.no === near || c.no === mySeat ? chairColor : colors.chair} /> // 패브릭 셸 의자 (창가 바)
        ) : c.chair === "lounger" ? (
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
      {branch.elevator && elevatorLabel && branch.stairs && (
        // 계단 (Cam Study Cafe): 엘리베이터 문 자리에 계단을 그림
        <Staircase box={branch.elevator} height={wallH} dir={branch.stairs} near={nearElevator} nearColor={DOOR_COLOR.near} />
      )}
      {branch.elevator && elevatorLabel && !branch.stairs && (
        <ElevatorDoor
          box={branch.elevator}
          height={DOOR_HEIGHT}
          near={nearElevator}
          nearColor={DOOR_COLOR.near}
          label={elevatorLabel}
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
        <ThemedDoor box={branch.door} height={DOOR_HEIGHT} near={nearExit} nearColor={DOOR_COLOR.near} label={exitLabel} door={branch.theme.door} along="x" />
      ) : branch.door && (
        <group>
          <mesh position={[branch.door.x, DOOR_HEIGHT / 2, branch.door.z]}>
            <boxGeometry args={[branch.door.w, DOOR_HEIGHT, branch.door.d]} />
            <meshStandardMaterial color={nearExit ? DOOR_COLOR.near : DOOR_COLOR.idle} />
          </mesh>
          {/* 표지판은 문 안쪽 면(지점 쪽, -Z)을 보게 반 바퀴 돌립니다. */}
          <mesh position={[branch.door.x, DOOR_SIGN.y, branch.door.z - branch.door.d / 2 - 0.01]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[DOOR_SIGN.width, (DOOR_SIGN.width * LABEL_PX.h) / LABEL_PX.w]} />
            <meshBasicMaterial map={labelTexture(exitLabel, "#14532d")} transparent />
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

    </>
  );
}
