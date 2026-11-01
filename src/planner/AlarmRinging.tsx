// 알람이 울릴 때 화면 가운데 뜨는 끄기 창. 시계 창을 닫아 둬도 뜹니다(가방이 깔아 줌).
// 소리가 브라우저에 막혔으면 안내 한 줄. 열릴 때 1인칭 시점 잠금을 풀어 바로 누를 수 있게.
import { useEffect } from 'react'
import { useClock } from './useClock'
import { ringText } from './clockLogic'

export function AlarmRinging() {
  const { state, soundBlocked, dismiss } = useClock()
  const ringing = state.ringing
  useEffect(() => {
    if (ringing && document.pointerLockElement) document.exitPointerLock()
  }, [ringing])
  if (!ringing) return null
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, pointerEvents: 'none' }}>
      <div role="alertdialog" aria-label="알람" style={{ pointerEvents: 'auto', width: 260, borderRadius: 16, padding: 16, background: '#fffaf0', border: '3px solid #a9dcc6', boxShadow: '0 10px 30px rgba(0,0,0,0.45)', textAlign: 'center', fontFamily: 'system-ui, sans-serif', color: '#4a4f63' }}>
        <div style={{ fontSize: 30 }}>⏰</div>
        <div style={{ fontWeight: 700, fontSize: 16, margin: '4px 0' }}>알람</div>
        <div>{ringText(ringing)}</div>
        <button type="button" autoFocus onClick={dismiss} style={{ marginTop: 12, fontSize: 14, padding: '6px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(#f6c9d4, #e9a9b9)', color: '#5a2f3c', fontWeight: 700, cursor: 'pointer' }}>
          끄기
        </button>
        {soundBlocked && <div style={{ marginTop: 8, fontSize: 12, color: '#b4495f' }}>소리가 막혔어요. 아무 데나 한 번 눌러 주세요</div>}
      </div>
    </div>
  )
}
