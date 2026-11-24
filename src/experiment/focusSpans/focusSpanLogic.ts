// 초록불·노란불·빨간불 구간 기록의 순수 로직. 화면과 분리해 Node로 검사합니다.
// 설계: docs/superpowers/specs/2026-11-24-four-comparison-experiment-design.md 6-3절 (참고 수치: 초록불 비율)
//
// 좌석 화면(StudyRunner)이 공부 중에 "언제부터 언제까지 무슨 불이었는지"를 구간으로 남기고,
// 실험 진행 화면(experiment.html)이 조건별 과제 시간(task_start ~ task_end)으로 잘라 비율을 냅니다.
// 두 화면은 같은 주소(같은 브라우저 저장소)를 쓰므로 서버를 거치지 않습니다.
// 남기는 것은 상태와 시각뿐입니다. 영상은 저장하지도 보내지도 않습니다.
import type { FocusStatus } from "../../focus/focusLogic";
import type { Store } from "../survey/surveyLogic";
import { STORE_PREFIX, localIso } from "../survey/surveyLogic";
import type { SessionEvent } from "../session/sessionLogic";

// 표시등 색. 규칙은 space/status.ts·CLAUDE.md 용어와 같습니다.
//   green  = 공부 중
//   yellow = 의심 중(보류). 가이드라인 이탈(outframe)도 노란불
//   red    = 기준을 넘겨 타이머가 멈춤 (away, drowsy, offscreen, phone)
export type Light = "green" | "yellow" | "red";
export type HoldReason = "face" | "eyes" | "frame" | "phone";
// 구간의 이유. 초록불은 focus, 보류는 hold_*, 나머지는 판정 상태 이름 그대로
export type SpanReason = FocusStatus | `hold_${HoldReason}`;

export const TICK_MS = 1000; // 기록 간격
export const GAP_MS = 5000; // 마지막 기록에서 이 시간 넘게 비면 이어 붙이지 않고 새 구간으로 봅니다 (화면을 떠났다 돌아온 경우)
export const MAX_SPANS = 5000; // 저장소에 두는 구간 수. 넘으면 오래된 것부터 버립니다 (구간은 불이 바뀔 때만 늘어남)

export type Span = { user: string; from: number; to: number; light: Light; reason: SpanReason };

export function lightOf(status: FocusStatus, hold: HoldReason | null): { light: Light; reason: SpanReason } {
  if (status === "focus") return hold ? { light: "yellow", reason: `hold_${hold}` } : { light: "green", reason: "focus" };
  if (status === "outframe") return { light: "yellow", reason: "outframe" };
  return { light: "red", reason: status };
}

// 지금 상태를 구간 목록에 반영합니다. 같은 상태가 이어지면 마지막 구간의 끝만 늘리고, 바뀌면 앞 구간을 지금 시각에 닫고 새 구간을 엽니다.
// 받은 배열은 바꾸지 않고 새 배열을 돌려줍니다.
export function extend(spans: Span[], now: number, user: string, light: Light, reason: SpanReason): Span[] {
  const last = spans[spans.length - 1];
  const fresh: Span = { user, from: now, to: now, light, reason };
  if (!last || last.user !== user || now - last.to > GAP_MS || now < last.to) return [...spans, fresh].slice(-MAX_SPANS);
  const closed = { ...last, to: now };
  if (last.light === light && last.reason === reason) return [...spans.slice(0, -1), closed];
  return [...spans.slice(0, -1), closed, fresh].slice(-MAX_SPANS);
}

// ── 조건별 요약 ──
export const REASONS: SpanReason[] = ["focus", "hold_face", "hold_eyes", "hold_frame", "hold_phone", "outframe", "away", "drowsy", "offscreen", "phone"];
const RED_REASONS: SpanReason[] = ["away", "drowsy", "offscreen", "phone"];

export type Summary = {
  windowMs: number; // 과제 시간 길이
  recordedMs: number; // 그중 기록이 있는 시간 (좌석에서 공부 중이던 시간). 과제 시간보다 짧으면 그만큼 기록이 비었다는 뜻
  lightMs: Record<Light, number>;
  reasonMs: Record<SpanReason, number>;
  redCount: Record<string, number>; // 빨간불 종류별 횟수 (과제 시간 안에 걸친 구간 수)
};

// [from, to) 시간 창 안의 구간만 잘라서 더합니다.
export function summarize(spans: Span[], from: number, to: number): Summary {
  const lightMs: Record<Light, number> = { green: 0, yellow: 0, red: 0 };
  const reasonMs = Object.fromEntries(REASONS.map((r) => [r, 0])) as Record<SpanReason, number>;
  const redCount: Record<string, number> = Object.fromEntries(RED_REASONS.map((r) => [r, 0]));
  let recordedMs = 0;
  for (const s of spans) {
    const ms = Math.min(s.to, to) - Math.max(s.from, from);
    if (ms <= 0) continue;
    recordedMs += ms;
    lightMs[s.light] += ms;
    reasonMs[s.reason] = (reasonMs[s.reason] ?? 0) + ms;
    if (s.light === "red") redCount[s.reason] = (redCount[s.reason] ?? 0) + 1;
  }
  return { windowMs: Math.max(0, to - from), recordedMs, lightMs, reasonMs, redCount };
}

