// 자동 보정: 공부 시작 때 정면·필기 자세·눈 감기를 잠깐씩 재서 그 사람의 기준(눈 크기·고개 각도)을 만듭니다.
// 몸·자리마다 다른 값이라 팀이 고정값을 정하지 않고 사람마다 잽니다. (docs/판정-기준-근거.md "세 층"의 2층)
// 화면·React와 무관한 순수 함수입니다. (Node로 검사 — 다른 파일을 import하지 않음)

export type CalibStepKey = "front" | "down" | "closed";

export const CALIB_STEPS: readonly { key: CalibStepKey; seconds: number; text: string }[] = [
  { key: "front", seconds: 3, text: "평소처럼 화면을 봐 주세요" },
  { key: "down", seconds: 3, text: "종이에 쓰는 자세로 숙여 주세요" },
  { key: "closed", seconds: 2, text: "그 자세로 눈을 감아 주세요 (끝나면 소리가 나요)" },
];

// 측정이 제대로 됐는지 거르는 값 (판정 기준이 아님. 보정 실패가 잦으면 각본 시험 뒤 조정)
export const MIN_FACE_RATIO = 0.8; // 얼굴이 기록의 이 비율 이상에서 보여야 함
export const MAX_PITCH_RANGE_DEGREES = 15; // 그동안 고개 각도가 이만큼 넘게 흔들리면 다시
export const MAX_CLOSED_RATIO = 0.8; // 감은 눈이 숙인 눈의 이 비율보다 작아야 진짜 감은 것

export type CalibSample = {
  found: boolean;
  ear: number | null;
  pitch: number | null; // 라디안, 숙이면 +
  framed: boolean | null; // 머리~가슴이 화면 안인지 (null = 확인 못 함 → 무시)
  wristsInView: boolean;
};

export type StepOk = { ok: true; ear: number; pitch: number; handsVisible: boolean };
export type StepResult = StepOk | { ok: false; reason: string };

export type Baseline = {
  frontEar: number;
  downEar: number;
  closedEar: number;
  frontPitch: number; // 라디안
  downPitch: number;
  handsVisible: boolean; // 필기 자세에서 손목이 보였는지 (책상이 보이는 구도)
};

const median = (values: number[]) => {
  const v = [...values].sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
};

export function summarizeStep(step: CalibStepKey, samples: CalibSample[]): StepResult {
  const seen = samples.filter((s) => s.found && s.ear !== null && s.pitch !== null);
  if (samples.length === 0 || seen.length / samples.length < MIN_FACE_RATIO)
    return { ok: false, reason: "얼굴이 잘 보이지 않았어요. 카메라를 보고 다시 해 주세요." };
  const pitches = seen.map((s) => s.pitch as number);
  const rangeDeg = ((Math.max(...pitches) - Math.min(...pitches)) * 180) / Math.PI;
  if (rangeDeg > MAX_PITCH_RANGE_DEGREES)
    return { ok: false, reason: "고개가 많이 움직였어요. 자세를 유지한 채 다시 해 주세요." };
  if (step === "front") {
    const checked = samples.filter((s) => s.framed !== null);
    if (checked.length > 0 && checked.filter((s) => s.framed).length / checked.length < MIN_FACE_RATIO)
      return { ok: false, reason: "머리와 어깨가 화면에 보이도록 카메라를 맞춘 뒤 다시 해 주세요." };
  }
  return {
    ok: true,
    ear: median(seen.map((s) => s.ear as number)),
    pitch: median(pitches),
    handsVisible: samples.filter((s) => s.wristsInView).length / samples.length >= 0.5,
  };
}

export function makeBaseline(
  front: StepOk,
  down: StepOk,
  closed: StepOk
): { ok: true; baseline: Baseline } | { ok: false; reason: string } {
  if (closed.ear >= down.ear * MAX_CLOSED_RATIO)
    return { ok: false, reason: "눈을 완전히 감은 채로 다시 해 주세요." };
  return {
    ok: true,
    baseline: {
      frontEar: front.ear,
      downEar: down.ear,
      closedEar: closed.ear,
      frontPitch: front.pitch,
      downPitch: down.pitch,
      handsVisible: down.handsVisible,
    },
  };
}
