// 바로 앉기 (#116) 화면 조각.
//   QuickSeatControl  광장 화면이 씁니다. 도착 직후 화면 아래에 큰 버튼(배너)을 한 번 보여 주고, 그 뒤로는 메뉴의 "바로 앉기"로 엽니다(startSeq).
//                     누르면: 최애 공간이 있으면 바로 그곳으로, 없으면 공간 고르는 창. 창에서 "다음부터 이 공간으로"를 켜면 계정에 저장됩니다.
//   FavoritePlaceSetting  설정 창(화면·마우스 탭)에서 지금 최애 공간을 보고 지웁니다.
// 이동과 앉기는 useQuickSeat.ts(요청 → 도착한 화면이 빈자리에 앉힘), 고르는 규칙은 quickSeatLogic.ts.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { useOnline } from '../realtime/onlineContext'
import { choosePlace, countByPlace, isValidPlace } from './quickSeatLogic'
import type { QuickPlace } from './quickSeatLogic'
import { useFavoritePlace, useGoQuickSeat } from './useQuickSeat'
import { PLACES } from './places'

const BANNER_SEEN_KEY = 'dooteum.quickSeatBanner' // 이 탭에서 배너를 한 번 보였는지 (sessionStorage: 탭을 닫으면 지워짐)

function seenBanner(): boolean {
  try {
    return sessionStorage.getItem(BANNER_SEEN_KEY) === '1'
  } catch {
    return false
  }
}
function markBanner() {
  try {
    sessionStorage.setItem(BANNER_SEEN_KEY, '1')
  } catch {
    // 저장 못 해도 이번 화면에서는 숨깁니다
  }
}

type Props = {
  myId: string
  startRef: RefObject<(() => void) | null> // 메뉴의 "바로 앉기"가 부를 함수를 여기에 넣어 둡니다 (배너 버튼과 같은 동작)
  banner: boolean // 배너를 보여도 되는 상황인지 (광장에 서 있고 다른 창이 없음)
  onDialogChange: (open: boolean) => void // 고르는 창이 떠 있는 동안 캐릭터 조작을 막으려고 알립니다
}

