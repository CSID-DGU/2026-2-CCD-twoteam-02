// 바로 앉기 (#116) 화면 조각.
//   QuickSeatControl  광장 화면이 씁니다. 바깥 공간(캠리단길·캠빛 대학교·캠빛 해변)에 서 있는 동안 화면 아래에 큰 버튼(배너)을 늘 보여 줍니다. "접기"로 접으면 작은 버튼만 남고, 누르면 다시 펴집니다. 메뉴의 "바로 앉기"로도 엽니다.
//                     누르면: 최애 공간이 있으면 바로 그곳으로, 없으면 공간 고르는 창. 창에서 "다음부터 이 공간으로"를 켜면 계정에 저장됩니다.
//   FavoritePlaceSetting  최애 공간을 고르고 지우는 목록. 배너의 안내 글 뒤와 설정 창(화면·마우스 탭)에 같이 씁니다.
// 이동과 앉기는 useQuickSeat.ts(요청 → 도착한 화면이 빈자리에 앉힘), 고르는 규칙은 quickSeatLogic.ts.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { useOnline } from '../realtime/onlineContext'
import { choosePlace, countByKey, countByPlace, isValidPlace } from './quickSeatLogic'
import type { QuickPlace } from './quickSeatLogic'
import { useFavoritePlace, useGoQuickSeat, useOutsideSeated } from './useQuickSeat'
import { OUTSIDE_SLUGS, PLACES, PLACE_GROUPS } from './places'

// 꺾쇠 화살표(⌄·⌃)를 글자 대신 선으로 그립니다. 글자 화살표는 글꼴·OS마다 모양과 굵기가 달라서 (#616)
const CHEVRON_PATH = 'M3 5.5l4 4 4-4' // 14×14 칸 안의 아래쪽 꺾쇠
function Chevron({ up = false, color = 'currentColor' }: { up?: boolean; color?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" style={{ display: 'block', transform: up ? 'rotate(180deg)' : undefined }}>
      <path d={CHEVRON_PATH} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
// <select> 오른쪽에 깔 같은 모양의 꺾쇠 (CSS 배경 그림이라 SVG 를 글자로 넣음)
const SELECT_CHEVRON = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 14 14'><path d='${CHEVRON_PATH}' fill='none' stroke='#aab0bb' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/></svg>`,
)}")`

const FOLDED_KEY = 'dooteum.quickSeatFolded' // 배너를 접어 두었는지 (sessionStorage: 다른 공간으로 옮겨도 접힌 채로, 탭을 닫으면 지워짐)

function readFolded(): boolean {
  try {
    return sessionStorage.getItem(FOLDED_KEY) === '1'
  } catch {
    return false
  }
}
function writeFolded(on: boolean) {
  try {
    if (on) sessionStorage.setItem(FOLDED_KEY, '1')
    else sessionStorage.removeItem(FOLDED_KEY)
  } catch {
    // 저장 못 해도 이번 화면에서는 그대로 접고 폅니다
  }
}

type Props = {
  myId: string
  startRef: RefObject<(() => void) | null> // 메뉴의 "바로 앉기"가 부를 함수를 여기에 넣어 둡니다 (배너 버튼과 같은 동작)
  banner: boolean // 배너를 보여도 되는 상황인지 (바깥 공간에 서 있고 다른 창이 없음)
  onDialogChange: (open: boolean) => void // 고르는 창이 떠 있는 동안 캐릭터 조작을 막으려고 알립니다
}

