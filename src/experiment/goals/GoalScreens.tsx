// 목표 카드 화면 세 가지 (참가자가 보는 부분). 실험 진행 화면(session/SessionApp.tsx)의 자기 공부 방식에 들어갑니다.
//   GoalWriteScreen: 카드 3장 쓰기 (조건 순서를 알기 전)
//   StudyPanel: 공부 시간 동안 남은 시간과 이번 카드를 보여 줌
//   AchieveScreen: 조건이 끝난 뒤 목표마다 달성률 입력
// 참가자 화면이므로 조건 이름(A/B/C)은 띄우지 않습니다.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ACHIEVE_STEP, CARD_NAME, DIFFICULTY_MAX, DIFFICULTY_MIN, MAX_GOALS, cardComplete, cardsComplete } from "./goalLogic";
import type { Goal } from "./goalLogic";
import { workerInterval } from "../../lib/workerInterval";
import { useNow } from "../session/useNow";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const DIFFICULTIES = Array.from({ length: DIFFICULTY_MAX - DIFFICULTY_MIN + 1 }, (_, k) => DIFFICULTY_MIN + k);
const PERCENTS = Array.from({ length: 100 / ACHIEVE_STEP + 1 }, (_, k) => k * ACHIEVE_STEP);

// ── 카드 3장 쓰기 ──
// 고칠 때마다 onChange 로 부모에게 넘겨 저장합니다(새로고침해도 쓰던 내용이 남게).
export function GoalWriteScreen({ cards, minutes, onChange, onSubmit }: { cards: Goal[][]; minutes: number; onChange: (cards: Goal[][]) => void; onSubmit: () => void }) {
  const setGoal = (c: number, i: number, patch: Partial<Goal>) =>
    onChange(cards.map((card, ci) => (ci !== c ? card : card.map((g, gi) => (gi !== i ? g : { ...g, ...patch })))));
  const addGoal = (c: number) => onChange(cards.map((card, ci) => (ci !== c ? card : [...card, { text: "", difficulty: null }])));
  const removeGoal = (c: number, i: number) => onChange(cards.map((card, ci) => (ci !== c ? card : card.filter((_, gi) => gi !== i))));
  const ok = cardsComplete(cards);

  return (
    <main style={styles.page}>
      <h1 style={styles.h1}>목표 카드 쓰기</h1>
      <p style={styles.notice}>
        오늘은 가져오신 공부를 {minutes}분씩 세 번 합니다. 시작하기 전에 각 {minutes}분 동안 할 공부를 카드에 적어 주세요.
        <br />
        목표는 한 장에 1~{MAX_GOALS}개, <b>셀 수 있게</b> 적습니다. 예: "문제 8개 풀기", "교재 31~36쪽 읽기". 세 장은 되도록 같은 과목, 비슷한 분량으로 적어 주세요.
      </p>
      {cards.map((card, c) => (
        <section key={c} style={styles.card}>
          <h2 style={styles.h2}>
            {CARD_NAME[c]} {minutes}분 {cardComplete(card) && <span style={styles.ok}>✓</span>}
          </h2>
          {card.map((g, i) => (
            <div key={i} style={styles.goal}>
              <div style={styles.row}>
                <span style={styles.muted}>목표 {i + 1}</span>
                <input
                  style={styles.input} value={g.text} maxLength={80} placeholder="예: 문제 8개 풀기"
                  onChange={(e) => setGoal(c, i, { text: e.target.value })}
                />
                {card.length > 1 && (
                  <button type="button" style={styles.link} onClick={() => removeGoal(c, i)}>지우기</button>
                )}
              </div>
              <div style={styles.row}>
                <span style={styles.muted}>예상 난이도</span>
                <span style={styles.small}>매우 쉬움</span>
                {DIFFICULTIES.map((d) => (
                  <label key={d} style={styles.pick}>
                    <input type="radio" name={`diff-${c}-${i}`} checked={g.difficulty === d} onChange={() => setGoal(c, i, { difficulty: d })} />
                    {d}
                  </label>
                ))}
                <span style={styles.small}>매우 어려움</span>
              </div>
            </div>
          ))}
          {card.length < MAX_GOALS && (
            <button type="button" style={styles.button} onClick={() => addGoal(c)}>목표 추가</button>
          )}
        </section>
      ))}
      <button type="button" style={styles.primary} disabled={!ok} onClick={onSubmit}>
        {ok ? "카드 내기" : "카드마다 목표와 난이도를 적어 주세요"}
      </button>
      <p style={styles.muted}>카드를 낸 뒤에는 고칠 수 없습니다.</p>
    </main>
  );
}