export function QuickSeatControl({ myId, startRef, banner, onDialogChange }: Props) {
  const online = useOnline()
  const counts = useMemo(() => countByPlace(online, myId), [online, myId])
  const { favorite, loaded, save } = useFavoritePlace()
  const go = useGoQuickSeat()
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(seenBanner)
  const [remember, setRemember] = useState(true)
  useEffect(() => {
    onDialogChange(open)
  }, [open, onDialogChange])

  // 최애가 있으면 묻지 않고 바로, 없으면 고르는 창
  const start = () => {
    setHidden(true)
    markBanner()
    if (loaded && isValidPlace(favorite, PLACES)) {
      const place = choosePlace(favorite, PLACES, counts)
      if (place) go(place)
      return
    }
    setOpen(true)
  }
  // 메뉴의 "바로 앉기"도 같은 동작을 하도록 최신 함수를 ref 에 둡니다
  useEffect(() => {
    startRef.current = start
    return () => {
      startRef.current = null
    }
  })

  const choose = (place: QuickPlace | null) => {
    setOpen(false)
    const target = place ?? choosePlace(null, PLACES, counts)
    if (!target) return
    if (place && remember) void save(place.key)
    go(target)
  }

  return (
    <>
      {banner && !hidden && !open && (
        <div style={styles.banner}>
          <button type="button" style={styles.bigButton} onClick={start}>
            🪑 바로 앉기
          </button>
          <span style={styles.bannerText}>최애 공간의 빈자리에 앉아 바로 공부를 시작해요</span>
          <button
            type="button"
            style={styles.dismiss}
            aria-label="닫기"
            onClick={() => {
              setHidden(true)
              markBanner()
            }}
          >
            ✕
          </button>
        </div>
      )}
      {open && (
        <div style={styles.backdrop} onClick={() => setOpen(false)}>
          <div style={styles.dialog} role="dialog" aria-label="바로 앉을 공간 고르기" onClick={(e) => e.stopPropagation()}>
            <div style={styles.head}>
              <strong>어디에 앉을까요?</strong>
              <button type="button" style={styles.dismiss} aria-label="닫기" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <div style={styles.list}>
              {PLACES.map((p) => {
                const n = counts.get(p.place) ?? 0
                return (
                  <button key={p.key} type="button" style={styles.item} onClick={() => choose(p)}>
                    <span>{p.label}</span>
                    <span style={styles.count}>{n > 0 ? `${n}명` : '비어 있음'}</span>
                  </button>
                )
              })}
            </div>
            <label style={styles.remember}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={styles.check} />
              다음부터 이 공간으로 바로 앉기 (설정에서 지울 수 있어요)
            </label>
            <button type="button" style={styles.anyButton} onClick={() => choose(null)}>
              아무 데나 (사람이 있는 곳부터)
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// 설정 창: 최애 공간 고르기·바꾸기·없애기 (없음이면 바로 앉기를 누를 때 고르는 창이 뜸)
export function FavoritePlaceSetting() {
  const { favorite, loaded, save } = useFavoritePlace()
  const [note, setNote] = useState('')
  const value = isValidPlace(favorite, PLACES) ? (favorite as string) : ''
  return (
    <div style={styles.settingRow}>
      <select
        aria-label="바로 앉기 최애 공간"
        style={styles.select}
        value={value}
        disabled={!loaded}
        onChange={async (e) => {
          setNote(await save(e.target.value === '' ? null : e.target.value))
        }}
      >
        <option value="">{loaded ? '없음 (누를 때 골라요)' : '읽는 중…'}</option>
        {PLACES.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </select>
      {note && <span style={{ color: '#f87171', fontSize: 13 }}>{note}</span>}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  banner: {
    position: 'fixed', bottom: 96, left: '50%', transform: 'translateX(-50%)', zIndex: 12,
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px 10px 10px', borderRadius: 14,
    background: 'rgba(32,35,42,.92)', color: '#fff', font: '14px system-ui, sans-serif', boxShadow: '0 8px 24px rgba(0,0,0,.35)',
  },
  bigButton: {
    padding: '12px 22px', borderRadius: 10, border: 'none', background: '#a78bfa', color: '#1b1e24',
    font: '700 17px system-ui, sans-serif', cursor: 'pointer',
  },
  bannerText: { color: '#d1d5db' },
  dismiss: { border: 'none', background: 'transparent', color: '#aab0bb', cursor: 'pointer', font: '16px system-ui, sans-serif', padding: '4px 6px' },
  backdrop: { position: 'fixed', inset: 0, zIndex: 20, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center' },
  dialog: {
    width: 'min(420px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 64px)', overflow: 'auto', padding: 16, borderRadius: 14,
    background: '#20232a', color: '#fff', font: '14px system-ui, sans-serif', display: 'flex', flexDirection: 'column', gap: 12,
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 16 },
  list: { display: 'flex', flexDirection: 'column', gap: 4 },
  item: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8,
    border: '1px solid #3a3f4b', background: '#16181d', color: '#fff', cursor: 'pointer', font: 'inherit', textAlign: 'left',
  },
  count: { color: '#aab0bb', fontSize: 13, fontVariantNumeric: 'tabular-nums' },
  remember: { display: 'flex', alignItems: 'center', gap: 8, color: '#d1d5db', fontSize: 13, cursor: 'pointer' },
  check: { width: 16, height: 16, accentColor: '#a78bfa', cursor: 'pointer' },
  anyButton: {
    padding: '8px 12px', borderRadius: 8, border: '1px solid #4b5563', background: 'transparent', color: '#fff',
    cursor: 'pointer', font: 'inherit',
  },
  settingRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  select: {
    padding: '4px 8px', borderRadius: 6, border: '1px solid #4b5563', background: '#16181d', color: '#fff',
    font: 'inherit', fontSize: 13, cursor: 'pointer', maxWidth: 220,
  },
}
