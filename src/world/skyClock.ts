// 지금 하늘 시계와 고른 날씨 (팀 전용 하늘 조절판). 단축키 표(keymap.ts)와 같은 방식의 작은 저장소입니다.
//
// WorldSky 가 매 프레임 getSkyClock() 으로 읽어 하늘 시각을 정하고, 처음에는 주소(?time, ?speed)로 채웁니다(parseClock).
// 팀 계정의 조절판(SkyTimePanel)이 setSkyClock 으로 바꾸면 다음 프레임부터 그 시각·빠르기로 하늘이 움직입니다.
// 날씨도 같습니다: 조절판에서 고르면(setSkyWeather) WorldSky 가 실제 날씨·주소(?weather=) 대신 그 날씨를 씁니다. null 이면 원래대로.
// 눈 쌓임도 따로 고릅니다(setSkyCover, 0~1). 주소 ?snowcover= 와 같은 값이고, null 이면 날씨를 따릅니다(#329).
// 먼 도시(밤 스카이라인)도 켜고 끕니다(setSkyline). 기본은 켜짐.
// 내 브라우저 안의 값이라 다른 사람 하늘은 바뀌지 않고, 새로고침하면 실제 시각·날씨(또는 주소 값)로 돌아갑니다.
import { useSyncExternalStore } from 'react'
import type { Clock } from './skyLogic'
import { parseWeatherOverride } from './weatherLogic'
import type { Weather } from './weatherLogic'

let current: Clock | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export const getSkyClock = () => current

export function setSkyClock(next: Clock) {
  current = next
  emit()
}

// 고른 날씨. 확인용 주소 ?weather= 와 같은 이름·같은 값(눈이면 쌓인 모습까지). 비·눈은 세기(0~1)도 고름(?weather=rain:0.3 과 같음)
export type WeatherPick = 'clear' | 'cloudy' | 'rain' | 'snow' | 'storm'
export const STRENGTHS = [
  { value: 0.3, label: '약하게' },
  { value: 0.6, label: '보통' }, // 확인용 주소의 기본 세기와 같음
  { value: 1, label: '강하게' },
] as const
let pick: WeatherPick | null = null
let strength: number = STRENGTHS[1].value
let picked: Weather | null = null

export const getSkyWeather = () => picked
export const hasStrength = (p: WeatherPick | null) => p === 'rain' || p === 'snow'

const repick = () => {
  picked = pick ? parseWeatherOverride(`?weather=${pick}${hasStrength(pick) ? `:${strength}` : ''}`) : null
  emit()
}

export function setSkyWeather(next: WeatherPick | null) {
  pick = next
  repick()
}

// 비·눈 세기. 비 ↔ 눈을 바꿔 골라도 그대로 이어짐
export function setSkyStrength(next: number) {
  strength = next
  repick()
}

// 고른 눈 쌓임 (0 없음 ~ 1 가득). null 이면 날씨(실제 쌓인 눈·고른 눈)를 따름
export const COVERS = [
  { value: null, label: '날씨대로' },
  { value: 0, label: '없음' },
  { value: 0.5, label: '조금' },
  { value: 1, label: '가득' },
] as const
let cover: number | null = null

export const getSkyCover = () => cover

export function setSkyCover(next: number | null) {
  cover = next
  emit()
}

// 먼 도시 스카이라인 보이기 (CitySkyline). 기본은 보임. 지울지 팀이 정하기 전에 조절판에서 꺼 보며 비교하는 용도
let skyline = true

export const getSkyline = () => skyline

export function setSkyline(next: boolean) {
  skyline = next
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// 조절판이 빠르기 표시를 다시 그리도록 지금 시계를 읽습니다.
export function useSkyClock(): Clock | null {
  return useSyncExternalStore(subscribe, getSkyClock)
}

// 조절판이 고른 날씨 버튼을 표시하도록 읽습니다. null 이면 [실제]
export function useSkyWeatherPick(): WeatherPick | null {
  return useSyncExternalStore(subscribe, () => pick)
}

export function useSkyStrength(): number {
  return useSyncExternalStore(subscribe, () => strength)
}

export function useSkyCover(): number | null {
  return useSyncExternalStore(subscribe, getSkyCover)
}

export function useSkyline(): boolean {
  return useSyncExternalStore(subscribe, getSkyline)
}
