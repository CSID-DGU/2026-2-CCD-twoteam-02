// 카메라 가이드라인 판정: 코와 양 어깨가 화면 안에 있으면 "머리~가슴이 들어왔다"고 봅니다.
// 화면 안/밖은 좌표로만 판단합니다. Pose는 화면 밖 관절의 위치도 추정하고,
// 그때도 visibility(보이는 정도)를 0.98 이상으로 내서 visibility로는 가를 수 없습니다. (2026-10-13 측정, #80)
// 화면·MediaPipe와 무관한 순수 함수라 따로 둡니다. (Node로 시나리오 검사 — 다른 파일을 import하지 않음)

// 기준값 (임시 — 1명 측정, 자동 보정으로 바꿀 예정. 근거: docs/판정-기준-근거.md 5절)
export const EDGE_MARGIN = 0.02; // 화면 가장자리에서 이만큼 안쪽까지만 "안"으로 봅니다. (가장자리는 위치 추정이 흔들림)
// 어깨가 이 높이(0 = 위, 1 = 아래)보다 아래면 밖. Pose는 화면 밖 어깨 위치도 추정해서 1보다 클 수 있습니다.
// 측정: 의자에 기대 눕기 최대 1.011, 카메라를 위로 젖히면 대부분 1.03 이상 → 그 사이 값
export const SHOULDER_MAX_Y = 1.02;
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

// ---- 카메라 문제 팝업 규칙 ----
// 정상일 때는 아무 알림도 없고, "카메라 문제"가 GUIDE_ALERT_SECONDS 넘게 이어질 때만 팝업을 띄웁니다.
// 사람이 자리를 떠난 것(배경 그대로)은 카메라 문제가 아니므로 팝업을 띄우지 않습니다.
export const GUIDE_ALERT_SECONDS = 10; // 카메라 문제가 이 시간 넘게 이어지면 팝업
export const INPUT_RECENT_SECONDS = 10; // 이 시간 안에 키보드·마우스 입력이 있었으면 사람이 자리에 있는 것으로 봄

// cropped: 사람은 보이는데 머리~가슴이 잘림 / moved: 사람이 없고 배경이 바뀜(카메라 돌아감)
// noPersonActive: 사람이 없고 배경 비교를 못 믿지만(흰 벽 등) 최근 입력이 있음 → 사람은 있는데 카메라가 못 봄
export type GuideReason = "cropped" | "moved" | "noPersonActive";

export type CameraCheck = {
  found: boolean; // Pose가 사람을 찾았는지
  framed: boolean | null; // null = Pose 준비 전·오류
  bgSame: boolean | null; // 배경이 기준과 같은지, null = 믿을 수 없음
  lastInputMs: number | null; // 마지막 키보드·마우스 입력 시각 (없으면 null)
};

export type GuideAlert = {
  problemSince: number | null; // 카메라 문제가 시작된 시각
  reason: GuideReason | null;
  show: boolean; // 팝업을 띄울지
};

export const initialGuideAlert: GuideAlert = { problemSince: null, reason: null, show: false };

export function cameraProblem(check: CameraCheck, nowMs: number): GuideReason | null {
  if (check.framed === null || check.framed) return null; // 모르거나 정상
  if (check.found) return "cropped";
  if (check.bgSame === false) return "moved";
  const recentInput =
    check.lastInputMs !== null && nowMs - check.lastInputMs <= INPUT_RECENT_SECONDS * 1000;
  if (check.bgSame === null && recentInput) return "noPersonActive";
  return null; // 배경 그대로 → 자리 이탈 (자리 이탈 판정이 따로 처리)
}

export function nextGuideAlert(prev: GuideAlert, check: CameraCheck, nowMs: number): GuideAlert {
  const reason = cameraProblem(check, nowMs);
  if (!reason) return initialGuideAlert; // 돌아오면 바로 내림
  const problemSince = prev.problemSince ?? nowMs;
  return { problemSince, reason, show: nowMs - problemSince >= GUIDE_ALERT_SECONDS * 1000 };
}
