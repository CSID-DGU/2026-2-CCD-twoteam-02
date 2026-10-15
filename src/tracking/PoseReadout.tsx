// 확인용: 가이드라인(Pose)이 지금 어떻게 판단하는지 글자로 보여 줍니다.
// 🟢만 보여서는 "어깨가 보임"인지 "Pose 결과가 없음"인지 구분할 수 없어서 만들었습니다.
import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { PoseState } from "./useTracking";
import type { PosePoint } from "./poseFrame";

const NAMES = ["코", "왼어깨", "오른어깨"]; // GUIDE_POINTS 순서와 같아야 합니다.

// 점 하나 → "코(보임 0.99, x 0.50, y 0.42)"
function describe(name: string, point: PosePoint | undefined) {
  if (!point) return `${name}(없음)`;
  const f = (v: number) => v.toFixed(2);
  return `${name}(보임 ${f(point.visibility ?? 0)}, x ${f(point.x)}, y ${f(point.y)})`;
}

export default function PoseReadout({ pose }: { pose: RefObject<PoseState> }) {
  const [text, setText] = useState("");

  useEffect(() => {
    const id = setInterval(() => {
      const { framed, guidePoints: points } = pose.current;
      const label = framed === null ? "확인 못 함" : framed ? "들어옴" : "벗어남";
      const detail = points
        ? points.map((p, i) => describe(NAMES[i], p)).join(" ")
        : "사람을 찾지 못함";
      setText(`가이드라인: ${label} · ${detail}`);
    }, 100);
    return () => clearInterval(id);
  }, [pose]);

  return <div style={{ opacity: 0.7, fontSize: 12 }}>{text}</div>;
}
