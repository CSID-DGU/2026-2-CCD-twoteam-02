// Pose 결과(pose ref)를 읽어 떨림을 걸러낸 사용자 팔 방향(거울 기준)을 내놓는 훅
//
// Pose 는 초당 POSE_HZ 번만 바뀌므로 같은 주기로 읽습니다.
// 내 모습 화면(TrackedCharacter)과 다른 참여자에게 보내는 팔(#139)이 각자 이 훅을 씁니다.
// 같은 입력을 같은 규칙으로 거르므로 두 결과는 같고, 계산은 아주 가볍습니다.
import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { POSE_HZ, armDirection, initialArmHold, nextArmHold, pickTarget } from "./armLogic";
import type { ArmHold, ArmTarget, UserArms } from "./armLogic";
import type { PoseState } from "./useTracking";

const SIDES = ["left", "right"] as const;

export function useArmDirections(pose: RefObject<PoseState> | undefined): RefObject<UserArms> {
  const arms = useRef<UserArms>({ left: null, right: null });

  useEffect(() => {
    if (!pose) return;
    // 팔마다 직전에 고른 기준 관절(손목/팔꿈치)과 붙잡아 둔 방향
    const targets: Record<string, ArmTarget> = {};
    const holds: Record<string, ArmHold> = { left: initialArmHold, right: initialArmHold };
    const id = setInterval(() => {
      const now = performance.now();
      for (const side of SIDES) {
        const joints = pose.current[side];
        targets[side] = pickTarget(joints, targets[side] ?? null);
        holds[side] = nextArmHold(holds[side], armDirection(joints, targets[side]), now);
        arms.current[side] = holds[side].dir;
      }
    }, 1000 / POSE_HZ);
    return () => clearInterval(id);
  }, [pose]);

  return arms;
}
