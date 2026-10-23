// 실험 설문 화면. 입구는 survey.tsx, 문항은 surveyItems.ts, 순수 로직은 surveyLogic.ts.
// 설계: docs/superpowers/specs/2026-10-23-survey-screen-design.md (Issue #201)
//
// 흐름: 시작(진행자가 참가자 번호·시점·순서 입력) → 묶음별 문항 → 끝(CSV 자동 내려받기).
// 응답은 답할 때마다 이 브라우저 저장소에 쌓여 새로고침해도 남고, 시점이 끝나면 CSV로 내려받습니다.
// 참가자 화면에는 조건 이름이나 점수를 띄우지 않습니다.
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { PHASES, PHASE_LABEL, csvName, isOrder, isParticipant, loadAnswers, loadProgress, nextProgress, saveProgress } from "./surveyLogic";
import type { Phase, Progress } from "./surveyLogic";
import { GROUPS_BY_PHASE } from "./surveyItems";
import { SurveyQuestions } from "./SurveyQuestions";
import type { SurveySetup } from "./SurveyQuestions";
import { browserStore, downloadCsv } from "./surveyBrowser";

type Setup = SurveySetup;

function setupFromUrl(): Setup {
  const q = new URLSearchParams(location.search);
  const phase = q.get("phase") ?? "";
  return {
    participant: q.get("participant") ?? "",
    phase: (PHASES as string[]).includes(phase) ? (phase as Phase) : "pre",
    order: q.get("order") ?? "",
  };
}

export default function SurveyApp() {
  const [setup, setSetup] = useState<Setup>(setupFromUrl);
  const [running, setRunning] = useState<Progress | null>(null);
  const [finished, setFinished] = useState(false);

  if (!running) {
    return (
      <SetupScreen
        setup={setup}
        onChange={setSetup}
        onStart={(p) => {
          setRunning(p);
          setFinished(false);
        }}
      />
    );
  }
  if (!finished) {
    return <SurveyQuestions setup={setup} progress={running} onFinish={() => setFinished(true)} />;
  }
  return <DoneScreen setup={setup} attempt={running.attempt} onHome={() => setRunning(null)} />;
}

