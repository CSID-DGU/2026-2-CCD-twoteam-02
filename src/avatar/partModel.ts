// 머리에 붙이는 입체 부품(머리카락 등, #296)을 불러와 색을 입힙니다. three.js 를 씁니다.
//
// 모델 파일(.gltf·.glb)은 한 번만 불러 두고, 캐릭터마다 복사해 씁니다(모양 데이터는 같이 씀).
// 캐릭터의 몸은 빛을 받지 않는 재질(MeshBasicMaterial)이고 면마다 밝기를 다르게 칠해 입체감을 냅니다(avatarLogic.SHADE).
// 입체 부품도 같은 느낌이 나도록 빛 대신 면이 보는 방향(법선)에 따라 밝기를 칠하고, 고른 색을 곱합니다.
// 재질이나 그림(텍스처) 이름에 'fixed' 가 들어간 부분은 고른 색을 입히지 않습니다(칠한 색 그대로. 예: 빨간 머리핀).
// Blockbench 는 재질 이름 없이 그림 이름만 내보내서 그림 이름도 봅니다.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { SHADE } from './avatarLogic'
import type { Part } from './avatarLogic'

// Blockbench 는 1칸(픽셀)을 1/16 로 줄여 내보냅니다. 그래서 모델을 16배 키워 머리 뼈 좌표(1칸 = 1)에 맞춥니다.
// 우리가 코드로 만든 머리(make-avatar-parts.mjs)도 같은 단위로 씁니다.
const MODEL_UNIT = 16
const loader = new GLTFLoader()
const models = new Map<string, Promise<THREE.Object3D>>()

// 면 방향 → 밝기(0~1). 위가 가장 밝고 아래가 가장 어두움 (맨몸과 같은 값)
function shadeOf(n: THREE.Vector3) {
  if (n.y > 0.5) return SHADE.top / 255
  if (n.y < -0.5) return SHADE.bottom / 255
  if (n.z > 0.5) return SHADE.front / 255
  if (n.z < -0.5) return SHADE.back / 255
  return SHADE.left / 255
}

// 불러온 모델의 꼭짓점마다 면 방향 밝기를 색으로 넣어 둡니다(한 번만).
function addShade(root: THREE.Object3D) {
  const n = new THREE.Vector3()
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    const g = o.geometry as THREE.BufferGeometry
    if (!g.attributes.normal) g.computeVertexNormals()
    const normals = g.attributes.normal
    const colors = new Float32Array(normals.count * 3)
    for (let i = 0; i < normals.count; i++) {
      n.fromBufferAttribute(normals, i).transformDirection(o.matrixWorld)
      colors.fill(shadeOf(n), i * 3, i * 3 + 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  })
}

// 모델 파일 (불러 둔 것이 있으면 그것)
export function loadPartModel(url: string): Promise<THREE.Object3D> {
  let p = models.get(url)
  if (!p) {
    p = loader.loadAsync(url).then((gltf) => {
      gltf.scene.updateMatrixWorld(true)
      addShade(gltf.scene)
      return gltf.scene
    })
    p.catch(() => models.delete(url)) // 실패하면 다음에 다시
    models.set(url, p)
  }
  return p
}

// 불러 둔 모델을 복사해 고른 색을 입힙니다. 재질은 이 복사본만 쓰므로 다 쓰면 disposePartModel 로 버립니다.
export function makePartModel(template: THREE.Object3D, part: Part, color: string): THREE.Object3D {
  const copy = template.clone(true)
  copy.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    const src = o.material as THREE.MeshStandardMaterial
    const map = src.map ?? null
    if (map) {
      map.magFilter = THREE.NearestFilter // 도트로 칠한 그림이 번지지 않게
      map.minFilter = THREE.NearestFilter
    }
    o.userData.ownMaterial = true // 스킨을 입히는 useSkin 이 이 재질을 바꾸지 않게
    o.material = new THREE.MeshBasicMaterial({
      color: /fixed/i.test(`${src.name} ${map?.name ?? ''}`) ? 0xffffff : color,
      map,
      vertexColors: true,
      transparent: src.transparent,
      alphaTest: map ? 0.5 : 0,
      side: src.side,
    })
  })
  copy.scale.setScalar(part.modelScale ?? MODEL_UNIT)
  return copy
}

export function disposePartModel(obj: THREE.Object3D) {
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose() // 모양 데이터와 그림은 같이 쓰므로 버리지 않음
  })
}

// ── 꾸미기 창의 부품 그림 ─────────────────────────────────────────────
// 입체 부품은 2D 로 그릴 수 없어서, 화면 밖 3D 화면 하나로 피부색 머리 + 부품을 비스듬히 찍어 옮깁니다.
// 3D 화면은 하나만 만들어 모든 부품 그림이 같이 씁니다(브라우저가 여는 3D 화면 수가 제한돼 있어서, #137).
let thumbRenderer: THREE.WebGLRenderer | null = null
const THUMB_CAMERA = new THREE.PerspectiveCamera(30, 1, 1, 200)
THUMB_CAMERA.position.set(9, 12, 26)
THUMB_CAMERA.lookAt(0, 5.6, 0)

export async function drawModelThumb(target: HTMLCanvasElement, part: Part, skin: string, color: string) {
  if (!part.model) return
  const template = await loadPartModel(part.model)
  thumbRenderer ??= new THREE.WebGLRenderer({ alpha: true, antialias: true })
  thumbRenderer.setSize(target.width, target.height, false)
  thumbRenderer.outputColorSpace = THREE.SRGBColorSpace
  const scene = new THREE.Scene()
  // 맨머리: 면마다 밝기를 다르게 칠한 피부색 상자 (상자 면 순서: +x, -x, 위, 아래, 앞, 뒤)
  const base = new THREE.Color(skin)
  const dirs = ['right', 'left', 'top', 'bottom', 'front', 'back'] as const
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(8, 8, 8),
    dirs.map((d) => new THREE.MeshBasicMaterial({ color: base.clone().multiplyScalar(SHADE[d] / 255) })),
  )
  head.position.y = 4
  const model = makePartModel(template, part, color)
  scene.add(head, model)
  thumbRenderer.render(scene, THUMB_CAMERA)
  const ctx = target.getContext('2d')!
  ctx.clearRect(0, 0, target.width, target.height)
  ctx.drawImage(thumbRenderer.domElement, 0, 0, target.width, target.height)
  disposePartModel(model)
  head.geometry.dispose()
  for (const m of head.material) m.dispose()
}
