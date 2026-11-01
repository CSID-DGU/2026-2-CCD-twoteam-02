// 가방 (B 또는 오른쪽 아래 가방 버튼): 스터디 플래너·메모장·시계가 들어 있습니다.
//   - 플래너: 꺼내면 화면에 띄워 둠 (어느 화면에서든 그대로, 다시 넣으면 닫힘)
//   - 메모장: 한 장 뜯으면 화면에 붙음. 붙인 메모는 떼서 가방에 넣어 두거나 버릴 수 있음
// 로그인한 화면 어디서나 (App 이 깔아 줌). 띄워 둔 창은 화면 맨 위 층이라 걸으면서도 보입니다.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { PlannerWindow } from './PlannerWindow'
import { ClockWindow } from './ClockWindow'
import { AlarmRinging } from './AlarmRinging'
import { useClockWatcher } from './useClock'
import { StickyNote } from './StickyNote'
import { MEMO_COLORS, useMemos } from './useMemos'
import { useHandFont } from './useHandFont'
import { HAND, INK, NOTE_COLOR, PRINT, handSize, paperSurface } from './paperStyle'
import { getKeymap, keyLabel, useKeymap } from '../menu/keymap'
import { isShortcut } from '../menu/shortcuts'

// 시계(스톱워치·알람) 꺼냄 여부. 플래너와 같은 방식으로 이 브라우저에 기억
const CLOCK_OPEN_KEY = 'dooteum.clock.open'
const loadClockOpen = () => {
  try {
    return localStorage.getItem(CLOCK_OPEN_KEY) === '1'
  } catch {
    return false
  }
}
const saveClockOpen = (v: boolean) => {
  try {
    localStorage.setItem(CLOCK_OPEN_KEY, v ? '1' : '0')
  } catch {
    // 기억 못 해도 이번엔 그대로
  }
}
const OPEN_KEY = 'dooteum.planner.open'
const loadOpen = () => {
  try {
    return localStorage.getItem(OPEN_KEY) === '1'
  } catch {
    return false
  }
}
const saveOpen = (v: boolean) => {
  try {
    localStorage.setItem(OPEN_KEY, v ? '1' : '0')
  } catch {
    // 기억 못 해도 이번엔 그대로
  }
}

// 오른쪽 아래에 있는 것 (가방이 피해야 함)
//   - 미니맵(걸을 때): 화면 짧은 변의 34%, 최대 300px + 테두리 4px, 가장자리에서 16px (space/Minimap.tsx)
//   - 내 모습 화면(앉았을 때): 200px, 가장자리에서 16px (space/SelfView.tsx) → 위·왼쪽 끝 216px
const MAP_EDGE = 'calc(20px + min(300px, 34vmin))' // 미니맵 위·왼쪽 끝 (가장자리에서)
const GAP = 12 // 미니맵·내 모습 화면과 띄우는 거리