// ── 공부 시간 ──
// 남은 시간과 이번 카드만 보여 줍니다. 공부는 이 창이 아니라 자기 자료로 합니다.
// 끝나는 시각은 워커 타이머로 확인합니다. 이 창이 다른 창에 가려져도 제때 다음 단계로 넘어가야
// 과제 시간(task_start ~ task_end)이 정확해서 초록불 비율을 그 시간으로 자를 수 있습니다.
export function StudyPanel({ seconds, startedAt, index, goals, onFinish, onAbort }: { seconds: number; startedAt: number; index: number; goals: Goal[]; onFinish: (endMs: number) => void; onAbort: () => void }) {
  const now = useNow();
  const left = Math.max(0, seconds - Math.floor((now - startedAt) / 1000));
  const finish = useRef(onFinish);
  useEffect(() => {
    finish.current = onFinish;
  });
  useEffect(() => {
    const endMs = startedAt + seconds * 1000;
    let done = false;
    const check = () => {
      if (done || Date.now() < endMs) return;
      done = true;
      finish.current(endMs);
    };
    check();
    return workerInterval(500, check);
  }, [startedAt, seconds]);

  return (
    <main style={styles.page}>
      <div style={styles.bar}>
        <span style={styles.timer}>{mmss(left)}</span>
        <span style={styles.muted}>{CARD_NAME[index]} 공부 시간</span>
      </div>
      <section style={styles.card}>
        <h2 style={styles.h2}>이번 목표</h2>
        <ol style={styles.list}>
          {goals.map((g, i) => (
            <li key={i}>{g.text}</li>
          ))}
        </ol>
      </section>
      <p style={styles.muted}>평소처럼 공부해 주세요. 시간이 끝나면 이 창이 다음 화면으로 넘어갑니다.</p>
      <p style={styles.staff}>
        진행자용 · <button type="button" style={styles.staffLink} onClick={onAbort}>공부 시간 일찍 끝내기</button>
      </p>
    </main>
  );
}

// ── 달성률 입력 ──
export function AchieveScreen({ index, goals, onSubmit }: { index: number; goals: Goal[]; onSubmit: (values: number[]) => void }) {
  const [values, setValues] = useState<(number | null)[]>(() => goals.map(() => null));
  const ok = values.every((v) => v !== null);
  return (
    <main style={styles.page}>
      <h1 style={styles.h1}>시간이 끝났습니다</h1>
      <p style={styles.notice}>{CARD_NAME[index]} 카드에 적은 목표를 얼마나 했는지 골라 주세요. 다 했으면 100%, 절반쯤이면 50%입니다. 느낌이 아니라 적어 둔 숫자를 기준으로 답해 주세요.</p>
      {goals.map((g, i) => (
        <section key={i} style={styles.card}>
          <h2 style={styles.h2}>{g.text}</h2>
          <div style={styles.row}>
            {PERCENTS.map((p) => (
              <label key={p} style={styles.pick}>
                <input type="radio" name={`ach-${i}`} checked={values[i] === p} onChange={() => setValues(values.map((v, vi) => (vi === i ? p : v)))} />
                {p}%
              </label>
            ))}
          </div>
        </section>
      ))}
      <button type="button" style={styles.primary} disabled={!ok} onClick={() => onSubmit(values as number[])}>
        {ok ? "설문으로" : "목표마다 골라 주세요"}
      </button>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 760, margin: "0 auto", padding: "24px 16px 48px", font: "16px/1.6 system-ui, sans-serif", color: "#111", display: "grid", gap: 16 },
  h1: { fontSize: 22, margin: 0 },
  h2: { fontSize: 17, margin: 0 },
  muted: { color: "#666", fontSize: 14, margin: 0 },
  small: { color: "#666", fontSize: 12 },
  ok: { color: "#15803d" },
  notice: { background: "#f3f4f6", borderRadius: 8, padding: "8px 12px", margin: 0, fontSize: 15 },
  card: { border: "1px solid #d1d5db", borderRadius: 8, padding: "12px 16px", display: "grid", gap: 12 },
  goal: { display: "grid", gap: 6, borderTop: "1px solid #e5e7eb", paddingTop: 10 },
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  pick: { display: "flex", gap: 3, alignItems: "center", cursor: "pointer" },
  input: { font: "inherit", padding: "6px 8px", border: "1px solid #bbb", borderRadius: 6, flex: "1 1 240px" },
  list: { margin: 0, paddingLeft: 20, fontSize: 18 },
  bar: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  timer: { fontSize: 32, fontVariantNumeric: "tabular-nums", fontWeight: 600 },
  primary: { font: "inherit", padding: "10px 20px", border: "none", borderRadius: 8, background: "#2563eb", color: "#fff", cursor: "pointer", justifySelf: "start" },
  button: { font: "inherit", fontSize: 14, padding: "6px 12px", border: "1px solid #bbb", borderRadius: 8, background: "#fff", cursor: "pointer", justifySelf: "start" },
  link: { font: "inherit", fontSize: 13, color: "#6b7280", background: "none", border: "none", textDecoration: "underline", cursor: "pointer", padding: 0 },
  staff: { color: "#9ca3af", fontSize: 11, margin: "32px 0 0", textAlign: "right" },
  staffLink: { font: "inherit", fontSize: 11, color: "#9ca3af", background: "none", border: "none", textDecoration: "underline", cursor: "pointer", padding: 0 },
};
