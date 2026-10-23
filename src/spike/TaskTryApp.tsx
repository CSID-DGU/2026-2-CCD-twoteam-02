// 사용자 실험 과제 후보 시험 (spike) 화면. 입구는 taskTry.tsx, 순수 로직은 taskTryLogic.ts.
//
// 흐름: 이름·후보·시간 고르기 → 시작 → 문항을 할 수 있는 만큼 풀기 → 시간이 끝나면 요약 + 메모 → CSV 내려받기.
// 로그인·Supabase·웹캠을 쓰지 않습니다. 과제가 정해지면 이 화면과 taskTryLogic.ts는 지웁니다.
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import {
  CANDIDATE_LABEL, CHECK_SECONDS, TRY_SECONDS, TYPO_PASSAGES,
  makeCalcProblem, passageOrder, scoreTypo, seededRandom, summarize, toCsv,
} from "./taskTryLogic";
import type { Candidate, CalcProblem, Memo, TrialRecord, TrialRow } from "./taskTryLogic";

const TICK_MS = 250; // 남은 시간 표시 갱신 간격

type Setup = { name: string; candidate: Candidate; seconds: number };

export default function TaskTryApp() {
  const [setup, setSetup] = useState<Setup>({ name: "", candidate: "calc", seconds: TRY_SECONDS });
  const [trial, setTrial] = useState<TrialRecord | null>(null);
  const [finished, setFinished] = useState(false);

  if (!trial) {
    return (
      <SetupScreen
        setup={setup}
        onChange={setSetup}
        onStart={() => {
          const seed = Date.now() % 1_000_000;
          setTrial({ ...setup, seed, startedAt: Date.now(), rows: [], memo: { boring: null, tired: null, studyLike: null, comment: "" } });
          setFinished(false);
        }}
      />
    );
  }
  if (!finished) {
    return (
      <TrialScreen
        trial={trial}
        onFinish={(rows) => {
          setTrial({ ...trial, rows });
          setFinished(true);
        }}
      />
    );
  }
  return (
    <ResultScreen
      trial={trial}
      onMemo={(memo) => setTrial({ ...trial, memo })}
      onAgain={() => setTrial(null)}
    />
  );
}

