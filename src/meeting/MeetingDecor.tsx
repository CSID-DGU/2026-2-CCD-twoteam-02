// 회의실 테이블·의자를 지점 분위기로 그립니다. (#57)
// 테마가 없는 지점(별다방)은 예전 모습(나무 원탁 + 상자 의자) 그대로입니다.
//   - 테이블: 상판은 지점 책상 색, 대리석 테이블이 있는 지점(흑요·월넛)은 대리석, 다이너(레트로카페)는 빨간 띠. 받침은 가구 금속·원목 색
//   - 의자: 1인 통 소파를 쓰는 지점(월넛·이끼·물결)은 통 소파, 그 밖의 테마 지점은 원목·크롬 다리 의자
import { DoubleSide } from 'three'
import { CHAIR } from '../space/layout'
import type { Spot } from '../space/layout'
import { TubChair, WoodChair } from '../space/Decor'
import { marbleTexture } from '../space/patternTexture'
import type { BranchTheme } from '../space/theme'
import { MEETING_TABLE_H } from './meetingTheme'
import type { ChairKind } from './meetingTheme'

const TOP_T = 0.06 // 상판 두께
const TRIM = { t: 0.04, out: 0.02 } // 다이너 상판 둘레 띠
const DEFAULT = { top: '#b98a5a', stand: '#7c5a3a', chair: '#6b7280' } // 테마가 없을 때 (예전 색)
export const HIGHLIGHT = '#f59e0b' // 가까이·내 의자 (지점과 같은 강조색)

export function MeetingTable({ radius, theme }: { radius: number; theme?: BranchTheme }) {
  const top = theme?.desk ?? DEFAULT.top
  const stand = theme?.furniture?.chrome ?? DEFAULT.stand
  const booth = theme?.booth
  const marble = booth && (booth.table ?? 'marble') === 'marble' ? booth.marble : undefined
  const diner = theme?.furniture?.style === 'diner'
  const metal = diner ? { metalness: 0.8, roughness: 0.25 } : {}
  return (
    <group>
      <mesh position={[0, MEETING_TABLE_H - TOP_T / 2, 0]}>
        <cylinderGeometry args={[radius, radius, TOP_T, 64]} />
        <meshStandardMaterial color={top} roughness={marble ? 0.3 : 0.6} />
      </mesh>
      {marble && (
        <mesh position={[0, MEETING_TABLE_H + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[radius, 64]} />
          <meshStandardMaterial map={marbleTexture(marble)} roughness={0.25} />
        </mesh>
      )}
      {diner && theme?.furniture?.trim && (
        <mesh position={[0, MEETING_TABLE_H - TOP_T / 2, 0]}>
          <cylinderGeometry args={[radius + TRIM.out, radius + TRIM.out, TRIM.t, 64, 1, true]} />
          <meshStandardMaterial color={theme.furniture.trim} side={DoubleSide} />
        </mesh>
      )}
      <mesh position={[0, (MEETING_TABLE_H - TOP_T) / 2, 0]}>
        <cylinderGeometry args={[0.15, 0.25, MEETING_TABLE_H - TOP_T, 16]} />
        <meshStandardMaterial color={stand} {...metal} />
      </mesh>
      {/* 받침 바닥판 */}
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.45, 0.5, 0.04, 24]} />
        <meshStandardMaterial color={stand} {...metal} />
      </mesh>
    </group>
  )
}

export function MeetingChair({ chair, kind, theme, highlight }: { chair: Spot; kind: ChairKind; theme?: BranchTheme; highlight: boolean }) {
  const color = highlight ? HIGHLIGHT : theme?.chair ?? DEFAULT.chair
  if (kind === 'tub') return <TubChair x={chair.x} z={chair.z} rot={chair.rot} color={color} />
  if (kind === 'wood') return <WoodChair x={chair.x} z={chair.z} rot={chair.rot} color={color} wood={theme?.furniture?.chrome ?? DEFAULT.stand} />
  return (
    <mesh position={[chair.x, CHAIR.h / 2, chair.z]} rotation={[0, chair.rot, 0]}>
      <boxGeometry args={[CHAIR.w, CHAIR.h, CHAIR.d]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}
