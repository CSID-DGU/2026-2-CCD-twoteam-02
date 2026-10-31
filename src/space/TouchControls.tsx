// 폰 화면 조작 (#377, #117). 광장·지점에서 터치 기기(useIsTouch)일 때만 띄웁니다.
//
//   왼쪽 아래   조이스틱: 엄지로 끌면 걷기, 끝까지 밀면 달리기 (joystickLogic)
//   오른쪽 화면 끌어서 둘러보기 (1인칭으로 서 있을 때만. 앉아 있으면 좌석 카메라가 화면 끌기를 직접 받음)
//   오른쪽 아래 [E] 상호작용 · [점프] · [시점] 버튼
// 입력은 touchInput 저장소에 넣고 Player·WalkCamera 가 매 프레임 읽습니다(키보드와 같은 자리).
// 노치·홈 바에 가리지 않게 safe-area 여백을 더합니다(앱으로 감쌀 때도 같음).
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import { knobOffset, stickVector } from './joystickLogic'
import { addLook, pressInteract, pressJump, resetTouch, setStick } from './touchInput'

const SIZE = { base: 120, knob: 52, button: 64, small: 52 } // px
const EDGE = 20 // 화면 가장자리에서 띄우는 거리(px)

type Props = {
  look: boolean // 끌어서 둘러보기 영역을 켤지 (1인칭으로 서 있을 때)
  move: boolean // 조이스틱을 보일지 (앉아 있으면 숨김)
  interactLabel?: string // [E] 버튼 글자 (설정에서 바꾼 키)
  onToggleView: () => void
}

export function TouchControls({ look, move, interactLabel = 'E', onToggleView }: Props) {
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const stickPointer = useRef<number | null>(null)
  const lookPointer = useRef<{ id: number; x: number; y: number } | null>(null)

  // 화면을 떠나면 남은 입력을 지움 (다음 화면에서 저절로 걷지 않게)
  useEffect(() => () => resetTouch(), [])

  const stickMove = (e: PointerEvent<HTMLDivElement>) => {
    if (stickPointer.current !== e.pointerId) return
    const r = e.currentTarget.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    setStick(stickVector(dx, dy))
    setKnob(knobOffset(dx, dy))
  }
  const stickEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (stickPointer.current !== e.pointerId) return
    stickPointer.current = null
    setStick({ x: 0, y: 0, run: false })
    setKnob({ x: 0, y: 0 })
  }

  return (
    <>
      {look && (
        <div
          style={styles.lookArea}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            lookPointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
          }}
          onPointerMove={(e) => {
            const p = lookPointer.current
            if (!p || p.id !== e.pointerId) return
            addLook(e.clientX - p.x, e.clientY - p.y)
            lookPointer.current = { ...p, x: e.clientX, y: e.clientY }
          }}
          onPointerUp={() => (lookPointer.current = null)}
          onPointerCancel={() => (lookPointer.current = null)}
        />
      )}
      {move && (
        <div
          style={styles.stick}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            stickPointer.current = e.pointerId
            stickMove(e)
          }}
          onPointerMove={stickMove}
          onPointerUp={stickEnd}
          onPointerCancel={stickEnd}
        >
          <div style={{ ...styles.knob, transform: `translate(${knob.x}px, ${knob.y}px)` }} />
        </div>
      )}
      <div style={styles.buttons}>
        <button type="button" style={styles.small} onPointerDown={(e) => (e.preventDefault(), onToggleView())} aria-label="시점 바꾸기">
          👁
        </button>
        {move && (
          <button type="button" style={styles.small} onPointerDown={(e) => (e.preventDefault(), pressJump())} aria-label="점프">
            ⤴
          </button>
        )}
        <button type="button" style={styles.main} onPointerDown={(e) => (e.preventDefault(), pressInteract())} aria-label="상호작용">
          {interactLabel}
        </button>
      </div>
    </>
  )
}

const safe = (side: 'left' | 'right' | 'bottom') => `calc(${EDGE}px + env(safe-area-inset-${side}))`
const round: CSSProperties = {
  borderRadius: '50%', border: '2px solid rgba(255,255,255,.55)', background: 'rgba(20,22,28,.45)',
  color: '#fff', font: '700 18px system-ui, sans-serif', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
}

const styles: Record<string, CSSProperties> = {
  // 오른쪽 화면 (메뉴·버튼보다 아래, 3D 화면보다 위)
  lookArea: { position: 'fixed', top: 0, bottom: 0, right: 0, left: '45%', zIndex: 5, touchAction: 'none' },
  stick: {
    ...round, position: 'fixed', zIndex: 6, left: safe('left'), bottom: safe('bottom'),
    width: SIZE.base, height: SIZE.base, display: 'grid', placeItems: 'center',
  },
  knob: { width: SIZE.knob, height: SIZE.knob, borderRadius: '50%', background: 'rgba(255,255,255,.7)', pointerEvents: 'none' },
  buttons: {
    position: 'fixed', zIndex: 7, right: safe('right'), bottom: safe('bottom'),
    display: 'flex', alignItems: 'flex-end', gap: 12,
  },
  main: { ...round, width: SIZE.button, height: SIZE.button, fontSize: 22, background: 'rgba(34,197,94,.55)' },
  small: { ...round, width: SIZE.small, height: SIZE.small },
}

