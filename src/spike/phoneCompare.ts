// 휴대폰 감지 모델 비교 (spike, #562·#564). 실제 서비스 코드가 아니라 측정용 화면입니다. 주소: /phone-compare.html
//
// 왜 필요한가: 모델을 바꿀지 정하려면 같은 장면을 여러 모델이 보게 해야 합니다. 웹캠으로 그때그때 하면 매번 동작이 달라
// 공정하지 않으므로, 미리 찍어 둔 영상 파일을 넣어 0.5초마다 한 장면씩 모든 모델에 똑같이 넣습니다.
//
// 재는 것
//   1 장면마다 휴대폰 점수와 상자 위치·크기 (0.5초 간격)
//   2 얼굴 위치와 얼굴 양옆 점 → 휴대폰 상자가 귀·볼 근처에 잡히는지 나중에 계산 (#563)
//   3 모델이 한 번 도는 데 걸리는 시간(ms)
//   4 같은 기록으로 "1초마다 4번 연속(지금)", "2초마다 2번 연속" 같은 규칙을 다시 돌린 결과
//
// 모델
//   - Lite0 (지금 서비스): MediaPipe EfficientDet-Lite0 float16, 그래픽 장치
//   - Lite0 int8·CPU: 같은 모델의 가벼운 판을 CPU 에서 (그래픽 장치를 3D 화면에 넘기는 실험)
//   - D-FINE-N: 640 크기로 보는 모델. 코드·가중치 Apache-2.0. MediaPipe 가 받는 형식이 아니라 ONNX Runtime Web 으로 돌립니다.
//     실행 라이브러리는 package.json 에 넣지 않고 이 화면에서만 CDN 에서 불러옵니다(서비스 빌드에 들어가지 않음).
//     주소에 ?ep=webgpu 를 붙이면 CPU 대신 WebGPU 로 돌립니다.
//
// 영상·그림은 저장하지도 전송하지도 않습니다. 숫자만 남깁니다. 모든 계산은 이 브라우저 안에서 합니다.
import { FaceLandmarker, FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";
import { centerCrop, decodeDfine, longestRun, simulateRule } from "./compareLogic";
import type { Box } from "./compareLogic";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const FACE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const LITE0_URL = "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite";
const LITE0_INT8_URL = "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/latest/efficientdet_lite0.tflite";
const ORT_DIST = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/";
const DFINE_REPO = "https://huggingface.co/onnx-community/dfine_n_coco-ONNX/resolve/main/";
const DFINE_SIZE = 640; // 모델이 받는 사진 크기
const USE_WEBGPU = new URLSearchParams(location.search).get("ep") === "webgpu";

const PHONE = "cell phone";
const FRAME_W = 640; // 서비스가 웹캠에 요청하는 크기
const FRAME_H = 480;
const GRID_SEC = 0.5; // 영상에서 장면을 뽑는 간격. 1초·2초·2.5초 규칙을 모두 이 간격의 배수로 다시 돌릴 수 있습니다.
const RECORD_MIN_SCORE = 0.1;
const THRESHOLDS = [0.3, 0.5]; // 요약에 보여 줄 기준 점수
const RULES = [
  { name: "지금: 1초마다, 4번 연속", intervalSec: 1, need: 4 },
  { name: "2초마다, 2번 연속", intervalSec: 2, need: 2 },
  { name: "2.5초마다, 2번 연속", intervalSec: 2.5, need: 2 },
];
// 얼굴 윤곽에서 양쪽 귀 앞 점 (MediaPipe 얼굴 478점 번호)
const FACE_SIDE_A = 234;
const FACE_SIDE_B = 454;

// 장면의 정답. 파일 이름 첫 글자로 미리 고릅니다: p(휴대폰이 화면 안), q(화면 밖일 수 있음), n(휴대폰 없음)
type Label = "in" | "maybe" | "none";
const LABEL_NAMES: Record<Label, string> = { in: "휴대폰 있음 (화면 안)", maybe: "휴대폰 있음 (화면 밖일 수 있음)", none: "휴대폰 없음" };

type Found = { score: number; box: Box | null; other: string };
type Model = { key: string; name: string; color: string; run: (frame: HTMLCanvasElement) => Found | Promise<Found> };
type Point = { x: number; y: number };
type Row = {
  scene: string;
  label: Label;
  t: number;
  face: Box | null;
  sides: [Point, Point] | null;
  models: Record<string, Found & { ms: number }>;
};

// ONNX Runtime Web 에서 쓰는 부분만 적은 타입 (CDN 에서 불러와 타입 정보가 없음)
type OrtTensor = { data: ArrayLike<number>; dims: readonly number[] };
type OrtSession = { inputNames: string[]; outputNames: string[]; run: (feeds: Record<string, OrtTensor>) => Promise<Record<string, OrtTensor>> };
type Ort = {
  env: { wasm: { wasmPaths?: string } };
  InferenceSession: { create: (url: string, options: { executionProviders: string[] }) => Promise<OrtSession> };
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => OrtTensor;
};

const rows: Row[] = [];
const models: Model[] = [];
let face: FaceLandmarker | null = null;
let busy = false;

// ---- 화면 ----
const style = document.createElement("style");
style.textContent = `
  body { font-family: system-ui, sans-serif; margin: 16px; background: #20232a; color: #fff; }
  canvas { width: 640px; max-width: 100%; display: block; background: #000; }
  table { border-collapse: collapse; font-size: 13px; margin-top: 8px; }
  th, td { border: 1px solid #555; padding: 2px 6px; text-align: right; }
  td.left, th.left { text-align: left; }
  #now { font-size: 18px; margin: 8px 0; }
  button, select, input { margin-right: 6px; }
  .legend span { margin-right: 12px; }
  .note { color: #cbd5e1; font-size: 13px; }
`;
document.head.append(style);
document.body.innerHTML = `
  <h2>휴대폰 감지 모델 비교</h2>
  <p class="note">미리 찍은 영상(또는 사진)을 넣으면 0.5초마다 한 장면씩 모든 모델에 똑같이 넣어 비교합니다.
     영상은 가운데를 4:3으로 잘라 640x480으로 맞춥니다. 영상은 저장하지도 보내지도 않습니다.<br>
     파일 이름 첫 글자로 정답을 미리 고릅니다: p = 휴대폰이 화면 안, q = 화면 밖일 수 있음, n = 휴대폰 없음 (아래에서 바꿀 수 있음)</p>
  <div id="now">모델 불러오는 중…</div>
  <p><input id="files" type="file" accept="video/*,image/*" multiple disabled>
     <button id="start" disabled>측정 시작</button>
     <button id="json">JSON 내려받기</button>
     <button id="clear">결과 지우기</button></p>
  <div id="list"></div>
  <canvas id="view" width="${FRAME_W}" height="${FRAME_H}"></canvas>
  <p class="legend" id="legend"></p>
  <div id="table"></div>
`;
const nowEl = document.getElementById("now")!;
const listEl = document.getElementById("list")!;
const tableEl = document.getElementById("table")!;
const filesEl = document.getElementById("files") as HTMLInputElement;
const startEl = document.getElementById("start") as HTMLButtonElement;
const view = document.getElementById("view") as HTMLCanvasElement;
const viewCtx = view.getContext("2d")!;
// 모델에 넣는 깨끗한 장면 (상자를 그리지 않은 것)
const frame = document.createElement("canvas");
frame.width = FRAME_W;
frame.height = FRAME_H;
const frameCtx = frame.getContext("2d", { willReadFrequently: true })!;
const video = document.createElement("video");
video.muted = true;
video.playsInline = true;

const esc = (text: string) => text.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

type Item = { file: File; label: Label; done: boolean };
let items: Item[] = [];

function guessLabel(name: string): Label {
  const first = name.trim().toLowerCase()[0];
  return first === "n" ? "none" : first === "q" ? "maybe" : "in";
}

function renderList() {
  if (items.length === 0) {
    listEl.innerHTML = "";
    return;
  }
  listEl.innerHTML = `<table><tr><th class="left">파일</th><th class="left">정답</th><th>상태</th></tr>${items
    .map(
      (item, i) => `<tr><td class="left">${esc(item.file.name)}</td>
        <td class="left"><select data-item="${i}">${(Object.keys(LABEL_NAMES) as Label[])
          .map((key) => `<option value="${key}"${key === item.label ? " selected" : ""}>${LABEL_NAMES[key]}</option>`)
          .join("")}</select></td>
        <td>${item.done ? "끝" : "대기"}</td></tr>`
    )
    .join("")}</table>`;
  listEl.querySelectorAll<HTMLSelectElement>("select").forEach((select) =>
    select.addEventListener("change", () => {
      items[Number(select.dataset.item)].label = select.value as Label;
    })
  );
}

filesEl.addEventListener("change", () => {
  items = [...(filesEl.files ?? [])].map((file) => ({ file, label: guessLabel(file.name), done: false }));
  renderList();
});

document.getElementById("clear")!.addEventListener("click", () => {
  if (busy) return;
  rows.length = 0;
  tableEl.innerHTML = "";
});

document.getElementById("json")!.addEventListener("click", () => {
  const data = {
    date: new Date().toISOString(),
    gridSec: GRID_SEC,
    frame: [FRAME_W, FRAME_H],
    dfineBackend: USE_WEBGPU ? "webgpu" : "wasm",
    models: models.map((m) => ({ key: m.key, name: m.name })),
    rows,
  };
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  link.download = `phone-compare-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
  link.click();
});

// ---- 모델 ----
// MediaPipe 물체 감지: 휴대폰 점수가 가장 높은 상자와, 휴대폰이 아닌 것 중 가장 점수 높은 이름을 돌려줍니다.
function mediapipeModel(key: string, name: string, color: string, detector: ObjectDetector): Model {
  return {
    key,
    name,
    color,
    run: (image) => {
      let score = 0;
      let box: Box | null = null;
      let other = "";
      let otherScore = 0;
      for (const d of detector.detect(image).detections) {
        const c = d.categories[0];
        const b = d.boundingBox;
        if (!c) continue;
        if (c.categoryName === PHONE) {
          if (c.score > score) {
            score = c.score;
            box = b ? { x: b.originX / image.width, y: b.originY / image.height, w: b.width / image.width, h: b.height / image.height } : null;
          }
        } else if (c.score > otherScore) {
          otherScore = c.score;
          other = `${c.categoryName} ${c.score.toFixed(2)}`;
        }
      }
      return { score, box, other };
    },
  };
}

async function dfineModel(): Promise<Model> {
  // 변수에 담은 주소라 Vite 가 묶지 않고, 브라우저가 이 화면에서만 CDN 에서 불러옵니다.
  const ortUrl = `${ORT_DIST}${USE_WEBGPU ? "ort.webgpu.min.mjs" : "ort.wasm.min.mjs"}`;
  const ort = (await import(/* @vite-ignore */ ortUrl)) as Ort;
  ort.env.wasm.wasmPaths = ORT_DIST;
  const config = (await (await fetch(`${DFINE_REPO}config.json`)).json()) as { id2label: Record<string, string> };
  const labels = Object.keys(config.id2label).map((_, i) => config.id2label[String(i)]);
  const phoneIndex = labels.indexOf(PHONE);
  if (phoneIndex < 0) throw new Error("D-FINE 종류 목록에 cell phone 이 없습니다");
  const session = await ort.InferenceSession.create(`${DFINE_REPO}onnx/model.onnx`, { executionProviders: [USE_WEBGPU ? "webgpu" : "wasm"] });

  const input = document.createElement("canvas");
  input.width = DFINE_SIZE;
  input.height = DFINE_SIZE;
  const inputCtx = input.getContext("2d", { willReadFrequently: true })!;
  const pixels = DFINE_SIZE * DFINE_SIZE;
  return {
    key: "dfine_n",
    name: `D-FINE-N (${USE_WEBGPU ? "WebGPU" : "CPU"})`,
    color: "#22d3ee",
    run: async (image) => {
      // 전처리: 640x640 으로 늘리고(비율 무시, 모델 학습 때와 같음) 0~1 로 바꿔 빨강·초록·파랑 판을 차례로 놓습니다.
      inputCtx.drawImage(image, 0, 0, DFINE_SIZE, DFINE_SIZE);
      const rgba = inputCtx.getImageData(0, 0, DFINE_SIZE, DFINE_SIZE).data;
      const data = new Float32Array(3 * pixels);
      for (let i = 0; i < pixels; i++) {
        data[i] = rgba[i * 4] / 255;
        data[pixels + i] = rgba[i * 4 + 1] / 255;
        data[2 * pixels + i] = rgba[i * 4 + 2] / 255;
      }
      const output = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", data, [1, 3, DFINE_SIZE, DFINE_SIZE]) });
      // 출력 두 개 중 마지막 크기가 4 인 것이 상자, 나머지가 종류별 점수입니다.
      const tensors = session.outputNames.map((name) => output[name]);
      const boxes = tensors.find((t) => t.dims[t.dims.length - 1] === 4);
      const logits = tensors.find((t) => t !== boxes);
      if (!boxes || !logits) throw new Error("D-FINE 출력 형식이 예상과 다릅니다");
      const found = decodeDfine(logits.data, boxes.data, labels.length, phoneIndex);
      return {
        score: found.phoneScore,
        box: found.box,
        other: found.otherIndex >= 0 ? `${labels[found.otherIndex]} ${found.otherScore.toFixed(2)}` : "",
      };
    },
  };
}

async function loadModels() {
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  const failed: string[] = [];
  const attempt = async (name: string, make: () => Promise<Model>) => {
    try {
      models.push(await make());
    } catch (error: unknown) {
      console.warn(`${name} 을 불러오지 못했습니다:`, error);
      failed.push(name);
    }
  };
  const detectorOptions = { runningMode: "IMAGE" as const, scoreThreshold: RECORD_MIN_SCORE, maxResults: 10 };
  await attempt("Lite0", async () =>
    mediapipeModel("lite0", "Lite0 (지금 서비스)", "#ef4444", await ObjectDetector.createFromOptions(fileset, { baseOptions: { modelAssetPath: LITE0_URL, delegate: "GPU" }, ...detectorOptions }))
  );
  await attempt("Lite0 int8", async () =>
    mediapipeModel("lite0_int8_cpu", "Lite0 int8·CPU", "#f59e0b", await ObjectDetector.createFromOptions(fileset, { baseOptions: { modelAssetPath: LITE0_INT8_URL, delegate: "CPU" }, ...detectorOptions }))
  );
  await attempt("D-FINE-N", dfineModel);
  try {
    face = await FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: "GPU" }, runningMode: "IMAGE", numFaces: 1 });
  } catch (error: unknown) {
    console.warn("얼굴 인식을 불러오지 못했습니다. 얼굴 위치 없이 잽니다:", error);
    failed.push("얼굴 위치");
  }
  document.getElementById("legend")!.innerHTML = models.map((m) => `<span style="color:${m.color}">■ ${esc(m.name)}</span>`).join("") + `<span>□ 얼굴</span>`;
  nowEl.textContent = `준비됨 — 영상을 고르고 [측정 시작]${failed.length ? ` (불러오지 못한 것: ${failed.join(", ")})` : ""}`;
  filesEl.disabled = false;
  startEl.disabled = false;
}

// ---- 측정 ----
function once(target: EventTarget, name: string, errorName = "error") {
  return new Promise<void>((resolve, reject) => {
    const ok = () => {
      target.removeEventListener(errorName, bad);
      resolve();
    };
    const bad = () => {
      target.removeEventListener(name, ok);
      reject(new Error(`${name} 을 기다리다 실패했습니다`));
    };
    target.addEventListener(name, ok, { once: true });
    target.addEventListener(errorName, bad, { once: true });
  });
}

function readFace(): { face: Box | null; sides: [Point, Point] | null } {
  const points = face?.detect(frame).faceLandmarks[0];
  if (!points) return { face: null, sides: null };
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const a = points[FACE_SIDE_A];
  const b = points[FACE_SIDE_B];
  return { face: { x: minX, y: minY, w: maxX - minX, h: maxY - minY }, sides: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }] };
}

// 지금 frame 에 그려진 장면을 모든 모델에 넣고 한 줄을 만듭니다. record 가 false 면 준비 운동(첫 실행은 느림)이라 버립니다.
async function measure(scene: string, label: Label, t: number, record: boolean) {
  const row: Row = { scene, label, t, ...readFace(), models: {} };
  for (const model of models) {
    const started = performance.now();
    const found = await model.run(frame);
    row.models[model.key] = { ...found, ms: performance.now() - started };
  }
  if (!record) return;
  rows.push(row);
  viewCtx.drawImage(frame, 0, 0);
  viewCtx.lineWidth = 3;
  for (const model of models) {
    const { score, box } = row.models[model.key];
    if (!box || score < THRESHOLDS[0]) continue;
    viewCtx.strokeStyle = model.color;
    viewCtx.strokeRect(box.x * FRAME_W, box.y * FRAME_H, box.w * FRAME_W, box.h * FRAME_H);
  }
  if (row.face) {
    viewCtx.strokeStyle = "#ffffff";
    viewCtx.lineWidth = 1;
    viewCtx.strokeRect(row.face.x * FRAME_W, row.face.y * FRAME_H, row.face.w * FRAME_W, row.face.h * FRAME_H);
  }
}

function drawSource(source: CanvasImageSource, width: number, height: number) {
  const crop = centerCrop(width, height, FRAME_W / FRAME_H);
  frameCtx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, FRAME_W, FRAME_H);
}

async function runFile(item: Item, warm: boolean) {
  const scene = item.file.name;
  if (item.file.type.startsWith("image/")) {
    const bitmap = await createImageBitmap(item.file);
    drawSource(bitmap, bitmap.width, bitmap.height);
    if (warm) await measure(scene, item.label, 0, false);
    await measure(scene, item.label, 0, true);
    bitmap.close();
    return;
  }
  const url = URL.createObjectURL(item.file);
  try {
    video.src = url;
    await once(video, "loadedmetadata");
    if (!Number.isFinite(video.duration)) throw new Error("영상 길이를 알 수 없습니다 (브라우저로 녹화한 webm 은 안 됩니다. QuickTime·카메라 앱으로 찍은 mov·mp4 를 써 주세요)");
    const total = Math.floor(video.duration / GRID_SEC);
    for (let i = 0; i < total; i++) {
      const t = i * GRID_SEC + GRID_SEC / 2;
      video.currentTime = t;
      await once(video, "seeked");
      drawSource(video, video.videoWidth, video.videoHeight);
      if (warm && i === 0) await measure(scene, item.label, t, false);
      await measure(scene, item.label, t, true);
      nowEl.textContent = `● ${scene} — ${i + 1} / ${total}`;
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

startEl.addEventListener("click", () => {
  if (busy || items.length === 0) return;
  busy = true;
  startEl.disabled = true;
  nowEl.textContent = "측정 시작…";
  void (async () => {
    const errors: string[] = [];
    let warm = true;
    for (const item of items) {
      if (item.done) continue;
      try {
        await runFile(item, warm);
        warm = false;
        item.done = true;
      } catch (error: unknown) {
        errors.push(`${item.file.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
      renderList();
      tableEl.innerHTML = summaryHtml();
    }
    nowEl.textContent = errors.length ? `끝 — 실패: ${errors.join(" / ")}` : "끝 — 아래 표를 보고, JSON 을 내려받아 주세요";
    busy = false;
    startEl.disabled = false;
  })();
});

