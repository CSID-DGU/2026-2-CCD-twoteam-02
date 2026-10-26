// 실험 설문 화면의 순수 로직. 화면(SurveyApp.tsx)과 분리해 Node로 바로 검사할 수 있게 둡니다.
// 설계: docs/superpowers/specs/2026-10-23-survey-screen-design.md, 문항: docs/실험-설문지.md (Issue #201)
//
// 저장하는 것은 참가자 번호·시점·문항 코드·응답·시각뿐입니다. 이름·연락처는 어디에도 쓰지 않습니다.

export type Phase = "pre" | "A" | "B" | "C" | "final";
export const PHASES: Phase[] = ["pre", "A", "B", "C", "final"];
export const PHASE_LABEL: Record<Phase, string> = {
  pre: "사전 설문", A: "조건 A 끝", B: "조건 B 끝", C: "조건 C 끝", final: "마무리 (진행자 입력)",
};

// 공존감 문항의 "(the room)" 자리에 넣는 말. A는 화상 화면이라 "열람실"이 어색해 "공간". 팀이 통일하면 여기만 바꿉니다.
export const PLACE_WORD: Record<Phase, string> = { pre: "열람실", A: "공간", B: "열람실", C: "열람실", final: "열람실" };
export const PLACE_TOKEN = "{장소}";

export const STORE_PREFIX = "survey:v1:"; // 브라우저 저장소 키 앞부분

export type Scale =
  | { kind: "likert"; min: number; max: number; labels: Record<number, string> } // 라벨은 양 끝·중간만 있어도 됨
  | { kind: "choice"; options: string[] }
  | { kind: "text" };

export type Item = {
  code: string;
  text: string;
  scale: Scale;
  reverse?: boolean; // 표시용. 저장은 원 응답 그대로
  intro?: string; // 질문 앞에 상자로 따로 보여 줄 설명 (예: 바디더블링 정의). 질문과 섞이지 않게 (팀 피드백 2026-10-26)
  textByPhase?: Partial<Record<Phase, string>>; // 시점별로 다른 문장이 있으면 이것이 우선 (예: B 조건은 상대가 없어 문장을 바꿈)
  phases?: Phase[]; // 적으면 그 시점에만 보여 줍니다. 없으면 모든 시점
};
export type Group = {
  id: string;
  title: string;
  note?: string; // 묶음 위 안내문
  noteByPhase?: Partial<Record<Phase, string>>; // 시점별로 다른 안내문이 있으면 이것이 우선
  footer?: string; // 묶음 맨 아래 작은 글씨 (저작권 고지처럼 참가자가 먼저 읽을 필요는 없는 것)
  items: Item[];
};

// 응답 한 줄. attempt는 같은 시점을 다시 했을 때 구분하는 회차(1부터). CSV에는 넣지 않고 answered_at으로 구분합니다.
export type Answer = {
  participant: string;
  phase: Phase;
  order: string;
  attempt: number;
  code: string;
  value: string;
  answeredAt: string; // ISO, 지역 시차 포함
  msSinceShown: number;
};

// 진행 상태. 중간에 끊기면 같은 묶음부터 이어 가기 위해 둡니다.
export type Progress = { phase: Phase; attempt: number; groupIndex: number; shownAt: number; done: boolean };

export const isParticipant = (s: string) => /^P\d{2,3}$/.test(s); // P01 ~ P999
export const isOrder = (s: string) => s.length === 3 && [...s].sort().join("") === "ABC"; // ABC의 순열

export const fillPlace = (text: string, phase: Phase) => text.split(PLACE_TOKEN).join(PLACE_WORD[phase]);

// 묶음 안내문: 시점별 안내가 있으면 그것, 없으면 공통 안내.
export const noteOf = (g: Group, phase: Phase) => fillPlace(g.noteByPhase?.[phase] ?? g.note ?? "", phase);

// 이 시점에 보여 줄 문항. phases 를 적은 문항은 그 시점에만 나옵니다.
export const itemsOf = (g: Group, phase: Phase) => g.items.filter((it) => !it.phases || it.phases.includes(phase));

