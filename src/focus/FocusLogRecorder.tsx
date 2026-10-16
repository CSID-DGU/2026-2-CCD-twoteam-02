// 판정 자동 기록 (/tracking 전용 측정 도구)
// 화면을 열면 바로 1초마다 판정 결과를 한 줄씩 남깁니다. 다른 탭에 있어도 워커 신호로 계속 기록합니다.
// 긴 실험 중에 저장을 잊거나 새로고침해도 잃지 않도록, 기록은 이 브라우저 저장소(localStorage)에 계속 써 둡니다.
// 숫자만 남기고 영상은 남기지 않으며, 저장소는 이 컴퓨터 안에만 있습니다. "새로 시작"을 누르면 지워집니다.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { shownStudyMs } from "./focusLogic";
import type { FocusStatus } from "./focusLogic";
import { clockOf, segmentsOf, toCsv } from "./focusLog";
import type { FocusLogRow, LogSegment } from "./focusLog";
import type { FocusView } from "./useFocusState";
import { workerInterval } from "../lib/workerInterval";

const TICK_MS = 1000; // 기록 간격
const PREFIX = "focusLog:v1:"; // 저장소 키 앞부분
const CHUNK_ROWS = 300; // 저장소 한 칸에 담는 줄 수 (매초 전체를 다시 쓰지 않으려고 나눠 담음)
const SHOWN_SEGMENTS = 15; // 표에 보여 줄 최근 구간 수

const STATUS_LABEL: [FocusStatus, string][] = [
  ["focus", "집중"], ["away", "이탈"], ["drowsy", "졸음"], ["offscreen", "다른 화면"], ["outframe", "가이드"], ["phone", "휴대폰"],
];

function loadRows(): FocusLogRow[] {
  try {
    const chunks = Number(localStorage.getItem(`${PREFIX}chunks`) ?? 0);
    const rows: FocusLogRow[] = [];
    for (let i = 0; i < chunks; i++) rows.push(...(JSON.parse(localStorage.getItem(`${PREFIX}${i}`) ?? "[]") as FocusLogRow[]));
    return rows;
  } catch {
    return [];
  }
}

// 마지막 칸만 다시 씁니다. 실패(저장 공간 부족 등)하면 false.
function saveTail(rows: FocusLogRow[]): boolean {
  try {
    const last = Math.floor((rows.length - 1) / CHUNK_ROWS);
    localStorage.setItem(`${PREFIX}${last}`, JSON.stringify(rows.slice(last * CHUNK_ROWS)));
    localStorage.setItem(`${PREFIX}chunks`, String(last + 1));
    return true;
  } catch {
    return false;
  }
}

function clearRows() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch {
    // 저장소를 못 쓰는 환경이면 지울 것도 없습니다.
  }
}

const duration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

type Props = {
  face: RefObject<{ found: boolean; updatedAt: number | null }>;
  pose: RefObject<{ found: boolean; framed: boolean | null }>;
  focus: FocusView;
};

// 화면에 보여 줄 요약. 기록(ref)은 그리는 중에 읽을 수 없어서, 기록할 때마다 요약을 만들어 state로 넘깁니다.
type View = { count: number; elapsedMs: number; segments: LogSegment[] };
const viewOf = (rows: FocusLogRow[]): View => ({
  count: rows.length,
  elapsedMs: rows.length > 0 ? rows[rows.length - 1].at - rows[0].at : 0,
  segments: segmentsOf(rows),
});

export function FocusLogRecorder({ face, pose, focus }: Props) {
  const rows = useRef<FocusLogRow[]>([]);
  const [view, setView] = useState<View>({ count: 0, elapsedMs: 0, segments: [] });
  const [saveFailed, setSaveFailed] = useState(false);
  const focusRef = useRef(focus);
  useEffect(() => {
    focusRef.current = focus;
  });

  useEffect(() => {
    rows.current = loadRows(); // 새로고침 전 기록에 이어서 씁니다.
    const page = Date.now();
    return workerInterval(TICK_MS, () => {
      const f = focusRef.current;
      const now = Date.now();
      const { found, updatedAt } = face.current;
      const body = pose.current.framed === null ? null : pose.current.found;
      rows.current.push({
        at: now, page, hidden: document.hidden, windowFocused: document.hasFocus(), allowDevices: f.allowDevices,
        face: found, faceAgeMs: updatedAt === null ? null : now - updatedAt, body, status: f.status,
        awaySeconds: f.awaySeconds, closedSeconds: f.closedSeconds, studyMs: f.studyMs, shownMs: shownStudyMs(f),
      });
      setSaveFailed(!saveTail(rows.current));
      setView(viewOf(rows.current));
    });
  }, [face, pose]);

  const { count, elapsedMs, segments } = view;

  const download = () => {
    const blob = new Blob(["﻿" + toCsv(rows.current)], { type: "text/csv" }); // 엑셀에서 한글이 깨지지 않게 BOM
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `focus-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const restart = () => {
    if (!window.confirm("지금까지의 판정 기록을 지우고 새로 시작할까요? (필요하면 먼저 CSV를 내려받으세요)")) return;
    clearRows();
    rows.current = [];
    setView(viewOf([]));
  };

  return (
    <div style={styles.panel}>
      <div>
        <b>판정 자동 기록</b> · ● 기록 중 {count > 0 ? `${duration(elapsedMs)} (${count}줄)` : ""}
        {saveFailed ? " · ⚠ 저장 실패 — CSV를 내려받으세요" : " · 이 브라우저에 저장됨"}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={download} disabled={count === 0}>CSV 내려받기</button>
        <button type="button" onClick={restart}>새로 시작</button>
      </div>
      {segments.length > 0 && (
        <table style={styles.table}>
          <thead>
            <tr>
              {["시작", "길이", "화면", "학습기기", "늘어난 집중", ...STATUS_LABEL.map(([, l]) => `${l}(초)`), "최대 끊김(초)"].map((h) => (
                <th key={h} style={styles.cell}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {segments.slice(-SHOWN_SEGMENTS).map((s) => (
              <tr key={s.from}>
                <td style={styles.cell}>{clockOf(s.from)}</td>
                <td style={styles.cell}>{duration(s.to - s.from)}</td>
                <td style={styles.cell}>{s.screen}</td>
                <td style={styles.cell}>{s.allowDevices ? "사용함" : "안 함"}</td>
                <td style={styles.cell}>{duration(s.gainedMs)}</td>
                {STATUS_LABEL.map(([k]) => (
                  <td key={k} style={styles.cell}>{s.statusSeconds[k] ?? ""}</td>
                ))}
                <td style={{ ...styles.cell, color: s.gaps > 0 ? "#fbbf24" : undefined }}>{s.maxGapSeconds.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: {
    position: "absolute", right: 16, top: 64, maxWidth: "min(640px, calc(100% - 32px))", maxHeight: "40vh", overflow: "auto",
    padding: "8px 12px", borderRadius: 8, background: "rgba(0,0,0,.6)", color: "#fff",
    font: "12px/1.5 system-ui, sans-serif", display: "grid", gap: 6, textAlign: "left",
  },
  table: { borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" },
  cell: { padding: "2px 6px", borderBottom: "1px solid rgba(255,255,255,.15)", whiteSpace: "nowrap" },
};
