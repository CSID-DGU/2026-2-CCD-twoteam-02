// 가방 (B 또는 왼쪽 아래 가방 버튼): 스터디 플래너와 메모장이 들어 있습니다.
//   - 플래너: 꺼내면 화면에 띄워 둠 (어느 화면에서든 그대로, 다시 넣으면 닫힘)
//   - 메모장: 한 장 뜯으면 화면에 붙음. 붙인 메모는 떼서 가방에 넣어 두거나 버릴 수 있음
// 로그인한 화면 어디서나 (App 이 깔아 줌). 띄워 둔 창은 화면 맨 위 층이라 걸으면서도 보입니다.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { PlannerWindow } from './PlannerWindow'
import { StickyNote } from './StickyNote'
import { MEMO_COLORS, useMemos } from './useMemos'
import { HAND, INK, NOTE_COLOR, PRINT, paperSurface } from './paperStyle'
import { getKeymap, keyLabel, useKeymap } from '../menu/keymap'
import { isShortcut } from '../menu/shortcuts'

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

const bagButton: CSSProperties = {
  position: 'fixed', left: 16, bottom: 64, zIndex: 41, pointerEvents: 'auto',
  background: '#7a5534', color: '#fff', border: '2px solid #5a3a22', borderRadius: 12, padding: '6px 12px',
  fontSize: 14, cursor: 'pointer', boxShadow: '0 3px 8px rgba(0,0,0,0.3)', fontFamily: PRINT,
}
const bagPanel: CSSProperties = {
  position: 'fixed', left: 16, bottom: 108, zIndex: 41, pointerEvents: 'auto', width: 270, padding: 14,
  background: '#8a6240', backgroundImage: 'repeating-linear-gradient(90deg, rgba(0,0,0,0.04) 0 2px, transparent 2px 6px)',
  border: '3px solid #5a3a22', borderRadius: 14, color: '#fff', fontFamily: PRINT, boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
}
const item: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.1)', marginTop: 8 }
const small: CSSProperties = { background: 'rgba(255,255,255,0.18)', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 9px', cursor: 'pointer', fontSize: 12 }

export function BagLayer() {
  const [bagOpen, setBagOpen] = useState(false)
  const [planner, setPlanner] = useState(loadOpen)
  const [notice, setNotice] = useState('') // 메모 뜯기 실패 안내
  const { memos, tear, change, remove } = useMemos()
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <b>🎒 내 가방</b>
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

          {notice && <div style={{ marginTop: 8, fontSize: 12, background: 'rgba(0,0,0,0.25)', padding: '6px 8px', borderRadius: 6 }}>{notice}</div>}

          {tucked.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.85 }}>가방에 넣어 둔 메모 {tucked.length}장</div>
              {tucked.map((m) => (
                <div key={m.id} style={{ ...item, marginTop: 5, padding: 5, background: NOTE_COLOR[m.color], color: INK }}>
                  <span style={{ flex: 1, fontFamily: HAND, fontSize: 17, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{m.body || '(빈 메모)'}</span>
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
