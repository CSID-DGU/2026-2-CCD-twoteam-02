// 채널 표시와 바꾸기, 전체 상한 대기 안내 (#442).
// 채널이 1번 하나뿐이면 번호를 보여 주지 않습니다. 사람이 적을 때 괜히 복잡해 보이지 않게 하려는 것입니다.
import { useState } from 'react'
import { channelList, crowdOf, firstEmptyChannel } from './channelLogic'
import type { ChannelInfo, Crowd } from './channelLogic'

const CROWD_COLOR: Record<Crowd, string> = { quiet: '#4ade80', busy: '#f59e0b', full: '#ef4444' }
const BAR_WIDTH = 48

type Props = {
  no: number
  count: number // 내 채널 인원 (나 포함)
  capacity: number
  autoFill: number
  channels: ChannelInfo[]
  onOpen: () => void // 창을 열 때 현황을 다시 받는다
  onChange: (no: number) => void
}

function Bar({ count, autoFill, capacity }: { count: number; autoFill: number; capacity: number }) {
  const ratio = capacity > 0 ? Math.min(1, count / capacity) : 0
  return (
    <span style={barBack}>
      <span style={{ ...barFill, width: BAR_WIDTH * ratio, background: CROWD_COLOR[crowdOf(count, autoFill, capacity)] }} />
    </span>
  )
}

export function ChannelBadge({ no, count, capacity, autoFill, channels, onOpen, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const others = channels.filter((c) => c.no !== no && c.count > 0)
  if (no === 1 && others.length === 0 && !open) {
    // 번호는 숨기되, 다른 채널이 생겼는지 알 수 있게 작은 단추만 둡니다.
    return (
      <button type="button" style={quietButton} aria-label="채널 보기" onClick={() => { setOpen(true); onOpen() }}>
        채널
      </button>
    )
  }
  return (
    <div style={box}>
      <button type="button" style={button} onClick={() => { if (!open) onOpen(); setOpen(!open) }} aria-expanded={open}>
        {no}채널 <Bar count={count} autoFill={autoFill} capacity={capacity} /> {count}/{capacity}
      </button>
      {open && (
        <div style={list}>
          {channelList(channels, no, count).map((c) => (
            <button
              type="button"
              key={c.no}
              style={c.no === no ? mineRow : row}
              disabled={c.no === no || c.count >= capacity}
              onClick={() => { setOpen(false); onChange(c.no) }}
            >
              {c.no}채널 <Bar count={c.count} autoFill={autoFill} capacity={capacity} /> {c.count >= capacity ? '가득 참' : `${c.count}/${capacity}`}
            </button>
          ))}
          <button type="button" style={row} onClick={() => { setOpen(false); onChange(firstEmptyChannel(channels, no)) }}>
            빈 채널로 옮기기
          </button>
        </div>
      )}
    </div>
  )
}

// 전체 상한을 넘어 기다리는 동안 화면 위에 띄웁니다. 자리가 나면 저절로 들어갑니다.
export function ChannelWaiting({ total, totalCapacity }: { total: number; totalCapacity: number }) {
  return (
    <div style={waitingBack} role="status">
      <div style={waitingBox}>
        <strong style={{ fontSize: 18 }}>지금 접속한 사람이 많아요</strong>
        <p style={{ margin: '10px 0 0', lineHeight: 1.5 }}>자리가 나면 저절로 들어가요. 이 화면을 그대로 두세요.</p>
        {totalCapacity > 0 && <p style={{ margin: '8px 0 0', opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>현재 {total}/{totalCapacity}명</p>}
      </div>
    </div>
  )
}

// 따라가거나 부름을 받은 친구가 다른 채널에 있을 때 옮길지 묻습니다 (#442).
export function ChannelFollowAsk({ no, reason, onYes, onNo }: { no: number; reason: 'follow' | 'summon'; onYes: () => void; onNo: () => void }) {
  return (
    <div style={waitingBack} role="dialog" aria-label="채널 옮기기">
      <div style={waitingBox}>
        <strong style={{ fontSize: 16 }}>{reason === 'summon' ? '부른 친구' : '친구'}가 {no}채널에 있어요</strong>
        <p style={{ margin: '10px 0 0', lineHeight: 1.5 }}>{no}채널로 옮겨서 친구 옆으로 갈까요?</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
          <button type="button" style={askYes} onClick={onYes}>{no}채널로 옮기기</button>
          <button type="button" style={askNo} onClick={onNo}>여기 있기</button>
        </div>
      </div>
    </div>
  )
}

const panel: React.CSSProperties = { background: 'rgba(32,35,42,.85)', color: '#fff', font: '13px system-ui, sans-serif', fontVariantNumeric: 'tabular-nums' }
const box: React.CSSProperties = { position: 'fixed', top: 52, left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }
const button: React.CSSProperties = { ...panel, border: 'none', cursor: 'pointer', padding: '6px 12px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6 }
const quietButton: React.CSSProperties = { ...button, position: 'fixed', top: 52, left: '50%', transform: 'translateX(-50%)', zIndex: 10, opacity: 0.75 }
const list: React.CSSProperties = { ...panel, display: 'flex', flexDirection: 'column', gap: 2, padding: 6, borderRadius: 10, maxHeight: '50vh', overflowY: 'auto' }
const row: React.CSSProperties = { background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', font: 'inherit', padding: '6px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }
const mineRow: React.CSSProperties = { ...row, background: 'rgba(255,255,255,.14)', cursor: 'default' }
const barBack: React.CSSProperties = { display: 'inline-block', width: BAR_WIDTH, height: 6, borderRadius: 3, background: 'rgba(255,255,255,.2)', overflow: 'hidden' }
const barFill: React.CSSProperties = { display: 'block', height: '100%' }
const waitingBack: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(10,12,16,.6)' }
const waitingBox: React.CSSProperties = { ...panel, font: '14px system-ui, sans-serif', padding: '20px 24px', borderRadius: 14, textAlign: 'center', maxWidth: 360 }
const askYes: React.CSSProperties = { font: 'inherit', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', background: '#4ade80', color: '#0b1a10', fontWeight: 600 }
const askNo: React.CSSProperties = { font: 'inherit', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', background: 'rgba(255,255,255,.16)', color: '#fff' }
