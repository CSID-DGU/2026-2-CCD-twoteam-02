// 실험 진행 화면. 한 참가자의 실험 전체(사전 설문 → 조건 3개 → 마무리)를 한 창에서 순서대로 진행합니다.
// 입구는 session.tsx(/experiment.html), 흐름 로직은 sessionLogic.ts, 설문 문항 화면은 ../survey/SurveyQuestions.tsx.
//
// 진행자가 보는 화면(시작, 조건 시작 안내, 휴식, 마무리 입력, 끝)과 참가자가 보는 화면(설문, 과제)이 번갈아 나옵니다.
// 참가자 화면에는 조건 이름(A/B/C)을 띄우지 않습니다. 진행자 화면에만 작게 표시합니다.
// 과제 자리는 아직 비어 있습니다. 과제 창(#191)이 정해지면 TaskPlaceholder 자리에 끼웁니다.
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { PHASE_LABEL, csvName, isOrder, isParticipant, loadAnswers, loadProgress, localIso, nextProgress, saveProgress } from "../survey/surveyLogic";
import type { Progress } from "../survey/surveyLogic";
import { SurveyQuestions } from "../survey/SurveyQuestions";
import { browserStore, downloadCsv, downloadText } from "../survey/surveyBrowser";
import {
  CONDITION_INTRO, MODE_LABEL, REST_SECONDS, TASK_INTRO, TASK_SECONDS_OPTIONS, appendEvent, compareDefaultKinds, eventOfStep, eventsCsv, eventsCsvName,
  kindForPosition, loadEvents, loadSession, loadTaskRows, phaseOfStep, saveSession, saveTaskRows, secondsLeft, stepLabel, stepsOf, taskCsvName,
} from "./sessionLogic";
import type { Condition, SessionMode, SessionProgress, Step } from "./sessionLogic";
import { useNow } from "./useNow";
import { CANDIDATE_LABEL, setFor, taskCsv } from "../task/taskLogic";
import type { AnswerRow, Candidate, TaskRow } from "../task/taskLogic";
import { TaskPanel } from "../task/TaskPanel";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function SessionApp() {
  const [session, setSession] = useState<SessionProgress | null>(null);
  if (!session) return <StartScreen onStart={setSession} />;
  return <Runner session={session} onUpdate={setSession} onHome={() => setSession(null)} />;
}

