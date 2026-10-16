// 휴대폰 감지 측정 (spike). 실제 서비스 코드가 아니라 측정용 화면입니다. 주소: /phone-spike.html
//
// 정한 측정 방법(docs/판정-기준-근거.md 8절): 헷갈리는 물건을 나열하지 않고 "평소 책상 그대로" 잽니다.
//   1 평소 책상 그대로, 휴대폰 없음 3분 → 휴대폰을 잘못 잡는 횟수(오탐)와 가장 길게 이어진 오탐
//   2 휴대폰 책상에 둠(앞면) 1분 30초, 3 뒷면 1분 30초, 4 들고 보기 1분 → 잡는 비율
// 지난 측정(모델-비교-실험 3단계)은 휴대폰이 화면에 안 보이던 시간까지 분모에 들어가 모델 성능으로 볼 수 없었습니다.
// 그래서 이번에는 영상 위에 감지 상자를 그려, 휴대폰이 계속 화면 안에 보이는지 직접 확인하면서 잽니다.
//
// 모델: MediaPipe 물체 감지 EfficientDet-Lite0 / Lite2 (COCO 80종). 초당 2번(제안서: 물체 인식은 초당 1~2회).
// 기준 점수를 나중에 바꿔 볼 수 있게 0.1 이상인 감지를 모두 기록합니다. 영상·그림은 남기지 않고 숫자만 남깁니다.
import { FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";
import type { Detection } from "@mediapipe/tasks-vision";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODELS = {
  lite0: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite",
  lite2: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float16/1/efficientdet_lite2.tflite",
} as const;
type ModelKey = keyof typeof MODELS;
const DETECT_MS = 500; // 초당 2번
const RECORD_MIN_SCORE = 0.1; // 이 이상은 모두 기록 (기준 점수는 요약에서 바꿔 봄)
const THRESHOLDS = [0.3, 0.5]; // 요약에 보여 줄 기준 점수
const PHONE = "cell phone";

const STEPS = [
  { id: 1, name: "평소 책상 그대로, 휴대폰 없음", seconds: 180, phone: false, hint: "휴대폰은 다른 곳에 치우고 평소처럼 공부합니다" },
  { id: 2, name: "휴대폰 책상에 둠 (앞면)", seconds: 90, phone: true, hint: "화면이 위로 오게 책상 위에 둡니다. 상자가 휴대폰에 그려지는지 봅니다" },
  { id: 3, name: "휴대폰 책상에 둠 (뒷면)", seconds: 90, phone: true, hint: "뒤집어서 책상 위에 둡니다" },
  { id: 4, name: "휴대폰 들고 보기", seconds: 60, phone: true, hint: "휴대폰을 들고 화면을 봅니다. 휴대폰이 카메라에 보이게 듭니다" },
] as const;

type Row = { t: number; framing: string; step: number; model: ModelKey; detections: { name: string; score: number }[] };
const rows: Row[] = [];

// ---- 화면 ----
const style = document.createElement("style");
style.textContent = `
  body { font-family: system-ui, sans-serif; margin: 16px; background: #20232a; color: #fff; }
  #stage { position: relative; display: inline-block; }
  video, canvas { width: 640px; max-width: 100%; transform: scaleX(-1); display: block; }
  canvas { position: absolute; inset: 0; }
  table { border-collapse: collapse; font-size: 13px; margin-top: 8px; }
  th, td { border: 1px solid #555; padding: 2px 6px; text-align: right; }
  td:nth-child(2), th:nth-child(2) { text-align: left; }
  #now { font-size: 20px; margin: 8px 0; }
  button { margin-right: 6px; }
`;
document.head.append(style);
document.body.innerHTML = `
  <h2>휴대폰 감지 측정 (MediaPipe Lite0 / Lite2)</h2>
  <p>구도: <button data-framing="A">A 노트북 보통 각도</button><button data-framing="B">B 책상이 보이게 낮춤</button>
     <span id="framing">← 먼저 고르세요</span></p>
  <p>단계 건너뛰기: ${STEPS.map((s) => `<button data-step="${s.id}">${s.id}부터</button>`).join("")}</p>
  <div id="now">모델 불러오는 중…</div>
  <div id="stage"><video id="video" muted playsinline></video><canvas id="overlay"></canvas></div>
  <p><button id="csv">CSV 내려받기</button> 빨간 상자 = 휴대폰, 회색 = 다른 물체 (Lite2 기준, 점수 0.3 이상)</p>
  <div id="table"></div>
`;
const nowEl = document.getElementById("now")!;
const video = document.getElementById("video") as HTMLVideoElement;
const canvas = document.getElementById("overlay") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const tableEl = document.getElementById("table")!;

let framing: string | null = null;
let stepIndex = 0; // 다음에 할 단계
let running: { step: (typeof STEPS)[number]; startMs: number } | null = null;
let audio: AudioContext | null = null;

document.querySelectorAll<HTMLButtonElement>("[data-framing]").forEach((b) =>
  b.addEventListener("click", () => {
    framing = b.dataset.framing!;
    stepIndex = 0;
    b.blur(); // 스페이스바가 이 버튼을 다시 누르지 않게
    document.getElementById("framing")!.textContent = `구도 ${framing} — 단계를 처음부터 합니다`;
    showNext();
  })
);

// 원하는 단계부터 하기 (측정 중에는 바꾸지 않음)
document.querySelectorAll<HTMLButtonElement>("[data-step]").forEach((b) =>
  b.addEventListener("click", () => {
    if (running) return;
    stepIndex = STEPS.findIndex((s) => s.id === Number(b.dataset.step));
    b.blur(); // 스페이스바가 이 버튼을 다시 누르지 않게
    showNext();
  })
);

function beep(times: number) {
  if (!audio) return;
  for (let i = 0; i < times; i++) {
    const at = audio.currentTime + i * 0.35;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.2;
    osc.connect(gain).connect(audio.destination);
    osc.start(at);
    osc.stop(at + 0.25);
  }
}

function showNext() {
  if (!framing) return;
  const step = STEPS[stepIndex];
  nowEl.textContent = step
    ? `다음: ${step.id}. ${step.name} (${step.seconds}초) — ${step.hint}. 준비되면 스페이스바`
    : `구도 ${framing} 끝. 다른 구도도 재려면 위에서 고르세요. CSV를 내려받아 주세요.`;
}

window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || !framing || running || !STEPS[stepIndex]) return;
  e.preventDefault();
  audio ??= new AudioContext();
  void audio.resume();
  running = { step: STEPS[stepIndex], startMs: performance.now() };
});

