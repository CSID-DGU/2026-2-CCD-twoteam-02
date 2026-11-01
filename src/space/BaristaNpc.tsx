// 카페 바리스타 NPC: 카운터 뒤에 서서 손님 쪽을 봄. 지점마다 머리 모양·옷 색·앞치마·모자가 다름(지점 JSON barista.look).
// greetSeq 가 바뀌면 손을 흔들거나(인사) 끄덕이고(주문 받음), bubble 이 있으면 머리 위에 말풍선. 캐릭터는 다른 참여자와 같은 WalkingCharacter.
// 앞치마·모자는 캐릭터 몸 크기(키 1.62m, 머리 1.14~1.62m 정육면체 0.48, 몸통 0.6~1.14m·폭 0.48·앞면 z 0.18)에 맞춰 바깥에 붙인 판·도형입니다.
// 바리스타는 한 방향을 보고 서 있으므로 소품도 그 방향으로 고정해 돌립니다.
import { useMemo } from 'react'
import { Billboard } from '@react-three/drei'
import { WalkingCharacter } from '../realtime/WalkingCharacter'
import { DEFAULT_AVATAR, avatarKey } from '../avatar/avatarLogic'
import { BUBBLE_PX_PER_M, bubbleTexture } from './speechBubble'
import { npcSpot } from './baristaLogic'
import type { Barista } from './baristaLogic'
import { colorMat } from '../world/worldMaterials'

const BUBBLE_Y = 2.1 // 말풍선 가운데 높이: 머리 위 (매단 메뉴판 아래)
const BODY = { front: 0.18, headTop: 1.62, headHalf: 0.24 } // 캐릭터 치수 (m)
const HAIR = 0.07 // 입체 머리카락이 머리 위·옆으로 나온 두께. 모자는 그 바깥에 씌움

export function BaristaNpc({ barista, bubble = null, greetSeq = 0, emote = 'wave' }: { barista: Barista; bubble?: string | null; greetSeq?: number; emote?: string }) {
  const spot = npcSpot(barista)
  const look = barista.look
  const model = useMemo(() => avatarKey({ ...DEFAULT_AVATAR, ...look }), [look])
  return (
    <WalkingCharacter x={spot.x} z={spot.z} h={spot.h} model={model} emote={greetSeq > 0 ? emote : undefined} emoteSeq={greetSeq}>
      <group rotation-y={spot.h}>
        {look.apron && <Apron color={look.apron} />}
        {look.hat && <Hat kind={look.hat} color={look.hatColor ?? '#2b2b2b'} />}
      </group>
      {bubble && <Bubble text={bubble} />}
    </WalkingCharacter>
  )
}

// 앞치마: 가슴판 + 허리 아래 치마판 + 목 끈 + 허리 끈 + 이름표
function Apron({ color }: { color: string }) {
  const m = colorMat(color)
  const z = BODY.front + 0.008
  return (
    <group>
      <mesh position={[0, 0.98, z]} material={m}>
        <boxGeometry args={[0.34, 0.3, 0.012]} />
      </mesh>
      <mesh position={[0, 0.5, z + 0.005]} material={m}>
        <boxGeometry args={[0.44, 0.42, 0.012]} />
      </mesh>
      {[-0.12, 0.12].map((x) => (
        <mesh key={x} position={[x, 1.13, z - 0.02]} rotation-x={0.6} material={m}>
          <boxGeometry args={[0.035, 0.06, 0.008]} />
        </mesh>
      ))}
      <mesh position={[0, 0.72, z + 0.008]} material={colorMat('#f4f1ea')}>
        <boxGeometry args={[0.46, 0.03, 0.012]} />
      </mesh>
      <mesh position={[-0.08, 1.04, z + 0.008]} material={colorMat('#ffffff')}>
        <boxGeometry args={[0.1, 0.05, 0.01]} />
      </mesh>
    </group>
  )
}

// 모자: 캡(윗판 + 앞 챙) / 베레모(납작하게 눌린 둥근 모자) / 두건(머리 띠 + 뒤 매듭)
function Hat({ kind, color }: { kind: 'cap' | 'beret' | 'bandana'; color: string }) {
  const m = colorMat(color)
  const top = BODY.headTop
  const half = BODY.headHalf + HAIR
  if (kind === 'cap')
    return (
      <group>
        <mesh position-y={top + 0.05} material={m}>
          <boxGeometry args={[half * 2, 0.16, half * 2]} />
        </mesh>
        <mesh position={[0, top - 0.02, half + 0.1]} material={m}>
          <boxGeometry args={[half * 1.5, 0.03, 0.2]} />
        </mesh>
      </group>
    )
  if (kind === 'beret')
    return (
      <mesh position={[0.03, top + 0.06, -0.02]} scale={[1, 0.36, 1]} rotation-z={-0.12} material={m}>
        <sphereGeometry args={[half + 0.03, 16, 10]} />
      </mesh>
    )
  return (
    <group>
      <mesh position-y={top - 0.08} material={m}>
        <boxGeometry args={[half * 2, 0.11, half * 2]} />
      </mesh>
      <mesh position={[0, top - 0.1, -half - 0.04]} rotation-x={0.5} material={m}>
        <boxGeometry args={[0.1, 0.14, 0.03]} />
      </mesh>
    </group>
  )
}

// 말풍선: 글 길이만큼 넓어지는 판 (글자·이모지가 눌리지 않게)
function Bubble({ text }: { text: string }) {
  const b = bubbleTexture(text)
  return (
    <Billboard position-y={BUBBLE_Y}>
      <mesh>
        <planeGeometry args={[b.w / BUBBLE_PX_PER_M, b.h / BUBBLE_PX_PER_M]} />
        <meshBasicMaterial map={b.texture} transparent />
      </mesh>
    </Billboard>
  )
}
