// 오버워치식 귓속말 로그창 (#49). 로비·지점 왼쪽 아래에 겹쳐 띄웁니다.
//
// Enter: 채팅창 열기 (마우스 잠금이 풀려 커서가 돌아옴) → 할 말 → Enter 로 보내기
// Tab: 접속 중인 친구를 돌아가며 고르기 / Esc 또는 빈 칸에서 Enter: 닫기
// 열어 두고 10초 동안 아무것도 안 하면 스르륵 사라집니다(적던 글이 있으면 기다림).
// 닫혀 있을 때 새 귓속말은 10초 보였다가 스르륵 사라지고, "Enter 귓속말"과 안 읽은 개수만 남습니다.
// 입력하는 동안에는 WASD·E·V 가 캐릭터를 움직이지 않습니다(입력칸에서 누른 키는 무시).
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useChat } from './chatContext'
import type { ChatLine } from './chatContext'
import { MAX_LENGTH, checkMessage, defaultTarget, nextTarget } from './chatLogic'

const SHOW_MS = 10000 // 닫혀 있을 때 새 줄이 보이는 시간
const IDLE_MS = 10000 // 열어 두고 이만큼 아무것도 안 하면 닫힘
const FADE_MS = 800 // 스르륵 사라지는 시간
const CLOSED_LINES = 5 // 닫혀 있을 때 최대 줄 수
const OPEN_LINES = 14 // 열었을 때 보이는 줄 수
const WHISPER = '#d8b4fe' // 아직 이야기하지 않은 친구의 색 (처음 주고받으면 친구마다 색이 정해짐)

