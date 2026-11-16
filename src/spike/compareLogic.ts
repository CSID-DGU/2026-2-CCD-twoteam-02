// 휴대폰 감지 모델 비교(phoneCompare.ts)에서 쓰는 계산. 화면과 무관한 순수 함수만 둡니다.

export type Box = { x: number; y: number; w: number; h: number }; // 화면 크기에 대한 비율 (0~1), 왼쪽 위 기준

// 가장 길게 이어진 "잡힘"의 개수
export function longestRun(hits: boolean[]): number {
  let best = 0;
  let run = 0;
  for (const hit of hits) {
    run = hit ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

// 판정 규칙을 기록 위에서 다시 돌려 봅니다.
// hits는 gridSec 간격으로 본 결과입니다. intervalSec마다 한 번만 본다고 치고, need번 연속으로 잡히면 빨간불입니다.
// 어느 순간부터 보기 시작하느냐(어긋남)에 따라 결과가 달라지므로, 가능한 어긋남을 모두 돌려 평균을 냅니다.
// - episodes: 빨간불이 켜진 횟수 (어긋남 평균)
// - redRate: 빨간불이 한 번이라도 켜진 어긋남의 비율 (0~1)
// - firstRedSec: 영상 시작부터 첫 빨간불까지 걸린 시간 (켜진 경우만 평균, 한 번도 안 켜졌으면 null)
export function simulateRule(hits: boolean[], gridSec: number, intervalSec: number, need: number) {
  const stride = Math.max(1, Math.round(intervalSec / gridSec));
  let episodes = 0;
  let redOffsets = 0;
  let firstSum = 0;
  for (let offset = 0; offset < stride; offset++) {
    let run = 0;
    let first: number | null = null;
    for (let i = offset; i < hits.length; i += stride) {
      run = hits[i] ? run + 1 : 0;
      if (run === need) {
        episodes++;
        first ??= i * gridSec;
      }
    }
    if (first !== null) {
      redOffsets++;
      firstSum += first;
    }
  }
  return {
    episodes: episodes / stride,
    redRate: redOffsets / stride,
    firstRedSec: redOffsets > 0 ? firstSum / redOffsets : null,
  };
}

// 영상에서 가운데를 잘라 낼 영역. 서비스는 웹캠을 640x480(4:3)으로 받으므로, 16:9로 찍은 영상도 같은 비율로 맞춥니다.
export function centerCrop(width: number, height: number, aspect: number) {
  if (width / height > aspect) {
    const w = height * aspect;
    return { sx: (width - w) / 2, sy: 0, sw: w, sh: height };
  }
  const h = width / aspect;
  return { sx: 0, sy: (height - h) / 2, sw: width, sh: h };
}

// D-FINE 출력 읽기.
// logits: [후보 수 x 종류 수] 점수(시그모이드 전), boxes: [후보 수 x 4] 가운데 x·y와 너비·높이(0~1).
// 후보마다 종류별 점수가 따로 나옵니다. 휴대폰 점수가 가장 높은 후보와, 휴대폰이 아닌 것 중 점수가 가장 높은 종류를 돌려줍니다.
export function decodeDfine(logits: ArrayLike<number>, boxes: ArrayLike<number>, numClasses: number, phoneIndex: number) {
  const queries = Math.floor(logits.length / numClasses);
  let phoneScore = 0;
  let phoneQuery = -1;
  let otherScore = 0;
  let otherIndex = -1;
  for (let q = 0; q < queries; q++) {
    for (let c = 0; c < numClasses; c++) {
      const score = 1 / (1 + Math.exp(-logits[q * numClasses + c]));
      if (c === phoneIndex) {
        if (score > phoneScore) {
          phoneScore = score;
          phoneQuery = q;
        }
      } else if (score > otherScore) {
        otherScore = score;
        otherIndex = c;
      }
    }
  }
  let box: Box | null = null;
  if (phoneQuery >= 0) {
    const cx = boxes[phoneQuery * 4];
    const cy = boxes[phoneQuery * 4 + 1];
    const w = boxes[phoneQuery * 4 + 2];
    const h = boxes[phoneQuery * 4 + 3];
    box = { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  return { phoneScore, box, otherIndex, otherScore };
}

// PP-PicoDet 출력 읽기.
// 이 모델은 사진을 격자로 나눠(한 칸이 8·16·32·64픽셀인 네 단계) 칸마다 종류별 점수와 상자까지의 거리를 냅니다.
// - scores: [칸 수 x 종류 수] 0~1 점수
// - distances: [칸 수 x 4 x 구간 수] 칸 가운데에서 상자의 왼쪽·위·오른쪽·아래까지 거리를 "구간별 가능성"으로 낸 값.
//   가능성으로 평균을 내면 거리(칸 단위)가 되고, 칸 크기를 곱하면 픽셀이 됩니다.
// 네 단계를 모두 훑어 휴대폰 점수가 가장 높은 칸의 상자와, 휴대폰이 아닌 것 중 점수가 가장 높은 종류를 돌려줍니다.
export function decodePicodet(levels: { scores: ArrayLike<number>; distances: ArrayLike<number> }[], inputSize: number, numClasses: number, phoneIndex: number) {
  let phoneScore = 0;
  let box: Box | null = null;
  let otherScore = 0;
  let otherIndex = -1;
  for (const { scores, distances } of levels) {
    const cells = Math.floor(scores.length / numClasses);
    const side = Math.round(Math.sqrt(cells));
    const stride = inputSize / side;
    const bins = Math.floor(distances.length / cells / 4);
    for (let i = 0; i < cells; i++) {
      for (let c = 0; c < numClasses; c++) {
        const score = scores[i * numClasses + c];
        if (c !== phoneIndex) {
          if (score > otherScore) {
            otherScore = score;
            otherIndex = c;
          }
          continue;
        }
        if (score <= phoneScore) continue;
        phoneScore = score;
        const reach: number[] = [];
        for (let edge = 0; edge < 4; edge++) {
          const at = (i * 4 + edge) * bins;
          let top = -Infinity;
          for (let b = 0; b < bins; b++) top = Math.max(top, distances[at + b]);
          let sum = 0;
          let expected = 0;
          for (let b = 0; b < bins; b++) {
            const weight = Math.exp(distances[at + b] - top);
            sum += weight;
            expected += weight * b;
          }
          reach.push((expected / sum) * stride);
        }
        const cx = ((i % side) + 0.5) * stride;
        const cy = (Math.floor(i / side) + 0.5) * stride;
        box = { x: (cx - reach[0]) / inputSize, y: (cy - reach[1]) / inputSize, w: (reach[0] + reach[2]) / inputSize, h: (reach[1] + reach[3]) / inputSize };
      }
    }
  }
  return { phoneScore, box, otherIndex, otherScore };
}
