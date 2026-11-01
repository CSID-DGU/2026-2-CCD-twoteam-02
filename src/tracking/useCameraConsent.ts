// 카메라를 켜기 전 안내를 보여 줄지 (#376). 우리 안내 창 → 시스템(브라우저·앱) 허용 창 순서로 켭니다.
//   ok       이미 허용된 브라우저(권한 상태 granted)이거나, 이 기기에서 한 번 [카메라 켜기]를 누름 → 바로 켬
//   needed   안내 창을 보여 줌
//   checking 권한 상태를 확인하는 중 (잠깐)
// 권한 상태 확인(Permissions API)을 못 하는 브라우저는 이 기기에서 누른 적이 있는지만 봅니다.
import { useEffect, useState } from 'react'

const KEY = 'dooteum.cameraOk'
export type ConsentState = 'checking' | 'needed' | 'ok'

function agreedBefore(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function useCameraConsent(): { state: ConsentState; agree: () => void } {
  const [state, setState] = useState<ConsentState>(() => (agreedBefore() ? 'ok' : 'checking'))

  useEffect(() => {
    if (state !== 'checking') return
    let alive = true
    const fallback = () => alive && setState('needed')
    const perms = navigator.permissions
    if (!perms?.query) {
      fallback()
      return
    }
    perms
      .query({ name: 'camera' as PermissionName })
      .then((r) => alive && setState(r.state === 'granted' ? 'ok' : 'needed'))
      .catch(fallback)
    return () => {
      alive = false
    }
  }, [state])

  const agree = () => {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      // 기억하지 못해도 이번에는 켭니다.
    }
    setState('ok')
  }
  return { state, agree }
}
