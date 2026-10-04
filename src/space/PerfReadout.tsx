// 측정용 표시: 화면 FPS와 2D → 3D 전환에 걸린 시간을 보여 줍니다.
// 제안서 목표: 30FPS 이상 유지, 전환 1초 이내
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

const SAMPLE_SECONDS = 0.5; // 이 시간마다 평균 FPS를 한 번 냅니다.
const WARMUP_SAMPLES = 2; // 처음 불러올 때의 끊김은 최저값에서 뺍니다.
const TARGET_FPS = 30;
const TARGET_TRANSITION_MS = 1000;

export type Perf = {
  fps: number | null;
  minFps: number | null; // 지금까지 가장 낮았던 FPS
  transitionMs: number | null; // 마지막 2D → 3D 전환에 걸린 시간
};

// Canvas 안에 두는 측정기. 그려진 프레임 수를 세어 FPS를 알려 줍니다.
export function FpsProbe({ onSample }: { onSample: (fps: number, warm: boolean) => void }) {
  const acc = useRef({ frames: 0, time: 0, samples: 0 });
  useFrame((_, delta) => {
    const a = acc.current;
    a.frames += 1;
    a.time += delta;
    if (a.time < SAMPLE_SECONDS) return;
    a.samples += 1;
    onSample(Math.round(a.frames / a.time), a.samples > WARMUP_SAMPLES);
    a.frames = 0;
    a.time = 0;
  });
  return null;
}

const ok = (pass: boolean) => (pass ? "#4ade80" : "#f87171");

export function PerfReadout({ perf }: { perf: Perf }) {
  const { fps, minFps, transitionMs } = perf;
  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        left: 16,
        padding: "6px 10px",
        borderRadius: 8,
        background: "rgba(32,35,42,.85)",
        color: "#fff",
        font: "12px/1.6 ui-monospace, Menlo, monospace",
        textAlign: "left",
        pointerEvents: "none",
      }}
    >
      <div>
        FPS {fps ?? "-"}
        {minFps !== null && (
          <span style={{ color: ok(minFps >= TARGET_FPS) }}> (최저 {minFps})</span>
        )}
      </div>
      <div>
        전환{" "}
        {transitionMs === null ? (
          "-"
        ) : (
          <span style={{ color: ok(transitionMs <= TARGET_TRANSITION_MS) }}>
            {(transitionMs / 1000).toFixed(2)}초
          </span>
        )}
      </div>
    </div>
  );
}
