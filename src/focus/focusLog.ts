// 판정 자동 기록의 순수 로직 (/tracking 전용 측정 도구, 화면은 FocusLogRecorder.tsx)
// 1초마다 판정 결과를 숫자로 한 줄씩 남기고, 화면 상태(보임·다른 탭·다른 앱)가 바뀐 구간별로 요약합니다.
// 영상은 남기지 않습니다.
import type { FocusStatus } from "./focusLogic";

export const LOG_GAP_SECONDS = 3; // 기록 사이가 이보다 벌어지면 "끊김"으로 봅니다 (브라우저가 반복을 늦췄거나 컴퓨터가 잠듦)

export type FocusLogRow = {
  at: number; // 기록 시각 (Date.now)
  page: number; // 페이지를 연 시각. 새로고침하면 바뀌고, 집중 시간도 0부터 다시 셉니다
  hidden: boolean; // 다른 탭
  windowFocused: boolean; // false면 다른 앱·다른 창
  allowOtherScreen: boolean; // 다른 탭·앱 사용함
  allowDevices: boolean; // 휴대폰·학습기기 사용함
  face: boolean; // 얼굴 찾음
  faceAgeMs: number | null; // 마지막 인식 뒤 지난 시간 (인식이 멈췄는지 확인용)
  body: boolean | null; // 몸(Pose) 찾음, null = 모름
  status: FocusStatus;
  awaySeconds: number;
  closedSeconds: number;
  studyMs: number; // 확정된 집중 시간
  shownMs: number; // 화면에 보이는 집중 시간 (확정 + 보류)
};

// 2026-10-21 이전에 저장된 줄은 allowDevices 하나뿐이다(체크 하나가 둘 다 허용했음). 없는 칸은 그 값으로 채운다.
export function withBothFlags(row: Omit<FocusLogRow, "allowOtherScreen"> & { allowOtherScreen?: boolean }): FocusLogRow {
  return { ...row, allowOtherScreen: row.allowOtherScreen ?? row.allowDevices };
}

export type ScreenKind = "보임" | "다른 탭" | "다른 앱";
export const screenOf = (row: FocusLogRow): ScreenKind =>
  row.hidden ? "다른 탭" : row.windowFocused ? "보임" : "다른 앱";

export type LogSegment = {
  from: number;
  to: number;
  screen: ScreenKind;
  allowOtherScreen: boolean;
  allowDevices: boolean;
  gainedMs: number; // 이 구간에서 늘어난 화면 집중 시간
  statusSeconds: Partial<Record<FocusStatus, number>>; // 상태별로 머문 시간(초, 기록 줄 수 기준)
  maxGapSeconds: number; // 가장 길게 끊긴 기록 간격
  gaps: number; // LOG_GAP_SECONDS 넘게 끊긴 횟수
};

// 화면 상태·두 허용 설정·페이지(새로고침)가 바뀔 때마다 구간을 나눕니다.
export function segmentsOf(rows: FocusLogRow[]): LogSegment[] {
  const result: LogSegment[] = [];
  let start: FocusLogRow | null = null;
  let current: LogSegment | null = null;
  let prev: FocusLogRow | null = null;
  for (const row of rows) {
    const screen = screenOf(row);
    const split =
      !current || !prev || !start || screen !== current.screen ||
      row.allowOtherScreen !== current.allowOtherScreen || row.allowDevices !== current.allowDevices || row.page !== prev.page;
    if (split) {
      current = {
        from: row.at, to: row.at, screen, allowOtherScreen: row.allowOtherScreen, allowDevices: row.allowDevices,
        gainedMs: 0, statusSeconds: {}, maxGapSeconds: 0, gaps: 0,
      };
      // 바로 앞 줄이 같은 페이지면 그 줄부터 재야 구간 경계의 1초가 빠지지 않습니다.
      start = prev && prev.page === row.page ? prev : row;
      result.push(current);
    } else if (prev) {
      const gap = (row.at - prev.at) / 1000;
      current!.maxGapSeconds = Math.max(current!.maxGapSeconds, gap);
      if (gap > LOG_GAP_SECONDS) current!.gaps++;
    }
    const seg = current!;
    seg.to = row.at;
    seg.gainedMs = row.shownMs - start!.shownMs;
    seg.statusSeconds[row.status] = (seg.statusSeconds[row.status] ?? 0) + 1;
    prev = row;
  }
  return result;
}

const CSV_HEADER = [
  "시각", "페이지", "화면", "다른 탭·앱", "휴대폰·기기", "얼굴", "인식 지난 ms", "몸", "상태", "안 보인 초", "눈 감은 초", "확정 집중 초", "화면 집중 초",
];

// 시각을 "17:22:05" 형식으로
export const clockOf = (ms: number) => {
  const d = new Date(ms);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
};

export function toCsv(rows: FocusLogRow[]): string {
  const lines = rows.map((r) =>
    [
      clockOf(r.at), r.page, screenOf(r), r.allowOtherScreen ? "켬" : "끔", r.allowDevices ? "켬" : "끔", r.face ? 1 : 0, r.faceAgeMs ?? "",
      r.body === null ? "" : r.body ? 1 : 0, r.status, r.awaySeconds.toFixed(1), r.closedSeconds.toFixed(1),
      (r.studyMs / 1000).toFixed(1), (r.shownMs / 1000).toFixed(1),
    ].join(",")
  );
  return [CSV_HEADER.join(","), ...lines].join("\n");
}
