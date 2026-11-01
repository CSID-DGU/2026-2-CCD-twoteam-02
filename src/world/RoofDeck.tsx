// 광장에서 보이는 지붕 위 루프탑 (이끼 루프탑). 루프탑 지점을 그대로 지붕 위에 그립니다.
// 지점 좌표 = 지붕 좌표라(지점 크기가 건물 겉 크기와 같음) 건물 무리(Building) 안에 지붕 높이만 올려 넣으면 됩니다.
// 조명은 넣지 않습니다(광장 하늘·해가 비춤). 전구·랜턴은 빛나는 재질이라 밤에 광장에서도 반짝입니다.
import { BranchInterior } from '../space/BranchInterior'
import { BRANCH_LAYOUTS } from '../space/branches'

export function RoofDeck({ slug }: { slug: string }) {
  const layout = BRANCH_LAYOUTS[slug]
  if (!layout) return null
  return <BranchInterior branch={layout} exitLabel="" lights={false} />
}
