// 모래 위를 걸을 때 나는 발소리. 소리 파일 없이 아주 짧은 잡음 알갱이를 흩어 "사르륵" 소리를 만듭니다.
// 내 위치 변화로 속도를 재서(서 있으면 안 남) 간격마다 한 번씩 냅니다. 나무 산책로 위에서는 나지 않습니다(onSand).
// 채팅 "소리 끔"을 따르고, 앉아 있으면 나지 않습니다. 그림은 그리지 않습니다.
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { onSand, stepGap } from './beachLogic'

const TELEPORT = 2 // 한 프레임에 이보다 멀리 가면 걸은 게 아님 (m)
// 한 걸음 = 아주 짧은 모래 알갱이 소리 여러 개가 흩어져 나는 "사르륵" (쿵 하는 낮은 소리 없음)
const STEP = {
  seconds: 0.26, // 한 걸음 길이
  grains: [7, 11], // 알갱이 수 범위
  grainSeconds: [0.035, 0.085], // 알갱이 하나 길이 범위
  gain: [0.012, 0.032], // 알갱이 하나 크기 범위
  freq: [3400, 6800], // 알갱이 높이 범위(Hz)
  highpass: 1900, // 이 아래는 뺌 (둔탁하지 않게)
  noiseSeconds: 0.5,
}
const between = ([lo, hi]: number[]) => lo + Math.random() * (hi - lo)

function makeStep() {
  let ctx: AudioContext | null = null
  let noise: AudioBuffer | null = null
  const play = () => {
    ctx ??= new AudioContext()
    const c = ctx
    if (c.state === 'suspended') {
      void c.resume()
      return // 아직 누른 적이 없으면 소리를 쌓지 않음
    }
    if (!noise) {
      noise = c.createBuffer(1, c.sampleRate * STEP.noiseSeconds, c.sampleRate)
      const data = noise.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    }
    const t0 = c.currentTime
    const high = c.createBiquadFilter()
    high.type = 'highpass'
    high.frequency.value = STEP.highpass
    high.connect(c.destination)
    const count = Math.round(between(STEP.grains))
    for (let i = 0; i < count; i++) {
      // 앞쪽에 몰리고 뒤로 갈수록 작아져 스르르 사라짐
      const at = i / count
      const t = t0 + at * at * STEP.seconds * 0.8 + Math.random() * 0.012
      const len = between(STEP.grainSeconds)
      const src = c.createBufferSource()
      src.buffer = noise
      const band = c.createBiquadFilter()
      band.type = 'bandpass'
      band.frequency.value = between(STEP.freq)
      band.Q.value = 1.1
      const g = c.createGain()
      const peak = between(STEP.gain) * (1 - at * 0.65)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(peak, t + len * 0.35)
      g.gain.exponentialRampToValueAtTime(0.0001, t + len)
      src.connect(band).connect(g).connect(high)
      src.start(t, Math.random() * (STEP.noiseSeconds - len), len + 0.01)
    }
  }
  const close = () => {
    void ctx?.close()
    ctx = null
    noise = null
  }
  return { play, close }
}

export function SandSteps({ posRef, size, muted }: { posRef: RefObject<{ x: number; z: number }>; size: { w: number; d: number }; muted: boolean }) {
  const sound = useRef<ReturnType<typeof makeStep> | null>(null)
  const last = useRef({ x: 0, z: 0, seen: false })
  const wait = useRef(0)
  useEffect(() => {
    const s = makeStep()
    sound.current = s
    return () => {
      s.close()
      sound.current = null
    }
  }, [])
  useFrame((_, delta) => {
    const p = posRef.current
    const l = last.current
    const moved = l.seen ? Math.hypot(p.x - l.x, p.z - l.z) : 0
    l.x = p.x
    l.z = p.z
    l.seen = true
    if (delta <= 0 || moved > TELEPORT) return
    const gap = stepGap(moved / delta)
    if (gap === null) {
      wait.current = 0 // 멈췄다 걸으면 바로 한 걸음
      return
    }
    wait.current -= delta
    if (wait.current > 0) return
    wait.current = gap
    if (!muted && onSand(p.x, p.z, size)) sound.current?.play()
  })
  return null
}