// 가방 색: 민트 누빔 파우치 (스톱워치와 같은 민트, 사용자 B안). 글자는 스톱워치 숫자 색
const BAG = { mint: '#bfe6d4', deep: '#8fcab2', ink: '#2f5d4c', text: '#4a4f63' }
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.45 0 0 0 0 0.38 0 0 0 0 0.35 0 0 0 0.12 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`

// 왼쪽 아래는 채팅 입력창과 겹쳐서 오른쪽 아래로: 미니맵·내 모습 화면 바로 위 (화면이 작으면 미니맵도 작아져 같이 내려옴)
const bagButton: CSSProperties = {
  position: 'fixed', right: 16, bottom: `max(${216 + GAP}px, calc(${MAP_EDGE} + ${GAP}px))`, zIndex: 41, pointerEvents: 'auto',
  background: BAG.mint, color: BAG.ink, border: `2px solid ${BAG.deep}`, borderRadius: 12, padding: '6px 12px',
  fontSize: 14, cursor: 'pointer', boxShadow: '0 3px 8px rgba(0,0,0,0.3), inset 0 -3px 0 rgba(0,0,0,0.08)', fontFamily: PRINT, fontWeight: 700,
}
// 가방 창은 미니맵 왼쪽에 아래부터 열림 (버튼 위로 열면 낮은 화면에서 높이가 모자람).
// 창 폭(270 + 안쪽 여백·테두리 34 = 304)이 들어갈 자리가 없는 좁은 화면이면 미니맵 위에 겹쳐 열림
const bagPanel: CSSProperties = {
  position: 'fixed', right: `max(16px, min(max(${216 + GAP}px, calc(${MAP_EDGE} + ${GAP}px)), calc(100vw - 320px)))`, bottom: 16,
  zIndex: 41, pointerEvents: 'auto', width: 270, padding: 14,
  maxHeight: 'calc(100vh - 66px)', overflowY: 'auto', // 66 = 위아래 여백 32 + 안쪽 여백·테두리 34
  paddingTop: 22, // 위 지퍼 자리
  // 민트 누빔: 대각선 두 방향 흰 선 + 잡티 질감 (스톱워치와 한 세트)
  backgroundColor: BAG.mint,
  backgroundImage: `${GRAIN}, repeating-linear-gradient(45deg, rgba(255,255,255,0.3) 0 1px, transparent 1px 16px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.3) 0 1px, transparent 1px 16px)`,
  border: 'none', borderRadius: 24, color: BAG.text, fontFamily: PRINT,
  boxShadow: '0 10px 24px rgba(0,0,0,0.45), inset 0 -6px 12px rgba(0,0,0,0.08), inset 0 2px 0 rgba(255,255,255,0.5)',
}
// 위쪽 분홍·크림 지퍼
const zipper: CSSProperties = { position: 'absolute', left: 18, right: 18, top: 9, height: 6, borderRadius: 3, background: 'repeating-linear-gradient(90deg, #fffaf0 0 3px, #e9a9b9 3px 6px)', boxShadow: '0 1px 1px rgba(0,0,0,0.12)' }
const item: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.55)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.08)', marginTop: 8 }
const small: CSSProperties = { background: '#fff', color: BAG.text, border: 'none', borderRadius: 999, padding: '3px 10px', cursor: 'pointer', fontSize: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.15)', whiteSpace: 'nowrap' }

export function BagLayer() {
  const [bagOpen, setBagOpen] = useState(false)
  const [planner, setPlanner] = useState(loadOpen)
  const [clock, setClock] = useState(loadClockOpen)
  useClockWatcher() // 시계를 닫아 둬도 알람이 울리게 (숨긴 탭에서도)
  const toggleClock = (v: boolean) => {
    setClock(v)
    saveClockOpen(v)
  }
  const [notice, setNotice] = useState('') // 메모 뜯기 실패 안내
  const { memos, tear, change, remove } = useMemos()
  useHandFont() // 내 손글씨 글씨체를 읽어 화면 전체(플래너·메모)에 적용
  const keymap = useKeymap()
  const togglePlanner = (v: boolean) => {
    setPlanner(v)
    saveOpen(v)
  }

  // B: 가방 열기·닫기 (글 쓰는 중이면 무시). 열면 1인칭 시점 잠금을 풀어 커서가 나오게
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!isShortcut(e) || e.code !== getKeymap().bag) return
      setBagOpen((o) => {
        if (!o && document.pointerLockElement) document.exitPointerLock()
        return !o
      })
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])

  const tucked = memos.filter((m) => !m.shown)
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 40 }}>
      {planner && <PlannerWindow onClose={() => togglePlanner(false)} />}
      {clock && <ClockWindow onClose={() => toggleClock(false)} />}
      <AlarmRinging />
      {memos
        .filter((m) => m.shown)
        .map((m) => (
          <StickyNote key={m.id} memo={m} onChange={(p) => change(m.id, p)} onHide={() => change(m.id, { shown: false })} onRemove={() => void remove(m.id)} />
        ))}

      <button style={bagButton} onClick={() => setBagOpen((o) => !o)} title={`가방 (${keyLabel(keymap.bag)})`}>
        🎒 가방 <span style={{ opacity: 0.7, fontSize: 11 }}>{keyLabel(keymap.bag)}</span>
      </button>
      {bagOpen && (
        <div style={bagPanel}>
          <div style={zipper} aria-hidden />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <b style={{ fontSize: 15 }}>🎒 내 가방</b>
            <button style={small} onClick={() => setBagOpen(false)}>닫기</button>
          </div>

          <div style={item}>
            <div style={{ ...paperSurface(), boxShadow: '0 1px 3px rgba(0,0,0,0.3)', width: 34, height: 46, borderRadius: 2, flex: 'none' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>스터디 플래너</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>오늘 할 일·시간표 (집중 기록이 저절로 칠해져요)</div>
            </div>
            <button style={small} onClick={() => togglePlanner(!planner)}>{planner ? '넣기' : '꺼내기'}</button>
          </div>

          <div style={item}>
            {/* 작은 민트 시계 그림 */}
            <div style={{ position: 'relative', width: 34, height: 34, flex: 'none', borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #d9f2e6, #a9dcc6 60%, #8fcab2)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
              <div style={{ position: 'absolute', inset: 5, borderRadius: '50%', background: '#fffaf0' }} />
              <div style={{ position: 'absolute', left: 13, top: -5, width: 8, height: 6, borderRadius: 2, background: '#f6c9d4' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>스톱워치</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>스톱워치·알람 (닫아 둬도 알람이 울려요)</div>
            </div>
            <button style={small} onClick={() => toggleClock(!clock)}>{clock ? '넣기' : '꺼내기'}</button>
          </div>

          <div style={item}>
            <div style={{ width: 34, height: 34, flex: 'none', background: NOTE_COLOR.yellow, boxShadow: '2px 2px 0 #e6d38a, 4px 4px 0 #d8c47a', borderRadius: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>메모장</div>
              <div style={{ display: 'flex', gap: 5, marginTop: 4 }}>
                {MEMO_COLORS.map((c) => (
                  <button key={c} onClick={() => void tear(c).then((err) => setNotice(err ?? ''))} title="한 장 뜯어 붙이기" style={{ width: 22, height: 22, borderRadius: 3, border: '1px solid rgba(0,0,0,0.2)', background: NOTE_COLOR[c], cursor: 'pointer' }} />
                ))}
                <span style={{ fontSize: 11, opacity: 0.8, alignSelf: 'center' }}>← 눌러서 뜯기</span>
              </div>
            </div>
          </div>

          {notice && <div style={{ marginTop: 8, fontSize: 12, background: 'rgba(255,255,255,0.7)', padding: '6px 8px', borderRadius: 8 }}>{notice}</div>}

          {tucked.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.85 }}>가방에 넣어 둔 메모 {tucked.length}장</div>
              {tucked.map((m) => (
                <div key={m.id} style={{ ...item, marginTop: 5, padding: 5, background: NOTE_COLOR[m.color], color: INK }}>
                  <span style={{ flex: 1, fontFamily: HAND, fontSize: handSize(17), overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{m.body || '(빈 메모)'}</span>
                  <button style={{ ...small, background: 'rgba(0,0,0,0.12)', color: INK }} onClick={() => change(m.id, { shown: true })}>붙이기</button>
                  <button style={{ ...small, background: 'rgba(0,0,0,0.12)', color: INK }} onClick={() => void remove(m.id)}>버리기</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
