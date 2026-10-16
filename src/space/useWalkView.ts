// 걸어 다닐 때의 시점(1인칭 / 위에서 보기)을 기억하는 훅
//
// 처음 접속하면 1인칭(#71)이고, V 로 위에서 보기로 바꾸면 로비 ↔ 지점을 오가도 그대로 유지합니다.
// 화면을 옮기면 로비·지점 화면이 새로 만들어져 시점이 처음 값으로 돌아가던 것을 막습니다.
//
// sessionStorage(이 탭이 열려 있는 동안만 남는 브라우저 저장소)에 둡니다.
// 새로고침해도 유지되고, 탭을 닫고 다시 접속하면 1인칭으로 돌아갑니다.
// 저장소를 못 쓰는 브라우저(사생활 보호 모드 등)면 기억하지 못할 뿐 동작은 같습니다.
import { useEffect, useState } from 'react'

export type WalkView = 'top' | 'first'

const STORAGE_KEY = 'dooteum.walkView'
const DEFAULT_VIEW: WalkView = 'first'

function readView(): WalkView {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    return saved === 'top' || saved === 'first' ? saved : DEFAULT_VIEW
  } catch {
    return DEFAULT_VIEW
  }
}

export function useWalkView() {
  const [view, setView] = useState<WalkView>(readView)

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, view)
    } catch {
      // 저장 못 해도 이번 화면에서는 그대로 씁니다.
    }
  }, [view])

  return [view, setView] as const
}
