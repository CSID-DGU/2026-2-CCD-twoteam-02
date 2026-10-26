// 실험 진행 흐름의 순수 로직. 화면(SessionApp.tsx)과 분리해 Node로 검사합니다.
// 흐름(docs/사용자-실험-재설계.md 3절 진행 순서): 사전 설문 → [조건 시작 문구 → 과제 20분 → 조건 끝 설문 → 휴식] × 3 → 마무리.
// 과제 자리는 아직 비어 있습니다(과제 창 #191이 정해지면 끼워 넣음). 지금은 20분 타이머와 "과제 끝" 버튼만 있습니다.
import type { Phase, Store } from "../survey/surveyLogic";
import { STORE_PREFIX, isOrder, localIso } from "../survey/surveyLogic";
import type { Candidate, TaskRow } from "../task/taskLogic";

export const TASK_SECONDS = 1200; // 조건당 과제 시간 20분 (문서 3절)
export const TASK_SECONDS_OPTIONS = [TASK_SECONDS, 300, 120]; // 본 실험 20분 / 예비·연습 5분 / 화면 점검 2분
export const REST_SECONDS = 300; // 조건 사이 휴식 5분 (설문 포함, 문서 3절)

export type Condition = "A" | "B" | "C";

// 조건 시작 문구 (문서 3절 "참가자 안내 문구" 고정본). 진행자가 그대로 읽습니다. 글자에 조건 이름은 없습니다.
export const CONDITION_INTRO: Record<Condition, string> = {
  A: "지금부터 20분, 다른 방의 세 사람과 화상 화면으로 함께 공부합니다. 서로 카메라는 켜고 소리는 끕니다. 서로 말이나 채팅은 하지 않습니다.",
  B: "지금부터 20분, 혼자 공부하는 방입니다. 다른 사람은 없고, 당신도 누구에게도 보이지 않습니다.",
  C: "지금부터 20분, 다른 방의 세 사람과 같은 열람실에 앉습니다. 서로 캐릭터로만 보입니다. 서로 말이나 채팅은 하지 않습니다.",
};
export const TASK_INTRO = "할 수 있는 만큼 풀어 주세요. 정확하게, 그러나 서두르거나 쉬지 말고 평소 속도로."; // 과제 안내 (세 조건 동일)

export type Step =
  | { kind: "pre" }
  | { kind: "ready"; condition: Condition; index: number } // index: 몇 번째 조건(1~3)
  | { kind: "task"; condition: Condition; index: number }
  | { kind: "survey"; condition: Condition; index: number }
  | { kind: "rest"; index: number }
  | { kind: "final" }
  | { kind: "done" };

// 순서 문자열(예 "CBA")로 단계 목록을 만듭니다. 마지막 조건 뒤에는 휴식 대신 바로 마무리.
export function stepsOf(order: string): Step[] {
  if (!isOrder(order)) throw new Error(`조건 순서가 아닙니다: ${order}`);
  const steps: Step[] = [{ kind: "pre" }];
  [...order].forEach((c, i) => {
    const condition = c as Condition;
    const index = i + 1;
    steps.push({ kind: "ready", condition, index }, { kind: "task", condition, index }, { kind: "survey", condition, index });
    if (index < 3) steps.push({ kind: "rest", index });
  });
  steps.push({ kind: "final" }, { kind: "done" });
  return steps;
}

export const stepLabel = (s: Step): string => {
  switch (s.kind) {
    case "pre": return "사전 설문";
    case "ready": return `조건 ${s.index} 시작 안내`;
    case "task": return `조건 ${s.index} 과제`;
    case "survey": return `조건 ${s.index} 설문`;
    case "rest": return `휴식 ${s.index}`;
    case "final": return "마무리";
    case "done": return "끝";
  }
};

// 설문 단계가 쓰는 설문 시점
export const phaseOfStep = (s: Step): Phase | null => (s.kind === "pre" ? "pre" : s.kind === "survey" ? s.condition : s.kind === "final" ? "final" : null);

// 진행 상태: 어느 단계까지 왔는지. 새로고침해도 그 단계부터 이어 갑니다.
// 실험 방식. experiment = 본 실험(한 과제로 세 조건 모두), compare = 팀 피드백용 과제 비교(1·2번은 계산·오탈자 한 번씩, 3번은 고름 — 2026-10-23 사용자 결정).
export type SessionMode = "experiment" | "compare";
export const MODE_LABEL: Record<SessionMode, string> = { experiment: "본 실험 (한 과제로 세 번)", compare: "과제 비교 (팀 피드백용: 1·2번 한 번씩, 3번은 고름)" };

// 과제 비교 방식의 1·2번 과제 순서. 참가자 번호 홀수는 계산 먼저, 짝수는 오탈자 먼저(순서 치우침을 줄이려고).
export const compareDefaultKinds = (participantNumber: number): Candidate[] => (participantNumber % 2 === 1 ? ["calc", "typo"] : ["typo", "calc"]);

