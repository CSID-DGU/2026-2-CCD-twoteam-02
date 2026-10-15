// 가이드라인 기준값 측정 기록: 상황(숫자키로 고름)마다 확인용 값을 0.1초마다 쌓고, 상황별 범위를 요약합니다.
// 영상은 남기지 않고 숫자만 쌓습니다. 화면·React와 무관한 순수 함수입니다. (Node로 시나리오 검사 — 다른 파일을 import하지 않음)

// 측정할 상황. 키는 한글 입력 상태에서도 동작하도록 e.code(자판 위치)로 받습니다.
export const SITUATIONS = [
  { code: "Digit1", key: "1", name: "정상 착석" },
  { code: "Digit2", key: "2", name: "숙여서 필기" },
  { code: "Digit3", key: "3", name: "기지개" },
  { code: "Digit4", key: "4", name: "기대 눕기" },
  { code: "Digit5", key: "5", name: "한쪽 어깨 화면 밖" },
  { code: "Digit6", key: "6", name: "카메라 왼쪽 조금" },
  { code: "Digit7", key: "7", name: "카메라 왼쪽 크게" },
  { code: "Digit8", key: "8", name: "카메라 오른쪽 조금" },
  { code: "Digit9", key: "9", name: "카메라 오른쪽 크게" },
  { code: "Digit0", key: "0", name: "카메라 위로" },
  { code: "KeyQ", key: "Q", name: "카메라에 바짝 붙음" },
  { code: "KeyW", key: "W", name: "자리 떠나기" },
  { code: "KeyE", key: "E", name: "스탠드 켜고 끄기" },
  { code: "KeyR", key: "R", name: "뒤로 사람 지나가기" },
  { code: "KeyT", key: "T", name: "흰 벽 앞" },
] as const;

export type Situation = (typeof SITUATIONS)[number];

export function situationOf(code: string): Situation | null {
  return SITUATIONS.find((s) => s.code === code) ?? null;
}

type Point = { x: number; y: number } | null;

// 0.1초마다 한 줄
export type MeasureSample = {
  t: number; // 기록 시작 후 경과(ms)
  situation: string;
  found: boolean; // Pose가 사람을 찾았는지
  framed: boolean | null; // 머리~가슴이 화면 안인지
  nose: Point;
  left: Point; // 왼쪽 어깨
  right: Point; // 오른쪽 어깨
  bgSame: boolean | null;
  bgScore: number | null;
  bgSpread: number | null;
  bgCells: number;
};

const RANGE_KEYS = ["noseX", "noseY", "leftX", "leftY", "rightX", "rightY", "bgScore", "bgSpread", "bgCells"] as const;
type RangeKey = (typeof RANGE_KEYS)[number];

// 상황별 요약: 비율(0~1)과 값마다 [최솟값, 최댓값] (값이 한 번도 없으면 null)
export type SituationSummary = {
  situation: string;
  count: number;
  outRate: number; // "벗어남"(framed = false) 비율
  foundRate: number; // 사람 있음 비율
  changedRate: number; // 배경 바뀜 비율
  unknownRate: number; // 배경 모름 비율
  ranges: Record<RangeKey, [number, number] | null>;
};

const valuesOf = (s: MeasureSample): Record<RangeKey, number | null> => ({
  noseX: s.nose?.x ?? null,
  noseY: s.nose?.y ?? null,
  leftX: s.left?.x ?? null,
  leftY: s.left?.y ?? null,
  rightX: s.right?.x ?? null,
  rightY: s.right?.y ?? null,
  bgScore: s.bgScore,
  bgSpread: s.bgSpread,
  bgCells: s.bgCells,
});

// 기록한 순서대로 상황별로 묶어 요약합니다.
export function summarize(samples: MeasureSample[]): SituationSummary[] {
  const groups = new Map<string, MeasureSample[]>();
  for (const s of samples) groups.set(s.situation, [...(groups.get(s.situation) ?? []), s]);
  return [...groups.entries()].map(([situation, list]) => {
    const rate = (test: (s: MeasureSample) => boolean) => list.filter(test).length / list.length;
    const ranges = {} as SituationSummary["ranges"];
    for (const key of RANGE_KEYS) {
      const values = list.map((s) => valuesOf(s)[key]).filter((v): v is number => v !== null);
      ranges[key] = values.length ? [Math.min(...values), Math.max(...values)] : null;
    }
    return {
      situation,
      count: list.length,
      outRate: rate((s) => s.framed === false),
      foundRate: rate((s) => s.found),
      changedRate: rate((s) => s.bgSame === false),
      unknownRate: rate((s) => s.bgSame === null),
      ranges,
    };
  });
}

// CSV (값이 없으면 빈칸)
export function toCsv(samples: MeasureSample[]): string {
  const header = ["t", "situation", "found", "framed", ...RANGE_KEYS, "bgSame"];
  const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const lines = samples.map((s) => {
    const values = valuesOf(s);
    return [s.t, s.situation, s.found, s.framed, ...RANGE_KEYS.map((k) => values[k]), s.bgSame].map(cell).join(",");
  });
  return [header.join(","), ...lines].join("\n");
}
