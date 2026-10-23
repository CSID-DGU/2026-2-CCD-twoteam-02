// 사용자 실험 과제 후보 시험(spike)의 순수 로직. 화면(taskTry.tsx)과 분리해 Node로 바로 검사할 수 있게 둡니다.
//
// 목적: docs/사용자-실험-재설계.md 3절 "과제 선정 절차" 1단계 — 팀원이 후보 ① 단순 계산, ② 오탈자 찾기를
// 각 10분씩 혼자 해 보고 지루함·피로·"공부 같음"을 메모해 과제를 정합니다. 실제 과제 창(#191)은 정한 뒤 따로 만듭니다.
// 영상·개인정보는 다루지 않고, 남는 것은 문항·입력·시각 숫자뿐입니다.

export const TRY_SECONDS = 600; // 후보당 시험 시간 (문서: 10분)
export const SHORT_SECONDS = 300; // 회의 시간이 짧을 때 쓰는 5분 (10-23 결정, 기본값). 2분은 지루함·피로가 쌓이기 전이라 짧음
export const CHECK_SECONDS = 120; // 화면이 잘 도는지 보는 짧은 점검용

// 문제 생성·지문·채점은 실험 과제 로직과 같은 것을 씁니다 (한 곳만 고치면 되게).
export { CALC_MIN, CALC_MAX, CARRY_RATIO, CANDIDATE_LABEL, seededRandom, hasCarry, makeCalcProblem, TYPO_SOURCES, parsePassage, TYPO_PASSAGES, passageOrder, scoreTypo } from "../experiment/task/taskLogic";
export type { Candidate, CalcProblem, TypoPassage, TypoScore, AnswerRow } from "../experiment/task/taskLogic";
import { CANDIDATE_LABEL } from "../experiment/task/taskLogic";
import type { Candidate, AnswerRow } from "../experiment/task/taskLogic";

// ── 기록 ──
export type TrialRow = AnswerRow & { index: number }; // 몇 번째 문항

export type Memo = { boring: number | null; tired: number | null; studyLike: number | null; comment: string };

export type TrialSummary = {
  done: number; // 답한 문항 수
  correct: number; // 계산: 맞힌 수 / 오탈자: 맞게 찾은 오타 수
  perMinute: number; // 분당 맞힌 수 (주 지표와 같은 꼴)
  medianMs: number; // 문항당 걸린 시간의 중앙값
};

export function summarize(rows: TrialRow[], seconds: number, candidate: Candidate): TrialSummary {
  const correct =
    candidate === "calc"
      ? rows.filter((r) => r.correct).length
      : rows.reduce((s, r) => s + Number(r.detail.split("/")[0] || 0), 0);
  const times = rows.map((r) => r.answeredMs - r.shownMs).sort((x, y) => x - y);
  const medianMs = times.length === 0 ? 0 : times[Math.floor(times.length / 2)];
  return { done: rows.length, correct, perMinute: seconds > 0 ? (correct / seconds) * 60 : 0, medianMs };
}

export type TrialRecord = {
  name: string;
  candidate: Candidate;
  seed: number;
  seconds: number;
  startedAt: number; // Date.now()
  rows: TrialRow[];
  memo: Memo;
};

const csvCell = (v: string | number | boolean | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// 위쪽에 요약·메모(# 로 시작), 아래에 문항별 표. 한 파일로 두어 회의에서 바로 비교하기 쉽게 합니다.
export function toCsv(t: TrialRecord): string {
  const s = summarize(t.rows, t.seconds, t.candidate);
  const head = [
    ["# 이름", t.name],
    ["# 후보", CANDIDATE_LABEL[t.candidate]],
    ["# 시작", new Date(t.startedAt).toISOString()],
    ["# 시간(초)", t.seconds],
    ["# 시드", t.seed],
    ["# 답한 문항", s.done],
    ["# 맞힌 수", s.correct],
    ["# 분당 맞힌 수", s.perMinute.toFixed(2)],
    ["# 문항당 중앙값(ms)", s.medianMs],
    ["# 지루함(1~5)", t.memo.boring],
    ["# 피로(1~5)", t.memo.tired],
    ["# 공부 같음(1~5)", t.memo.studyLike],
    ["# 한 줄 메모", t.memo.comment],
  ];
  const header = ["문항", "보인 시각ms", "답한 시각ms", "걸린ms", "문제", "정답", "입력", "맞음", "세부", "놓침", "잘못 누름"];
  const body = t.rows.map((r) => [
    r.index, r.shownMs, r.answeredMs, r.answeredMs - r.shownMs, r.problem, r.answer, r.input, r.correct ? 1 : 0, r.detail, r.missed, r.wrong,
  ]);
  return [...head, header, ...body].map((row) => row.map(csvCell).join(",")).join("\n");
}
