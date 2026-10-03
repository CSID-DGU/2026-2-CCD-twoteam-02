import { Canvas } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";
import branch from "./branches/byeol.json";
import { Player } from "./Player";

export function BranchScene() {
  return (
    <Canvas>
      <OrthographicCamera
        makeDefault
        position={[0, 20, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        zoom={40}
      />
      <ambientLight intensity={1.2} />

      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[branch.size.w, branch.size.d]} />
        <meshStandardMaterial color="#e8e2d6" />
      </mesh>

      {branch.walls.map((w, i) => (
        <mesh key={i} position={[w.x, 1.25, w.z]}>
          <boxGeometry args={[w.w, 2.5, w.d]} />
          <meshStandardMaterial color="#8a8f98" />
        </mesh>
      ))}

      {branch.seats.map((s) => (
        <mesh key={s.no} position={[s.x, 0.37, s.z]}>
          <boxGeometry args={[1.2, 0.74, 0.6]} />
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
        <boxGeometry args={[0.6, 1.2, 0.4]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>

      <Player
        obstacles={[
          ...branch.walls,
          ...branch.seats.map((s) => ({ x: s.x, z: s.z, w: 1.2, d: 0.6 })),
        ]}
        spawn={branch.spawn}
      />
    </Canvas>
  );
}
