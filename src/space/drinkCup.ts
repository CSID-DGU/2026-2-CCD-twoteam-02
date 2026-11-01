// 카페에서 받은 음료 컵·빵 모양. 손(Player)·책상·1인칭 화면(HeldDrink)이 같은 모양을 씁니다.
// 크기는 캐릭터 모델 단위(화면에서 0.6배)라, 모델 밖에 둘 때는 CUP_WORLD_SCALE 을 곱합니다. 바닥이 y=0.
// 빵(스콘·마들렌·치아바타·샌드위치)은 컵 대신 작은 접시에 담겨 나옵니다. 메뉴 JSON 의 food 로 고름.
import * as THREE from 'three'
import type { FoodKind, MenuItem } from './baristaLogic'

export const CUP_WORLD_SCALE = 0.6
const M = 1 / CUP_WORLD_SCALE // 빵은 m 로 적고 모델 단위로 바꿈

const mat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.8 })

// 테이크아웃 컵 (흰 컵 + 갈색 슬리브 + 뚜껑)
export function makeCup() {
  const g = new THREE.Group()
  const white = mat('#f4f1ea')
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.075, 0.24, 12), white)
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.096, 0.084, 0.09, 12), mat('#8a5a32'))
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.03, 12), white)
  body.position.y = 0.12
  sleeve.position.y = 0.11
  lid.position.y = 0.255
  g.add(body, sleeve, lid)
  return g
}

// 접시 + 빵 (m 단위로 만들고 그룹을 모델 단위로 키움)
export function makeFood(kind: FoodKind) {
  const g = new THREE.Group()
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.075, 0.015, 20), mat('#fbfaf6'))
  plate.position.y = 0.0075
  g.add(plate)
  const on = 0.015 // 접시 윗면
  if (kind === 'scone') {
    // 겉이 울퉁불퉁한 둥근 덩어리 두 개
    ;[[-0.03, 0.0, 0.045], [0.035, 0.02, 0.04]].forEach(([x, z, r]) => {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat('#d9a35a'))
      m.scale.y = 0.75
      m.position.set(x, on + r * 0.7, z)
      m.rotation.y = x * 20
      g.add(m)
    })
  } else if (kind === 'madeleine') {
    // 조개 모양: 납작한 반구, 둘
    ;[-0.035, 0.035].forEach((x, i) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#e6b45c'))
      m.scale.set(0.8, 0.5, 1.15)
      m.position.set(x, on, 0)
      m.rotation.y = i ? 0.4 : -0.3
      g.add(m)
    })
  } else if (kind === 'ciabatta') {
    // 길쭉한 빵 + 위에 밀가루 자국
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), mat('#c98a45'))
    m.scale.set(1.9, 0.6, 1)
    m.position.y = on + 0.028
    m.rotation.y = 0.5
    const flour = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), mat('#efe3cf'))
    flour.scale.set(1.2, 0.18, 0.45)
    flour.position.y = on + 0.052
    flour.rotation.y = 0.5
    g.add(m, flour)
  } else {
    // 샌드위치: 세모 두 쪽 (빵·양상추·햄·빵)
    ;[-0.03, 0.03].forEach((x, i) => {
      const half = new THREE.Group()
      const layers: [string, number][] = [['#f0d9a8', 0.018], ['#7cb342', 0.008], ['#e8a0a0', 0.01], ['#f0d9a8', 0.018]]
      let y = on
      for (const [c, h] of layers) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, h, 3), mat(c))
        m.position.y = y + h / 2
        y += h
        half.add(m)
      }
      half.position.x = x
      half.rotation.y = i ? Math.PI / 3 : 0
      g.add(half)
    })
  }
  g.scale.setScalar(M)
  return g
}

export function makeHeld(item: MenuItem) {
  return item.food ? makeFood(item.food) : makeCup()
}
