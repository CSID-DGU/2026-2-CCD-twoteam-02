// 실험 과제 화면 (조건 하나, 20분). 실험 진행 화면(session/SessionApp.tsx)의 과제 단계에 들어갑니다.
// 위에 남은 시간·푼 수, 아래에 과제(계산 또는 오탈자). 답할 때마다 부모가 준 onAnswer 로 넘겨 저장하고,
// 시간이 끝나면 onFinish. 새로고침해도 startedAt(과제 시작 시각)과 이미 답한 수(done)로 이어 갑니다.
import type { CSSProperties } from "react";
import { CANDIDATE_LABEL } from "./taskLogic";
import type { AnswerRow, Candidate } from "./taskLogic";
import { CalcTask, TypoTask } from "./TaskItems";
import { useNow } from "../session/useNow";

type Props = {
  kind: Candidate;
  seconds: number; // 과제 시간
  startedAt: number; // 과제 시작 시각 (Date.now)
  seed: number;
  setIndex: number; // 문제 세트(0~2). 오탈자는 그 세트의 지문만 씀
  done: number; // 이미 답한 문항 수 (이어 하기)
  onAnswer: (row: AnswerRow) => void;
  onFinish: () => void; // 시간이 끝났을 때 (부모가 저장·다음 단계)
  onAbort: () => void; // 진행자가 일찍 끝낼 때 (예비·연습용)
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function TaskPanel({ kind, seconds, startedAt, seed, setIndex, done, onAnswer, onFinish, onAbort }: Props) {
  const now = useNow();
  const left = Math.max(0, seconds - Math.floor((now - startedAt) / 1000));
  const elapsed = () => Date.now() - startedAt;

  if (left === 0) {
    return (
      <main style={styles.page}>
        <h1 style={styles.h1}>시간이 끝났습니다</h1>
        <p>수고하셨습니다. 이어서 짧은 설문이 나옵니다.</p>
        <button type="button" style={styles.primary} onClick={onFinish}>설문으로</button>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.bar}>
        <span style={styles.timer}>{mmss(left)}</span>
        <span style={styles.muted}>{done}문항</span>
      </div>
      {kind === "calc" ? (
        <CalcTask key={`calc-${seed}`} seed={seed} skip={done} elapsed={elapsed} onAnswer={onAnswer} />
      ) : (
        <TypoTask key={`typo-${seed}`} seed={seed} setIndex={setIndex} skip={done} elapsed={elapsed} onAnswer={onAnswer} />
      )}
      <p style={styles.staff}>
        진행자용 · {CANDIDATE_LABEL[kind]} ·{" "}
        <button type="button" style={styles.link} onClick={onAbort}>과제 일찍 끝내기</button>
      </p>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 760, margin: "0 auto", padding: "16px 16px 48px", font: "16px/1.6 system-ui, sans-serif", color: "#111", display: "grid", gap: 8 },
  h1: { fontSize: 22, margin: 0 },
  muted: { color: "#666", fontSize: 14, margin: 0 },
  bar: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  timer: { fontSize: 20, fontVariantNumeric: "tabular-nums", fontWeight: 600 },
  primary: { font: "inherit", padding: "10px 20px", border: "none", borderRadius: 8, background: "#2563eb", color: "#fff", cursor: "pointer", justifySelf: "start" },
  staff: { color: "#9ca3af", fontSize: 11, margin: "32px 0 0", textAlign: "right" },
  link: { font: "inherit", fontSize: 11, color: "#9ca3af", background: "none", border: "none", textDecoration: "underline", cursor: "pointer", padding: 0 },
};
