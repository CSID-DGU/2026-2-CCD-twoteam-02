// 회의실 음성 (#46). 회의에 들어와 있는 동안 같은 회의 사람들과 음성을 잇고, 나가면 끊습니다.
//
// 연결 신호는 회의 방(useParticipants 의 signalRef)으로 주고받고, 실제 연결은 VoiceMesh 가 합니다.
// 마이크는 기본으로 꺼져 있고, 켤 때 처음으로 마이크 권한을 묻습니다. 남의 목소리는 들어오자마자 들립니다.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { SignalPort } from '../realtime/participants'
import { VoiceMesh } from './voiceMesh'

const TICK_MS = 1000 // 아직 연결이 없는 사람에게 연결을 거는 주기
const MEASURE_MS = 100 // 말하는 사람을 다시 재는 주기

// 회의 방과 음성 연결 사이의 신호 통로를 만듭니다. useParticipants 와 useVoice 에 같이 넘깁니다.
export function useSignalPort() {
  return useRef<SignalPort>({ receive: () => {}, send: null })
}

// presentKey: 회의 방에 있는 다른 참석자 계정 번호를 쉼표로 이은 값
export function useVoice(myId: string, presentKey: string, signalRef: RefObject<SignalPort>) {
  const mesh = useRef<VoiceMesh | null>(null)
  const [micOn, setMicOn] = useState(false)
  const [speaking, setSpeaking] = useState<Set<string>>(() => new Set())
  const [blocked, setBlocked] = useState(false)

  // 회의에 있는 동안 하나의 연결 묶음을 둡니다. 나가면(화면이 사라지면) 모두 끊고 마이크도 끕니다.
  useEffect(() => {
    const port = signalRef.current
    const m = new VoiceMesh(
      myId,
      (to, data) => port.send?.(to, data),
      () => {
        setSpeaking(new Set(m.speaking))
        setBlocked(m.blocked)
      },
    )
    mesh.current = m
    port.receive = (from, data) => void m.receive(from, data)
    const tick = setInterval(() => m.tick(), TICK_MS)
    const measure = setInterval(() => m.measure(), MEASURE_MS)
    return () => {
      clearInterval(tick)
      clearInterval(measure)
      port.receive = () => {}
      m.close()
      mesh.current = null
      setMicOn(false)
    }
  }, [myId, signalRef])

  useEffect(() => {
    mesh.current?.setPeople(presentKey ? presentKey.split(',') : [])
  }, [presentKey])

  // 마이크 켜기·끄기. 실패하면 안내 문구를 돌려줍니다(성공하면 '').
  const setMic = useCallback(async (on: boolean) => {
    const m = mesh.current
    if (!m) return ''
    if (!on) {
      await m.setMicTrack(null)
      setMicOn(false)
      return ''
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, // 스피커 소리가 다시 들어가지 않게
      })
      if (mesh.current !== m) {
        stream.getTracks().forEach((t) => t.stop()) // 그사이 회의에서 나갔으면 바로 끔
        return ''
      }
      await m.setMicTrack(stream.getAudioTracks()[0] ?? null)
      m.unlock() // 버튼을 누른 김에 막힌 재생도 풉니다
      setMicOn(true)
      return ''
    } catch (e) {
      const name = (e as { name?: string }).name
      return name === 'NotAllowedError' ? '마이크 권한이 없어요. 브라우저 주소창 옆에서 허용해 주세요.' : '마이크를 켜지 못했어요.'
    }
  }, [])

  const unlock = useCallback(() => mesh.current?.unlock(), [])

  return { micOn, setMic, speaking, blocked, unlock }
}
