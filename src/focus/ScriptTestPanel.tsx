// 각본 시험 패널 (/tracking 전용 측정 도구). 순수 로직·행동 표는 scriptTest.ts
// 빠른 점검판 / 정식판을 고르고, 스페이스바로 행동을 하나씩 시작합니다. 행동이 끝나면 삐 소리가 나고 자동으로 채점합니다.
// (눈 감기·자리 비우기 중에는 화면을 못 보므로 소리로 알립니다. 소리는 Web Audio로 만들고 라이브러리는 쓰지 않습니다)
//
// 판정 두 가지를 이 패널에서 직접 계산합니다: 가이드라인 없이(실제 공부 화면과 같음) / 가이드라인 켬.
// 0.1초 기록은 워커 신호로 남겨 다른 탭에 가 있어도 끊기지 않습니다(9·13번 행동).
// 채점 결과와 순서는 브라우저 저장소에 저장해서, 새로고침하거나 정식판을 2~3번에 나눠 해도 이어서 할 수 있습니다.
// 0.1초 기록은 양이 많아 메모리에만 두고, 시험이 끝나거나 중단할 때 CSV로 내려받습니다(새로고침하면 그 전 기록은 사라짐).
// 영상은 남기지 않고 숫자만 남기며, 서버로 보내지 않습니다.
// (2026-10-22) 눈 감음·휴대폰도 기록해, 정답 없는 측정 행동(14~17)과 기존 행동의 최장 연속·끊김·고개 변동 폭을 측정표로 보여 줍니다.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { useFocusState } from "./useFocusState";
import type { FocusView } from "./useFocusState";
import { AWAY_SECONDS, DROWSY_DOWN_SECONDS, DROWSY_SECONDS, PHONE_SECONDS, RETURN_SECONDS, eyeClosed } from "./focusLogic";
import type { FocusInput } from "./focusLogic";
import type { Baseline } from "./calibration";
import type { PhoneState } from "../tracking/useTracking";
import { BEHAVIORS, behaviorOf, byBehavior, expectedStudyMs, logCsv, makePlan, measureRows, resultsCsv, scoreTrial, summarize } from "./scriptTest";
import type { Behavior, Judgement, LogRow, Summary, TestMode, TrialResult, TrialSample } from "./scriptTest";
import { workerInterval } from "../lib/workerInterval";

const SAMPLE_MS = 100; // 기록 간격
const STORAGE_KEY = "scriptTest:v1";
const BEEP_HZ = 880;
// 행동 중간 신호(돌아와 앉기)는 카메라 밖에 있는 사람이 들어야 하므로 CUE_INTERVAL_SECONDS 간격으로 CUE_REPEATS번 되풀이합니다.
// (각본 시험 2026-10-23: 두 명 모두 30초 신호를 못 듣고 돌아오지 않음)
const CUE_REPEATS = 3;
const CUE_INTERVAL_SECONDS = 2;
// 카메라에 잘 잡히게 행동하면 실제보다 높은 정확도가 나오므로, 평소처럼 하도록 안내합니다.
const NATURAL_NOTE = "평소 하던 대로 하세요. 카메라를 의식해서 잘 보이게 하지 마세요.";

type Saved = { mode: TestMode; plan: number[]; results: TrialResult[]; startedAt: number; knownIds?: number[] }; // knownIds: 시작할 때의 행동 표 (건너뛴 행동과 "새 행동"을 구분하려고. 옛 저장엔 없음)
type Running = { trial: number; behavior: Behavior; startMs: number; samples: TrialSample[]; cuesDone: number }; // cuesDone: 중간 신호를 낸 횟수

function loadSaved(): Saved | null {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    return text ? (JSON.parse(text) as Saved) : null;
  } catch {
    return null;
  }
}

function store(saved: Saved | null) {
  try {
    if (saved) localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 저장소를 못 쓰면 이어 하기만 안 됩니다. 시험은 그대로 진행합니다.
  }
}

