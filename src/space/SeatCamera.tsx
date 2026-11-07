// 3D 좌석 모드의 카메라. 지점 좌석과 회의실 의자(#45), 광장 벤치가 같이 씁니다.
// 기본은 1인칭이고, V 로 내 캐릭터를 밖에서 보는 3인칭(뒤 위·오른쪽·왼쪽)으로 바꿀 수 있습니다(#436, seatViewLogic).
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import { Euler, MathUtils, Matrix4, Quaternion, Raycaster, Vector3 } from "three";
import type { InstancedMesh, Mesh, Object3D, PerspectiveCamera as PerspectiveCameraImpl } from "three";
import type { Box, Spot } from "./layout";
import { getKeymap } from "../menu/keymap";
import { fitInRoom, orbitPosition, orbitTarget } from "./seatViewLogic";
import { cycleSeatView, useSeatView } from "./useSeatView";

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
const VIEW_FOLLOW = 6; // 시점을 바꿀 때 카메라가 새 자리로 미끄러져 가는 빠르기
// 3인칭에서 카메라와 나 사이를 가리는 물건 숨기기 (#436)
const HIDE_EVERY = 0.2; // 가리는 물건을 다시 찾는 간격(초)
const HIDE_LAYER = 30; // 숨긴 물건을 옮겨 두는 레이어. 카메라는 이 레이어를 그리지 않음
const SELF_MARGIN = 0.5; // 내 머리·머리카락에는 닿지 않게 선을 이만큼 짧게(m)
const SEAT_KEEP = 0.6; // 내 자리에서 옆으로 이만큼 안에 걸린 것(내 의자·벤치·책상)은 숨기지 않음(m). 숨기면 허공에 앉은 것처럼 보임
const LOW_KEEP = 0.25; // 화면 가운데 선이 이보다 낮은 곳(바닥·깔개)에 걸리면 숨기지 않음(m)
// 선을 쏠 내 몸의 자리: 머리(눈) 기준 [오른쪽(m), 위(m)]. 머리·양어깨·가슴
const AIM_POINTS: [number, number][] = [[0, 0], [0.35, -0.15], [-0.35, -0.15], [0, -0.45]];
// 화면 가운데에 고르게 쏠 선(화면 좌표 -1~1, [가로, 세로]). 내 몸에는 안 닿아도 화면을 크게 가리는 가까운 나무·기둥을 찾음.
// 아래쪽(내 벤치·의자가 보이는 곳)에는 쏘지 않습니다.
const SCREEN_POINTS: [number, number][] = [-0.6, -0.3, 0, 0.3, 0.6].flatMap((x) => [0.5, 0.2, -0.05].map((y): [number, number] => [x, y]));
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
// 3인칭에서는 같은 끌기·WASD 로 내 머리 둘레를 돌고, 벽(walls) 밖으로 나가면 벽 앞까지 당깁니다.
// 3인칭일 때 내 캐릭터를 그리는 것은 장면이 합니다(useSeatView 를 보고 SeatedCharacter).
// walls: 3인칭 카메라를 막는 벽(위에서 본 상자)
export function SeatCamera({ spot, onArrive, paused, walls = [] }: { spot: Spot; onArrive: () => void; paused: boolean; walls?: Box[] }) {
  const cam = useRef<PerspectiveCameraImpl>(null!);
  const progress = useRef(0); // 0(시작) → 1(전환 끝)
  const yaw = useRef(0); // 정면에서 좌우로 돌린 각도 (+ 가 왼쪽)
  const pitch = useRef(0); // 위(+)·아래(-)로 기울인 각도
  const keys = useRef(new Set<string>());
  const recenter = useRef<{ yaw: number; pitch: number; t: number } | null>(null); // 정면으로 돌아오는 중이면 시작 각도와 진행(0~1)
  const pausedRef = useRef(paused);
  const wallsRef = useRef(walls);
  useEffect(() => {
    pausedRef.current = paused;
    wallsRef.current = walls;
  }, [paused, walls]);
  const view = useSeatView();
  const viewRef = useRef(view);
  // 시점을 바꾸면 둘러본 각도를 정면으로 돌립니다. 새 시점이 처음 정한 구도로 보이게
  useEffect(() => {
    viewRef.current = view;
    yaw.current = 0;
    pitch.current = 0;
    recenter.current = null;
  }, [view]);
  const canvas = useThree((s) => s.gl.domElement);
  const scene = useThree((s) => s.scene);
  // 숨긴 물건. 다시 찾을 때마다 먼저 모두 되돌린 뒤 같은 프레임 안에서 다시 숨겨, 화면에서는 깜빡이지 않습니다.
  const hidden = useRef<Hidden>({ meshes: new Map(), instances: new Map() });
  const hideClock = useRef(0);
  const ray = useMemo(() => {
    const r = new Raycaster();
    r.layers.enableAll();
    return r;
  }, []);
  // 자리에서 일어나면(이 카메라가 사라지면) 숨긴 물건을 모두 되돌립니다.
  useEffect(() => {
    const h = hidden.current;
    return () => showAll(h);
  }, []);
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
    return {
      startPos, startQuat, endPos, target: new Quaternion(), euler: new Euler(0, 0, 0, "YXZ"),
      head: { x: endPos.x, y: endPos.y, z: endPos.z }, // 3인칭 카메라가 도는 가운데 (1인칭 눈 자리)
      aim: orbitTarget({ x: endPos.x, y: endPos.y, z: endPos.z }, rot), // 3인칭 카메라가 바라볼 곳
      want: new Vector3(), // 이번 프레임에 카메라가 가야 할 자리
      look: new Matrix4(),
      aimVec: new Vector3(),
    };
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
      // 시점 바꾸기 (#436): 1인칭 → 뒤 위 → 오른쪽 → 왼쪽. 서 있을 때 시점 키(설정 view, 기본 V)와 같은 키
      if (e.code === getKeymap().view && !e.repeat && !pausedRef.current && !e.ctrlKey && !e.metaKey && !e.altKey) {
        cycleSeatView();
        return;
      }
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
    // 3인칭이면 머리 둘레에서 둘러본 만큼 돈 자리(끌기 오른쪽 = 장면이 오른쪽으로 = 카메라는 왼쪽으로)에서 머리 앞을 바라봅니다.
    // 위아래: ↑·W 를 누르거나 아래로 끌면 카메라가 위로 올라가 더 내려다봅니다(1인칭의 위로 보기와 반대 방향이 자연스러움).
    const v = viewRef.current;
    if (v === "first") {
      pose.want.copy(pose.endPos);
      pose.euler.set(pitch.current + lie * LIE_LOOK_UP, rot + Math.PI + yaw.current, 0);
      pose.target.setFromEuler(pose.euler);
    } else {
      const p = fitInRoom(pose.head, orbitPosition(v, pose.head, rot, -yaw.current, pitch.current), wallsRef.current);
      pose.want.set(p.x, p.y, p.z);
      pose.aimVec.set(pose.aim.x, pose.aim.y, pose.aim.z);
      pose.target.setFromRotationMatrix(pose.look.lookAt(pose.want, pose.aimVec, UP));
    }

    if (progress.current < 1) {
      progress.current = Math.min(1, progress.current + delta / TRANSITION);
      if (progress.current === 1) onArrive(); // 전환이 끝난 순간을 알립니다. (측정용)
      const k = 1 - (1 - progress.current) ** 3; // 처음엔 빠르게, 끝에서 천천히
      cam.current.position.lerpVectors(pose.startPos, pose.want, k);
      cam.current.quaternion.slerpQuaternions(pose.startQuat, pose.target, k);
    } else {
      cam.current.position.lerp(pose.want, 1 - Math.exp(-VIEW_FOLLOW * delta));
      // 3인칭은 카메라가 미끄러져 가는 동안에도 머리 쪽을 보도록 지금 자리에서 다시 겨눕니다.
      if (v !== "first") pose.target.setFromRotationMatrix(pose.look.lookAt(cam.current.position, pose.aimVec, UP));
      cam.current.quaternion.slerp(pose.target, 1 - Math.exp(-LOOK_FOLLOW * delta));
    }

    // 3인칭: 카메라에서 내 머리·어깨·가슴으로 선을 그어 걸리는 물건을 숨기고, 비켜난 물건은 다시 보이게 합니다.
    if (v === "first" || progress.current < 1) {
      showAll(hidden.current);
      return;
    }
    hideClock.current += delta;
    if (hideClock.current < HIDE_EVERY) return;
    hideClock.current = 0;
    hideBlockers(scene, ray, cam.current, pose.head, pose.aim, rot, hidden.current);
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

// 숨긴 물건: 따로 그리는 물건(Mesh) → 원래 레이어, 묶어 그리는 물건(InstancedMesh)의 한 개 → 원래 자리 행렬
type Hidden = { meshes: Map<Object3D, number>; instances: Map<string, { mesh: InstancedMesh; id: number; matrix: Matrix4 }> };
type P = { x: number; y: number; z: number };
const tmp = new Vector3();
const ZERO = new Matrix4().makeScale(0, 0, 0); // 묶음 안의 한 개를 숨길 때: 크기를 0 으로

// 카메라에서 내 머리·어깨·가슴·화면 가운데(aim)와, 화면 가운데에 고르게 선을 그어 걸리는 물건을 숨깁니다.
// 먼저 지난번에 숨긴 것을 모두 되돌린 뒤 다시 찾으므로, 이제 안 걸리는 물건은 저절로 다시 보입니다.
// 받은 3D 객체를 바꾸는 일이라 컴포넌트 밖에 둡니다(React 규칙 검사가 훅 안에서 넘겨받은 값을 바꾸는 것을 막음, useSkin 과 같음).
function hideBlockers(scene: Object3D, ray: Raycaster, camera: PerspectiveCameraImpl, head: P, aim: P, rot: number, hidden: Hidden) {
  showAll(hidden);
  const from = camera.position;
  const rx = -Math.cos(rot), rz = Math.sin(rot); // 캐릭터의 오른쪽
  const reach = from.distanceTo(tmp.set(head.x, head.y, head.z)) - SELF_MARGIN; // 나보다 앞(카메라 쪽)에 있는 것만
  const hits: { object: Object3D; instanceId?: number; point: Vector3 }[] = [];
  const cast = (far: number, lowOk: boolean) => {
    if (far <= 0) return;
    ray.far = far;
    for (const hit of ray.intersectObject(scene, true)) if (lowOk || hit.point.y > LOW_KEEP) hits.push(hit);
  };
  // 내 몸과 화면 가운데(aim) 쪽
  for (const t of [...AIM_POINTS.map(([side, up]) => ({ x: head.x + rx * side, y: head.y + up, z: head.z + rz * side })), aim]) {
    tmp.set(t.x, t.y, t.z).sub(from);
    const len = tmp.length();
    ray.set(from, tmp.normalize());
    cast(len - SELF_MARGIN, true);
  }
  // 화면 가운데에 고르게
  for (const [x, y] of SCREEN_POINTS) {
    tmp.set(x, y, 0.5).unproject(camera).sub(from).normalize();
    ray.set(from, tmp);
    cast(reach, false);
  }
  for (const hit of hits) {
    const o = hit.object;
    if (!canHide(o) || Math.hypot(hit.point.x - head.x, hit.point.z - head.z) < SEAT_KEEP) continue;
    const inst = o as InstancedMesh;
    if (inst.isInstancedMesh) {
      if (hit.instanceId === undefined) continue;
      const key = `${inst.uuid}:${hit.instanceId}`;
      if (hidden.instances.has(key)) continue;
      const matrix = new Matrix4();
      inst.getMatrixAt(hit.instanceId, matrix);
      hidden.instances.set(key, { mesh: inst, id: hit.instanceId, matrix });
      inst.setMatrixAt(hit.instanceId, ZERO);
      inst.instanceMatrix.needsUpdate = true;
    } else if (!hidden.meshes.has(o)) {
      hidden.meshes.set(o, o.layers.mask);
      o.layers.set(HIDE_LAYER);
    }
  }
}

// 숨긴 물건을 모두 되돌립니다.
function showAll(hidden: Hidden) {
  for (const [o, mask] of hidden.meshes) o.layers.mask = mask;
  hidden.meshes.clear();
  for (const { mesh, id, matrix } of hidden.instances.values()) {
    mesh.setMatrixAt(id, matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }
  hidden.instances.clear();
}

// 숨겨도 되는 물건인지. 사람(캐릭터, userData.person)과 여러 소품을 합쳐 만든 메시(staticBatch, userData.merged)는 숨기지 않습니다.
function canHide(o: Object3D): boolean {
  if (!(o as Mesh).isMesh || !o.visible || o.userData.merged) return false;
  for (let p: Object3D | null = o; p; p = p.parent) if (p.userData.person) return false;
  return true;
}