// ── 시작 화면 (진행자) ──
function SetupScreen({ setup, onChange, onStart }: { setup: Setup; onChange: (s: Setup) => void; onStart: (p: Progress) => void }) {
  const validParticipant = isParticipant(setup.participant);
  const validOrder = isOrder(setup.order);
  const saved = validParticipant ? loadAnswers(browserStore, setup.participant) : [];
  const prev = validParticipant ? loadProgress(browserStore, setup.participant, setup.phase) : null;
  const groups = GROUPS_BY_PHASE[setup.phase];

  let hint = "";
  if (prev && !prev.done) hint = `${PHASE_LABEL[setup.phase]} 설문을 ${prev.groupIndex + 1}번째 묶음(${groups[prev.groupIndex]?.title})부터 이어 합니다.`;
  else if (prev?.done) hint = `${PHASE_LABEL[setup.phase]} 설문은 이미 끝났습니다. 다시 하면 응답이 덧붙여집니다(덮어쓰지 않음).`;

  return (
    <main style={styles.page}>
      <h1 style={styles.h1}>실험 설문</h1>
      <p style={styles.muted}>진행자가 채우는 화면입니다. 시작을 누르면 참가자에게 넘깁니다.</p>
      <label style={styles.field}>
        참가자 번호 (P01 꼴)
        <input style={styles.input} value={setup.participant} onChange={(e) => onChange({ ...setup, participant: e.target.value.trim().toUpperCase() })} placeholder="P01" />
        {setup.participant !== "" && !validParticipant && <span style={styles.warn}>P 뒤에 숫자 2~3자리</span>}
      </label>
      <fieldset style={styles.fieldset}>
        <legend>시점</legend>
        {PHASES.map((p) => (
          <label key={p} style={styles.radio}>
            <input type="radio" checked={setup.phase === p} onChange={() => onChange({ ...setup, phase: p })} />
            {PHASE_LABEL[p]}
          </label>
        ))}
      </fieldset>
      <label style={styles.field}>
        조건 순서 (예: CBA)
        <input style={styles.input} value={setup.order} onChange={(e) => onChange({ ...setup, order: e.target.value.trim().toUpperCase() })} placeholder="CBA" />
        {setup.order !== "" && !validOrder && <span style={styles.warn}>A·B·C를 한 번씩, 세 글자</span>}
      </label>
      {hint && <p style={styles.notice}>{hint}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          style={styles.primary}
          disabled={!validParticipant || !validOrder}
          onClick={() => {
            const { progress } = nextProgress(prev, setup.phase, Date.now());
            saveProgress(browserStore, setup.participant, progress);
            onStart(progress);
          }}
        >
          시작
        </button>
        {saved.length > 0 && (
          <button type="button" style={styles.button} onClick={() => downloadCsv(saved, csvName(setup.participant, "all", new Date()))}>
            전체 CSV 내려받기 ({saved.length}행)
          </button>
        )}
      </div>
    </main>
  );
}

// ── 끝 화면 ──
function DoneScreen({ setup, attempt, onHome }: { setup: Setup; attempt: number; onHome: () => void }) {
  const rows = useMemo(
    () => loadAnswers(browserStore, setup.participant).filter((a) => a.phase === setup.phase && a.attempt === attempt),
    [setup.participant, setup.phase, attempt],
  );
  const downloaded = useRef(false);
  useEffect(() => {
    if (downloaded.current) return; // StrictMode에서 두 번 그려도 한 번만
    downloaded.current = true;
    downloadCsv(rows, csvName(setup.participant, setup.phase, new Date()));
  }, [rows, setup.participant, setup.phase]);

  return (
    <main style={styles.page}>
      <h1 style={styles.h1}>저장되었습니다</h1>
      <p>답해 주셔서 감사합니다. 진행자에게 알려 주세요.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={styles.button} onClick={() => downloadCsv(rows, csvName(setup.participant, setup.phase, new Date()))}>
          CSV 다시 내려받기 ({rows.length}행)
        </button>
        <button type="button" style={styles.button} onClick={onHome}>시작 화면으로</button>
      </div>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 760, margin: "0 auto", padding: "24px 16px 48px", font: "16px/1.6 system-ui, sans-serif", color: "#111", display: "grid", gap: 16 },
  h1: { fontSize: 22, margin: 0 },
  muted: { color: "#666", fontSize: 14, margin: 0 },
  warn: { color: "#b45309", fontSize: 14 },
  notice: { background: "#f3f4f6", borderRadius: 8, padding: "8px 12px", margin: 0, fontSize: 15 },
  field: { display: "grid", gap: 4 },
  fieldset: { border: "1px solid #ccc", borderRadius: 8, padding: "8px 12px", display: "grid", gap: 6 },
  radio: { display: "flex", gap: 6, alignItems: "center" },
  input: { font: "inherit", padding: "6px 8px", border: "1px solid #bbb", borderRadius: 6, maxWidth: 200 },
  textarea: { font: "inherit", padding: "6px 8px", border: "1px solid #bbb", borderRadius: 6, width: "100%", boxSizing: "border-box" },
  primary: { font: "inherit", padding: "10px 20px", border: "none", borderRadius: 8, background: "#2563eb", color: "#fff", cursor: "pointer", justifySelf: "start" },
  button: { font: "inherit", padding: "10px 20px", border: "1px solid #bbb", borderRadius: 8, background: "#fff", cursor: "pointer" },
  bar: { display: "flex", justifyContent: "space-between", color: "#444", fontSize: 14 },
  item: { borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "grid", gap: 8 },
  question: { margin: 0, fontSize: 17 },
  likert: { display: "flex", gap: 4, flexWrap: "wrap" },
  likertCell: { display: "grid", justifyItems: "center", gap: 2, minWidth: 64, flex: "1 1 64px", cursor: "pointer", textAlign: "center" },
  likertNum: { fontVariantNumeric: "tabular-nums" },
  likertLabel: { fontSize: 12, color: "#555", minHeight: 16 },
  choices: { display: "grid", gap: 4 },
};