export type SessionProgress = {
  participant: string;
  order: string;
  mode: SessionMode;
  taskKind: Candidate; // 본 실험 방식의 과제 종류 (팀이 정하기 전이라 진행자가 고름)
  kindsByPosition?: Candidate[]; // 과제 비교 방식: 조건 차례(0~2)별 과제. 3번째는 고르기 전까지 비어 있음
  taskSeconds: number; // 과제 시간
  stepIndex: number;
  startedAt: string;
  taskStartedAt?: number; // 과제 단계에 들어간 시각(ms). 새로고침해도 타이머가 이어지게
  taskSeed?: number; // 이 조건의 문제 시드 (과제 시작 때 정함)
  restStartedAt?: number; // 휴식 단계에 들어간 시각(ms)
};

// 사건 기록: 단계가 바뀐 시각. 과제 CSV·설문 CSV와 시각을 맞춰 보는 데 씁니다.
export type SessionEvent = { participant: string; order: string; event: string; condition: string; at: string };

export const EVENT_HEADER = ["participant", "order", "event", "condition", "at"];

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function eventsCsv(rows: SessionEvent[]): string {
  return [EVENT_HEADER.join(","), ...rows.map((r) => [r.participant, r.order, r.event, r.condition, r.at].map(csvCell).join(","))].join("\n");
}

export function eventsCsvName(participant: string, at: Date): string {
  return `session-${participant}-${localIso(at).slice(0, 19).replace(/[:T]/g, "-")}.csv`;
}

// 단계 진입 사건 이름. done은 기록하지 않습니다(final_done이 끝).
export function eventOfStep(s: Step, when: "start" | "end"): { event: string; condition: string } | null {
  switch (s.kind) {
    case "pre": return { event: `pre_${when}`, condition: "" };
    case "ready": return when === "start" ? { event: "ready", condition: s.condition } : null;
    case "task": return { event: `task_${when}`, condition: s.condition };
    case "survey": return { event: `survey_${when}`, condition: s.condition };
    case "rest": return when === "start" ? { event: "rest_start", condition: "" } : null;
    case "final": return { event: `final_${when}`, condition: "" };
    case "done": return null;
  }
}

// ── 저장소 ──
const progressKey = (p: string) => `${STORE_PREFIX}${p}:session`;
const eventsKey = (p: string) => `${STORE_PREFIX}${p}:events`;

export function loadSession(store: Store, participant: string): SessionProgress | null {
  try {
    const raw = store.get(progressKey(participant));
    return raw ? (JSON.parse(raw) as SessionProgress) : null;
  } catch {
    return null;
  }
}

export function saveSession(store: Store, p: SessionProgress): boolean {
  try {
    store.set(progressKey(p.participant), JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export function loadEvents(store: Store, participant: string): SessionEvent[] {
  try {
    return JSON.parse(store.get(eventsKey(participant)) ?? "[]") as SessionEvent[];
  } catch {
    return [];
  }
}

export function appendEvent(store: Store, e: SessionEvent): SessionEvent[] {
  const next = [...loadEvents(store, e.participant), e];
  try {
    store.set(eventsKey(e.participant), JSON.stringify(next));
  } catch {
    // 저장 실패해도 화면은 계속 갑니다. 끝에서 내려받을 때 빠진 줄은 없는 대로 나갑니다.
  }
  return next;
}

// k번째 조건(0부터)의 과제 종류. 비교 방식에서 아직 안 골랐으면 null.
export function kindForPosition(p: SessionProgress, position: number): Candidate | null {
  if (p.mode === "experiment") return p.taskKind;
  return p.kindsByPosition?.[position] ?? null;
}

// 과제 기록: 조건마다 따로 저장 (새로고침 뒤 이어 하기, 끝에서 전체 CSV)
const taskKey = (p: string, condition: Condition) => `${STORE_PREFIX}${p}:task:${condition}`;

export function loadTaskRows(store: Store, participant: string, condition: Condition): TaskRow[] {
  try {
    return JSON.parse(store.get(taskKey(participant, condition)) ?? "[]") as TaskRow[];
  } catch {
    return [];
  }
}

export function saveTaskRows(store: Store, participant: string, condition: Condition, rows: TaskRow[]): boolean {
  try {
    store.set(taskKey(participant, condition), JSON.stringify(rows));
    return true;
  } catch {
    return false;
  }
}

export const taskCsvName = (participant: string, condition: Condition | "all", at: Date) =>
  `task-${participant}-${condition}-${localIso(at).slice(0, 19).replace(/[:T]/g, "-")}.csv`;

// 남은 초 (과제 타이머). 음수는 0.
export const secondsLeft = (startedAt: number, now: number, total: number) => Math.max(0, total - Math.floor((now - startedAt) / 1000));
