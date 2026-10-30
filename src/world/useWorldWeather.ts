// 실제 서울 날씨 받기 (#317). Open-Meteo 시간별 예보를 브라우저가 직접 받습니다(키·서버 없음).
//
//   - 광장에 들어오면 받고, 그다음은 서울 정각 + 1분마다 다시 받습니다. 모두 같은 때 받아 같은 값을 씁니다.
//   - 받은 예보는 모듈 변수에 둡니다. 지점에 다녀와도 같은 시간 안이면 다시 부르지 않습니다.
//   - 실패하면 5분 뒤 다시 시도하고, 그동안은 이미 받은 앞으로의 예보를 그대로 씁니다. 받은 게 없으면 맑음(weatherAt).
//   - 확인용 주소(?weather=rain 등)가 있으면 아무것도 부르지 않고 그 날씨로 고정합니다.
// 값은 React 상태가 아니라 ref 로 넘깁니다. WorldSky 가 매 프레임 읽는 값이라, 받을 때마다 광장을 다시 그릴 필요가 없습니다.
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { nextFetchDelay, parseForecast, parseWeatherOverride, weatherUrl } from './weatherLogic'
import type { Hour, WeatherSource } from './weatherLogic'

const HOUR_MS = 3_600_000
const RETRY_MS = 5 * 60_000 // 실패하면 이만큼 뒤 다시
const TIMEOUT_MS = 10_000 // 한 번 받기에 이보다 오래 걸리면 그만둠

// 받은 예보 (광장을 떠나도 남음). hour = 받은 때의 시간 번호(ms / 1시간)
const cache: { hours: Hour[] | null; hour: number } = { hours: null, hour: -1 }

export function useWorldWeather(): RefObject<WeatherSource> {
  const source = useRef<WeatherSource>({ hours: cache.hours, override: null })

  useEffect(() => {
    const override = parseWeatherOverride(window.location.search)
    if (override) {
      source.current = { hours: null, override }
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    let ctrl: AbortController | null = null
    let warned = false
    let stopped = false

    const schedule = (ms: number) => {
      if (!stopped) timer = setTimeout(load, ms)
    }
    async function load() {
      ctrl = new AbortController()
      const giveUp = setTimeout(() => ctrl?.abort(), TIMEOUT_MS)
      try {
        const res = await fetch(weatherUrl(), { signal: ctrl.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const hours = parseForecast(await res.json())
        if (!hours) throw new Error('예보 모양이 다름')
        const now = Date.now()
        cache.hours = hours
        cache.hour = Math.floor(now / HOUR_MS)
        source.current = { hours, override: null }
        schedule(nextFetchDelay(now))
      } catch (e) {
        if (stopped) return
        if (!warned) console.warn('날씨를 받지 못했습니다(이미 받은 예보 또는 맑음으로 둡니다):', e)
        warned = true
        schedule(RETRY_MS)
      } finally {
        clearTimeout(giveUp)
      }
    }

    const now = Date.now()
    if (cache.hours && cache.hour === Math.floor(now / HOUR_MS)) schedule(nextFetchDelay(now))
    else void load()
    return () => {
      stopped = true
      clearTimeout(timer)
      ctrl?.abort()
    }
  }, [])

  return source
}
