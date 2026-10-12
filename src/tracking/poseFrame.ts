// 카메라 가이드라인 판정 기준: 코와 양 어깨가 모두 화면 안에 보이면 "머리~가슴이 들어왔다"고 봅니다.
// 화면·MediaPipe와 무관한 순수 함수라 따로 둡니다. (Node로 시나리오 검사)

// 기준값은 아직 임시입니다. 팀에서 확정되면 여기만 고치면 됩니다.
export const VISIBLE_SCORE = 0.5; // 이 점수 이상이어야 그 점이 보인다고 봅니다.
export const GUIDE_POINTS = [0, 11, 12] as const; // Pose 랜드마크 번호: 코, 왼쪽 어깨, 오른쪽 어깨

// Pose 랜드마크 한 점 (x, y는 화면 기준 0~1)
export type PosePoint = { x: number; y: number; visibility?: number };

const inside = (v: number) => v >= 0 && v <= 1;

export function isFramed(landmarks: PosePoint[] | undefined): boolean {
  if (!landmarks) return false; // 사람을 찾지 못함
  return GUIDE_POINTS.every((i) => {
    const point = landmarks[i];
    return (
      point !== undefined &&
      (point.visibility ?? 0) >= VISIBLE_SCORE &&
      inside(point.x) &&
      inside(point.y)
    );
  });
}
