// 캠빛 중앙도서관의 서가(stack): 방 가운데에서 바깥벽으로 뻗은 긴 책장 일곱 개.
// 서가 몸체(뒤판·칸막이·판·받침)와 책등 전부를 InstancedMesh 두 개로 한 번에 그립니다 (서가마다 따로 그리면 그리기 호출이 크게 늘어남).
// 책등 색·두께는 시드로 정해 다시 그려도 그대로입니다 (배치 계산은 theme.ts 의 stackBooks, 순수 함수).
// 안쪽 끝 칸막이에 분야 안내판(흰 판)을 답니다. 부딪힘은 theme.ts 의 stackBoxes 가 막습니다.
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, MeshStandardMaterial, Object3D } from 'three'
import type { InstancedMesh } from 'three'
import { LIB_TILE, meterUvInstanced, oakGrain } from './libraryTextures'
import { LABEL_PX, labelTexture } from './labelTexture'
import { STACK, STACK_BOOK_COLORS, STACK_SHELF, STACK_SIGN, stackBooks } from './theme'
import type { LibraryStack } from './theme'

const SEED_BASE = 20251102 // 서가마다 이 값에 번호를 더해 시드로 씀 (고정)
const BODY_COLOR = '#c8ab84' // 밝은 참나무 (사진 IMG_4660)

// 몸체 재질: 나뭇결 하나를 모든 서가가 같이 씀. 상자를 늘여 쓰므로 UV 를 미터로 다시 계산해 결이 늘어나지 않게 함
let bodyMat: MeshStandardMaterial | null = null
function stackBodyMat() {
  bodyMat ??= meterUvInstanced(new MeshStandardMaterial({ color: BODY_COLOR, map: oakGrain(), roughness: 0.7 }), LIB_TILE.grain)
  return bodyMat
}
const SIGN_BG = '#ffffff'
const SIGN_TEXT = '#2b2b2b'

// 서가 몸체 조각 한 개: 서가 기준 좌표의 가운데 (옆 x, 높이 y, 바깥 쪽 거리 r)와 크기 (옆 sx, 높이 sy, 길이 sz)
type Part = { x: number; y: number; r: number; sx: number; sy: number; sz: number }

// 서가 하나의 몸체 조각들 (뒤판 1 + 칸막이 bays+1 + 판 rows+1 + 받침 1)
function bodyParts(): Part[] {
  const S = STACK
  const K = STACK_SHELF
  const len = S.to - S.from
  const mid = (S.from + S.to) / 2
  const rowH = (S.h - K.plinth) / K.rows
  const parts: Part[] = []
  parts.push({ x: 0, y: S.h / 2, r: mid, sx: K.back, sy: S.h, sz: len }) // 뒤판
  const bayStep = (len - K.divider) / K.bays
  for (let i = 0; i <= K.bays; i++) parts.push({ x: 0, y: S.h / 2, r: S.from + K.divider / 2 + i * bayStep, sx: S.thick, sy: S.h, sz: K.divider }) // 칸막이 (맨 안쪽은 안내판이 붙는 끝판)
  for (let j = 0; j <= K.rows; j++) parts.push({ x: 0, y: K.plinth + j * rowH, r: mid, sx: S.thick, sy: K.board, sz: len }) // 판 (맨 위는 윗판)
  parts.push({ x: 0, y: K.plinth / 2, r: mid, sx: S.thick - 0.04, sy: K.plinth, sz: len - 0.04 }) // 받침
  return parts
}

// 서가 기준 좌표(옆 x, 높이 y, 바깥 거리 r)를 월드로: a 만큼 돌린 방향이 바깥(+r)
function place(o: Object3D, a: number, x: number, y: number, r: number, sx: number, sy: number, sz: number) {
  o.position.set(Math.sin(a) * r + Math.cos(a) * x, y, Math.cos(a) * r - Math.sin(a) * x)
  o.rotation.set(0, a, 0)
  o.scale.set(sx, sy, sz)
  o.updateMatrix()
}

export function LibraryStacks({ stacks }: { stacks: LibraryStack[] }) {
  const parts = useMemo(() => bodyParts(), [])
  const books = useMemo(() => stacks.map((_, i) => stackBooks(SEED_BASE + i)), [stacks])
  const bookCount = books.reduce((n, b) => n + b.length, 0)
  const bodyRef = useRef<InstancedMesh>(null)
  const bookRef = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const body = bodyRef.current
    const spine = bookRef.current
    if (!body || !spine) return
    const o = new Object3D()
    const c = new Color()
    let k = 0
    stacks.forEach((st) => {
      parts.forEach((p) => {
        place(o, st.a, p.x, p.y, p.r, p.sx, p.sy, p.sz)
        body.setMatrixAt(k++, o.matrix)
      })
    })
    let m = 0
    stacks.forEach((st, i) => {
      books[i].forEach((b) => {
        // 책등은 면(옆으로 ±face)에 앞면이 맞게: 가운데 = face - 깊이/2. 너비는 서가 길이 방향(r)
        place(o, st.a, b.side * (STACK_SHELF.face - b.d / 2), b.y, b.r, b.d, b.h, b.w)
        spine.setMatrixAt(m, o.matrix)
        spine.setColorAt(m, c.set(STACK_BOOK_COLORS[b.color]))
        m++
      })
    })
    body.instanceMatrix.needsUpdate = true
    spine.instanceMatrix.needsUpdate = true
    if (spine.instanceColor) spine.instanceColor.needsUpdate = true
  }, [stacks, parts, books])

  const signH = (STACK_SIGN.w * LABEL_PX.h) / LABEL_PX.w
  return (
    <group>
      <instancedMesh ref={bodyRef} args={[undefined, undefined, parts.length * stacks.length]} key={`b${stacks.length}`} frustumCulled={false} material={stackBodyMat()}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={bookRef} args={[undefined, undefined, bookCount]} key={`k${bookCount}`} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      {stacks.map((st, i) => (
        // 안내판: 안쪽 끝판(가운데를 보는 면) 위에. 그룹을 a 만큼 돌리면 +z 가 바깥이라 판은 반 바퀴 돌려 가운데를 보게 함
        <group key={i} rotation-y={st.a}>
          <mesh position={[0, STACK_SIGN.y, STACK.from - STACK_SIGN.gap]} rotation-y={Math.PI}>
            <planeGeometry args={[STACK_SIGN.w, signH]} />
            <meshBasicMaterial map={labelTexture(st.shelf, SIGN_BG, SIGN_TEXT)} transparent />
          </mesh>
        </group>
      ))}
    </group>
  )
}
