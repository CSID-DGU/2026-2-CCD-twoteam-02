// 과제 문항 화면: ① 두 자리 덧셈(CalcTask), ② 오탈자 찾기(TypoTask). 실험 진행 화면(TaskPanel)과 과제 후보 시험(spike)이 같이 씁니다.
// 두 화면 모두 "문항이 보인 시각·답한 시각(과제 시작 기준 ms)"을 onAnswer 로 넘기고, 저장은 부모가 합니다.
import { useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { TYPO_PASSAGES, makeCalcProblem, passageOrder, scoreTypo, seededRandom } from "./taskLogic";
import type { AnswerRow, CalcProblem } from "./taskLogic";

// skip: 이미 답한 문항 수. 새로고침 뒤 이어 할 때 같은 문제가 다시 나오지 않게 그만큼 건너뜁니다.
export type TaskProps = { seed: number; skip?: number; setIndex?: number; elapsed: () => number; onAnswer: (row: AnswerRow) => void }; // setIndex: 오탈자 지문 세트(없으면 전체)

export function CalcTask({ seed, skip = 0, elapsed, onAnswer }: TaskProps) {
  const rand = useMemo(() => seededRandom(seed), [seed]);
  const [problem, setProblem] = useState<CalcProblem>(() => {
    for (let i = 0; i < skip; i++) makeCalcProblem(rand); // 이미 답한 문제는 건너뜀
    return makeCalcProblem(rand);
  });
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

export function TypoTask({ seed, skip = 0, setIndex, elapsed, onAnswer }: TaskProps) {
  const order = useMemo(() => passageOrder(seededRandom(seed), setIndex), [seed, setIndex]);
  const [pos, setPos] = useState(skip); // 지문 순서상 위치 (바닥나면 처음부터 다시)
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


const styles: Record<string, CSSProperties> = {
  muted: { color: "#666", fontSize: 14, margin: 0 },
  primary: { font: "inherit", padding: "10px 20px", border: "none", borderRadius: 8, background: "#2563eb", color: "#fff", cursor: "pointer" },
  center: { display: "grid", gap: 16, justifyItems: "center", paddingTop: 48 },
  problem: { fontSize: 48, fontVariantNumeric: "tabular-nums" },
  answer: { font: "inherit", fontSize: 40, width: 160, textAlign: "center", padding: "6px 8px", border: "2px solid #bbb", borderRadius: 8 },
  passage: { fontSize: 22, lineHeight: 2, margin: 0, wordBreak: "keep-all", userSelect: "none" },
  char: { padding: "2px 1px", borderRadius: 4 },
  marked: { background: "#fde68a", textDecoration: "underline", textDecorationColor: "#d97706" },
};
