// 접속 상태를 화면들에 나눠 주는 통로 (#176). 실제 연결은 OnlineProvider 가 합니다.
//
// React context: 앱 맨 위에서 한 번 만든 값을 아래 어느 화면에서든 꺼내 쓰게 하는 장치입니다.
// 접속 상태 방에는 한 번만 들어가야 해서(여러 번 들어가면 같은 사람이 겹쳐 셈) 맨 위에 하나만 둡니다.
import { createContext, useContext, useEffect } from 'react'
import { ELSEWHERE } from './online'

export type OnlineValue = {
  places: Map<string, string> // 접속 중인 계정 번호 → 지금 있는 곳
  setPlace: (place: string) => void // 내가 지금 있는 곳을 바꿉니다
  setInvisible: (on: boolean) => void // 켜면 접속 상태 방에서 나를 뺍니다 (실험 B 조건, #47)
}

export const OnlineContext = createContext<OnlineValue>({ places: new Map(), setPlace: () => {}, setInvisible: () => {} })

// 접속 중인 사람들
export function useOnline() {
  return useContext(OnlineContext).places
}

// 이 화면에 있는 동안 내가 있는 곳을 place 로 표시합니다. 화면을 떠나면 "그 밖의 화면"으로 돌립니다.
export function useOnlinePlace(place: string) {
  const { setPlace } = useContext(OnlineContext)
  useEffect(() => {
    setPlace(place)
    return () => setPlace(ELSEWHERE)
  }, [place, setPlace])
}

// 이 화면에 있는 동안 active 면 다른 사람에게 접속 중으로 보이지 않습니다. 화면을 떠나면 풉니다.
// 실험 B 조건(혼자 공부: 남도 안 보이고 나도 안 보임)에서 씁니다. (#47)
export function useOnlineInvisible(active: boolean) {
  const { setInvisible } = useContext(OnlineContext)
  useEffect(() => {
    setInvisible(active)
    return () => setInvisible(false)
  }, [active, setInvisible])
}