export function ChatOverlay() {
  const chat = useChat()
  const [open, setOpen] = useState(false)
  const [fading, setFading] = useState(false) // 열린 창이 사라지는 중
  const [activity, setActivity] = useState(0) // 무언가 할 때마다 올라감 (사라지기 시간 다시 세기)
  const [draft, setDraft] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [sending, setSending] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const chatRef = useRef(chat) // Enter 처리(한 번 등록)에서 최신 값을 읽기 위해
  useEffect(() => {
    chatRef.current = chat
  })

  // 화면에 채팅창이 있다고 알립니다. (프로필 창의 귓속말 버튼은 채팅창이 있는 로비·지점에서만 보임)
  const setHasOverlay = chat?.setHasOverlay
  useEffect(() => {
    setHasOverlay?.(true)
    return () => setHasOverlay?.(false)
  }, [setHasOverlay])

  // 프로필 창에서 "귓속말"을 누르면 그 친구가 골라진 채 열립니다.
  // (렌더 중에 이전 값과 비교해 상태를 고치는 React 권장 방식. 효과에서 setState 하지 않으려고)
  const openKey = chat?.openKey ?? 0
  const [seenOpenKey, setSeenOpenKey] = useState(openKey)
  if (openKey !== seenOpenKey) {
    setSeenOpenKey(openKey)
    setOpen(true)
    setFading(false)
    setActivity((a) => a + 1)
  }

  const close = useCallback(() => {
    setOpen(false)
    setFading(false)
    setDraft('')
    input.current?.blur()
    setNow(Date.now())
  }, [])

  // Enter 로 열기. 다른 입력칸·버튼에서 누른 Enter 는 그쪽 것이라 두지 않습니다.
  useEffect(() => {
    if (!chat?.enabled || open) return
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Enter' || e.isComposing) return
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLButtonElement || t instanceof HTMLSelectElement) return
      e.preventDefault()
      if (document.pointerLockElement) document.exitPointerLock()
      // 받는 친구를 미리 골라 둡니다: 지금 고른 친구 → 마지막으로 귓속말한 친구 → 첫 친구
      const c = chatRef.current
      if (c) {
        const pick = defaultTarget(c.target, c.lastFrom, c.online)
        if (pick !== c.target) c.setTarget(pick)
        c.refreshFriends() // 로그인 뒤 새로 생긴 친구도 보이게 친구 목록을 다시 읽음
      }
      setOpen(true)
      setFading(false)
      setActivity((a) => a + 1)
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [chat?.enabled, open])

  // 열면 입력칸에 커서를 두고, 열려 있는 동안 온 귓속말은 읽은 것으로 칩니다.
  const unread = chat?.unread ?? 0
  const markRead = chat?.markRead
  useEffect(() => {
    if (!open) return
    input.current?.focus()
    if (unread > 0) markRead?.()
  }, [open, unread, markRead])

  // 열어 두고 10초 동안 아무것도 안 하면 스르륵 닫습니다. 적던 글이 있거나 새 줄이 오면 다시 셉니다.
  const lineCount = chat?.lines.length ?? 0
  useEffect(() => {
    if (!open || draft.trim()) return
    const id = setTimeout(() => setFading(true), IDLE_MS)
    return () => clearTimeout(id)
  }, [open, draft, activity, lineCount])
  useEffect(() => {
    if (!fading) return
    const id = setTimeout(close, FADE_MS)
    return () => clearTimeout(id)
  }, [fading, close])

  // 닫혀 있을 때 줄이 사라지도록 1초마다 시계를 돌립니다.
  useEffect(() => {
    if (open) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [open])

  if (!chat?.enabled) return null

  const touch = () => {
    setActivity((a) => a + 1)
    setFading(false)
  }

  const submit = async () => {
    const checked = checkMessage(draft, chat.target, chat.online)
    if (!checked.ok) {
      if (checked.error) chat.note(checked.error)
      else close() // 빈 칸에서 Enter: 닫기
      return
    }
    setSending(true)
    const error = await chat.send(checked.to, checked.text)
    setSending(false)
    if (error) {
      chat.note(error)
      return
    }
    setDraft('')
  }

  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    touch()
    if (e.nativeEvent.isComposing) return // 한글 조합 중 Enter 는 글자 확정용
    if (e.key === 'Enter') {
      e.preventDefault()
      if (!sending) void submit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const next = nextTarget(chat.target, chat.online)
      if (next) chat.setTarget(next)
      else chat.note('지금 접속한 친구가 없어요.')
    }
  }

  const target = chat.online.find((f) => f.id === chat.target)
  // 닫혀 있을 때는 최근 줄만, 오래된 줄은 투명해졌다가(스르륵) 빠집니다.
  const shown = open
    ? chat.lines.slice(-OPEN_LINES)
    : chat.lines.filter((l) => now - l.at < SHOW_MS + FADE_MS).slice(-CLOSED_LINES)

  return (
    <div style={{ ...styles.wrap, opacity: fading ? 0 : 1 }}>
      <div style={{ ...styles.log, ...(open ? styles.logOpen : null) }}>
        {shown.map((l) => (
          <Line key={l.id} line={l} color={l.peer ? chat.colors[l.peer.id] : undefined} gone={!open && now - l.at >= SHOW_MS} />
        ))}
      </div>

      {open ? (
        <>
          <div style={styles.inputRow}>
            <span
              style={{ ...styles.chip, color: (target && chat.colors[target.id]) || WHISPER }}
              title="Tab: 받는 친구 바꾸기"
            >
              {target ? `${target.nickname}에게` : '받는 친구 없음'}
            </span>
            <input
              ref={input}
              id="chat-input"
              style={styles.input}
              value={draft}
              maxLength={MAX_LENGTH}
              placeholder="할 말을 적고 Enter · Tab 친구 바꾸기 · Esc 닫기"
              onChange={(e) => {
                setDraft(e.target.value)
                touch()
              }}
              onKeyDown={onKey}
              aria-label="귓속말 입력"
            />
          </div>
          <div style={styles.controls}>
            <button
              type="button"
              style={styles.toggle}
              disabled={chat.studying} // 공부 중에는 자동으로 켜져 있고 끌 수 없습니다.
              onMouseDown={(e) => e.preventDefault()} // 입력칸 커서를 뺏지 않게
              onClick={() => {
                chat.setManualQuiet(!chat.manualQuiet)
                touch()
              }}
              title={chat.studying ? '공부 중에는 자동으로 방해금지예요' : '방해금지 켜고 끄기'}
            >
              {chat.quiet ? '🔕 방해금지 켜짐' : '🔔 방해금지 꺼짐'}
            </button>
            <button
              type="button"
              style={styles.toggle}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                chat.setMuted(!chat.muted)
                touch()
              }}
              title="알림음 켜고 끄기"
            >
              {chat.muted ? '🔇 소리 끔' : '🔊 소리 켬'}
            </button>
            <span style={styles.hint}>접속한 친구 {chat.online.length}명</span>
          </div>
        </>
      ) : (
        <div style={styles.bar}>
          <span style={styles.hint}>💬 Enter 귓속말</span>
          {chat.unread > 0 && <span style={styles.badge}>{chat.unread}</span>}
          {chat.quiet && <span style={styles.hint}>🔕 방해금지{chat.studying ? ' (공부 중)' : ''}</span>}
        </div>
      )}
    </div>
  )
}

