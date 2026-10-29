// 오늘의 별자리 운세 창 (#321). 광장 밤하늘에서 별자리를 누르면 뜹니다(어느 별자리를 눌러도 같은 창).
//
// 순위와 문구는 우리가 정합니다(fortuneLogic.ts, 진짜 오하아사 아님).
//   맨 위   내 별자리 카드(생일로 정함): 순위·한 줄 운세·행운의 공부 시간·과목.
//           생일이 없으면 그 자리에서 생일(월·일)을 넣을 수 있습니다. 넣으면 바로 카드와 하늘의 금색이 바뀝니다.
//   아래    1~12위 목록. 줄을 누르면 펼쳐져 행운의 시간·과목이 보이고 다시 누르면 접힙니다.
//           하늘에서 누른 별자리 줄은 처음부터 펼쳐 둡니다. 내 별자리·누른 별자리 줄은 강조합니다.
// 창이 떠 있는 동안 광장은 캐릭터를 멈춥니다(WorldScene). Esc·닫기·바깥 누르기로 닫습니다.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { dailyRanking } from './fortuneLogic'
import type { Fortune } from './fortuneLogic'
import { SIGNS, signOfBirthday } from './starLogic'
import { BirthdayInput } from '../profile/BirthdayInput'
import { useMyBirthday } from '../profile/useMyBirthday'
import type { Birthday } from '../profile/useMyBirthday'

const nameOf = (id: string) => SIGNS.find((s) => s.id === id)?.name ?? id

export function FortunePanel({ picked, myId, onClose }: { picked: string; myId: string | null; onClose: () => void }) {
  // 오늘 순위는 창을 열 때 한 번 정합니다. (열어 둔 채 자정을 넘겨도 바뀌지 않음)
  const [today] = useState(() => dailyRanking(Date.now()))
  const { birthday, loading, save } = useMyBirthday(myId)
  const mySign = birthday ? signOfBirthday(birthday.month, birthday.day) : null
  const mine = today.ranks.find((r) => r.sign === mySign)
  const [open, setOpen] = useState<Set<string>>(() => new Set([picked]))
  const toggle = (sign: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(sign)) next.delete(sign)
      else next.add(sign)
      return next
    })

  // 창을 열면 마우스 잠금을 풀어 버튼을 누를 수 있게 하고, Esc 로 닫습니다.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    if (document.pointerLockElement) document.exitPointerLock()
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>✦ 오늘의 별자리 운세 · {today.label}</span>
          <button type="button" style={styles.close} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        {mine ? <MyCard f={mine} /> : !loading && <AskBirthday save={save} />}

        <ol style={styles.list}>
          {today.ranks.map((r) => {
            const expanded = open.has(r.sign)
            const isMine = r.sign === mySign
            const isPicked = r.sign === picked
            return (
              <li key={r.sign}>
                <button
                  type="button"
                  style={{ ...styles.row, ...(isMine ? styles.rowMine : isPicked ? styles.rowPicked : null) }}
                  onClick={() => toggle(r.sign)}
                  aria-expanded={expanded}
                >
                  <span style={styles.rank}>{r.rank === 1 ? '👑' : `${r.rank}위`}</span>
                  <span style={styles.name}>
                    {nameOf(r.sign)}
                    {isMine ? ' (나)' : ''}
                  </span>
                  <span style={styles.text}>{r.text}</span>
                  <span style={styles.chevron}>{expanded ? '▴' : '▾'}</span>
                </button>
                {expanded && (
                  <div style={styles.more}>
                    행운의 공부 시간 <b>{r.luckyTime}</b> · 행운의 과목 <b>{r.luckySubject}</b>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
        <p style={styles.note}>매일 서울 자정에 바뀌어요. 재미로 보는 운세예요. 줄을 누르면 자세히 볼 수 있어요.</p>
      </div>
    </div>
  )
}

// 내 별자리 카드
function MyCard({ f }: { f: Fortune }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardSub}>내 별자리</div>
      <div style={styles.cardRank}>
        {f.rank === 1 ? '👑 ' : ''}
        {f.rank}위 {nameOf(f.sign)}
      </div>
      <div style={styles.cardText}>{f.text}</div>
      <div style={styles.lucky}>
        행운의 공부 시간 <b>{f.luckyTime}</b> · 행운의 과목 <b>{f.luckySubject}</b>
      </div>
    </div>
  )
}

// 생일이 없을 때: 그 자리에서 넣기
function AskBirthday({ save }: { save: (b: Birthday | null) => Promise<string | null> }) {
  const [draft, setDraft] = useState<Birthday | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!draft || busy) return
    setBusy(true)
    const message = await save(draft)
    setBusy(false)
    setError(message ?? '')
  }
  return (
    <div style={styles.card}>
      <div style={styles.cardText}>생일을 넣으면 내 별자리 운세를 맨 위에서 볼 수 있어요. 하늘에서도 내 별자리가 금색으로 빛나요.</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <BirthdayInput value={draft} onChange={setDraft} />
        <button type="button" style={styles.save} onClick={() => void submit()} disabled={!draft || busy}>
          {busy ? '…' : '저장'}
        </button>
      </div>
      <div style={styles.lucky}>양력 월·일만 받아요. 태어난 해는 받지 않고, 나만 볼 수 있어요. 내 프로필 계정 탭에서 바꿀 수 있어요.</div>
      {error && <div style={{ color: '#fca5a5', fontSize: 13 }}>{error}</div>}
    </div>
  )
}

const GOLD = '#ffd27a'
const styles: Record<string, CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, zIndex: 30, display: 'grid', placeItems: 'center', background: 'rgba(5,10,30,.55)' },
  panel: {
    width: 'min(460px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', padding: 20, borderRadius: 14,
    background: 'rgba(16,22,48,.96)', color: '#fff', font: '14px/1.5 system-ui, sans-serif', boxShadow: '0 8px 32px rgba(0,0,0,.5)',
    border: '1px solid rgba(255,210,122,.35)',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 16, fontWeight: 700, color: GOLD },
  close: { border: 'none', background: 'transparent', color: '#cbd5e1', fontSize: 18, cursor: 'pointer' },
  card: { display: 'grid', gap: 6, padding: 14, borderRadius: 10, background: 'rgba(255,210,122,.12)', marginBottom: 14 },
  cardSub: { fontSize: 12, color: GOLD, opacity: 0.85 },
  cardRank: { fontSize: 20, fontWeight: 800, color: GOLD },
  cardText: { fontSize: 15 },
  lucky: { fontSize: 13, color: '#cbd5e1' },
  save: { padding: '4px 12px', borderRadius: 6, border: 'none', background: GOLD, color: '#1a1405', fontWeight: 700, cursor: 'pointer' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 },
  row: {
    width: '100%', display: 'grid', gridTemplateColumns: '40px 86px 1fr 14px', gap: 8, alignItems: 'baseline', padding: '5px 6px',
    borderRadius: 6, border: 'none', background: 'transparent', color: '#fff', font: 'inherit', textAlign: 'left', cursor: 'pointer',
  },
  rowMine: { background: 'rgba(255,210,122,.2)' },
  rowPicked: { background: 'rgba(159,196,255,.15)' },
  rank: { fontWeight: 700, color: GOLD },
  name: { fontWeight: 600 },
  text: { fontSize: 12, color: '#cbd5e1' },
  chevron: { fontSize: 11, color: '#94a3b8' },
  more: { margin: '0 6px 4px 54px', fontSize: 12, color: '#e2e8f0' },
  note: { margin: '12px 0 0', fontSize: 12, color: '#94a3b8' },
}
