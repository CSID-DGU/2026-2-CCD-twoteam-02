// 오버워치식 귓속말 로그창 (#49). 로비·지점 왼쪽 아래에 겹쳐 띄웁니다.
//
// Enter: 채팅창 열기 (마우스 잠금이 풀려 커서가 돌아옴) → 할 말 → Enter 로 보내기
// Tab: 접속 중인 친구를 돌아가며 고르기 / Esc 또는 빈 칸에서 Enter: 닫기
// 열어 두고 10초 동안 아무것도 안 하면 스르륵 사라집니다(적던 글이 있거나 스크롤하는 중이면 기다림).
// 열면 이번 접속의 대화(최대 100줄)를 모두 보여 주고 마우스 휠로 올려 볼 수 있습니다. 줄 끝에 몇 분 전인지 붙입니다(#211).
// 닫혀 있을 때 새 귓속말은 10초 보였다가 스르륵 사라지고, "Enter 귓속말"과 안 읽은 개수만 남습니다.
// 밝은 바닥 위에서도 보이도록 글자 뒤에 어두운 반투명 배경을 깝니다(#211).
// 입력하는 동안에는 WASD·E·V 가 캐릭터를 움직이지 않습니다(입력칸에서 누른 키는 무시).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useChat } from './chatContext'
import type { ChatLine } from './chatContext'
import { MAX_LENGTH, checkMessage, defaultTarget, nextTarget, timeAgo } from './chatLogic'

