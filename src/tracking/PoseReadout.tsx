// 확인용: 가이드라인(Pose)과 배경 비교가 지금 어떻게 판단하는지 글자로 보여 줍니다. (/tracking 전용)
// 기준값(여백·배경 닮음 기준)을 측정할 때 이 숫자들을 상황별로 적습니다.
import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { PoseState } from "./useTracking";
import type { PosePoint } from "./poseFrame";

const NAMES = ["코", "왼어깨", "오른어깨"]; // GUIDE_POINTS 순서와 같아야 합니다.
const f = (v: number | null) => (v === null ? "-" : v.toFixed(2));

// 점 하나 → "코(x 0.50, y 0.42)"  (visibility는 화면 밖에서도 높게 나와 표시하지 않음)
function describe(name: string, point: PosePoint | undefined) {
  return point ? `${name}(x ${f(point.x)}, y ${f(point.y)})` : `${name}(없음)`;
}

export default function PoseReadout({ pose }: { pose: RefObject<PoseState> }) {
  const [text, setText] = useState("");

  useEffect(() => {
    const id = setInterval(() => {
      const { found, framed, guidePoints, bgSame, bgScore, bgSpread, bgCells, lastMotionMs } = pose.current;
      // 팔 움직임(깨어 있음 신호)이 얼마나 전인지. 필기할 때 계속 0~1초로 유지되는지 확인용
      const motion = lastMotionMs === null ? "없음" : `${((Date.now() - lastMotionMs) / 1000).toFixed(1)}초 전`;
      const frame = framed === null ? "확인 못 함" : framed ? "들어옴" : "벗어남";
      const points = guidePoints
        ? guidePoints.map((p, i) => describe(NAMES[i], p)).join(" ")
        : "사람을 찾지 못함";
      const bg = bgSame === null ? "모름" : bgSame ? "같음" : "바뀜";
      setText(
        `가이드라인: ${frame} · 사람 ${found ? "있음" : "없음"} · ${points} · ` +
          `배경 ${bg} (닮음 ${f(bgScore)}, 무늬 ${f(bgSpread)}, 비교 ${bgCells}칸) · 팔 움직임 ${motion}`
      );
    }, 100);
    return () => clearInterval(id);
  }, [pose]);

  return <div style={{ opacity: 0.7, fontSize: 12 }}>{text}</div>;
}