document.getElementById("csv")!.addEventListener("click", () => {
  const lines = ["t,framing,step,model,phoneScore,detections"];
  for (const r of rows) {
    const phone = Math.max(0, ...r.detections.filter((d) => d.name === PHONE).map((d) => d.score));
    lines.push(`${r.t},${r.framing},${r.step},${r.model},${phone.toFixed(3)},"${r.detections.map((d) => `${d.name}:${d.score.toFixed(2)}`).join(" ")}"`);
  }
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `phone-spike-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
  link.click();
});

// ---- 요약 ----
// 단계·모델별: 감지 횟수, 기준 점수마다 휴대폰을 잡은 비율과 가장 길게 이어진 시간(초), 휴대폰 최고 점수, 자주 잡힌 다른 물체
function summaryHtml(): string {
  const head = ["구도", "단계", "모델", "감지 수", ...THRESHOLDS.flatMap((th) => [`휴대폰 ≥${th}`, `최장 연속 ≥${th}(초)`]), "휴대폰 최고 점수", "자주 잡힌 다른 물체(≥0.3)"];
  const body: string[] = [];
  for (const fr of ["A", "B"]) {
    for (const step of STEPS) {
      for (const model of Object.keys(MODELS) as ModelKey[]) {
        const rs = rows.filter((r) => r.framing === fr && r.step === step.id && r.model === model);
        if (rs.length === 0) continue;
        const phoneScore = (r: Row) => Math.max(0, ...r.detections.filter((d) => d.name === PHONE).map((d) => d.score));
        const cells = THRESHOLDS.flatMap((th) => {
          const hits = rs.map((r) => phoneScore(r) >= th);
          let best = 0, cur = 0;
          for (const h of hits) best = Math.max(best, (cur = h ? cur + 1 : 0));
          const n = hits.filter(Boolean).length;
          const rate = step.phone ? `${Math.round((n / rs.length) * 100)}%` : `${n}회`;
          return [rate, ((best * DETECT_MS) / 1000).toFixed(1)];
        });
        const others = new Map<string, number>();
        rs.forEach((r) => r.detections.filter((d) => d.name !== PHONE && d.score >= 0.3).forEach((d) => others.set(d.name, (others.get(d.name) ?? 0) + 1)));
        const top = [...others].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${n} ${Math.round((c / rs.length) * 100)}%`).join(", ");
        body.push(`<tr><td>${fr}</td><td>${step.id}. ${step.name}</td><td>${model}</td><td>${rs.length}</td>${cells.map((c) => `<td>${c}</td>`).join("")}<td>${Math.max(...rs.map(phoneScore)).toFixed(2)}</td><td>${top}</td></tr>`);
      }
    }
  }
  return `<table><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr>${body.join("")}</table>
    <p>휴대폰 없음 단계는 잘못 잡은 횟수, 나머지는 잡은 비율입니다. "최장 연속"은 노란불 기준(몇 초 연속)을 정할 근거입니다.</p>`;
}

