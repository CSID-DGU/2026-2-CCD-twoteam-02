// 1인칭으로 걸을 때 오른쪽 아래에 뜨는 미니맵 (#290): "위에서 보기"를 작게 줄여 보여 줍니다.
// 지점·광장·회의실이 같이 씁니다. 3D 장면(<Canvas>) 안에, 1인칭이고 서 있을 때만 넣습니다.
// 광장처럼 넓은 곳은 전체를 그리면 너무 작아서, follow(m)를 넘기면 내 둘레만 따라다니며 보여 줍니다. (#315)
//
// 그리는 방법: 매 프레임 1인칭 화면을 그린 뒤, "위에서 보기"와 같은 카메라로 같은 장면을 작은 그림(렌더 타깃)에
// 한 번 더 그리고, 그 그림을 화면 구석에 덧그립니다. 그림으로 한 번 거치는 것은 투명도를 줘서 스르르 나타나게 하기 위해서입니다.
// 이 컴포넌트가 화면 그리기를 맡으므로(useFrame 우선순위 1) React Three Fiber 의 자동 그리기는 꺼집니다.
//
// 걷는 중인지는 내 위치(posRef)가 바뀌었는지로 직접 봅니다. 마우스로 둘러보기만 하면 뜨지 않습니다.
// 내 화살표는 레이어 1에만 두어 미니맵 카메라에만 보이고 1인칭 화면과 클릭(레이캐스트)에는 잡히지 않습니다.
// 미니맵이 완전히 사라진 동안에는 두 번째 그리기를 하지 않아 평소 부담은 그대로입니다.
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useIsTouch } from './useIsTouch'

const SIZE_PX = 300 // 긴 변 (처음 200px 에서 1.5배로 키움)
const MAX_SHARE = 0.34 // 작은 화면(폰, #377)에서는 화면 짧은 변의 이만큼까지만
const MARGIN_PX = 16 // 화면 가장자리에서 띄우는 거리
const BORDER_PX = 2
const HIDE_AFTER_S = 1 // 멈춘 뒤 이만큼 지나면 사라짐 (걷다 멈출 때마다 깜빡이지 않게)
const FADE_S = 0.2 // 나타나고 사라지는 시간
const MOVE_EPS = 1e-4 // 이보다 작게 바뀐 것은 움직임으로 보지 않음 (m)
const MAP_LAYER = 1 // 미니맵 카메라에만 보이는 레이어 (내 화살표)
const CAMERA_HEIGHT = 20 // 위에서 보기 카메라와 같은 높이
const ARROW_HEIGHT = 10 // 벽·캐릭터보다 위, 카메라보다 아래
const ARROW_SCALE = 0.07 // 화살표 길이 = 공간 긴 변 × 이 값
const OUTSIDE = new THREE.Color('#20232a') // 미니맵에서 공간 밖(배경) 색
const MSAA_SAMPLES = 4 // 미니맵 그림의 계단 현상 줄이기. 없으면 움직이는 화살표·캐릭터 가장자리가 자글자글 깜빡입니다.

type Props = {
  area: { w: number; d: number } // 공간 크기 (m). 위에서 보기(TopDownCamera)와 같은 값
  posRef: RefObject<{ x: number; z: number }> // 내 위치
  headingRef: RefObject<number> // 바라보는 방향 (라디안, 0이면 +Z 쪽)
  follow?: number // 있으면 공간 전체 대신 내 둘레 이 거리(m)만 보여 주며 따라다님 (광장)
}

// 바라보는 쪽(+Z)을 가리키는 납작한 화살표. 바닥(XZ 평면)에 눕혀 둡니다.
function arrowGeometry(length: number) {
  const s = new THREE.Shape()
  s.moveTo(0, length * 0.6) // 끝
  s.lineTo(length * 0.4, -length * 0.4)
  s.lineTo(0, -length * 0.15)
  s.lineTo(-length * 0.4, -length * 0.4)
  s.closePath()
  const g = new THREE.ShapeGeometry(s)
  g.rotateX(Math.PI / 2) // 모양의 +Y 를 +Z(바라보는 쪽)로. 이때 앞면이 아래를 보므로 재질을 양면으로 둡니다.
  return g
}

