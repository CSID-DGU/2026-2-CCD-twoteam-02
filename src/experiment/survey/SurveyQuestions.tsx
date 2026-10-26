// 설문 문항 화면 (참가자가 보는 부분). 설문 단독 화면(SurveyApp)과 실험 진행 화면(session/SessionApp)이 같이 씁니다.
// 묶음 하나가 한 페이지. 답할 때마다 브라우저 저장소에 쌓고, 마지막 묶음을 제출하면 onFinish 를 부릅니다.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { fillPlace, groupComplete, itemsOf, loadAnswers, localIso, noteOf, saveAnswers, saveProgress, textOf, upsertAnswer } from "./surveyLogic";
import type { Answer, Item, Phase, Progress } from "./surveyLogic";
import { GROUPS_BY_PHASE } from "./surveyItems";
import { browserStore } from "./surveyBrowser";

export type SurveySetup = { participant: string; phase: Phase; order: string };

export function SurveyQuestions({ setup, progress, onFinish }: { setup: SurveySetup; progress: Progress; onFinish: () => void }) {
  const groups = GROUPS_BY_PHASE[setup.phase];
  // 문항 데이터가 바뀌어 저장된 묶음 번호가 범위를 넘으면 마지막 묶음부터 (끊긴 진행 상태로 화면이 깨지지 않게)
  const [groupIndex, setGroupIndex] = useState(Math.min(progress.groupIndex, groups.length - 1));
  const [answers, setAnswers] = useState<Answer[]>(() => loadAnswers(browserStore, setup.participant));
  const [saveFailed, setSaveFailed] = useState(false);
  const shownAt = useRef(progress.shownAt); // 이 묶음이 (다시) 보인 시각
  const group = groups[groupIndex];

  // 묶음이 바뀌면 보인 시각을 새로 적고 진행 상태를 저장합니다. 새로고침하면 이 묶음부터 이어 갑니다.
  useEffect(() => {
    saveProgress(browserStore, setup.participant, { ...progress, groupIndex, shownAt: shownAt.current, done: false });
  }, [groupIndex, progress, setup.participant]);

  const answer = (item: Item, value: string) => {
    const now = new Date();
    const row: Answer = {
      participant: setup.participant, phase: setup.phase, order: setup.order, attempt: progress.attempt,
      code: item.code, value, answeredAt: localIso(now), msSinceShown: now.getTime() - shownAt.current,
    };
    const next = upsertAnswer(answers, row);
    setAnswers(next);
    setSaveFailed(!saveAnswers(browserStore, setup.participant, next));
  };

  const valueOf = (code: string) => answers.find((a) => a.phase === setup.phase && a.attempt === progress.attempt && a.code === code)?.value;
  const complete = groupComplete(group, answers, setup.phase, progress.attempt);
  const last = groupIndex === groups.length - 1;

  const next = () => {
    if (last) {
      saveProgress(browserStore, setup.participant, { ...progress, groupIndex, shownAt: shownAt.current, done: true });
      onFinish();
      return;
    }
    shownAt.current = Date.now();
    setGroupIndex(groupIndex + 1);
    window.scrollTo(0, 0);
  };

  const note = noteOf(group, setup.phase);
  return (
    <main style={styles.page}>
      <div style={styles.bar}>
        <span>{groupIndex + 1} / {groups.length}</span>
        {saveFailed && <span style={styles.warn}>⚠ 저장 실패 — 진행자에게 알려 주세요</span>}
      </div>
      <h1 style={styles.h1}>{group.title}</h1>
      {note && <p style={styles.notice}>{note}</p>}
      {itemsOf(group, setup.phase).map((item, i) => (
        <ItemBlock key={item.code} index={i + 1} item={item} phase={setup.phase} value={valueOf(item.code)} onAnswer={(v) => answer(item, v)} />
      ))}
      <button type="button" style={styles.primary} disabled={!complete} onClick={next}>
        {complete ? (last ? "제출" : "다음") : "모든 문항에 답해 주세요"}
      </button>
      {group.footer && <p style={styles.footer}>{group.footer}</p>}
    </main>
  );
}

function ItemBlock({ index, item, phase, value, onAnswer }: { index: number; item: Item; phase: Phase; value: string | undefined; onAnswer: (v: string) => void }) {
  const text = textOf(item, phase);
  const { scale } = item;
  // 라디오 그룹 이름은 문항 코드. 같은 묶음 안에서 코드가 겹치지 않습니다.
  return (
    <div style={styles.item}>
      {item.intro && <blockquote style={styles.intro}>{fillPlace(item.intro, phase)}</blockquote>}
      <p style={styles.question}>
        <span style={styles.muted}>{index}. </span>
        {text}
      </p>
      {scale.kind === "likert" && (
        <div style={styles.likert}>
          {Array.from({ length: scale.max - scale.min + 1 }, (_, k) => scale.min + k).map((n) => (
            <label key={n} style={styles.likertCell}>
              <input type="radio" name={item.code} checked={value === String(n)} onChange={() => onAnswer(String(n))} />
              <span style={styles.likertNum}>{n}</span>
              <span style={styles.likertLabel}>{scale.labels[n] ?? ""}</span>
            </label>
          ))}
        </div>
      )}
      {scale.kind === "choice" && (
        <div style={styles.choices}>
          {scale.options.map((opt) => (
            <label key={opt} style={styles.radio}>
              <input type="radio" name={item.code} checked={value === opt} onChange={() => onAnswer(opt)} />
              {opt}
            </label>
          ))}
        </div>
      )}
      {scale.kind === "text" && (
        <textarea style={styles.textarea} rows={3} value={value ?? ""} onChange={(e) => onAnswer(e.target.value)} />
      )}
    </div>
  );
}


const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 760, margin: "0 auto", padding: "24px 16px 48px", font: "16px/1.6 system-ui, sans-serif", color: "#111", display: "grid", gap: 16 },
  h1: { fontSize: 22, margin: 0 },
  muted: { color: "#666", fontSize: 14, margin: 0 },
  warn: { color: "#b45309", fontSize: 14 },
  notice: { background: "#f3f4f6", borderRadius: 8, padding: "8px 12px", margin: 0, fontSize: 15 },
  intro: { background: "#fffbeb", borderLeft: "4px solid #f59e0b", borderRadius: 6, padding: "8px 12px", margin: 0, fontSize: 15 }, // 질문 앞 설명 상자
  footer: { color: "#888", fontSize: 12, margin: 0 }, // 저작권 고지 등 바닥글
  radio: { display: "flex", gap: 6, alignItems: "center" },
  textarea: { font: "inherit", padding: "6px 8px", border: "1px solid #bbb", borderRadius: 6, width: "100%", boxSizing: "border-box" },
  primary: { font: "inherit", padding: "10px 20px", border: "none", borderRadius: 8, background: "#2563eb", color: "#fff", cursor: "pointer", justifySelf: "start" },
  bar: { display: "flex", justifyContent: "space-between", color: "#444", fontSize: 14 },
  item: { borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "grid", gap: 8 },
  question: { margin: 0, fontSize: 17 },
  likert: { display: "flex", gap: 4, flexWrap: "wrap" },
  likertCell: { display: "grid", justifyItems: "center", gap: 2, minWidth: 64, flex: "1 1 64px", cursor: "pointer", textAlign: "center" },
  likertNum: { fontVariantNumeric: "tabular-nums" },
  likertLabel: { fontSize: 12, color: "#555", minHeight: 16 },
  choices: { display: "grid", gap: 4 },
};