// ── 시작 (진행자) ──
function StartScreen({ onStart }: { onStart: (s: SessionProgress) => void }) {
  const q = new URLSearchParams(location.search);
  const [participant, setParticipant] = useState((q.get("participant") ?? "").toUpperCase());
  const [order, setOrder] = useState((q.get("order") ?? "").toUpperCase());
  const [mode, setMode] = useState<SessionMode>(q.get("mode") === "compare" ? "compare" : "experiment");
  const [taskKind, setTaskKind] = useState<Candidate>(q.get("task") === "typo" ? "typo" : "calc");
  const [taskSeconds, setTaskSeconds] = useState(TASK_SECONDS_OPTIONS[0]);
  const okP = isParticipant(participant);
  const okO = isOrder(order);
  const prev = okP ? loadSession(browserStore, participant) : null;
  const steps = okO ? stepsOf(order) : [];

  const start = () => {
    const now = new Date();
    const s: SessionProgress = prev ?? {
      participant, order, mode, taskKind, taskSeconds, stepIndex: 0, startedAt: localIso(now),
      kindsByPosition: mode === "compare" ? compareDefaultKinds(Number(participant.slice(1)) || 0) : undefined,
    };
    if (!prev) {
      saveSession(browserStore, s);
      appendEvent(browserStore, { participant, order, event: "session_start", condition: "", at: localIso(now) });
    }
    onStart(s);
  };

  return (
    <main style={styles.page}>
      <h1 style={styles.h1}>실험 진행</h1>
      <p style={styles.muted}>진행자가 채우는 화면입니다. 시작을 누르면 사전 설문부터 순서대로 진행됩니다.</p>
      <label style={styles.field}>
        참가자 번호 (P01 꼴)
        <input style={styles.input} value={participant} onChange={(e) => setParticipant(e.target.value.trim().toUpperCase())} placeholder="P01" />
        {participant !== "" && !okP && <span style={styles.warn}>P 뒤에 숫자 2~3자리</span>}
      </label>
      <label style={styles.field}>
        조건 순서 (예: CBA)
        <input style={styles.input} value={order} onChange={(e) => setOrder(e.target.value.trim().toUpperCase())} placeholder="CBA" />
        {order !== "" && !okO && <span style={styles.warn}>A·B·C를 한 번씩, 세 글자</span>}
      </label>
      <fieldset style={styles.fieldset}>
        <legend>실험 방식</legend>
        {(Object.keys(MODE_LABEL) as SessionMode[]).map((m) => (
          <label key={m} style={styles.radio}>
            <input type="radio" checked={mode === m} onChange={() => setMode(m)} disabled={!!prev} />
            {MODE_LABEL[m]}
          </label>
        ))}
        {mode === "compare" && okP && (
          <p style={styles.muted}>
            이 참가자는 1번 {CANDIDATE_LABEL[compareDefaultKinds(Number(participant.slice(1)) || 0)[0]]}, 2번{" "}
            {CANDIDATE_LABEL[compareDefaultKinds(Number(participant.slice(1)) || 0)[1]]}, 3번은 시작 안내 화면에서 고릅니다.
          </p>
        )}
      </fieldset>
      {mode === "experiment" && (
        <fieldset style={styles.fieldset}>
          <legend>과제 종류 (참가자가 고른 것. 세 조건 모두 같은 과제)</legend>
          {(Object.keys(CANDIDATE_LABEL) as Candidate[]).map((k) => (
            <label key={k} style={styles.radio}>
              <input type="radio" checked={taskKind === k} onChange={() => setTaskKind(k)} disabled={!!prev} />
              {CANDIDATE_LABEL[k]}
            </label>
          ))}
        </fieldset>
      )}
      <fieldset style={styles.fieldset}>
        <legend>과제 시간</legend>
        {TASK_SECONDS_OPTIONS.map((sec) => (
          <label key={sec} style={styles.radio}>
            <input type="radio" checked={taskSeconds === sec} onChange={() => setTaskSeconds(sec)} disabled={!!prev} />
            {sec / 60}분{sec === TASK_SECONDS_OPTIONS[0] ? " (본 실험)" : sec === TASK_SECONDS_OPTIONS[1] ? " (예비·연습)" : " (화면 점검)"}
          </label>
        ))}
      </fieldset>
      {prev && (
        <p style={styles.notice}>
          이 참가자는 진행 중이던 기록이 있습니다. {prev.order} 순서, {prev.mode === "compare" ? "과제 비교" : CANDIDATE_LABEL[prev.taskKind]} {prev.taskSeconds / 60}분,
          "{stepLabel(stepsOf(prev.order)[prev.stepIndex])}" 단계부터 이어 갑니다.
          {prev.order !== order && order !== "" && " (입력한 순서는 무시되고 저장된 순서를 씁니다.)"}
        </p>
      )}
      {okO && !prev && (
        <p style={styles.muted}>순서: {steps.filter((s) => s.kind !== "done").map(stepLabel).join(" → ")}</p>
      )}
      <button type="button" style={styles.primary} disabled={!okP || !(okO || prev)} onClick={start}>
        {prev ? "이어 하기" : "시작"}
      </button>
    </main>
  );
}