// 미니맵에 쓰는 three.js 물체들. 크기가 바뀔 때만 새로 만들고, 매 프레임에는 ref 로 읽어 위치·투명도만 바꿉니다.
type Parts = {
  target: THREE.WebGLRenderTarget // 미니맵 그림을 그려 둘 곳
  mapCamera: THREE.OrthographicCamera // 위에서 보기와 같은 카메라
  arrow: THREE.Group // 내 화살표 (레이어 1)
  overlay: { scene: THREE.Scene; camera: THREE.OrthographicCamera; border: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; map: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> }
}

function createParts(W: number, D: number, mapW: number, mapH: number, dpr: number): Parts {
  // 렌더 타깃은 sRGB 로 저장해야 화면에 덧그릴 때 색이 1인칭 화면과 같습니다.
  // 렌더 타깃에는 화면(<Canvas>)의 안티에일리어싱이 적용되지 않아서 samples 로 따로 켭니다.
  const target = new THREE.WebGLRenderTarget(Math.round(mapW * dpr), Math.round(mapH * dpr), {
    colorSpace: THREE.SRGBColorSpace,
    samples: MSAA_SAMPLES,
  })

  // 맨 위가 -Z 인 위에서 보기 (지도는 돌지 않음)
  const mapCamera = new THREE.OrthographicCamera(-W / 2, W / 2, D / 2, -D / 2, 0.1, 100)
  mapCamera.position.set(0, CAMERA_HEIGHT, 0)
  mapCamera.rotation.set(-Math.PI / 2, 0, 0)
  mapCamera.layers.enable(MAP_LAYER)
  mapCamera.updateMatrixWorld()

  // 노란 화살표 + 잘 보이게 조금 큰 검은 테두리
  const length = Math.max(W, D) * ARROW_SCALE
  const arrow = new THREE.Group()
  const outline = new THREE.Mesh(arrowGeometry(length * 1.35), new THREE.MeshBasicMaterial({ color: '#111', side: THREE.DoubleSide }))
  const fill = new THREE.Mesh(arrowGeometry(length), new THREE.MeshBasicMaterial({ color: '#facc15', side: THREE.DoubleSide }))
  fill.position.y = 0.01 // 테두리 위에
  outline.position.z = -length * 0.05 // 테두리 끝이 화살표 끝을 감싸도록
  for (const m of [outline, fill]) m.layers.set(MAP_LAYER)
  arrow.add(outline, fill)
  arrow.position.y = ARROW_HEIGHT

  // 화면에 덧그리는 판 (픽셀 단위 카메라). 테두리 판 위에 미니맵 그림 판을 올립니다.
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1)
  const border = new THREE.Mesh(
    new THREE.PlaneGeometry(mapW + BORDER_PX * 2, mapH + BORDER_PX * 2),
    new THREE.MeshBasicMaterial({ color: '#20232a', transparent: true, depthTest: false }),
  )
  const map = new THREE.Mesh(
    new THREE.PlaneGeometry(mapW, mapH),
    new THREE.MeshBasicMaterial({ map: target.texture, transparent: true, depthTest: false }),
  )
  map.renderOrder = 1
  scene.add(border, map)
  return { target, mapCamera, arrow, overlay: { scene, camera, border, map } }
}

function disposeParts(parts: Parts) {
  parts.target.dispose()
  for (const o of [parts.arrow, parts.overlay.scene]) {
    o.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        child.material.dispose()
      }
    })
  }
}

