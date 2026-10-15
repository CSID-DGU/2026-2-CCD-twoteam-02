// 배경 비교: 카메라가 돌아갔는지(배경이 바뀜), 사람만 자리를 떠났는지(배경 그대로) 가립니다.
// 영상은 작게 줄여 칸(BG_COLS × BG_ROWS)별 평균 밝기 숫자로만 읽고, 그림은 남기지 않습니다.
// 비교는 상관계수(무늬가 닮은 정도)로 해서, 방 전체 밝기가 바뀌는 것(불 켜기, 카메라 자동 노출)은 무시합니다.
// 화면·브라우저와 무관한 순수 함수입니다. (Node로 시나리오 검사 — 다른 파일을 import하지 않음)

// 기준값 (임시 — 측정 후 확정, 근거: docs/판정-기준-근거.md)
export const BG_COLS = 8; // 가로 칸 수
export const BG_ROWS = 6; // 세로 칸 수
export const BG_SAMPLE_WIDTH = 64; // 영상을 이 크기로 줄여 읽은 뒤 칸별로 평균 냅니다.
export const BG_SAMPLE_HEIGHT = 48;
export const BG_SAME_SCORE = 0.8; // 상관계수가 이 값 이상이면 "배경 같음"
export const BG_FLAT_SPREAD = 8; // 기준 배경의 밝기 표준편차(0~255)가 이보다 작으면 무늬가 없어 비교를 믿지 않음
export const PERSON_PAD = 0.15; // 코·어깨 둘레로 이만큼 더 넓게 사람 칸으로 봅니다. (머리·팔)
const MIN_CELLS = 8; // 비교할 칸이 이보다 적으면 믿지 않음

type Point = { x: number; y: number };

// RGBA 픽셀(width × height) → 칸별 평균 밝기(0~255), 왼쪽 위부터 가로 순서
export function cellMeans(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  cols = BG_COLS,
  rows = BG_ROWS
): number[] {
  const sums = new Array<number>(cols * rows).fill(0);
  const counts = new Array<number>(cols * rows).fill(0);
  for (let y = 0; y < height; y++) {
    const row = Math.floor((y * rows) / height);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const light = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      const cell = row * cols + Math.floor((x * cols) / width);
      sums[cell] += light;
      counts[cell] += 1;
    }
  }
  return sums.map((sum, i) => sum / (counts[i] || 1));
}

// 사람이 차지한 칸: 코·어깨를 감싸는 상자를 넓히고, 어깨 아래(몸)는 화면 끝까지 사람으로 봅니다.
export function personCells(
  points: (Point | undefined)[] | null,
  cols = BG_COLS,
  rows = BG_ROWS
): boolean[] {
  const mask = new Array<boolean>(cols * rows).fill(false);
  const found = (points ?? []).filter((p): p is Point => p !== undefined);
  if (found.length === 0) return mask;
  const left = Math.min(...found.map((p) => p.x)) - PERSON_PAD;
  const right = Math.max(...found.map((p) => p.x)) + PERSON_PAD;
  const top = Math.min(...found.map((p) => p.y)) - 2 * PERSON_PAD; // 코 위로 머리
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const overlaps = (c + 1) / cols > left && c / cols < right && (r + 1) / rows > top;
      mask[r * cols + c] = overlaps;
    }
  }
  return mask;
}

const pick = (values: number[], skip: boolean[]) => values.filter((_, i) => !skip[i]);

function std(values: number[]) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
}

function correlation(a: number[], b: number[]): number | null {
  const sa = std(a);
  const sb = std(b);
  if (sa === 0 || sb === 0) return null;
  const ma = a.reduce((x, y) => x + y, 0) / a.length;
  const mb = b.reduce((x, y) => x + y, 0) / b.length;
  const cov = a.reduce((sum, v, i) => sum + (v - ma) * (b[i] - mb), 0) / a.length;
  return cov / (sa * sb);
}

// 기준 배경과 지금 배경 비교. 사람이 있던 칸(기준·지금 둘 다)은 뺍니다.
// same: true 같음 / false 바뀜 / null 믿을 수 없음(기준 없음, 무늬 없음, 비교할 칸 부족)
export function compareBackground(
  ref: number[] | null,
  refSkip: boolean[] | null,
  cur: number[],
  curSkip: boolean[]
): { same: boolean | null; score: number | null; spread: number | null } {
  if (!ref || !refSkip) return { same: null, score: null, spread: null };
  const skip = ref.map((_, i) => refSkip[i] || curSkip[i]);
  const a = pick(ref, skip);
  const b = pick(cur, skip);
  if (a.length < MIN_CELLS) return { same: null, score: null, spread: null };
  const spread = std(a);
  const score = correlation(a, b);
  if (spread < BG_FLAT_SPREAD || score === null) return { same: null, score, spread };
  return { same: score >= BG_SAME_SCORE, score, spread };
}
