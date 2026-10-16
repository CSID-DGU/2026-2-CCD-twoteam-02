// 숨긴 탭 인식 시험 (spike). 실제 서비스 코드가 아니라 측정용 화면입니다. 주소: /hidden-spike.html
//
// 알고 싶은 것: 다른 탭으로 가서 이 페이지가 숨겨져도 얼굴 인식을 느린 주기로 계속 돌릴 수 있는가.
// - requestAnimationFrame(지금 트래킹 반복): 숨기면 멈춥니다. → 비교용으로 셉니다.
// - 메인 스레드 setInterval: 숨기면 1초 1회, Chrome은 숨긴 지 5분 뒤 1분 1회로 늦춘다고 알려져 있습니다. → 셉니다.
// - Web Worker setInterval: 워커 타이머는 늦추지 않는다고 알려져 있습니다. → 워커가 1초마다 신호를 보내면
//   메인 스레드가 그때 얼굴 인식을 한 번 돌립니다. (숨겨진 동안에만)
// - 숨긴 탭에서 <video>의 프레임이 계속 바뀌는지(currentTime), 안 바뀌면 ImageCapture.grabFrame()으로
//   카메라에서 직접 한 장 받아 인식되는지도 봅니다.
//
// 결과는 10초 칸마다 한 줄로 화면에 쌓입니다. 영상·그림은 저장하지 않고 숫자만 남깁니다.
// GPU 대신 CPU로 시험하려면 주소 뒤에 ?cpu 를 붙입니다.
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// useTracking.ts와 같은 주소를 씁니다.
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const TICK_MS = 1000; // 숨긴 동안 인식 주기 (시험용)
const WINDOW_MS = 10_000; // 결과 한 줄의 길이

type Row = {
  t: number; // 시작 뒤 몇 초부터의 칸인지
  hiddenTicks: number; // 이 칸에서 숨겨져 있던 워커 신호 수
  hiddenFor: number | null; // 칸 끝 시점에 숨긴 지 몇 초
  raf: number; // rAF 호출 수
  main: number; // 메인 setInterval 호출 수
  worker: number; // 워커 신호 수
  detects: number; // 숨긴 동안 인식 시도 수
  found: number; // 그중 얼굴을 찾은 수
  advanced: number; // 그중 <video> 프레임이 바뀌어 있던 수
  grabbed: number; // 프레임이 안 바뀌어 grabFrame으로 인식한 수
  grabFound: number; // 그중 얼굴을 찾은 수
  ms: number; // 인식에 걸린 시간 합 (평균 계산용)
  errors: string[];
};

type ImageCaptureLike = { grabFrame(): Promise<ImageBitmap> };
const ImageCaptureCtor = (globalThis as { ImageCapture?: new (track: MediaStreamTrack) => ImageCaptureLike })
  .ImageCapture;

const startedAt = performance.now();
const rows: Row[] = [];
let hiddenSince: number | null = null;

function emptyRow(t: number): Row {
  return {
    t, hiddenTicks: 0, hiddenFor: null, raf: 0, main: 0, worker: 0,
    detects: 0, found: 0, advanced: 0, grabbed: 0, grabFound: 0, ms: 0, errors: [],
  };
}

// 지금 시각이 속한 칸을 돌려줍니다. 비어 있는 칸도 만들어 둬서 "아무것도 안 돈 10초"가 보이게 합니다.
function current(): Row {
  const t = Math.floor((performance.now() - startedAt) / WINDOW_MS) * (WINDOW_MS / 1000);
  while (rows.length === 0 || rows[rows.length - 1].t < t) {
    const next = rows.length === 0 ? 0 : rows[rows.length - 1].t + WINDOW_MS / 1000;
    rows.push(emptyRow(next));
  }
  const row = rows[rows.length - 1];
  row.hiddenFor = hiddenSince === null ? null : Math.round((performance.now() - hiddenSince) / 1000);
  return row;
}

document.addEventListener("visibilitychange", () => {
  hiddenSince = document.hidden ? performance.now() : null;
  if (!document.hidden) render();
});

// ---- 화면 ----
const style = document.createElement("style");
style.textContent = `
  body { font-family: system-ui, sans-serif; margin: 16px; }
  table { border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #ccc; padding: 2px 6px; text-align: right; }
  tr.hidden td { background: #fff6d6; }
  video { width: 240px; transform: scaleX(-1); border: 1px solid #ccc; }
  #status { font-weight: bold; margin: 8px 0; }
`;
document.head.append(style);
document.body.innerHTML = `
  <h2>숨긴 탭 인식 시험</h2>
  <p>준비되면 다른 탭으로 가서 정해진 순서대로 있다가 돌아오세요. 노란 줄 = 숨겨져 있던 칸.</p>
  <div id="status">준비 중…</div>
  <video id="video" muted playsinline></video>
  <p><button id="copy">CSV 복사</button></p>
  <div id="table"></div>
`;
const statusEl = document.getElementById("status")!;
const video = document.getElementById("video") as HTMLVideoElement;
const tableEl = document.getElementById("table")!;