const SHOW_MS = 10000 // 닫혀 있을 때 새 줄이 보이는 시간
const IDLE_MS = 10000 // 열어 두고 이만큼 아무것도 안 하면 닫힘
const FADE_MS = 800 // 스르륵 사라지는 시간
const AGO_TICK_MS = 30000 // 열어 둔 동안 "몇 분 전"을 다시 계산하는 간격
const CLOSED_LINES = 5 // 닫혀 있을 때 새 줄을 최대 몇 줄까지 띄울지
const BOTTOM_GAP = 24 // 맨 아래에서 이만큼(px) 안이면 "맨 아래를 보는 중"으로 침
const SCROLL_TOUCH_MS = 500 // 스크롤 중에는 이 간격으로 자동 닫힘 시간을 다시 셈
const HUD_BG = 'rgba(32,35,42,.85)' // 오른쪽 위 메뉴·화면 정보 상자와 같은 배경
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
  const logBox = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true) // 맨 아래를 보는 중이면 새 줄이 올 때 따라 내려감
  const lastScrollTouch = useRef(0)
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

  // 열 때는 맨 아래(최근 대화)부터 보여 주고, 새 줄이 오면 따라 내려갑니다.
  // 위로 올려 예전 대화를 보는 중이면 끌어내리지 않습니다.
  useLayoutEffect(() => {
    if (!open) {
      stickToBottom.current = true
      return
    }
    const box = logBox.current
    if (box && stickToBottom.current) box.scrollTop = box.scrollHeight
  }, [open, lineCount])

  // 시계: 닫혀 있을 때는 줄이 사라지도록 1초마다, 열어 둔 동안은 "몇 분 전"을 고치도록 30초마다 돌립니다.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), open ? AGO_TICK_MS : 1000)
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

  // 스크롤하면 맨 아래인지 기억하고, 자동 닫힘 시간을 다시 셉니다(읽는 중에 닫히지 않게).
  const onScroll = () => {
    const box = logBox.current
    if (!box) return
    stickToBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < BOTTOM_GAP
    const t = Date.now()
    if (t - lastScrollTouch.current < SCROLL_TOUCH_MS) return
    lastScrollTouch.current = t
    touch()
  }

  const target = chat.online.find((f) => f.id === chat.target)
  // 열면 대화 전부(스크롤), 닫혀 있으면 방금 온 줄만. 오래된 줄은 투명해졌다가(스르륵) 빠집니다.
  const shown = open
    ? chat.lines
    : chat.lines.filter((l) => now - l.at < SHOW_MS + FADE_MS).slice(-CLOSED_LINES)

  return (
    <div style={{ ...styles.wrap, opacity: fading ? 0 : 1 }}>
      {open ? (
        shown.length > 0 && (
          <div ref={logBox} style={styles.logOpen} onScroll={onScroll}>
            {shown.map((l) => (
              <Line key={l.id} line={l} color={l.peer ? chat.colors[l.peer.id] : undefined} gone={false} ago={timeAgo(l.at, now)} />
            ))}
          </div>
        )
      ) : (
        <div style={styles.log}>
          {/* 닫혀 있을 때는 줄마다 배경을 깔아, 줄이 사라질 때 배경도 같이 사라지게 합니다. */}
          {shown.map((l) => (
            <Line key={l.id} line={l} color={l.peer ? chat.colors[l.peer.id] : undefined} gone={now - l.at >= SHOW_MS} pill />
          ))}
        </div>
      )}

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
              onMouseDown={(e) => e.preventDefault()} // 입력칸 커서를 뺏지 않게
              onClick={() => {
                chat.setQuiet(!chat.quiet) // 공부 중에도 끄고 켤 수 있음 (#216)
                touch()
              }}
              title={chat.studying ? '공부를 시작하면 자동으로 켜져요. 이번 공부 동안 끄고 켤 수 있어요' : '방해금지 켜고 끄기'}
            >
              {chat.quiet ? '🔕 방해금지 켜짐' : '🔔 방해금지 꺼짐'}
            </button>
            {/* 방해금지 중에는 알림음이 나지 않으므로 꺼짐으로 고정해 보여 줍니다. 원래 소리 설정은 그대로 두었다가
                방해금지를 끄면 다시 보여 줍니다. (#220) */}
            <button
              type="button"
              style={{ ...styles.toggle, ...(chat.quiet ? styles.toggleLocked : null) }}
              disabled={chat.quiet}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                chat.setMuted(!chat.muted)
                touch()
              }}
              title={chat.quiet ? '방해금지 중에는 알림음이 나지 않아요' : '알림음 켜고 끄기'}
            >
              {chat.quiet ? '🔇 소리 꺼짐 (방해금지)' : chat.muted ? '🔇 소리 끔' : '🔊 소리 켬'}
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
// ago: 몇 분 전인지 (열었을 때만. 닫혀 있을 때는 새 줄만 10초 보이므로 붙이지 않음)
function Line({ line, color, gone, pill = false, ago }: { line: ChatLine; color?: string; gone: boolean; pill?: boolean; ago?: string }) {
  const style = { ...styles.line, ...(pill ? styles.pill : null), opacity: gone ? 0 : line.quiet ? 0.7 : 1 }
  if (line.kind === 'system') return <div style={{ ...style, ...styles.system }}>{line.text}</div>
  const name = line.peer?.nickname ?? '친구'
  return (
    <div style={{ ...style, color: color ?? WHISPER }}>
      <span style={styles.tag}>{line.kind === 'in' ? '[받음]' : '[보냄]'}</span> <span style={styles.who}>{name}:</span> {line.text}
      {line.quiet && <span style={styles.quietMark}> 🔕</span>}
      {ago && <span style={styles.ago}> · {ago}</span>}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    position: 'fixed', left: 16, bottom: 16, zIndex: 15, width: 'min(380px, calc(100vw - 32px))',
    display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6,
    font: '14px/1.5 system-ui, sans-serif', textAlign: 'left', // 모두 왼쪽 정렬
    transition: `opacity ${FADE_MS}ms ease`,
  },
  log: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, pointerEvents: 'none' },
  logOpen: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
    padding: '8px 10px', borderRadius: 8, background: HUD_BG, maxHeight: '40vh', overflowY: 'auto', pointerEvents: 'auto',
  },
  pill: { padding: '2px 8px', borderRadius: 6, background: HUD_BG },
  line: { textShadow: '0 1px 2px rgba(0,0,0,.8)', overflowWrap: 'anywhere', transition: 'opacity 1s ease' },
  system: { color: '#cbd5e1', fontStyle: 'italic' },
  who: { fontWeight: 700 },
  tag: { opacity: 0.8 },
  quietMark: { fontSize: 11 },
  ago: { color: '#9ca3af', fontSize: 12 },
  inputRow: { display: 'flex', alignItems: 'center', gap: 6, padding: 6, borderRadius: 8, background: HUD_BG },
  chip: { flexShrink: 0, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,.1)', fontWeight: 700, fontSize: 12 },
  input: { flex: 1, minWidth: 0, padding: '4px 6px', border: 'none', outline: 'none', background: 'transparent', color: '#fff', font: 'inherit', textAlign: 'left' },
  bar: { alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 8, background: HUD_BG, pointerEvents: 'none' },
  hint: { color: '#fff', fontSize: 13 },
  badge: { minWidth: 18, padding: '0 6px', borderRadius: 9, background: '#a855f7', color: '#fff', fontSize: 11, fontWeight: 700, textAlign: 'center' },
  controls: { alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: 4, borderRadius: 8, background: HUD_BG },
  toggle: {
    padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,.2)', background: HUD_BG,
    color: '#fff', font: 'inherit', fontSize: 12, cursor: 'pointer',
  },
  toggleLocked: { color: '#9ca3af', cursor: 'default' }, // 방해금지 중이라 누를 수 없는 소리 버튼
}