export function Minimap({ area, posRef, headingRef, follow }: Props) {
  const scene = useThree((s) => s.scene)
  const dpr = useThree((s) => s.viewport.dpr)
  const screen = useThree((s) => s.size)
  const touch = useIsTouch() // 폰: 오른쪽 아래는 조작 버튼 자리라 왼쪽 위에 그림 (#377)
  const longPx = Math.min(SIZE_PX, Math.round(Math.min(screen.width, screen.height) * MAX_SHARE))

  // 미니맵 크기(px): 긴 변을 SIZE_PX(작은 화면이면 longPx) 로, 공간 비율 그대로. 위에서 보기처럼 가장자리를 0.5m씩 남깁니다.
  // 따라다닐 때는 정사각형 둘레만 그립니다.
  const W = (follow ?? area.w) + 1
  const D = (follow ?? area.d) + 1
  const mapW = W >= D ? longPx : Math.round((longPx * W) / D)
  const mapH = D >= W ? longPx : Math.round((longPx * D) / W)

  const parts = useRef<Parts | null>(null)
  useEffect(() => {
    const created = createParts(W, D, mapW, mapH, dpr)
    scene.add(created.arrow)
    parts.current = created
    return () => {
      scene.remove(created.arrow)
      disposeParts(created)
      parts.current = null
    }
  }, [scene, W, D, mapW, mapH, dpr])

  const last = useRef<{ x: number; z: number } | null>(null)
  const lastMoveAt = useRef(-Infinity)
  const opacity = useRef(0)

  useFrame(({ gl, scene, camera, clock, size }, delta) => {
    // 걷는 중인지: 위치가 바뀌면 그 시각을 기억합니다.
    const now = clock.elapsedTime
    const p = posRef.current
    if (last.current && Math.hypot(p.x - last.current.x, p.z - last.current.z) > MOVE_EPS) lastMoveAt.current = now
    last.current = { x: p.x, z: p.z }
    const want = now - lastMoveAt.current < HIDE_AFTER_S ? 1 : 0
    const step = delta / FADE_S
    // 이미 목표에 닿았으면 그대로 둡니다. (같을 때 빼면 1 ↔ 0.92 를 오가며 깜빡였음, 2026-10-28)
    if (want > opacity.current) opacity.current = Math.min(1, opacity.current + step)
    else if (want < opacity.current) opacity.current = Math.max(0, opacity.current - step)

    // 1인칭 화면 (원래 React Three Fiber 가 하던 그리기)
    gl.render(scene, camera)
    const made = parts.current
    if (opacity.current === 0 || !made) return
    const { target, mapCamera, arrow, overlay } = made

    // 미니맵 그림: 같은 장면을 위에서 그립니다. 화살표는 이때만 보입니다.
    arrow.position.x = p.x
    arrow.position.z = p.z
    arrow.rotation.y = headingRef.current
    if (follow !== undefined) {
      // 미니맵 카메라를 내 위치 바로 위로 (높이·회전은 그대로)
      mapCamera.position.x = p.x
      mapCamera.position.z = p.z
      mapCamera.updateMatrixWorld()
    }
    const background = scene.background
    scene.background = OUTSIDE // 공간 밖은 어둡게
    gl.setRenderTarget(target)
    gl.clear()
    gl.render(scene, mapCamera)
    gl.setRenderTarget(null)
    scene.background = background

    // 오른쪽 아래(폰은 왼쪽 위)에 덧그리기 (화면 픽셀 좌표, 아래가 0)
    overlay.camera.right = size.width
    overlay.camera.top = size.height
    overlay.camera.updateProjectionMatrix()
    const cx = touch ? MARGIN_PX + BORDER_PX + mapW / 2 : size.width - MARGIN_PX - BORDER_PX - mapW / 2
    const cy = touch ? size.height - MARGIN_PX - BORDER_PX - mapH / 2 : MARGIN_PX + BORDER_PX + mapH / 2
    overlay.border.position.set(cx, cy, 0)
    overlay.map.position.set(cx, cy, 0)
    overlay.border.material.opacity = opacity.current * 0.9
    overlay.map.material.opacity = opacity.current
    const autoClear = gl.autoClear
    gl.autoClear = false
    gl.render(overlay.scene, overlay.camera)
    gl.autoClear = autoClear
  }, 1)

  return null
}
