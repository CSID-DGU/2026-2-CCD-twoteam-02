// 3D 좌석 모드의 1인칭 카메라. 지점 좌석과 회의실 의자(#45)가 같이 씁니다.
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from "three";
import type { PerspectiveCamera as PerspectiveCameraImpl } from "three";
import type { Spot } from "./layout";
import { getKeymap } from "../menu/keymap";

const EYE_HEIGHT = 1.1; // 앉았을 때 눈높이
const SEAT_FOV = 60; // 1인칭 화면의 세로 시야각
const TRANSITION = 0.8; // 2D → 3D 전환 시간(초). 목표는 1초 이내입니다.
const START_HEIGHT = 7; // 전환을 시작하는 카메라 높이
const START_BACK = 3; // 전환을 시작할 때 자리 뒤로 물러난 거리
const SEAT_HEIGHT = 0.74; // 책상 높이
const LOOK_LIMIT = Math.PI / 3; // 좌우로 60도씩, 합쳐서 120도까지 둘러볼 수 있습니다.
const PITCH_UP = MathUtils.degToRad(15); // 앉아서 위로 볼 수 있는 각도
const PITCH_DOWN = MathUtils.degToRad(30); // 아래로 볼 수 있는 각도 (책상을 내려다보기 좋게 더 넓게)
const LOOK_SPEED = 0.005; // 마우스를 1픽셀 끌 때 도는 각도(라디안)
const KEY_LOOK_SPEED = 1.2; // WASD·방향키로 둘러볼 때 도는 빠르기(초당 라디안)
const LOOK_FOLLOW = 20; // 시점이 마우스를 따라가는 빠르기
const RECENTER_SEC = 0.9; // 정면 보기(Space)로 책상 정면까지 돌아오는 시간(초). 천천히 돌아오게 (#112)
const UP = new Vector3(0, 1, 0);
// 누운 자리(라운지 소파, spot.lie): 눈을 뒤·아래로 옮기고 정면 시선을 위로 들어 천장(천창)과 가운데를 함께 봅니다.
const LIE_BACK = 0.55; // 누운 각도 1 라디안당 눈이 뒤로 가는 거리
const LIE_DROP = 0.35; // 누운 각도 1 라디안당 눈이 내려가는 거리
const LIE_LOOK_UP = 0.6; // 누운 각도에 곱해 정면 시선을 위로 드는 비율