// ---- 요약 ----
const percent = (value: number) => `${Math.round(value * 100)}%`;
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

function summaryHtml(): string {
  const scenes = [...new Set(rows.map((r) => r.scene))];
  // 표 1: 장면·모델별로 잡은 비율, 가장 길게 이어진 시간, 한 번 도는 시간
  const head1 = ["장면", "정답", "모델", "표본", ...THRESHOLDS.flatMap((th) => [`휴대폰 ≥${th}`, `최장 연속 ≥${th}(초)`]), "휴대폰 최고 점수", "한 번 평균(ms)", "자주 잡힌 다른 것"];
  const body1: string[] = [];
  for (const scene of scenes) {
    const rs = rows.filter((r) => r.scene === scene);
    const label = rs[0].label;
    for (const model of models) {
      const found = rs.map((r) => r.models[model.key]).filter(Boolean);
      if (found.length === 0) continue;
      const cells = THRESHOLDS.flatMap((th) => {
        const hits = found.map((f) => f.score >= th);
        const n = hits.filter(Boolean).length;
        return [label === "none" ? `${n}회` : percent(n / hits.length), (longestRun(hits) * GRID_SEC).toFixed(1)];
      });
      const others = new Map<string, number>();
      for (const f of found) {
        const name = f.other.replace(/ [\d.]+$/, "");
        const score = Number(f.other.split(" ").pop());
        if (name && score >= 0.3) others.set(name, (others.get(name) ?? 0) + 1);
      }
      const top = [...others].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, count]) => `${name} ${percent(count / found.length)}`).join(", ");
      body1.push(
        `<tr><td class="left">${esc(scene)}</td><td class="left">${LABEL_NAMES[label]}</td><td class="left" style="color:${model.color}">${esc(model.name)}</td><td>${found.length}</td>${cells
          .map((c) => `<td>${c}</td>`)
          .join("")}<td>${Math.max(...found.map((f) => f.score)).toFixed(2)}</td><td>${mean(found.map((f) => f.ms)).toFixed(0)}</td><td class="left">${esc(top)}</td></tr>`
      );
    }
  }

  // 표 2: 같은 기록으로 판정 규칙을 다시 돌린 결과
  const head2 = ["모델", "기준 점수", "규칙", "화면 안 휴대폰: 빨간불이 된 비율", "첫 빨간불까지(초)", "화면 밖일 수 있음: 빨간불이 된 비율", "휴대폰 없음: 억울한 빨간불(회)", "휴대폰 없음 영상 길이(분)"];
  const body2: string[] = [];
  for (const model of models) {
    for (const th of THRESHOLDS) {
      for (const rule of RULES) {
        const results = scenes.map((scene) => {
          const rs = rows.filter((r) => r.scene === scene && r.models[model.key]);
          return { label: rs[0]?.label, seconds: rs.length * GRID_SEC, ...simulateRule(rs.map((r) => r.models[model.key].score >= th), GRID_SEC, rule.intervalSec, rule.need) };
        });
        const of = (label: Label) => results.filter((r) => r.label === label);
        const inFrame = of("in");
        const maybe = of("maybe");
        const none = of("none");
        const firsts = inFrame.map((r) => r.firstRedSec).filter((v): v is number => v !== null);
        body2.push(
          `<tr><td class="left" style="color:${model.color}">${esc(model.name)}</td><td>${th}</td><td class="left">${rule.name}</td>
            <td>${inFrame.length ? percent(mean(inFrame.map((r) => r.redRate))) : "—"}</td>
            <td>${firsts.length ? mean(firsts).toFixed(1) : "—"}</td>
            <td>${maybe.length ? percent(mean(maybe.map((r) => r.redRate))) : "—"}</td>
            <td>${none.length ? none.reduce((sum, r) => sum + r.episodes, 0).toFixed(1) : "—"}</td>
            <td>${none.length ? (none.reduce((sum, r) => sum + r.seconds, 0) / 60).toFixed(1) : "—"}</td></tr>`
        );
      }
    }
  }
  return `
    <h3>1. 장면별 결과</h3>
    <table><tr>${head1.map((h) => `<th>${h}</th>`).join("")}</tr>${body1.join("")}</table>
    <p class="note">휴대폰 없음 장면은 잘못 잡은 횟수, 나머지는 잡은 비율입니다. 한 번 평균(ms)은 모델이 한 장면을 보는 데 걸린 시간입니다.</p>
    <h3>2. 판정 규칙을 다시 돌린 결과</h3>
    <table><tr>${head2.map((h) => `<th>${h}</th>`).join("")}</tr>${body2.join("")}</table>
    <p class="note">같은 기록에서 "몇 초마다 보고 몇 번 연속 잡히면 빨간불"을 계산한 값입니다. 보기 시작하는 순간에 따라 달라져 평균을 냈습니다.
      "빨간불이 된 비율"은 장면마다 빨간불이 켜질 확률의 평균이고, "첫 빨간불까지"는 영상 시작부터 걸린 시간입니다(휴대폰이 처음부터 있는 영상 기준).</p>`;
}

loadModels().catch((error: unknown) => {
  nowEl.textContent = `시작 실패: ${error instanceof Error ? error.message : String(error)}`;
});