// 문항 문장: 시점별 문장이 있으면 그것, 없으면 공통 문장.
export const textOf = (it: Item, phase: Phase) => fillPlace(it.textByPhase?.[phase] ?? it.text, phase);

// 같은 참가자·시점·회차·문항이면 마지막 값으로 바꿉니다(한 문항은 한 행). 다른 회차는 그대로 남습니다.
export function upsertAnswer(list: Answer[], a: Answer): Answer[] {
  const i = list.findIndex((x) => x.participant === a.participant && x.phase === a.phase && x.attempt === a.attempt && x.code === a.code);
  if (i < 0) return [...list, a];
  const next = list.slice();
  next[i] = a;
  return next;
}

// 묶음의 모든 문항에 답했는지. "text" 문항은 비워도 됩니다(메모).
export function groupComplete(g: Group, answers: Answer[], phase: Phase, attempt: number): boolean {
  return itemsOf(g, phase).every((it) => it.scale.kind === "text" || answers.some((a) => a.phase === phase && a.attempt === attempt && a.code === it.code));
}

// 지역 시차가 붙은 ISO 시각 (예: 2026-11-10T14:32:10+09:00). UTC로 적으면 실험 기록과 맞춰 보기 불편해서입니다.
export function localIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const CSV_HEADER = ["participant", "phase", "order", "code", "value", "answered_at", "ms_since_shown"];

// docs/실험-설문지.md 3절의 열 그대로. BOM은 내려받을 때 화면이 붙입니다.
export function toCsv(rows: Answer[]): string {
  const body = rows.map((r) => [r.participant, r.phase, r.order, r.code, r.value, r.answeredAt, r.msSinceShown].map(csvCell).join(","));
  return [CSV_HEADER.join(","), ...body].join("\n");
}

export function csvName(participant: string, phase: Phase | "all", at: Date): string {
  return `survey-${participant}-${phase}-${localIso(at).slice(0, 19).replace(/[:T]/g, "-")}.csv`;
}

// ── 저장소 (브라우저 API를 주입받아 Node에서도 검사) ──
export type Store = { get(k: string): string | null; set(k: string, v: string): void };

const answersKey = (p: string) => `${STORE_PREFIX}${p}:answers`;
const progressKey = (p: string, phase: Phase) => `${STORE_PREFIX}${p}:progress:${phase}`;

export function loadAnswers(store: Store, participant: string): Answer[] {
  try {
    return JSON.parse(store.get(answersKey(participant)) ?? "[]") as Answer[];
  } catch {
    return [];
  }
}

// 실패(저장 공간 부족 등)하면 false. 화면은 그때 "저장 실패" 표시를 띄웁니다.
export function saveAnswers(store: Store, participant: string, rows: Answer[]): boolean {
  try {
    store.set(answersKey(participant), JSON.stringify(rows));
    return true;
  } catch {
    return false;
  }
}

export function loadProgress(store: Store, participant: string, phase: Phase): Progress | null {
  try {
    const raw = store.get(progressKey(participant, phase));
    return raw ? (JSON.parse(raw) as Progress) : null;
  } catch {
    return null;
  }
}

export function saveProgress(store: Store, participant: string, p: Progress): boolean {
  try {
    store.set(progressKey(participant, p.phase), JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

// 시작할 때 진행 상태를 정합니다. 없으면 1회차 처음부터, 진행 중이면 그 묶음부터 이어서, 끝났으면 다음 회차 처음부터.
export type StartKind = "new" | "resume" | "again";
export function nextProgress(prev: Progress | null, phase: Phase, now: number): { kind: StartKind; progress: Progress } {
  if (!prev) return { kind: "new", progress: { phase, attempt: 1, groupIndex: 0, shownAt: now, done: false } };
  if (!prev.done) return { kind: "resume", progress: { ...prev, shownAt: now } }; // 다시 보인 시각부터 잽니다
  return { kind: "again", progress: { phase, attempt: prev.attempt + 1, groupIndex: 0, shownAt: now, done: false } };
}
