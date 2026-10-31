// 지점 배경 소리 켜기·끄기와 음량 (휴식방 물소리). 이 창이 떠 있는 동안 소리가 나고, 지점을 나가면 꺼집니다.
// 소리 만드는 법은 ambience.ts 참고.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { loadAmbiencePref, saveAmbiencePref, startAmbience } from './ambience'
import type { AmbienceHandle, AmbienceKind, AmbiencePref } from './ambience'

const LABEL: Record<AmbienceKind, string> = { stream: '물소리' }

export function AmbienceControl({ kind }: { kind: AmbienceKind }) {
  const [pref, setPref] = useState<AmbiencePref>(loadAmbiencePref)
  const handle = useRef<AmbienceHandle | null>(null)
  const volume = useRef(pref.volume) // 켤 때 쓸 지금 음량 (음량만 바꿀 때는 소리를 새로 만들지 않음)

  // 음량만 바꾸면 하던 소리의 크기만 바꿉니다.
  useEffect(() => {
    volume.current = pref.volume
    handle.current?.setVolume(pref.volume)
  }, [pref.volume])

  // 켜져 있으면 시작, 끄거나 지점을 나가면 멈춤
  useEffect(() => {
    if (!pref.on) return
    handle.current = startAmbience(kind, volume.current)
    return () => {
      handle.current?.stop()
      handle.current = null
    }
  }, [kind, pref.on])

  const change = (next: AmbiencePref) => {
    setPref(next)
    saveAmbiencePref(next)
  }

  return (
    <div style={styles.box}>
      <button
        type="button"
        style={styles.button}
        // 누른 뒤 초점을 놓아, 이어서 누르는 Space(점프)·WASD 가 이 버튼으로 가지 않게 합니다.
        onClick={(e) => {
          change({ ...pref, on: !pref.on })
          e.currentTarget.blur()
        }}
        aria-label={pref.on ? `${LABEL[kind]} 끄기` : `${LABEL[kind]} 켜기`}
      >
        {pref.on ? '🔊' : '🔇'} {LABEL[kind]}
      </button>
      {pref.on && (
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(pref.volume * 100)}
          onChange={(e) => change({ ...pref, volume: Number(e.target.value) / 100 })}
          // 다 옮기면 초점을 놓습니다. 초점이 남아 있으면 걷기 키가 막힙니다(Player 는 입력칸에서 친 키를 무시).
          onPointerUp={(e) => e.currentTarget.blur()}
          style={styles.slider}
          aria-label={`${LABEL[kind]} 음량`}
        />
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  box: {
    position: 'fixed', top: 116, left: 16, display: 'flex', alignItems: 'center', gap: 8,
    padding: '4px 10px', borderRadius: 8, background: 'rgba(32,35,42,.85)', color: '#fff', font: '13px system-ui, sans-serif',
  },
  button: { background: 'none', border: 'none', color: '#fff', font: 'inherit', cursor: 'pointer', padding: '2px 0' },
  slider: { width: 90, accentColor: '#7dd3fc' },
}
