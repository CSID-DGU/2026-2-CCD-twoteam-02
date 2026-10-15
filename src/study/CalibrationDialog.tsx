// 공부 시작 보정: 정면 3초 → 필기 자세 3초 → 필기 자세로 눈 감기 2초를 재서 개인 기준을 만듭니다.
// 단계마다 3초 준비 시간을 주고, 눈 감기가 끝나면 소리로 알립니다. 측정이 잘못되면 그 단계만 다시 합니다.
// 기준은 메모리에만 두고 서버로 보내지 않습니다.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { CALIB_STEPS, makeBaseline, summarizeStep } from "../focus/calibration";
import type { Baseline, CalibSample, StepOk } from "../focus/calibration";
import type { FaceState, PoseState } from "../tracking/useTracking";

const PREP_SECONDS = 3; // 자세를 잡을 준비 시간
const SAMPLE_MS = 100;

// 짧은 "삐" 소리 (소리를 못 내도 진행)
function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => void ctx.close();
  } catch {
    // 소리 없이 계속
  }
}

type Props = {
  face: RefObject<FaceState>;
  pose: RefObject<PoseState>;
  onDone: (baseline: Baseline) => void;
  onSkip: () => void;
};

export function CalibrationDialog({ face, pose, onDone, onSkip }: Props) {
  const [index, setIndex] = useState(0); // 지금 단계
  const [phase, setPhase] = useState<"prep" | "record" | "failed">("prep");
  const [left, setLeft] = useState(PREP_SECONDS); // 남은 초
  const [reason, setReason] = useState("");
  const [redoIndex, setRedoIndex] = useState(0); // 실패 뒤 "다시 하기"로 돌아갈 단계
  const results = useRef<StepOk[]>([]);
  const step = CALIB_STEPS[index];
  // 부모가 다시 그려질 때마다 onDone이 새 함수가 되므로, ref에 담아 측정 반복이 처음부터 다시 시작되지 않게 합니다.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    if (phase === "failed") return;
    const samples: CalibSample[] = [];
    const total = phase === "prep" ? PREP_SECONDS : step.seconds;
    const startedAt = Date.now();
    const id = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      setLeft(Math.max(0, Math.ceil(total - elapsed)));
      if (phase === "record") {
        const f = face.current;
        const p = pose.current;
        samples.push({ found: f.found, ear: f.ear, pitch: f.found ? f.pitch : null, framed: p.framed, wristsInView: p.wristsInView });
      }
      if (elapsed < total) return;
      clearInterval(id);
      if (phase === "prep") {
        setLeft(step.seconds); // 이펙트 본문에서 setState를 피하려고 전환 시점에 미리 채움
        setPhase("record");
        return;
      }
      if (step.key === "closed") beep();
      const result = summarizeStep(step.key, samples);
      if (!result.ok) {
        setReason(result.reason);
        setRedoIndex(index);
        setPhase("failed");
        return;
      }
      results.current[index] = result;
      if (index < CALIB_STEPS.length - 1) {
        setIndex(index + 1);
        setLeft(PREP_SECONDS);
        setPhase("prep");
        return;
      }
      const [front, down, closed] = results.current;
      const made = makeBaseline(front, down, closed);
      if (made.ok) onDoneRef.current(made.baseline);
      else {
        setReason(made.reason);
        setRedoIndex(CALIB_STEPS.findIndex((s) => s.key === made.redo)); // 문제가 난 단계부터 다시
        setPhase("failed");
      }
    }, SAMPLE_MS);
    return () => clearInterval(id);
  }, [index, phase, step, face, pose]);

  return (
    <div style={styles.backdrop}>
      <div style={styles.box}>
        <div style={{ opacity: 0.7 }}>
          자세 맞추기 {index + 1} / {CALIB_STEPS.length}
        </div>
        <div style={styles.title}>{step.text}</div>
        {phase === "prep" && <div>{left}초 뒤 시작해요. 자세를 잡아 주세요.</div>}
        {phase === "record" && <div style={styles.count}>● 재는 중 {left}</div>}
        {phase === "failed" && (
          <>
            <div style={{ color: "#facc15" }}>{reason}</div>
            <button
              type="button"
              style={styles.button}
              onClick={() => {
                setIndex(redoIndex);
                setLeft(PREP_SECONDS);
                setPhase("prep");
              }}
            >
              다시 하기
            </button>
          </>
        )}
        <button type="button" style={styles.skip} onClick={onSkip}>
          건너뛰기 (눈 감음 판정 없이 공부)
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  backdrop: {
    position: "fixed", inset: 0, zIndex: 20, display: "grid", placeItems: "center",
    background: "rgba(0,0,0,.45)", font: "14px system-ui, sans-serif",
  },
  box: {
    display: "grid", gap: 10, padding: "20px 24px", borderRadius: 12, minWidth: 320, textAlign: "center",
    background: "rgba(32,35,42,.97)", color: "#fff",
  },
  title: { fontSize: 18, fontWeight: 600 },
  count: { fontSize: 22, fontWeight: 700, color: "#4ade80" },
  button: { padding: "6px 12px", borderRadius: 8, border: "none", background: "#22c55e", color: "#0b1a10", fontWeight: 600, cursor: "pointer" },
  skip: { padding: "4px 8px", borderRadius: 6, border: "1px solid #4b5563", background: "transparent", color: "#d1d5db", cursor: "pointer", font: "inherit" },
};