// 3D 좌석 모드: 앉은 자리에서 책상 쪽을 바라보는 1인칭 카메라.
// 자리 뒤쪽 위에서 시작해 눈높이로 내려앉으며 전환합니다.
// WASD·방향키나 마우스 끌기로 좌우 120도, 위 15도·아래 30도 범위에서 둘러봅니다. (#73)
// Space(설정에서 바꿈)를 누르면 RECENTER_SEC 동안 천천히 책상 정면으로 돌아옵니다. 그사이 둘러보면 멈춥니다. (#112)
// 앉아 있을 때는 몸이 움직이지 않으니 WASD 를 시점에 씁니다. 마우스는 잠그지 않습니다(타이머 버튼 등을 눌러야 해서).
export function SeatCamera({ spot, onArrive, paused }: { spot: Spot; onArrive: () => void; paused: boolean }) {
  const cam = useRef<PerspectiveCameraImpl>(null!);
  const progress = useRef(0); // 0(시작) → 1(전환 끝)
  const yaw = useRef(0); // 정면에서 좌우로 돌린 각도 (+ 가 왼쪽)
  const pitch = useRef(0); // 위(+)·아래(-)로 기울인 각도
  const keys = useRef(new Set<string>());
  const recenter = useRef<{ yaw: number; pitch: number; t: number } | null>(null); // 정면으로 돌아오는 중이면 시작 각도와 진행(0~1)
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  const canvas = useThree((s) => s.gl.domElement);
  // 자리 객체가 새로 만들어져도 값이 같으면 다시 계산하지 않습니다. 다시 계산하면 아래 position·quaternion 값이 바뀌어
  // 카메라가 전환 시작 위치(자리 뒤 위쪽)로 튀어 오른 채 남습니다. 회의 화면은 참석자가 바뀔 때마다 자리를 새로 만듭니다. (#45)
  const { x, z, rot } = spot;
  const raise = spot.y ?? 0; // 높은 의자면 눈높이와 책상도 그만큼 위 (#57)
  const lie = spot.lie ?? 0;
  const pose = useMemo(() => {
    const fx = Math.sin(rot), fz = Math.cos(rot); // 책상 쪽 방향
    const endPos = new Vector3(x - fx * lie * LIE_BACK, EYE_HEIGHT + raise - lie * LIE_DROP, z - fz * lie * LIE_BACK);
    const startPos = new Vector3(x - fx * START_BACK, START_HEIGHT, z - fz * START_BACK);
    const desk = new Vector3(x + fx, SEAT_HEIGHT + raise, z + fz);
    const startQuat = new Quaternion().setFromRotationMatrix(
      new Matrix4().lookAt(startPos, desk, UP)
    );
    // 매 프레임 새로 만들지 않도록 계산용 값을 미리 만들어 둡니다.
    return { startPos, startQuat, endPos, target: new Quaternion(), euler: new Euler(0, 0, 0, "YXZ") };
  }, [x, z, rot, raise, lie]);

  // 화면을 끌면 끄는 쪽으로 장면이 따라오도록 시점을 돌립니다.
  useEffect(() => {
    let dragging = false;
    const down = (e: PointerEvent) => {
      dragging = true;
      canvas.setPointerCapture(e.pointerId); // 화면 밖으로 나가도 끌기가 이어지게
      canvas.style.setProperty("cursor", "grabbing");
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      recenter.current = null; // 끌어서 둘러보면 정면으로 돌아오기를 멈춤
      yaw.current = MathUtils.clamp(yaw.current + e.movementX * LOOK_SPEED, -LOOK_LIMIT, LOOK_LIMIT);
      pitch.current = MathUtils.clamp(pitch.current + e.movementY * LOOK_SPEED, -PITCH_DOWN, PITCH_UP);
    };
    const up = () => {
      dragging = false;
      canvas.style.setProperty("cursor", "grab");
    };
    canvas.style.setProperty("cursor", "grab");
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    return () => {
      canvas.style.setProperty("cursor", "");
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, [canvas]);

  // WASD·방향키로 둘러보기. 글자를 입력하는 중이면 무시하고, 창이 떠 있으면 돌지 않습니다.
  useEffect(() => {
    const pressed = keys.current;
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // 정면 보기 (#112): 지금 각도에서 정면까지 RECENTER_SEC 동안 천천히 돌립니다(아래 프레임).
      if (e.code === getKeymap().recenter && !e.repeat && !pausedRef.current && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault(); // Space 로 페이지가 스크롤되지 않게
        // 방금 누른 버튼(공부 시작 등)에 포커스가 남아 있으면 Space 가 그 버튼을 다시 누르므로 포커스를 뺍니다.
        if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
        recenter.current = { yaw: yaw.current, pitch: pitch.current, t: 0 };
        return;
      }
      pressed.add(e.code);
    };
    const up = (e: KeyboardEvent) => pressed.delete(e.code);
    const clear = () => pressed.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);

  useFrame((_, delta) => {
    const k = keys.current;
    if (!pausedRef.current) {
      const dt = Math.min(delta, 0.05);
      const turn = +(k.has("KeyA") || k.has("ArrowLeft")) - +(k.has("KeyD") || k.has("ArrowRight")); // 왼쪽 +
      const tilt = +(k.has("KeyW") || k.has("ArrowUp")) - +(k.has("KeyS") || k.has("ArrowDown")); // 위 +
      if (turn || tilt) recenter.current = null; // 키로 둘러보면 정면으로 돌아오기를 멈춤
      yaw.current = MathUtils.clamp(yaw.current + turn * KEY_LOOK_SPEED * dt, -LOOK_LIMIT, LOOK_LIMIT);
      pitch.current = MathUtils.clamp(pitch.current + tilt * KEY_LOOK_SPEED * dt, -PITCH_DOWN, PITCH_UP);
      // 정면으로 돌아오는 중: 처음과 끝은 천천히, 가운데는 빠르게(ease-in-out)
      const r = recenter.current;
      if (r) {
        r.t = Math.min(1, r.t + dt / RECENTER_SEC);
        const left = 1 - (r.t < 0.5 ? 2 * r.t * r.t : 1 - (-2 * r.t + 2) ** 2 / 2);
        yaw.current = r.yaw * left;
        pitch.current = r.pitch * left;
        if (r.t === 1) recenter.current = null;
      }
    }
    // 바라볼 방향 = 좌석 정면에서 좌우(yaw)로 돌리고 위아래(pitch)로 기울인 방향.
    // 카메라는 기본으로 -Z를 보므로 반 바퀴 돌려 좌석 방향(+Z 기준)에 맞춥니다.
    pose.euler.set(pitch.current + lie * LIE_LOOK_UP, rot + Math.PI + yaw.current, 0);
    pose.target.setFromEuler(pose.euler);

    if (progress.current < 1) {
      progress.current = Math.min(1, progress.current + delta / TRANSITION);
      if (progress.current === 1) onArrive(); // 전환이 끝난 순간을 알립니다. (측정용)
      const k = 1 - (1 - progress.current) ** 3; // 처음엔 빠르게, 끝에서 천천히
      cam.current.position.lerpVectors(pose.startPos, pose.endPos, k);
      cam.current.quaternion.slerpQuaternions(pose.startQuat, pose.target, k);
    } else {
      cam.current.quaternion.slerp(pose.target, 1 - Math.exp(-LOOK_FOLLOW * delta));
    }
  });

  return (
    <PerspectiveCamera
      ref={cam}
      makeDefault
      fov={SEAT_FOV}
      near={0.05}
      position={pose.startPos}
      quaternion={pose.startQuat}
    />
  );
}