const COLUMNS: [keyof Row | "avgMs", string][] = [
  ["t", "시각(초)"], ["hiddenFor", "숨긴 지(초)"], ["raf", "rAF"], ["main", "메인 타이머"],
  ["worker", "워커 신호"], ["detects", "인식 시도"], ["found", "얼굴 찾음"], ["advanced", "프레임 바뀜"],
  ["grabbed", "grabFrame"], ["grabFound", "grab 찾음"], ["avgMs", "평균 ms"], ["errors", "오류"],
];

function cell(row: Row, key: keyof Row | "avgMs"): string {
  if (key === "avgMs") return row.detects ? (row.ms / row.detects).toFixed(0) : "";
  if (key === "errors") return row.errors.slice(0, 2).join(" / ");
  const value = row[key];
  return value === null ? "" : String(value);
}

function render() {
  const head = COLUMNS.map(([, label]) => `<th>${label}</th>`).join("");
  const body = rows
    .map((row) => `<tr class="${row.hiddenTicks > 0 ? "hidden" : ""}">${COLUMNS.map(([k]) => `<td>${cell(row, k)}</td>`).join("")}</tr>`)
    .join("");
  tableEl.innerHTML = `<table><tr>${head}</tr>${body}</table>`;
}

document.getElementById("copy")!.addEventListener("click", () => {
  const lines = [COLUMNS.map(([, label]) => label).join(",")];
  for (const row of rows) lines.push(COLUMNS.map(([k]) => `"${cell(row, k)}"`).join(","));
  void navigator.clipboard.writeText(lines.join("\n"));
  statusEl.textContent = "CSV를 복사했습니다.";
});

// ---- 시험 ----
async function main() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
  video.srcObject = stream;
  await video.play();
  const track = stream.getVideoTracks()[0];
  const capture = ImageCaptureCtor ? new ImageCaptureCtor(track) : null;

  const useCpu = new URLSearchParams(location.search).has("cpu");
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  const landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: useCpu ? "CPU" : "GPU" },
    runningMode: "VIDEO",
    numFaces: 1,
  });

  // MediaPipe VIDEO 모드는 시각이 늘 커져야 하므로 두 경로(rAF·워커)가 같은 시계를 씁니다.
  let lastTs = 0;
  const stamp = () => {
    lastTs = Math.max(performance.now(), lastTs + 1);
    return lastTs;
  };
  const detect = (source: HTMLVideoElement | ImageBitmap) =>
    (landmarker.detectForVideo(source, stamp()).faceLandmarks?.length ?? 0) > 0;

  // 1) rAF: 보이는 동안 지금 앱처럼 인식합니다. (숨기면 멈추는지 확인)
  let visibleFound = false;
  const loop = () => {
    current().raf++;
    if (!document.hidden && video.readyState >= 2) visibleFound = detect(video);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // 2) 메인 setInterval: 세기만 합니다. (숨긴 탭에서 얼마나 늦춰지는지)
  setInterval(() => {
    current().main++;
    if (!document.hidden) {
      statusEl.textContent = `준비됨 (${useCpu ? "CPU" : "GPU"}) — 얼굴 ${visibleFound ? "보임" : "안 보임"}`;
      render();
    }
  }, TICK_MS);

  // 3) 워커 setInterval → 메인 스레드에서 숨긴 동안만 인식
  const workerCode = `setInterval(() => postMessage(0), ${TICK_MS});`;
  const worker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: "text/javascript" })));
  let lastVideoTime = -1;
  let busy = false;
  worker.onmessage = async () => {
    const row = current();
    row.worker++;
    if (!document.hidden || busy) return;
    row.hiddenTicks++;
    busy = true;
    const begin = performance.now();
    try {
      row.detects++;
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        row.advanced++;
        if (detect(video)) row.found++;
      } else if (capture) {
        // <video> 프레임이 멈춰 있으면 카메라에서 직접 한 장 받습니다. 그림은 인식 직후 버립니다.
        const bitmap = await capture.grabFrame();
        row.grabbed++;
        const found = detect(bitmap);
        bitmap.close();
        if (found) {
          row.grabFound++;
          row.found++;
        }
      }
    } catch (error: unknown) {
      row.errors.push(error instanceof Error ? error.message : String(error));
    } finally {
      row.ms += performance.now() - begin;
      busy = false;
    }
  };
}

main().catch((error: unknown) => {
  statusEl.textContent = `시작 실패: ${error instanceof Error ? error.message : String(error)}`;
});