export function QuickSeatControl({ myId, startRef, banner, onDialogChange }: Props) {
  const online = useOnline()
  const onlineCounts = useMemo(() => countByPlace(online, myId), [online, myId]) // 있는 곳(월드·지점)마다 접속한 사람 수
  const { favorite, loaded, save } = useFavoritePlace()
  const go = useGoQuickSeat()
  const [open, setOpen] = useState(false)
  // 줄마다 보여 줄 인원. 바깥 공부 자리는 돌아다니는 사람이 아니라 그 자리에 앉은 사람만 셉니다(창을 열 때 다시 읽음)
  const seated = useOutsideSeated(OUTSIDE_SLUGS, open)
  const counts = useMemo(() => countByKey(PLACES, onlineCounts, seated), [onlineCounts, seated])
  const [folded, setFoldedState] = useState(readFolded) // 접어 두었는지 (작은 버튼만 보임)
  const setFolded = (on: boolean) => {
    setFoldedState(on)
    writeFolded(on)
  }
  const [remember, setRemember] = useState(true)
  useEffect(() => {
    onDialogChange(open)
  }, [open, onDialogChange])

  // 최애가 있으면 묻지 않고 바로, 없으면 고르는 창
  const start = () => {
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
      {banner && !open && folded && (
        <button type="button" style={styles.folded} aria-label="바로 앉기 펴기" onClick={() => setFolded(false)}>
          바로 앉기 <Chevron up />
        </button>
      )}
      {banner && !open && !folded && (
        <div style={styles.banner}>
          <button type="button" style={styles.bigButton} onClick={start}>
            바로 앉기
          </button>
          <span style={styles.bannerText}>최애 공간의 빈자리에 앉아 바로 공부를 시작해요</span>
          {/* 최애 공간을 설정까지 가지 않고 여기서 바로 고릅니다. 고르기만 하고, 앉는 것은 "바로 앉기"를 눌러야 합니다 */}
          <FavoritePlaceSetting />
          {/* 접기: 옆의 최애 공간 고르기(⌄)와 헷갈리지 않게 화살표 대신 글자 버튼 (#616) */}
          <button type="button" style={styles.fold} title="배너 접기" onClick={() => setFolded(true)}>
            접기
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
            {/* 구역(캠리단길·캠빛 대학교·캠빛 해변)별로 묶어 보여 줍니다. 인원은 구역 이름 옆에 합쳐서도 보여 줌 */}
            {PLACE_GROUPS.map((g) => {
              const total = [...new Set(g.places.map((p) => p.place))].reduce((sum, place) => sum + (onlineCounts.get(place) ?? 0), 0) // 구역 합계는 그 구역에 있는 사람 모두(돌아다니는 사람 포함). 벤치·캠프파이어는 같은 장소라 한 번만 셈
              return (
                <section key={g.area} style={styles.group}>
                  <div style={styles.groupHead}>
                    <span>{g.area}</span>
                    {total > 0 && <span style={styles.count}>{total}명</span>}
                  </div>
                  <div style={styles.list}>
                    {g.places.map((p) => {
                      const n = counts.get(p.key) // 바깥 자리는 DB 에서 읽기 전이면 없음 (인원을 비워 둠)
                      return (
                        <button key={p.key} type="button" style={styles.item} onClick={() => choose(p)}>
                          <span>{p.short}</span>
                          <span style={styles.count}>{n === undefined ? '' : n > 0 ? `${n}명` : '비어 있음'}</span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
            <label style={styles.remember}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={styles.check} />
              다음부터 이 공간으로 바로 앉기 (설정에서 바꿀 수 있어요)
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

// 최애 공간 고르기·바꾸기. 한 번 고르면 다른 공간으로 바꿀 수만 있고 비울 수는 없습니다.
// 아직 고른 적이 없으면 "공간 고르기"가 보이고(목록에는 안 나옴), 그동안은 바로 앉기를 누를 때 고르는 창이 뜹니다.
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
          if (e.target.value === '') return
          setNote(await save(e.target.value))
        }}
      >
        {/* 고른 공간이 없을 때만 보이는 자리 표시. disabled·hidden 이라 펼친 목록에서는 고를 수 없습니다 */}
        {value === '' && (
          <option value="" disabled hidden>
            {loaded ? '공간 고르기' : '읽는 중…'}
          </option>
        )}
        {PLACE_GROUPS.map((g) => (
          <optgroup key={g.area} label={g.area}>
            {g.places.map((p) => (
              <option key={p.key} value={p.key}>
                {p.short}
              </option>
            ))}
          </optgroup>
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
    // 좁은 화면(폰)에서는 줄을 바꿔, 안내 글이 한 글자 폭으로 눌려 세로로 늘어서지 않게 합니다 (#616)
    flexWrap: 'wrap', justifyContent: 'center', width: 'max-content', maxWidth: 'calc(100vw - 24px)', boxSizing: 'border-box',
    background: 'rgba(32,35,42,.92)', color: '#fff', font: '14px system-ui, sans-serif', boxShadow: '0 8px 24px rgba(0,0,0,.35)',
  },
  bigButton: {
    padding: '12px 22px', borderRadius: 10, border: 'none', background: '#a78bfa', color: '#1b1e24',
    font: '700 17px system-ui, sans-serif', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  bannerText: { color: '#d1d5db', flex: '1 1 160px' },
  folded: {
    position: 'fixed', bottom: 96, left: '50%', transform: 'translateX(-50%)', zIndex: 12,
    padding: '6px 14px', borderRadius: 999, border: 'none', background: 'rgba(32,35,42,.92)', color: '#c4b5fd',
    font: '700 13px system-ui, sans-serif', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,.3)',
    display: 'flex', alignItems: 'center', gap: 6,
  },
  fold: {
    height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid #4b5563', background: 'transparent', color: '#d1d5db',
    font: '13px system-ui, sans-serif', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
  },
  dismiss: { border: 'none', background: 'transparent', color: '#aab0bb', cursor: 'pointer', font: '16px system-ui, sans-serif', padding: '4px 6px' },
  backdrop: { position: 'fixed', inset: 0, zIndex: 20, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center' },
  dialog: {
    width: 'min(420px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 64px)', overflow: 'auto', padding: 16, borderRadius: 14,
    background: '#20232a', color: '#fff', font: '14px system-ui, sans-serif', display: 'flex', flexDirection: 'column', gap: 12,
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 16 },
  list: { display: 'flex', flexDirection: 'column', gap: 4 },
  group: { display: 'flex', flexDirection: 'column', gap: 6 },
  groupHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', color: '#c4b5fd', fontSize: 13, fontWeight: 700, padding: '0 2px' },
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
  // 브라우저 기본 화살표를 숨기고(appearance: none) 오른쪽에 같은 꺾쇠를 그려 넣습니다 (#616)
  select: {
    appearance: 'none', WebkitAppearance: 'none', height: 32, padding: '0 30px 0 10px', borderRadius: 8,
    border: '1px solid #4b5563', backgroundColor: '#16181d', backgroundImage: SELECT_CHEVRON, backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center', color: '#fff', font: 'inherit', fontSize: 13, cursor: 'pointer', maxWidth: 220,
  },
}