function draw(detections: Detection[]) {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const d of detections) {
    const c = d.categories[0];
    const box = d.boundingBox;
    if (!c || !box || c.score < 0.3) continue;
    const phone = c.categoryName === PHONE;
    ctx.strokeStyle = phone ? "#ef4444" : "#9ca3af";
    ctx.lineWidth = phone ? 4 : 2;
    ctx.strokeRect(box.originX, box.originY, box.width, box.height);
  }
}

// ---- 측정 ----
async function main() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
  video.srcObject = stream;
  await video.play();
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  const detectors = {} as Record<ModelKey, ObjectDetector>;
  for (const key of Object.keys(MODELS) as ModelKey[]) {
    detectors[key] = await ObjectDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODELS[key], delegate: "GPU" },
      runningMode: "VIDEO",
      scoreThreshold: RECORD_MIN_SCORE,
      maxResults: 10,
    });
  }
  nowEl.textContent = "준비됨 — 위에서 구도를 고르세요";
  const started = performance.now();
  let lastTs = 0;

  setInterval(() => {
    const now = performance.now();
    if (running) {
      const left = running.startMs + running.step.seconds * 1000 - now;
      nowEl.textContent = `● ${running.step.id}. ${running.step.name} — ${Math.ceil(left / 1000)}초 남음`;
      if (left <= 0) {
        running = null;
        stepIndex++;
        beep(stepIndex >= STEPS.length ? 3 : 1);
        showNext();
        tableEl.innerHTML = summaryHtml();
      }
    }
    if (video.readyState < 2) return;
    for (const key of Object.keys(MODELS) as ModelKey[]) {
      lastTs = Math.max(performance.now(), lastTs + 1); // VIDEO 모드는 시각이 늘 커져야 함
      const result = detectors[key].detectForVideo(video, lastTs);
      if (key === "lite2") draw(result.detections);
      if (running && framing) {
        rows.push({
          t: Math.round(now - started), framing, step: running.step.id, model: key,
          detections: result.detections.flatMap((d) => d.categories.map((c) => ({ name: c.categoryName, score: c.score }))),
        });
      }
    }
  }, DETECT_MS);
}

main().catch((error: unknown) => {
  nowEl.textContent = `시작 실패: ${error instanceof Error ? error.message : String(error)}`;
});