// ── 단계 진행 ──
function Runner({ session, onUpdate, onHome }: { session: SessionProgress; onUpdate: (s: SessionProgress) => void; onHome: () => void }) {
  const steps = stepsOf(session.order);
  const step = steps[Math.min(session.stepIndex, steps.length - 1)];

  // 단계가 끝나면 사건을 적고 다음 단계로. 다음 단계의 시작 사건도 적고, 과제·휴식이면 그 시작 시각을 남깁니다.
  // nowMs 는 누른 쪽(이벤트 핸들러)에서 Date.now()로 넘깁니다. 그리는 중에 시계를 읽지 않기 위해서입니다.
  const advance = (nowMs: number) => {
    const now = localIso(new Date(nowMs));
    const end = eventOfStep(step, "end");
    if (end) appendEvent(browserStore, { participant: session.participant, order: session.order, ...end, at: now });
    const nextIndex = Math.min(session.stepIndex + 1, steps.length - 1);
    const nextStep = steps[nextIndex];
    const begin = eventOfStep(nextStep, "start");
    if (begin) appendEvent(browserStore, { participant: session.participant, order: session.order, ...begin, at: now });
    const next: SessionProgress = {
      ...session,
      stepIndex: nextIndex,
      taskStartedAt: nextStep.kind === "task" ? nowMs : undefined,
      taskSeed: nextStep.kind === "task" ? nowMs % 1_000_000 : undefined,
      restStartedAt: nextStep.kind === "rest" ? nowMs : undefined,
    };
    saveSession(browserStore, next);
    onUpdate(next);
    window.scrollTo(0, 0);
  };

  switch (step.kind) {
    case "pre":
    case "survey":
    case "final":
      return <SurveyStep session={session} step={step} onDone={() => advance(Date.now())} />;
    case "ready":
      return <ReadyStep session={session} step={step} onUpdate={onUpdate} onStart={() => advance(Date.now())} />;
    case "task":
      return <TaskStep session={session} condition={step.condition} onUpdate={onUpdate} onDone={() => advance(Date.now())} />;
    case "rest":
      return (
        <main style={styles.page}>
          <p style={styles.staff}>진행자용</p>
          <h1 style={styles.h1}>휴식</h1>
          <p>설문이 끝났습니다. 조건 사이 휴식은 설문을 포함해 약 {REST_SECONDS / 60}분입니다. 준비되면 다음 조건으로 넘어갑니다.</p>
          <RestTimer startedAt={session.restStartedAt} />
          <button type="button" style={styles.primary} onClick={() => advance(Date.now())}>다음 조건으로</button>
        </main>
      );
    case "done":
      return <DoneScreen session={session} onHome={onHome} />;
  }
}

// 조건 시작 안내(진행자). 과제 비교 방식의 3번째 조건에서는 어느 과제를 한 번 더 할지 여기서 고릅니다.
function ReadyStep({ session, step, onUpdate, onStart }: { session: SessionProgress; step: Extract<Step, { kind: "ready" }>; onUpdate: (s: SessionProgress) => void; onStart: () => void }) {
  const position = step.index - 1;
  const kind = kindForPosition(session, position);
  const needChoice = session.mode === "compare" && kind === null;
  const choose = (k: Candidate) => {
    const kinds = [...(session.kindsByPosition ?? [])];
    kinds[position] = k;
    const next = { ...session, kindsByPosition: kinds };
    saveSession(browserStore, next);
    onUpdate(next);
  };
  return (
    <main style={styles.page}>
      <p style={styles.staff}>진행자용 · 조건 {step.index}/3 ({step.condition}){kind ? ` · ${CANDIDATE_LABEL[kind]}` : ""}</p>
      <h1 style={styles.h1}>시작 안내</h1>
      {session.mode === "compare" && position === 2 && (
        <fieldset style={styles.fieldset}>
          <legend>이번에 한 번 더 할 과제</legend>
          <p style={styles.muted}>마음에 든 것이어도 되고, 괜찮을지 확인하고 싶은 것이어도 됩니다. 1·2번에서 한 것 중 하나가 두 번째가 됩니다.</p>
          {(Object.keys(CANDIDATE_LABEL) as Candidate[]).map((k) => (
            <label key={k} style={styles.radio}>
              <input type="radio" checked={kind === k} onChange={() => choose(k)} />
              {CANDIDATE_LABEL[k]}
            </label>
          ))}
        </fieldset>
      )}
      {/* 진행자 지시문("참가자에게 그대로 읽어 주세요")은 참가자도 같은 화면을 보므로 뺐습니다(팀 피드백 2026-10-26). 절차는 문서 3절에. */}
      <blockquote style={styles.quote}>{CONDITION_INTRO[step.condition]}</blockquote>
      <blockquote style={styles.quote}>{TASK_INTRO}</blockquote>
      <button type="button" style={styles.primary} disabled={needChoice} onClick={onStart}>
        {needChoice ? "과제를 먼저 고르세요" : "과제 시작"}
      </button>
    </main>
  );
}

