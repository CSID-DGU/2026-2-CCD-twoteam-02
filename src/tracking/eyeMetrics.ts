// 눈 크기(EAR: 눈 세로 ÷ 가로)를 Face 랜드마크로 계산합니다. 작을수록 감긴 눈입니다.
// 정규화 좌표(0~1)는 가로세로 비율이 달라 왜곡되므로 픽셀 좌표로 바꿔 계산합니다. (프로토타입과 같은 방식)
// 화면·MediaPipe와 무관한 순수 함수입니다. (Node로 검사 — 다른 파일을 import하지 않음)

// 눈 점 6개: 바깥 끝, 위 2, 안쪽 끝, 아래 2 (prototype/face_tracking.py와 같은 번호)
export const RIGHT_EYE = [33, 160, 158, 133, 153, 144];
export const LEFT_EYE = [362, 385, 387, 263, 373, 380];

type Point = { x: number; y: number };

// 양쪽 눈 EAR 평균. 랜드마크가 모자라면 null
export function earOf(points: Point[] | undefined, width: number, height: number): number | null {
  if (!points || points.length < 400) return null;
  const dist = (a: number, b: number) =>
    Math.hypot((points[a].x - points[b].x) * width, (points[a].y - points[b].y) * height);
  const one = (e: number[]) => (dist(e[1], e[5]) + dist(e[2], e[4])) / (2 * dist(e[0], e[3]) || 1e-6);
  return (one(RIGHT_EYE) + one(LEFT_EYE)) / 2;
}