// ── 시작 화면 ──
function SetupScreen({ setup, onChange, onStart }: { setup: Setup; onChange: (s: Setup) => void; onStart: () => void }) {
  return (
    <main style={styles.page}>
      <h1 style={styles.h1}>과제 후보 시험</h1>
      <p style={styles.muted}>
        후보를 하나 골라 {TRY_SECONDS / 60}분 동안 할 수 있는 만큼 풉니다. 정확하게, 그러나 서두르거나 쉬지 말고 평소 속도로.
        끝나면 지루함·피로·공부 같음을 적고 CSV를 내려받아 주세요.
      </p>
      <label style={styles.field}>
        이름(또는 표시)
        <input style={styles.input} value={setup.name} onChange={(e) => onChange({ ...setup, name: e.target.value })} placeholder="예: 원준" />
      </label>
      <fieldset style={styles.fieldset}>
        <legend>후보</legend>
        {(Object.keys(CANDIDATE_LABEL) as Candidate[]).map((c) => (
          <label key={c} style={styles.radio}>
            <input type="radio" checked={setup.candidate === c} onChange={() => onChange({ ...setup, candidate: c })} />
            {CANDIDATE_LABEL[c]}
            <span style={styles.muted}>
              {c === "calc" ? " — 두 자리 + 두 자리 덧셈. 답을 치고 Enter." : " — 짧은 문단에서 틀린 글자를 눌러 표시하고 '다음'."}
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset style={styles.fieldset}>
        <legend>시간</legend>
        {[TRY_SECONDS, CHECK_SECONDS].map((s) => (
          <label key={s} style={styles.radio}>
            <input type="radio" checked={setup.seconds === s} onChange={() => onChange({ ...setup, seconds: s })} />
            {s / 60}분{s === CHECK_SECONDS ? " (화면 점검용)" : ""}
          </label>
        ))}
      </fieldset>
      <button type="button" style={styles.primary} disabled={setup.name.trim() === ""} onClick={onStart}>
        시작
      </button>
    </main>
  );
}

// ── 시험 화면: 타이머 + 후보별 문항 ──
function TrialScreen({ trial, onFinish }: { trial: TrialRecord; onFinish: (rows: TrialRow[]) => void }) {
  const rows = useRef<TrialRow[]>([]);
  const start = trial.startedAt; // 시작 시각은 부모가 시험을 만들 때 적어 둔 값
  const [leftMs, setLeftMs] = useState(trial.seconds * 1000);
  const [count, setCount] = useState(0);
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish); // 부모가 다시 그려도 타이머를 새로 시작하지 않게
  useEffect(() => {
    onFinishRef.current = onFinish;
  });

  useEffect(() => {
    const id = setInterval(() => {
      const left = trial.seconds * 1000 - (Date.now() - start);
      setLeftMs(Math.max(0, left));
      if (left <= 0 && !finishedRef.current) {
        finishedRef.current = true;
        clearInterval(id);
        onFinishRef.current(rows.current);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [trial.seconds, start]);

  const elapsed = () => Date.now() - start;
  const push = (row: Omit<TrialRow, "index">) => {
    rows.current.push({ index: rows.current.length + 1, ...row });
    setCount(rows.current.length);
  };

  const mm = Math.floor(leftMs / 60000);
  const ss = String(Math.floor((leftMs % 60000) / 1000)).padStart(2, "0");

  return (
    <main style={styles.page}>
      <div style={styles.bar}>
        <span>{CANDIDATE_LABEL[trial.candidate]} · {trial.name}</span>
        <span style={styles.timer}>{mm}:{ss}</span>
        <span>{count}문항</span>
      </div>
      {trial.candidate === "calc" ? (
        <CalcTask seed={trial.seed} elapsed={elapsed} onAnswer={push} />
      ) : (
        <TypoTask seed={trial.seed} elapsed={elapsed} onAnswer={push} />
      )}
    </main>
  );
}

type TaskProps = { seed: number; elapsed: () => number; onAnswer: (row: Omit<TrialRow, "index">) => void };

function CalcTask({ seed, elapsed, onAnswer }: TaskProps) {
  const rand = useMemo(() => seededRandom(seed), [seed]);
  const [problem, setProblem] = useState<CalcProblem>(() => makeCalcProblem(rand));
  const [shownMs, setShownMs] = useState(0);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    if (v === "") return; // 빈 Enter는 무시
    onAnswer({
      shownMs, answeredMs: elapsed(), problem: `${problem.a}+${problem.b}`, answer: String(problem.answer),
      input: v, correct: Number(v) === problem.answer, detail: problem.carry ? "받아올림" : "", missed: "", wrong: "",
    });
    setProblem(makeCalcProblem(rand));
    setShownMs(elapsed());
    setInput("");
    inputRef.current?.focus();
  };

  return (
    <form onSubmit={submit} style={styles.center}>
      <div style={styles.problem}>
        {problem.a} + {problem.b} =
      </div>
      <input
        ref={inputRef}
        autoFocus
        inputMode="numeric"
        pattern="[0-9]*"
        style={styles.answer}
        value={input}
        onChange={(e) => setInput(e.target.value.replace(/[^0-9]/g, ""))}
      />
      <p style={styles.muted}>답을 치고 Enter</p>
    </form>
  );
}

function TypoTask({ seed, elapsed, onAnswer }: TaskProps) {
  const order = useMemo(() => passageOrder(seededRandom(seed)), [seed]);
  const [pos, setPos] = useState(0); // 지문 순서상 위치 (바닥나면 처음부터 다시)
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [shownMs, setShownMs] = useState(0);
  const passage = TYPO_PASSAGES[order[pos % order.length]];
  const round = Math.floor(pos / order.length) + 1;

  const toggle = (i: number) => {
    if (passage.chars[i].trim() === "") return; // 공백은 누를 수 없음
    const next = new Set(marked);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setMarked(next);
  };

  const next = () => {
    const s = scoreTypo(passage, marked);
    onAnswer({
      shownMs, answeredMs: elapsed(), problem: `지문${order[pos % order.length] + 1}${round > 1 ? ` (${round}회차)` : ""}`,
      answer: String(passage.typoAt.length), input: String(marked.size),
      correct: s.misses === 0 && s.falseMarks === 0, detail: `${s.hits}/${s.misses}/${s.falseMarks}`, missed: s.missed, wrong: s.wrong,
    });
    setPos(pos + 1);
    setMarked(new Set());
    setShownMs(elapsed());
  };

  return (
    <div style={styles.center}>
      <p style={styles.passage}>
        {passage.chars.map((ch, i) => (
          <span
            key={i}
            onClick={() => toggle(i)}
            style={{ ...styles.char, ...(marked.has(i) ? styles.marked : null), cursor: ch.trim() === "" ? "default" : "pointer" }}
          >
            {ch}
          </span>
        ))}
      </p>
      <p style={styles.muted}>틀린 글자를 눌러 표시하세요. 다시 누르면 지워집니다. 다 찾았으면 '다음'. {marked.size}개 표시</p>
      <button type="button" style={styles.primary} onClick={next}>다음</button>
    </div>
  );
}

// ── 결과 + 메모 ──
const MEMO_ITEMS: [keyof Omit<Memo, "comment">, string][] = [
  ["boring", "지루함 (1 전혀 ~ 5 매우)"],
  ["tired", "피로 (1 전혀 ~ 5 매우)"],
  ["studyLike", "공부 같음 (1 전혀 ~ 5 매우)"],
];

function ResultScreen({ trial, onMemo, onAgain }: { trial: TrialRecord; onMemo: (m: Memo) => void; onAgain: () => void }) {
  const s = summarize(trial.rows, trial.seconds, trial.candidate);
  const [saved, setSaved] = useState(false);

  const download = () => {
    const blob = new Blob(["﻿" + toCsv(trial)], { type: "text/csv" }); // 엑셀에서 한글이 깨지지 않게 BOM
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `task-try-${trial.candidate}-${trial.name}-${new Date(trial.startedAt).toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  };

  return (
    <main style={styles.page}>
      <h1 style={styles.h1}>끝났습니다</h1>
      <table style={styles.table}>
        <tbody>
          <tr><td>후보</td><td>{CANDIDATE_LABEL[trial.candidate]}</td></tr>
          <tr><td>답한 문항</td><td>{s.done}</td></tr>
          <tr><td>{trial.candidate === "calc" ? "맞힌 수" : "맞게 찾은 오타"}</td><td>{s.correct}</td></tr>
          <tr><td>분당 맞힌 수</td><td>{s.perMinute.toFixed(1)}</td></tr>
          <tr><td>문항당 중앙값</td><td>{(s.medianMs / 1000).toFixed(1)}초</td></tr>
        </tbody>
      </table>
      <WrongList trial={trial} />
      <fieldset style={styles.fieldset}>
        <legend>메모 (과제를 고르는 기준)</legend>
        {MEMO_ITEMS.map(([key, label]) => (
          <div key={key} style={styles.field}>
            {label}
            <div style={{ display: "flex", gap: 12 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} style={styles.radio}>
                  <input type="radio" checked={trial.memo[key] === n} onChange={() => onMemo({ ...trial.memo, [key]: n })} />
                  {n}
                </label>
              ))}
            </div>
          </div>
        ))}
        <label style={styles.field}>
          한 줄 메모
          <input style={styles.input} value={trial.memo.comment} onChange={(e) => onMemo({ ...trial.memo, comment: e.target.value })} />
        </label>
      </fieldset>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" style={styles.primary} onClick={download}>CSV 내려받기</button>
        <button type="button" style={styles.button} onClick={onAgain} disabled={!saved}>
          {saved ? "다른 후보 해 보기" : "먼저 CSV를 내려받으세요"}
        </button>
      </div>
    </main>
  );
}

// 틀린 문항만 모아 보여 줍니다. 계산은 틀린 문제·입력, 오탈자는 놓친 글자(원문→오타)와 잘못 누른 글자.
function WrongList({ trial }: { trial: TrialRecord }) {
  const wrong = trial.rows.filter((r) => !r.correct);
  if (wrong.length === 0) return <p style={styles.muted}>틀린 문항이 없습니다.</p>;
  const isCalc = trial.candidate === "calc";
  return (
    <div style={styles.field}>
      <b>틀린 문항 {wrong.length}개</b>
      <table style={styles.table}>
        <thead>
          <tr>
            {(isCalc ? ["문항", "문제", "정답", "입력"] : ["문항", "지문", "놓친 오타(원문→오타)", "잘못 누른 글자"]).map((h) => (
              <th key={h} style={styles.cell}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {wrong.map((r) => (
            <tr key={r.index}>
              <td style={styles.cell}>{r.index}</td>
              <td style={styles.cell}>{r.problem}</td>
              <td style={styles.cell}>{isCalc ? r.answer : r.missed || "—"}</td>
              <td style={styles.cell}>{isCalc ? r.input : r.wrong || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 720, margin: "0 auto", padding: "24px 16px", font: "16px/1.6 system-ui, sans-serif", color: "#111", display: "grid", gap: 16 },
  h1: { fontSize: 22, margin: 0 },
  muted: { color: "#666", fontSize: 14, margin: 0 },
  field: { display: "grid", gap: 4 },
  fieldset: { border: "1px solid #ccc", borderRadius: 8, padding: "8px 12px", display: "grid", gap: 6 },
  radio: { display: "flex", gap: 6, alignItems: "center" },
  input: { font: "inherit", padding: "6px 8px", border: "1px solid #bbb", borderRadius: 6 },
  primary: { font: "inherit", padding: "10px 20px", border: "none", borderRadius: 8, background: "#2563eb", color: "#fff", cursor: "pointer" },
  button: { font: "inherit", padding: "10px 20px", border: "1px solid #bbb", borderRadius: 8, background: "#fff", cursor: "pointer" },
  bar: { display: "flex", justifyContent: "space-between", alignItems: "center", color: "#444", fontSize: 14 },
  timer: { fontSize: 20, fontVariantNumeric: "tabular-nums", fontWeight: 600 },
  center: { display: "grid", gap: 16, justifyItems: "center", paddingTop: 48 },
  problem: { fontSize: 48, fontVariantNumeric: "tabular-nums" },
  answer: { font: "inherit", fontSize: 40, width: 160, textAlign: "center", padding: "6px 8px", border: "2px solid #bbb", borderRadius: 8 },
  passage: { fontSize: 22, lineHeight: 2, margin: 0, wordBreak: "keep-all", userSelect: "none" },
  char: { padding: "2px 1px", borderRadius: 4 },
  marked: { background: "#fde68a", textDecoration: "underline", textDecorationColor: "#d97706" },
  table: { borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" },
  cell: { padding: "2px 10px", borderBottom: "1px solid #ddd", textAlign: "left" },
};