// 설문 단계: 설문 화면의 진행 상태(묶음 번호·회차)를 그대로 써서 중간에 끊겨도 이어 갑니다.
function SurveyStep({ session, step, onDone }: { session: SessionProgress; step: Step; onDone: () => void }) {
  const phase = phaseOfStep(step)!;
  const [progress] = useState<Progress>(() => {
    const { progress } = nextProgress(loadProgress(browserStore, session.participant, phase), phase, Date.now());
    saveProgress(browserStore, session.participant, progress);
    return progress;
  });
  return (
    <SurveyQuestions
      setup={{ participant: session.participant, phase, order: session.order }}
      progress={progress}
      onFinish={() => {
        // 시점별 CSV를 그때그때 내려받아 두어, 중간에 컴퓨터가 꺼져도 앞 시점은 남습니다.
        const rows = loadAnswers(browserStore, session.participant).filter((a) => a.phase === phase && a.attempt === progress.attempt);
        downloadCsv(rows, csvName(session.participant, phase, new Date()));
        onDone();
      }}
    />
  );
}

// 과제 단계. 과제 화면(TaskPanel)에 조건·시드·이미 답한 수를 넘기고, 답마다 저장합니다. 끝나면 이 조건의 과제 CSV를 내려받고 다음 단계로.
function TaskStep({ session, condition, onUpdate, onDone }: { session: SessionProgress; condition: Condition; onUpdate: (s: SessionProgress) => void; onDone: () => void }) {
  const [rows, setRows] = useState<TaskRow[]>(() => loadTaskRows(browserStore, session.participant, condition));
  // 문제 세트: 몇 번째 조건인지(항상 1→2→3, 설계 문서 3절). 조건 순서가 돌아가므로 세트와 조건이 섞이지 않음
  const position = session.order.indexOf(condition);
  const setIndex = setFor(position);
  const kind = kindForPosition(session, position) ?? session.taskKind; // 비교 방식에서 안 골랐으면(새로고침 등) 기본 과제
  const [saveFailed, setSaveFailed] = useState(false);

  // 새로고침 뒤 시작 시각·시드가 없으면 지금 정합니다 (ready 화면을 거치지 않은 경우)
  useEffect(() => {
    if (!session.taskStartedAt || session.taskSeed === undefined) {
      const now = Date.now();
      const s = { ...session, taskStartedAt: session.taskStartedAt ?? now, taskSeed: session.taskSeed ?? now % 1_000_000 };
      saveSession(browserStore, s);
      onUpdate(s);
    }
  }, [session, onUpdate]);
  if (!session.taskStartedAt || session.taskSeed === undefined) return null;

  const onAnswer = (a: AnswerRow) => {
    const row: TaskRow = {
      ...a, participant: session.participant, condition, order: session.order, kind, set: setIndex + 1, seed: session.taskSeed!,
      index: rows.length + 1, answeredAt: localIso(new Date()),
    };
    const next = [...rows, row];
    setRows(next);
    setSaveFailed(!saveTaskRows(browserStore, session.participant, condition, next));
  };

  const finish = () => {
    downloadText(taskCsv(rows), taskCsvName(session.participant, condition, new Date()));
    onDone();
  };

  return (
    <>
      {saveFailed && <p style={{ ...styles.warn, textAlign: "center", margin: "8px 0 0" }}>⚠ 저장 실패 — 진행자에게 알려 주세요</p>}
      <TaskPanel
        kind={kind}
        seconds={session.taskSeconds}
        startedAt={session.taskStartedAt}
        seed={session.taskSeed}
        setIndex={setIndex}
        done={rows.length}
        onAnswer={onAnswer}
        onFinish={finish}
        onAbort={() => {
          if (window.confirm("과제를 지금 끝내고 설문으로 넘어갈까요? (본 실험에서는 쓰지 않습니다)")) finish();
        }}
      />
    </>
  );
}