// 비율. 분모는 기록이 있는 시간입니다(과제 시간 전체가 아님). 기록이 없으면 null.
export const ratioOf = (s: Summary, light: Light): number | null => (s.recordedMs > 0 ? s.lightMs[light] / s.recordedMs : null);

// 진행 기록(task_start, task_end)에서 조건별 과제 시간 창을 찾습니다. 같은 조건이 두 번 있으면 마지막 것을 씁니다.
export type TaskWindow = { condition: string; from: number; to: number };
export function taskWindows(events: SessionEvent[]): TaskWindow[] {
  const start = new Map<string, number>();
  const done = new Map<string, TaskWindow>();
  for (const e of events) {
    const at = Date.parse(e.at);
    if (Number.isNaN(at)) continue;
    if (e.event === "task_start") start.set(e.condition, at);
    if (e.event === "task_end" && start.has(e.condition)) done.set(e.condition, { condition: e.condition, from: start.get(e.condition)!, to: at });
  }
  return [...done.values()].sort((a, b) => a.from - b.from);
}

// ── CSV ──
const csvCell = (v: string | number) => (typeof v === "string" && /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v));
const sec = (ms: number) => (ms / 1000).toFixed(1);
const pct = (v: number | null) => (v === null ? "" : v.toFixed(4));

export const SUMMARY_HEADER = [
  "participant", "order", "condition", "task_start", "task_end", "task_seconds", "recorded_seconds",
  "green_seconds", "yellow_seconds", "red_seconds", "green_ratio", "yellow_ratio", "red_ratio",
  ...REASONS.map((r) => `${r}_seconds`), ...RED_REASONS.map((r) => `${r}_count`),
];

// 조건마다 한 줄. 기록이 없는 조건(예: 화상 화면 A는 트래킹을 돌리지 않음)은 recorded_seconds가 0이고 비율이 빈칸입니다.
export function summaryCsv(participant: string, order: string, spans: Span[], windows: TaskWindow[]): string {
  const rows = windows.map((w) => {
    const s = summarize(spans, w.from, w.to);
    return [
      participant, order, w.condition, localIso(new Date(w.from)), localIso(new Date(w.to)), sec(s.windowMs), sec(s.recordedMs),
      sec(s.lightMs.green), sec(s.lightMs.yellow), sec(s.lightMs.red), pct(ratioOf(s, "green")), pct(ratioOf(s, "yellow")), pct(ratioOf(s, "red")),
      ...REASONS.map((r) => sec(s.reasonMs[r])), ...RED_REASONS.map((r) => s.redCount[r]),
    ].map(csvCell).join(",");
  });
  return [SUMMARY_HEADER.join(","), ...rows].join("\n");
}

export const SPAN_HEADER = ["participant", "condition", "from", "to", "seconds", "light", "reason"];

// 과제 시간 안의 구간을 그대로(창에 맞춰 잘라서) 내보냅니다. 요약을 다시 계산하거나 시간 흐름을 볼 때 씁니다.
export function spansCsv(participant: string, spans: Span[], windows: TaskWindow[]): string {
  const rows = windows.flatMap((w) =>
    spans
      .map((s) => ({ ...s, from: Math.max(s.from, w.from), to: Math.min(s.to, w.to) }))
      .filter((s) => s.to > s.from)
      .map((s) => [participant, w.condition, localIso(new Date(s.from)), localIso(new Date(s.to)), sec(s.to - s.from), s.light, s.reason].map(csvCell).join(","))
  );
  return [SPAN_HEADER.join(","), ...rows].join("\n");
}

export const focusCsvName = (participant: string, kind: "summary" | "spans", at: Date) =>
  `focus-${kind}-${participant}-${localIso(at).slice(0, 19).replace(/[:T]/g, "-")}.csv`;

// ── 저장소 ── (참가자 번호를 좌석 화면은 모르므로 키에 넣지 않고, 진행 화면이 과제 시각으로 잘라 씁니다)
const SPANS_KEY = `${STORE_PREFIX}focus:spans`;

export function loadSpans(store: Store): Span[] {
  try {
    return JSON.parse(store.get(SPANS_KEY) ?? "[]") as Span[];
  } catch {
    return [];
  }
}

export function saveSpans(store: Store, spans: Span[]): boolean {
  try {
    store.set(SPANS_KEY, JSON.stringify(spans));
    return true;
  } catch {
    return false;
  }
}
