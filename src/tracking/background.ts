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
// 사람 칸: 머리(코 둘레)와 몸통(양 어깨 사이 아래)만 뺍니다. 너무 넓게 빼면 평소 거리에서 비교할 칸이 남지 않습니다.
export const HEAD_HALF_WIDTH = 0.18; // 코 좌우로 이만큼을 머리로 봅니다.
export const HEAD_ABOVE = 0.35; // 코 위로 이만큼을 머리로 봅니다.
export const BODY_PAD = 0.05; // 어깨 바깥·위로 이만큼 더 몸통으로 봅니다.
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

type Box = { left: number; right: number; top: number; bottom: number };

// 사람이 차지한 칸. points는 [코, 왼어깨, 오른어깨] 순서(GUIDE_POINTS)입니다.
// 머리 = 코 둘레 상자(어깨 높이까지), 몸통 = 양 어깨 사이에서 화면 아래 끝까지.
export function personCells(
  points: (Point | undefined)[] | null,
  cols = BG_COLS,
  rows = BG_ROWS
): boolean[] {
  const mask = new Array<boolean>(cols * rows).fill(false);
  const [nose, ...rest] = points ?? [];
  const shoulders = rest.filter((p): p is Point => p !== undefined);
  const boxes: Box[] = [];
  const shoulderTop = shoulders.length ? Math.min(...shoulders.map((p) => p.y)) : 1;
  if (nose) {
    boxes.push({
      left: nose.x - HEAD_HALF_WIDTH,
      right: nose.x + HEAD_HALF_WIDTH,
      top: nose.y - HEAD_ABOVE,
      bottom: Math.max(shoulderTop, nose.y),
    });
  }
  if (shoulders.length) {
    boxes.push({
      left: Math.min(...shoulders.map((p) => p.x)) - BODY_PAD,
      right: Math.max(...shoulders.map((p) => p.x)) + BODY_PAD,
      top: shoulderTop - BODY_PAD,
      bottom: 1,
    });
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      mask[r * cols + c] = boxes.some(
        (b) => (c + 1) / cols > b.left && c / cols < b.right && (r + 1) / rows > b.top && r / rows < b.bottom
      );
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
// cells: 실제로 비교한 칸 수 (확인용 — 사람이 가린 칸을 빼고 남은 수)
export function compareBackground(
  ref: number[] | null,
  refSkip: boolean[] | null,
  cur: number[],
  curSkip: boolean[]
): { same: boolean | null; score: number | null; spread: number | null; cells: number } {
  if (!ref || !refSkip) return { same: null, score: null, spread: null, cells: 0 };
  const skip = ref.map((_, i) => refSkip[i] || curSkip[i]);
  const a = pick(ref, skip);
  const b = pick(cur, skip);
  const cells = a.length;
  if (cells < MIN_CELLS) return { same: null, score: null, spread: null, cells };
  const spread = std(a);
  const score = correlation(a, b);
  if (spread < BG_FLAT_SPREAD || score === null) return { same: null, score, spread, cells };
  return { same: score >= BG_SAME_SCORE, score, spread, cells };
}
