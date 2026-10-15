// 가이드라인 기준값 측정 도구 (/tracking 전용): 숫자키로 지금 상황을 고르면 0.1초마다 확인용 값을 쌓고,
// 상황별 범위(최솟값~최댓값)와 비율을 표로 보여 줍니다. 영상은 남기지 않고 숫자만 쌓습니다.
// 기록은 메모리에만 있으므로 새로고침하면 사라집니다. 필요하면 CSV로 내려받습니다(내 컴퓨터에만 저장).
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { SITUATIONS, situationOf, summarize, toCsv } from "./measureLog";
import type { MeasureSample } from "./measureLog";
import type { PoseState } from "./useTracking";

const SAMPLE_MS = 100; // 기록 간격

const pct = (v: number) => `${Math.round(v * 100)}%`;
const range = (r: [number, number] | null, digits = 2) =>
  r ? (r[0] === r[1] ? r[0].toFixed(digits) : `${r[0].toFixed(digits)}~${r[1].toFixed(digits)}`) : "-";

export function MeasureRecorder({ pose }: { pose: RefObject<PoseState> }) {
  const [current, setCurrent] = useState<string | null>(null); // 지금 기록 중인 상황 (null = 멈춤)
  const [samples, setSamples] = useState<MeasureSample[]>([]);
  const startedAt = useRef<number | null>(null);

  // 숫자·글자 키로 상황 고르기, 스페이스바로 멈춤
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setCurrent(null);
        return;
      }
      const situation = situationOf(e.code);
      if (situation) setCurrent(situation.name);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!current) return;
    const id = setInterval(() => {
      const now = Date.now();
      startedAt.current ??= now;
      const { found, framed, guidePoints, bgSame, bgScore, bgSpread, bgCells } = pose.current;
      const point = (i: number) => {
        const p = guidePoints?.[i];
        return p ? { x: p.x, y: p.y } : null;
      };
      const sample: MeasureSample = {
        t: now - startedAt.current,
        situation: current,
        found,
        framed,
        nose: point(0),
        left: point(1),
        right: point(2),
        bgSame,
        bgScore,
        bgSpread,
        bgCells,
      };
      setSamples((prev) => [...prev, sample]);
    }, SAMPLE_MS);
    return () => clearInterval(id);
  }, [current, pose]);

  const rows = useMemo(() => summarize(samples), [samples]);

  const download = () => {
    const blob = new Blob([toCsv(samples)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `guide-measure-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={styles.panel}>
      <div>
        <b>측정 기록</b> · {current ? `● ${current} 기록 중 (스페이스바로 멈춤)` : "멈춤 — 키로 상황을 고르면 기록 시작"}
      </div>
      <div style={{ opacity: 0.7 }}>
        {SITUATIONS.map((s) => `${s.key} ${s.name}`).join(" · ")}
      </div>
      {rows.length > 0 && (
        <>
          <table style={styles.table}>
            <thead>
              <tr>
                {["상황", "개수", "벗어남", "사람", "배경 바뀜", "배경 모름", "코 x", "코 y", "왼어깨 x", "왼어깨 y", "오른어깨 x", "오른어깨 y", "닮음", "무늬", "비교 칸"].map((h) => (
                  <th key={h} style={styles.cell}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.situation}>
                  <td style={styles.cell}>{r.situation}</td>
                  <td style={styles.cell}>{r.count}</td>
                  <td style={styles.cell}>{pct(r.outRate)}</td>
                  <td style={styles.cell}>{pct(r.foundRate)}</td>
                  <td style={styles.cell}>{pct(r.changedRate)}</td>
                  <td style={styles.cell}>{pct(r.unknownRate)}</td>
                  <td style={styles.cell}>{range(r.ranges.noseX)}</td>
                  <td style={styles.cell}>{range(r.ranges.noseY)}</td>
                  <td style={styles.cell}>{range(r.ranges.leftX)}</td>
                  <td style={styles.cell}>{range(r.ranges.leftY)}</td>
                  <td style={styles.cell}>{range(r.ranges.rightX)}</td>
                  <td style={styles.cell}>{range(r.ranges.rightY)}</td>
                  <td style={styles.cell}>{range(r.ranges.bgScore)}</td>
                  <td style={styles.cell}>{range(r.ranges.bgSpread, 1)}</td>
                  <td style={styles.cell}>{range(r.ranges.bgCells, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={download}>CSV 내려받기</button>
            <button type="button" onClick={() => setSamples([])}>기록 지우기</button>
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: {
    position: "absolute", left: 16, bottom: 16, maxWidth: "calc(100% - 260px)", maxHeight: "45vh", overflow: "auto",
    padding: "8px 12px", borderRadius: 8, background: "rgba(0,0,0,.6)", color: "#fff",
    font: "12px/1.5 system-ui, sans-serif", display: "grid", gap: 6, textAlign: "left",
  },
  table: { borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" },
  cell: { padding: "2px 6px", borderBottom: "1px solid rgba(255,255,255,.15)", whiteSpace: "nowrap" },
};