function RestTimer({ startedAt }: { startedAt: number | undefined }) {
  const now = useNow();
  return <p style={styles.timer}>{mmss(startedAt ? secondsLeft(startedAt, now, REST_SECONDS) : REST_SECONDS)}</p>;
}

// ── 끝 (진행자) ──
function DoneScreen({ session, onHome }: { session: SessionProgress; onHome: () => void }) {
  const answers = loadAnswers(browserStore, session.participant);
  const events = loadEvents(browserStore, session.participant);
  const taskRows = (["A", "B", "C"] as Condition[]).flatMap((c) => loadTaskRows(browserStore, session.participant, c));
  return (
    <main style={styles.page}>
      <p style={styles.staff}>진행자용</p>
      <h1 style={styles.h1}>실험이 끝났습니다</h1>
      <p>참가자에게 사후 설명을 하고, 아래 파일들을 받아 실험 자료 폴더에 넣습니다. 조건별 과제 CSV와 시점별 설문 CSV는 각 단계가 끝날 때 이미 내려받아졌습니다.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={styles.primary} onClick={() => downloadCsv(answers, csvName(session.participant, "all", new Date()))}>
          설문 전체 CSV ({answers.length}행)
        </button>
        <button type="button" style={styles.button} onClick={() => downloadText(taskCsv(taskRows), taskCsvName(session.participant, "all", new Date()))}>
          과제 전체 CSV ({taskRows.length}행)
        </button>
        <button type="button" style={styles.button} onClick={() => downloadText(eventsCsv(events), eventsCsvName(session.participant, new Date()))}>
          진행 기록 CSV ({events.length}행)
        </button>
        <button type="button" style={styles.button} onClick={onHome}>시작 화면으로</button>
      </div>
      <p style={styles.muted}>
        시점: {(["pre", "A", "B", "C", "final"] as const).map((p) => `${PHASE_LABEL[p]} ${answers.filter((a) => a.phase === p).length}행`).join(" · ")}
      </p>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 760, margin: "0 auto", padding: "24px 16px 48px", font: "16px/1.6 system-ui, sans-serif", color: "#111", display: "grid", gap: 16 },
  h1: { fontSize: 22, margin: 0 },
  muted: { color: "#666", fontSize: 14, margin: 0 },
  warn: { color: "#b45309", fontSize: 14 },
  staff: { color: "#6b7280", fontSize: 12, margin: 0, letterSpacing: 1 },
  notice: { background: "#f3f4f6", borderRadius: 8, padding: "8px 12px", margin: 0, fontSize: 15 },
  quote: { margin: 0, padding: "12px 16px", borderLeft: "4px solid #2563eb", background: "#eff6ff", fontSize: 18 },
  field: { display: "grid", gap: 4 },
  fieldset: { border: "1px solid #ccc", borderRadius: 8, padding: "8px 12px", display: "grid", gap: 6 },
  radio: { display: "flex", gap: 6, alignItems: "center" },
  input: { font: "inherit", padding: "6px 8px", border: "1px solid #bbb", borderRadius: 6, maxWidth: 200 },
  primary: { font: "inherit", padding: "10px 20px", border: "none", borderRadius: 8, background: "#2563eb", color: "#fff", cursor: "pointer", justifySelf: "start" },
  button: { font: "inherit", padding: "10px 20px", border: "1px solid #bbb", borderRadius: 8, background: "#fff", cursor: "pointer", justifySelf: "start" },
  timer: { fontSize: 48, fontVariantNumeric: "tabular-nums", margin: 0, textAlign: "center" },
};
