// 광장 캠프파이어 장작 소리·분수 물소리의 켜기·음량.
// 두 소리는 가까이 갈수록 커지는 소리라(campfireLogic.fireLoudness, fountainLogic.fountainLoudness),
// 소리가 들리는 거리 안에 있을 때만 조절 막대를 보여 줍니다. 설정은 소리마다 따로 이 브라우저에 기억합니다.
// 음량 100% 가 원래 크기입니다(조절 기능을 넣기 전과 같음).
import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { loadAmbiencePref, saveAmbiencePref } from '../space/ambience'
import type { AmbiencePref } from '../space/ambience'
import { SoundControl } from '../space/AmbienceControl'
import { fireLoudness } from './campfireLogic'
import { fountainLoudness } from './fountainLogic'

type Kind = 'campfire' | 'fountain'
type Point = { x: number; z: number }

const LABEL: Record<Kind, string> = { campfire: '캠프파이어', fountain: '분수' }
const KEY: Record<Kind, string> = { campfire: 'dooteum.sound.campfire', fountain: 'dooteum.sound.fountain' }
const DEFAULT_PREF: AmbiencePref = { on: true, volume: 1 }
const NEAR_CHECK_MS = 400 // 소리가 들리는 거리인지 다시 보는 간격 (AmbienceControl 과 같음)

const volumeOf = (pref: AmbiencePref) => (pref.on ? pref.volume : 0)

// fire·fountain: 이 광장에 있는 것만 (없으면 undefined). posRef: 내 위치
export function useNearSounds(posRef: RefObject<Point>, fire?: Point, fountain?: Point) {
  const [prefs, setPrefs] = useState<Record<Kind, AmbiencePref>>(() => ({
    campfire: loadAmbiencePref(KEY.campfire, DEFAULT_PREF),
    fountain: loadAmbiencePref(KEY.fountain, DEFAULT_PREF),
  }))
  const [near, setNear] = useState<Record<Kind, boolean>>({ campfire: false, fountain: false })

  useEffect(() => {
    if (!fire && !fountain) return
    const read = () => {
      const p = posRef.current
      const next = {
        campfire: !!fire && !!p && fireLoudness(fire, p) > 0,
        fountain: !!fountain && !!p && fountainLoudness(fountain, p) > 0,
      }
      // 바뀔 때만 다시 그립니다.
      setNear((prev) => (prev.campfire === next.campfire && prev.fountain === next.fountain ? prev : next))
    }
    read()
    const id = window.setInterval(read, NEAR_CHECK_MS)
    return () => window.clearInterval(id)
  }, [posRef, fire, fountain])

  const change = (kind: Kind, next: AmbiencePref) => {
    setPrefs((prev) => ({ ...prev, [kind]: next }))
    saveAmbiencePref(next, KEY[kind])
  }

  const controls = (['campfire', 'fountain'] as const).map(
    (kind) => near[kind] && <SoundControl key={kind} label={LABEL[kind]} pref={prefs[kind]} onChange={(next) => change(kind, next)} />,
  )

  return { campfireVolume: volumeOf(prefs.campfire), fountainVolume: volumeOf(prefs.fountain), controls }
}
