// 카메라 가이드라인 판정: 코와 양 어깨가 화면 안에 있으면 "머리~가슴이 들어왔다"고 봅니다.
// 화면 안/밖은 좌표로만 판단합니다. Pose는 화면 밖 관절의 위치도 추정하고,
// 그때도 visibility(보이는 정도)를 0.98 이상으로 내서 visibility로는 가를 수 없습니다. (2026-10-13 측정, #80)
// 화면·MediaPipe와 무관한 순수 함수라 따로 둡니다. (Node로 시나리오 검사 — 다른 파일을 import하지 않음)

// 기준값 (임시 — 측정 후 확정, 근거: docs/판정-기준-근거.md)
export const EDGE_MARGIN = 0.02; // 화면 가장자리에서 이만큼 안쪽까지만 "안"으로 봅니다. (가장자리는 위치 추정이 흔들림)
export const SHOULDER_MAX_Y = 1; // 어깨가 이 높이(0 = 위, 1 = 아래)보다 아래면 밖. 정상 자세도 0.90~0.93이라 여유가 거의 없음
export const GUIDE_POINTS = [0, 11, 12] as const; // Pose 랜드마크 번호: 코, 왼쪽 어깨, 오른쪽 어깨
const NOSE = 0;

// Pose 랜드마크 한 점 (x, y는 화면 기준 0~1)
export type PosePoint = { x: number; y: number; visibility?: number };

const between = (v: number, min: number, max: number) => v >= min && v <= max;

export function isFramed(landmarks: PosePoint[] | undefined): boolean {
  if (!landmarks) return false; // 사람을 찾지 못함
  return GUIDE_POINTS.every((i) => {
    const point = landmarks[i];
    if (!point) return false;
    const maxY = i === NOSE ? 1 : SHOULDER_MAX_Y;
    return between(point.x, EDGE_MARGIN, 1 - EDGE_MARGIN) && between(point.y, EDGE_MARGIN, maxY);
  });
}
