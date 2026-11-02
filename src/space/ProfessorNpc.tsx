// 강의동 교수 NPC: 칠판 옆 교탁 뒤에 서서 학생 쪽을 봄. 자리·생김새는 지점 JSON professor (professorLogic.ts).
// 카페 바리스타(BaristaNpc)와 같은 방식: 다른 참여자와 같은 WalkingCharacter 에 안경·넥타이만 도형으로 붙이고,
// greetSeq 가 바뀌면 손을 흔들고, bubble 이 있으면 머리 위 말풍선(Bubble 은 바리스타와 같이 씀).
// 안경·넥타이는 캐릭터 몸 크기(머리 1.14~1.62m 정육면체 0.48·앞면 z 0.24, 몸통 0.6~1.14m·앞면 z 0.18)에 맞춘 판입니다.
import { useMemo } from 'react'
import { WalkingCharacter } from '../realtime/WalkingCharacter'
import { DEFAULT_AVATAR, avatarKey } from '../avatar/avatarLogic'
import { Bubble } from './BaristaNpc'
import { LECTERN, lecternOf } from './professorLogic'
import type { Professor } from './professorLogic'
import { colorMat } from '../world/worldMaterials'

const HEAD = { front: 0.24, half: 0.24 } // 머리 앞면 z, 반 폭
const TORSO_FRONT = 0.18 // 몸통 앞면 z
// 안경: 알 하나 크기(w·h), 테 두께(t), 두 알 가운데 사이 반(gap), 높이(y)
const GLASSES = { w: 0.13, h: 0.09, t: 0.014, gap: 0.09, y: 1.39 }
// 넥타이: 매듭 위치·크기, 넥타이 판 위·아래 높이와 폭
const TIE = { knotY: 1.1, knot: 0.06, top: 1.07, bottom: 0.76, w: 0.07 }

export function ProfessorNpc({ professor, bubble = null, greetSeq = 0, wood = '#8a6a4a' }: { professor: Professor; bubble?: string | null; greetSeq?: number; wood?: string }) {
  const look = professor.look
  const model = useMemo(() => avatarKey({ ...DEFAULT_AVATAR, ...look }), [look])
  return (
    <>
      <WalkingCharacter x={professor.x} z={professor.z} h={professor.rot} model={model} emote={greetSeq > 0 ? 'wave' : undefined} emoteSeq={greetSeq}>
        <group rotation-y={professor.rot}>
          {look.glasses && <Glasses color={look.glasses} />}
          {look.tie && <Tie color={look.tie} />}
        </group>
        {bubble && <Bubble text={bubble} />}
      </WalkingCharacter>
      <Lectern professor={professor} wood={wood} />
    </>
  )
}

// 안경: 네모 테 두 알 + 코걸이 + 귀까지 다리
function Glasses({ color }: { color: string }) {
  const m = colorMat(color)
  const z = HEAD.front + 0.012
  const g = GLASSES
  return (
    <group position={[0, g.y, z]}>
      {[-g.gap, g.gap].map((x) => (
        <group key={x} position-x={x}>
          {[g.h / 2, -g.h / 2].map((y) => (
            <mesh key={y} position-y={y} material={m}>
              <boxGeometry args={[g.w, g.t, g.t]} />
            </mesh>
          ))}
          {[g.w / 2, -g.w / 2].map((dx) => (
            <mesh key={dx} position-x={dx} material={m}>
              <boxGeometry args={[g.t, g.h, g.t]} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position-y={g.h / 4} material={m}>
        <boxGeometry args={[g.gap * 2 - g.w, g.t, g.t]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (HEAD.half + 0.006), g.h / 4, -0.1]} material={m}>
          <boxGeometry args={[g.t, g.t, 0.2]} />
        </mesh>
      ))}
    </group>
  )
}

// 넥타이: 매듭 + 길쭉한 판 + 끝 뾰족한 마름모
function Tie({ color }: { color: string }) {
  const m = colorMat(color)
  const z = TORSO_FRONT + 0.01
  const t = TIE
  const len = t.top - t.bottom
  return (
    <group>
      <mesh position={[0, t.knotY, z + 0.005]} material={m}>
        <boxGeometry args={[t.knot, t.knot, 0.02]} />
      </mesh>
      <mesh position={[0, t.bottom + len / 2, z]} material={m}>
        <boxGeometry args={[t.w, len, 0.012]} />
      </mesh>
      <mesh position={[0, t.bottom, z]} rotation-z={Math.PI / 4} material={m}>
        <boxGeometry args={[t.w / Math.SQRT2, t.w / Math.SQRT2, 0.012]} />
      </mesh>
    </group>
  )
}

// 교탁: 나무 몸통 + 학생 쪽이 높게 기운 윗판 + 앞면 장식 판
function Lectern({ professor, wood }: { professor: Professor; wood: string }) {
  const l = lecternOf(professor)
  const m = colorMat(wood)
  const L = LECTERN
  const body = L.h - 0.06
  return (
    <group position={[l.x, 0, l.z]} rotation-y={l.rot}>
      <mesh position-y={body / 2} material={m}>
        <boxGeometry args={[L.w, body, L.d]} />
      </mesh>
      <mesh position-y={L.h - 0.02} rotation-x={-0.18} material={m}>
        <boxGeometry args={[L.w + 0.08, 0.04, L.d + 0.08]} />
      </mesh>
      <mesh position={[0, body * 0.55, L.d / 2 + 0.006]} material={colorMat('#5a3d26')}>
        <boxGeometry args={[L.w * 0.7, body * 0.5, 0.012]} />
      </mesh>
    </group>
  )
}