function download(text: string, name: string) {
  const blob = new Blob(["﻿" + text], { type: "text/csv" }); // 엑셀에서 한글이 깨지지 않게 BOM
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const judgementOf = (v: FocusView): Judgement => ({ status: v.status, studyMs: v.studyMs });
const pct = (v: number | null) => (v === null ? "-" : `${Math.round(v * 100)}%`);
const sec = (ms: number | null) => (ms === null ? "-" : `${(ms / 1000).toFixed(1)}초`);
const minutesOf = (ids: number[]) => Math.round(ids.reduce((sum, id) => sum + behaviorOf(id).seconds, 0) / 60);

type Props = {
  face: RefObject<FocusInput>;
  pose: RefObject<{ found: boolean; framed: boolean | null }>;
  phone: RefObject<PhoneState>; // 휴대폰 감지 결과 (측정 기록용. /tracking은 감지를 항상 켜 둠)
  baseline: Baseline | null; // 보정 기준. 없으면 시작할 수 없습니다(졸음 판정이 보정했을 때만 동작하므로).
};

export function ScriptTestPanel({ face, pose, phone, baseline }: Props) {
  const plain = useFocusState(face, undefined, undefined, { body: pose, baseline }); // 실제 공부 화면과 같은 판정
  const guide = useFocusState(face, undefined, pose, { body: pose, baseline }); // 가이드라인도 쓰는 판정
  const [open, setOpen] = useState(() => loadSaved() !== null);
  const [saved, setSaved] = useState<Saved | null>(loadSaved);
  const [running, setRunning] = useState<{ trial: number; behavior: Behavior; startMs: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const runRef = useRef<Running | null>(null);
  const rows = useRef<LogRow[]>([]);
  const testStart = useRef<number | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const wasClosed = useRef(false); // 눈 감음 기록의 히스테리시스(감김·뜸 경계가 다름)용
  // 워커 신호·키 입력에서 최신 값을 읽기 위한 ref (그리는 중에는 읽지 않음)
  const latest = useRef({ plain, guide, saved, baseline });
  useEffect(() => {
    latest.current = { plain, guide, saved, baseline };
  });

  const inProgress = saved !== null && saved.results.length < saved.plan.length;

  function beep(times: number) {
    const ctx = audio.current;
    if (!ctx) return;
    for (let i = 0; i < times; i++) {
      const at = ctx.currentTime + i * 0.5;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = BEEP_HZ;
      gain.gain.value = 0.5; // 자리를 비운 사람도 들리게 (0.2는 못 들었음)
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.4);
    }
  }

  // 행동을 끝내고 채점합니다.
  function finishTrial(run: Running) {
    const { plain, guide, saved } = latest.current;
    if (!saved) return;
    runRef.current = null;
    setRunning(null);
    if (run.behavior.allowOtherScreen) {
      plain.setAllowOtherScreen(false);
      guide.setAllowOtherScreen(false);
    }
    const next: Saved = { ...saved, results: [...saved.results, scoreTrial(run.trial, run.behavior, run.samples)] };
    latest.current.saved = next;
    store(next);
    setSaved(next);
    const done = next.results.length >= next.plan.length;
    beep(done ? 3 : 1);
    if (done) download(logCsv(rows.current), "script-test-log");
  }

  // 0.1초 기록: 시험이 진행 중인 동안 워커 신호로 돕니다.
  useEffect(() => {
    if (!inProgress) return;
    return workerInterval(SAMPLE_MS, () => {
      const n = Date.now();
      testStart.current ??= n;
      const { plain, guide, baseline } = latest.current;
      const run = runRef.current;
      const elapsedMs = run ? n - run.startMs : null;
      const f = face.current;
      // 눈 감음은 판정과 같은 함수로 기록합니다. 보정 전이거나 얼굴이 없으면 모름(null)
      const closed = baseline && f.found && f.ear !== null && f.ear !== undefined ? eyeClosed({ ...f, baseline }, wasClosed.current) : null;
      wasClosed.current = closed ?? false;
      const phoneFound = phone.current.found;
      rows.current.push({
        t: n - testStart.current, trial: run?.trial ?? null, behaviorId: run?.behavior.id ?? null, elapsedMs,
        plain: judgementOf(plain), guide: judgementOf(guide), found: f.found, ear: f.ear ?? null, pitch: f.pitch ?? 0, closed, phone: phoneFound,
        framed: pose.current.framed, body: pose.current.framed === null ? null : pose.current.found,
        hidden: document.hidden, focused: document.hasFocus(), allowOtherScreen: plain.allowOtherScreen, allowDevices: plain.allowDevices, baseline,
      });
      if (run && elapsedMs !== null) {
        run.samples.push({ elapsedMs, plain: judgementOf(plain), guide: judgementOf(guide), found: f.found, closed, phone: phoneFound, pitch: f.pitch ?? 0 });
        const cue = run.behavior.cue;
        if (cue && run.cuesDone < CUE_REPEATS && elapsedMs >= (cue.atSeconds + run.cuesDone * CUE_INTERVAL_SECONDS) * 1000) {
          run.cuesDone += 1;
          beep(3);
        }
        if (elapsedMs >= run.behavior.seconds * 1000) finishTrial(run);
      }
      setNow(n);
    });
    // finishTrial·beep은 ref만 읽으므로 의존성에 넣지 않습니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inProgress, face, pose, phone]);

  // 스페이스바: 다음 행동 시작
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { saved, baseline, plain, guide } = latest.current;
      if (e.code !== "Space" || !saved || saved.results.length >= saved.plan.length) return;
      e.preventDefault(); // 버튼에 초점이 있어도 눌리지 않게
      if (runRef.current || !baseline) return;
      audio.current ??= new AudioContext(); // 사용자가 누른 순간에 만들어야 소리가 납니다
      void audio.current.resume();
      const behavior = behaviorOf(saved.plan[saved.results.length]);
      if (behavior.allowOtherScreen) {
        plain.setAllowOtherScreen(true);
        guide.setAllowOtherScreen(true);
      }
      const run: Running = { trial: saved.results.length + 1, behavior, startMs: Date.now(), samples: [], cuesDone: 0 };
      runRef.current = run;
      setRunning({ trial: run.trial, behavior, startMs: run.startMs });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const start = (mode: TestMode) => {
    const next: Saved = { mode, plan: makePlan(mode), results: [], startedAt: Date.now(), knownIds: BEHAVIORS.map((b) => b.id) };
    rows.current = [];
    testStart.current = null;
    store(next);
    setSaved(next);
  };

  const stop = () => {
    if (rows.current.length > 0) download(logCsv(rows.current), "script-test-log");
    rows.current = [];
    testStart.current = null;
  };

  // 다음 행동을 채점 없이 순서에서 뺍니다 (특정 행동만 해 보고 싶을 때). 결과·기록은 그대로입니다.
  const skip = () => {
    const { saved } = latest.current;
    if (!saved || runRef.current || saved.results.length >= saved.plan.length) return;
    const at = saved.results.length;
    const next: Saved = { ...saved, plan: [...saved.plan.slice(0, at), ...saved.plan.slice(at + 1)] };
    latest.current.saved = next;
    store(next);
    setSaved(next);
  };

  // 저장된 시험이 예전 행동 표로 만들어졌으면(새 행동이 없음) 새 행동을 뒤에 붙여 이어 합니다.
  // 건너뛴 행동은 순서에서 빠지지만 knownIds에는 있으므로 "새 행동"으로 보지 않습니다.
  const knownIds = saved ? (saved.knownIds ?? saved.plan) : [];
  const missingIds = saved ? BEHAVIORS.filter((b) => !knownIds.includes(b.id)).map((b) => b.id) : [];
  const appendMissing = () => {
    const { saved } = latest.current;
    if (!saved || runRef.current) return;
    const added = BEHAVIORS.filter((b) => missingIds.includes(b.id)).flatMap((b) => Array<number>(saved.mode === "full" ? (b.repeats ?? 1) : 1).fill(b.id));
    const next: Saved = { ...saved, plan: [...saved.plan, ...added], knownIds: [...knownIds, ...missingIds] };
    latest.current.saved = next;
    store(next);
    setSaved(next);
  };

  const reset = () => {
    if (!window.confirm("각본 시험 결과를 지우고 처음부터 할까요? (필요하면 먼저 결과 CSV를 내려받으세요)")) return;
    runRef.current = null;
    setRunning(null);
    rows.current = [];
    testStart.current = null;
    store(null);
    setSaved(null);
  };

  if (!open) {
    return (
      <div style={styles.panel}>
        <button type="button" onClick={() => setOpen(true)}>각본 시험 열기</button>
      </div>
    );
  }

  const results = saved?.results ?? [];
  const next = saved && inProgress ? behaviorOf(saved.plan[saved.results.length]) : null;
  const quickIds = BEHAVIORS.map((b) => b.id);
  const fullPlan = makePlan("full"); // 회차 수·시간 표시용 (순서는 시작할 때 다시 섞음)

  return (
    <div style={styles.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <b>각본 시험{saved ? ` · ${saved.mode === "quick" ? "빠른 점검판" : "정식판"} ${results.length}/${saved.plan.length}` : ""}</b>
        <button type="button" onClick={() => setOpen(false)}>접기</button>
      </div>

      {!baseline && <div style={styles.warn}>먼저 왼쪽 위 "보정하기"로 보정하세요. 졸음 판정은 보정했을 때만 동작합니다.</div>}

      {!saved && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" disabled={!baseline} onClick={() => start("quick")}>
            빠른 점검판 ({quickIds.length}개, 약 {minutesOf(quickIds)}분 + 쉬는 시간)
          </button>
          <button type="button" disabled={!baseline} onClick={() => start("full")}>
            정식판 ({fullPlan.length}회, 약 {minutesOf(fullPlan)}분 + 쉬는 시간, 나눠서 가능)
          </button>
        </div>
      )}

      {running && (
        <div style={styles.big}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>#{running.behavior.id} {running.behavior.name}</div>
          {running.behavior.hint && <div>{running.behavior.hint}</div>}
          {running.behavior.cue && <div>{running.behavior.cue.atSeconds}초부터 {CUE_INTERVAL_SECONDS}초마다 {CUE_REPEATS}번 소리(세 번씩): {running.behavior.cue.text}</div>}
          <div style={{ fontSize: 32, fontVariantNumeric: "tabular-nums" }}>
            {Math.max(0, Math.ceil((running.startMs + running.behavior.seconds * 1000 - now) / 1000))}초
          </div>
          {/* 행동 중에는 판정을 보여 주지 않습니다. 보면서 무의식적으로 맞추면 정확도가 부풀려집니다. */}
          <div style={{ opacity: 0.7 }}>{NATURAL_NOTE}</div>
        </div>
      )}

      {!running && next && (
        <div style={styles.big}>
          <div>
            다음: <b>#{next.id} {next.name}</b> ({next.seconds}초
            {next.expect === "focus" ? ", 초록 유지가 정답" : next.expect === "measure" ? ", 측정만 — 정답 없음" : `, ${next.expect}가 정답`})
          </div>
          {next.hint && <div>{next.hint}</div>}
          <div><b>준비되면 스페이스바</b> — 끝나면 삐 소리가 납니다</div>
          <div style={{ opacity: 0.7 }}>{NATURAL_NOTE}</div>
        </div>
      )}

      {saved && missingIds.length > 0 && !running && (
        <div style={styles.warn}>
          저장된 시험은 예전 행동 표로 만들어져 새 행동(#{missingIds.join(", #")})이 없습니다.{" "}
          <button type="button" onClick={appendMissing}>새 행동 추가해 이어 하기</button> 또는 "처음부터 다시"
        </div>
      )}

      {saved && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {inProgress && <button type="button" onClick={skip} disabled={running !== null}>이 행동 건너뛰기</button>}
          {inProgress && <button type="button" onClick={stop} disabled={running !== null}>여기서 멈추고 기록 내려받기</button>}
          {results.length > 0 && <button type="button" onClick={() => download(resultsCsv(results), "script-test-results")}>결과 CSV</button>}
          <button type="button" onClick={reset} disabled={running !== null}>처음부터 다시</button>
        </div>
      )}

      {results.length > 0 && <ResultTable results={results} />}
      {results.length > 0 && <MeasureTable results={results} />}
    </div>
  );
}

function SummaryLine({ label, s }: { label: string; s: Summary }) {
  return (
    <div>
      {label}: 정확도 <b>{pct(s.accuracy)}</b> ({s.correct}/{s.trials}) · 필기 오판율 {pct(s.writingWrongRate)} · 공부 시간 오차{" "}
      {s.timeError === null ? "-" : `${s.timeError >= 0 ? "+" : ""}${(s.timeError * 100).toFixed(1)}%`}
    </div>
  );
}

function ResultTable({ results }: { results: TrialResult[] }) {
  const rows = byBehavior(results);
  return (
    <>
      <SummaryLine label="가이드라인 없이" s={summarize(results, "plain")} />
      <SummaryLine label="가이드라인 켬" s={summarize(results, "guide")} />
      <div style={{ opacity: 0.7 }}>목표: 정확도 80% 이상 · 필기 오판율 10% 이하 · 시간 오차 ±10%</div>
      <table style={styles.table}>
        <thead>
          <tr>
            {["#", "행동", "정답", "맞음(없이)", "맞음(가이드)", "처음 빨간불(없이)", "빨간불까지(없이)", "들어간 시간(없이)", "들어가야 할 시간"].map((h) => (
              <th key={h} style={styles.cell}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.behavior.id}>
              <td style={styles.cell}>{r.behavior.id}</td>
              <td style={styles.cell}>{r.behavior.name}</td>
              <td style={styles.cell}>{r.behavior.expect === "focus" ? "초록" : r.behavior.expect}</td>
              <td style={{ ...styles.cell, color: r.plainCorrect < r.n ? "#fbbf24" : undefined }}>{r.plainCorrect}/{r.n}</td>
              <td style={styles.cell}>{r.guideCorrect}/{r.n}</td>
              <td style={styles.cell}>{r.plainFirstYellow.map((s) => s ?? "없음").join(", ")}</td>
              <td style={styles.cell}>{sec(r.plainYellowMs)}</td>
              <td style={styles.cell}>{sec(r.plainGainedMs)}</td>
              <td style={styles.cell}>{sec(expectedStudyMs(r.behavior))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// 측정표: 정답 없이 수치만 모은 것. 기준값을 정하는 데 씁니다 (docs/판정-기준-근거.md 10절)
function MeasureTable({ results }: { results: TrialResult[] }) {
  const rows = measureRows(results);
  if (rows.length === 0) return null;
  const withCount = (ms: number | null, n: number | null) => (ms === null ? "-" : `${sec(ms)} (${n ?? 0}회)`);
  const deg = (v: number | null) => (v === null ? "-" : `${v.toFixed(0)}°`);
  return (
    <>
      <div style={{ marginTop: 6 }}>
        <b>측정</b> (정답 없음 — 기준값을 정하는 수치) · 지금 기준: 자리 이탈 {AWAY_SECONDS}초 · 졸음 {DROWSY_SECONDS}초(숙임 {DROWSY_DOWN_SECONDS}초) · 휴대폰 {PHONE_SECONDS}초 · 끊김 내성 {RETURN_SECONDS}초
      </div>
      <table style={styles.table}>
        <thead>
          <tr>
            {["#", "행동", "회차", "안 보임 최장", "감음 최장", "휴대폰 최장", "끊김(보임)", "끊김(뜸)", "고개 변동 폭"].map((h) => (
              <th key={h} style={styles.cell}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.behavior.id}>
              <td style={styles.cell}>{r.behavior.id}</td>
              <td style={styles.cell}>{r.behavior.name}</td>
              <td style={styles.cell}>{r.n}</td>
              <td style={styles.cell}>{sec(r.longestMissingMs)}</td>
              <td style={styles.cell}>{sec(r.longestClosedMs)}</td>
              <td style={styles.cell}>{sec(r.longestPhoneMs)}</td>
              <td style={styles.cell}>{withCount(r.shortFoundMaxMs, r.shortFoundCount)}</td>
              <td style={styles.cell}>{withCount(r.shortOpenMaxMs, r.shortOpenCount)}</td>
              <td style={styles.cell}>{deg(r.pitchRangeDeg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: {
    position: "absolute", left: 16, top: 220, maxWidth: "min(720px, calc(100% - 32px))", maxHeight: "50vh", overflow: "auto",
    padding: "8px 12px", borderRadius: 8, background: "rgba(0,0,0,.7)", color: "#fff",
    font: "12px/1.5 system-ui, sans-serif", display: "grid", gap: 6, textAlign: "left", zIndex: 5,
  },
  big: { font: "15px/1.6 system-ui, sans-serif", padding: "6px 0" },
  warn: { color: "#fbbf24" },
  table: { borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" },
  cell: { padding: "2px 6px", borderBottom: "1px solid rgba(255,255,255,.15)", whiteSpace: "nowrap" },
};
