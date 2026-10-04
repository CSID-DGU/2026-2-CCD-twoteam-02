import { Canvas, useThree } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";
import branch from "./branches/byeol.json";
import { KIOSK, SEAT, obstaclesOf, roomWalls } from "./layout";
import { Player } from "./Player";

const obstacles = obstaclesOf(branch);

// 창 크기가 바뀌어도 지점 전체가 화면에 들어오도록 배율을 맞춥니다.
function TopDownCamera() {
  const size = useThree((s) => s.size);
  const zoom = Math.min(
    size.width / (branch.size.w + 1),
    size.height / (branch.size.d + 1)
  );
  return (
    <OrthographicCamera
      makeDefault
      position={[0, 20, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      zoom={zoom}
    />
  );
}

export function BranchScene() {
  return (
    <Canvas>
      <TopDownCamera />
      <ambientLight intensity={1.2} />

      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[branch.size.w, branch.size.d]} />
        <meshStandardMaterial color="#e8e2d6" />
      </mesh>

      {[...branch.walls, ...branch.rooms.flatMap(roomWalls)].map((w, i) => (
        <mesh key={i} position={[w.x, 1.25, w.z]}>
          <boxGeometry args={[w.w, 2.5, w.d]} />
          <meshStandardMaterial color="#8a8f98" />
        </mesh>
      ))}

      {branch.seats.map((s) => (
        <mesh key={s.no} position={[s.x, 0.37, s.z]}>
          <boxGeometry args={[SEAT.w, 0.74, SEAT.d]} />
          <meshStandardMaterial color="#b98a5a" />
        </mesh>
      ))}

      {branch.rooms.map((r) => (
        <mesh
          key={r.no}
          position={[r.x, 0.01, r.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[r.w, r.d]} />
          <meshStandardMaterial color="#c9d6e3" />
        </mesh>
      ))}

      <mesh position={[branch.kiosk.x, 0.6, branch.kiosk.z]}>
        <boxGeometry args={[KIOSK.w, 1.2, KIOSK.d]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>

      <Player obstacles={obstacles} spawn={branch.spawn} />
    </Canvas>
  );
}
