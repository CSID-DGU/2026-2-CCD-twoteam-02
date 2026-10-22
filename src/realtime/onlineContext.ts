// 접속 상태를 화면들에 나눠 주는 통로 (#176). 실제 연결은 OnlineProvider 가 합니다.
//
// React context: 앱 맨 위에서 한 번 만든 값을 아래 어느 화면에서든 꺼내 쓰게 하는 장치입니다.
// 접속 상태 방에는 한 번만 들어가야 해서(여러 번 들어가면 같은 사람이 겹쳐 셈) 맨 위에 하나만 둡니다.
import { createContext, useContext, useEffect } from 'react'
import { ELSEWHERE } from './online'

// 한 사람의 접속 상태
export type OnlineEntry = {
  place: string // 지금 있는 곳 (로비·지점 slug·그 밖의 화면)
  studying: boolean // 공부 세션이 도는 중인지 (친구 탭 표시, #49)
  quiet: boolean // 귓속말 방해금지 중인지 (보낼 때 "알림 없이 전달돼요" 안내용, #216)
}

export type OnlineValue = {
  people: Map<string, OnlineEntry> // 접속 중인 계정 번호 → 상태
  studying: boolean // 내가 공부 중인지
  setPlace: (place: string) => void // 내가 지금 있는 곳을 바꿉니다
  setStudying: (studying: boolean) => void // 내 공부 중 여부를 바꿉니다
  setQuiet: (quiet: boolean) => void // 내 방해금지 여부를 바꿉니다
}

export const OnlineContext = createContext<OnlineValue>({
  people: new Map(),
  studying: false,
  setPlace: () => {},
  setStudying: () => {},
  setQuiet: () => {},
})

// 접속 중인 사람들
export function useOnline() {
  return useContext(OnlineContext).people
}

// 내가 공부 중인지 (귓속말 방해금지, #49)
export function useMyStudying() {
  return useContext(OnlineContext).studying
}

// 이 화면에 있는 동안 내가 있는 곳을 place 로 표시합니다. 화면을 떠나면 "그 밖의 화면"으로 돌립니다.
export function useOnlinePlace(place: string) {
  const { setPlace } = useContext(OnlineContext)
  useEffect(() => {
    setPlace(place)
    return () => setPlace(ELSEWHERE)
  }, [place, setPlace])
}

// 공부 세션이 도는 동안 "공부 중"으로 표시합니다. 끝나거나 화면을 떠나면 풉니다. (#49)
export function useStudyingFlag(active: boolean) {
  const { setStudying } = useContext(OnlineContext)
  useEffect(() => {
    setStudying(active)
    return () => setStudying(false)
  }, [active, setStudying])
}

// 귓속말 방해금지 중이면 친구에게 알립니다. 꺼지거나 화면을 떠나면 풉니다. (#216)
export function useQuietFlag(active: boolean) {
  const { setQuiet } = useContext(OnlineContext)
  useEffect(() => {
    setQuiet(active)
    return () => setQuiet(false)
  }, [active, setQuiet])
}