// 받은 줄은 [받음], 보낸 줄은 [보냄] 태그로 방향을 보여 줍니다(오버워치식). 그 친구와의 줄은 모두 같은 색입니다.
function Line({ line, color, gone }: { line: ChatLine; color?: string; gone: boolean }) {
  const style = { ...styles.line, opacity: gone ? 0 : line.quiet ? 0.7 : 1 }
  if (line.kind === 'system') return <div style={{ ...style, ...styles.system }}>{line.text}</div>
  const name = line.peer?.nickname ?? '친구'
  return (
    <div style={{ ...style, color: color ?? WHISPER }}>
      <span style={styles.tag}>{line.kind === 'in' ? '[받음]' : '[보냄]'}</span> <span style={styles.who}>{name}:</span> {line.text}
      {line.quiet && <span style={styles.quietMark}> 🔕</span>}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    position: 'fixed', left: 16, bottom: 16, zIndex: 15, width: 'min(380px, calc(100vw - 32px))',
    display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6,
    font: '13px/1.5 system-ui, sans-serif', textAlign: 'left', // 모두 왼쪽 정렬
    transition: `opacity ${FADE_MS}ms ease`,
  },
  log: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, pointerEvents: 'none' },
  logOpen: { padding: '8px 10px', borderRadius: 8, background: 'rgba(20,22,27,.72)', maxHeight: '40vh', overflowY: 'auto', pointerEvents: 'auto' },
  line: { textShadow: '0 1px 2px rgba(0,0,0,.8)', overflowWrap: 'anywhere', transition: 'opacity 1s ease' },
  system: { color: '#cbd5e1', fontStyle: 'italic' },
  who: { fontWeight: 700 },
  tag: { opacity: 0.8 },
  quietMark: { fontSize: 11 },
  inputRow: { display: 'flex', alignItems: 'center', gap: 6, padding: 6, borderRadius: 8, background: 'rgba(20,22,27,.85)' },
  chip: { flexShrink: 0, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,.1)', fontWeight: 700, fontSize: 12 },
  input: { flex: 1, minWidth: 0, padding: '4px 6px', border: 'none', outline: 'none', background: 'transparent', color: '#fff', font: 'inherit', textAlign: 'left' },
  bar: { display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none' },
  hint: { color: 'rgba(255,255,255,.75)', fontSize: 12, textShadow: '0 1px 2px rgba(0,0,0,.8)' },
  badge: { minWidth: 18, padding: '0 6px', borderRadius: 9, background: '#a855f7', color: '#fff', fontSize: 11, fontWeight: 700, textAlign: 'center' },
  controls: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  toggle: {
    padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,.2)', background: 'rgba(20,22,27,.8)',
    color: '#fff', font: 'inherit', fontSize: 12, cursor: 'pointer',
  },
}
