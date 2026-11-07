// 움직이지 않는 소품 묶어 그리기: 한 묶음(group) 안의 메시들을 재질이 같은 것끼리 도형을 합쳐 메시 몇 개로 바꿉니다.
// Cam Study Cafe 처럼 책장 칸·책·화분 잎·펜던트 등이 수백 개면 화면을 그릴 때마다 그만큼 따로 그려서 무거웠음 (그리는 횟수 478번).
// 원래 메시는 숨기기만 하고(React 가 계속 들고 있음), 합친 메시를 묶음 옆에 붙입니다. 움직이거나 색이 바뀌는 것은 넣지 않습니다.
import { Group, Matrix4, Mesh } from 'three'
import type { BufferGeometry, Material, Object3D } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// 재질이 "같아 보이는지": 같은 종류·색·그림·주요 설정이면 하나로 그려도 똑같이 보임
function lookOf(m: Material): string {
  const r = m as Material & Record<string, unknown>
  const hex = (k: string) => (r[k] as { getHexString?: () => string } | undefined)?.getHexString?.() ?? ''
  const id = (k: string) => (r[k] as { uuid?: string } | null | undefined)?.uuid ?? ''
  return [
    m.type, hex('color'), hex('emissive'), r.emissiveIntensity, id('map'), id('bumpMap'), r.bumpScale, id('emissiveMap'),
    r.roughness, r.metalness, r.flatShading, m.transparent, m.opacity, m.alphaTest, m.side, m.blending, m.depthWrite, m.colorWrite, m.toneMapped,
  ].join('|')
}

// 합칠 수 있게 도형을 맞춤: 인덱스 없이, 위치·법선·uv 만 (도형마다 가진 속성이 다르면 mergeGeometries 가 실패함)
function normalized(g: BufferGeometry, matrix: Matrix4): BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g.clone()
  for (const name of Object.keys(src.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') src.deleteAttribute(name)
  if (!src.getAttribute('normal')) src.computeVertexNormals()
  src.clearGroups()
  src.applyMatrix4(matrix)
  return src
}

// root 안의 메시를 합쳐 새 Group 으로 돌려줌 (root 기준 좌표). 합친 원래 메시는 숨김. 정리할 때 dispose 를 부름(숨긴 메시도 다시 보임)
export function batchStatic(root: Object3D): { group: Group; dispose: () => void } {
  root.updateWorldMatrix(true, true)
  const toRoot = new Matrix4().copy(root.matrixWorld).invert()
  const buckets = new Map<string, { material: Material; parts: Mesh[] }>()
  root.traverse((o) => {
    const m = o as Mesh
    if (!m.isMesh || (m as unknown as { isInstancedMesh?: boolean }).isInstancedMesh || Array.isArray(m.material) || !m.visible) return
    const key = `${lookOf(m.material)}|${m.geometry.getAttribute('uv') ? 'uv' : 'nouv'}|${m.renderOrder}`
    const b = buckets.get(key) ?? { material: m.material, parts: [] }
    b.parts.push(m)
    buckets.set(key, b)
  })
  const group = new Group()
  const made: BufferGeometry[] = []
  const hidden: Mesh[] = []
  for (const { material, parts } of buckets.values()) {
    if (parts.length < 2) continue // 하나뿐이면 합쳐도 그대로
    const geos = parts.map((p) => normalized(p.geometry, new Matrix4().multiplyMatrices(toRoot, p.matrixWorld)))
    const merged = mergeGeometries(geos)
    geos.forEach((g) => g.dispose())
    if (!merged) continue // 속성이 안 맞으면 원래대로 둠
    made.push(merged)
    const mesh = new Mesh(merged, material)
    mesh.userData.merged = true // 좌석 3인칭 카메라(SeatCamera)가 가리는 물건으로 숨기지 않음 (숨기면 묶인 소품이 한꺼번에 사라짐)
    mesh.renderOrder = parts[0].renderOrder
    group.add(mesh)
    for (const p of parts) p.visible = false
    hidden.push(...parts)
  }
  return {
    group,
    dispose: () => {
      made.forEach((g) => g.dispose())
      hidden.forEach((m) => (m.visible = true))
    },
  }
}
