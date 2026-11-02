// 책 읽기 창. 손잡이를 끌어 옮기고(FloatingWindow), 본문은 문단 단위 세로 스크롤입니다(쪽 나눔 없음).
//   - 처음 열 때 loan.position 문단으로 스크롤, 스크롤하면 화면 맨 위 문단 번호를 onPosition 으로 보냄
//   - 키보드는 가로채지 않음(이동 키 그대로). 마우스 휠로 본문을 넘기고 글자 선택도 됩니다.
//   - 열 때 받은 loan 값으로 그려, 읽는 동안 기한이 지나도 닫지 않음 (닫으면 가방 목록에서 사라짐)
//   - 한자·옛 맞춤법은 원문 그대로, 시는 문단 안의 줄바꿈(\n)을 pre-line 으로 살림
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { FloatingWindow } from '../planner/FloatingWindow'
import { PRINT } from '../planner/paperStyle'
import { useBookText } from './useBookText'
import { topParagraph } from './libraryLogic'
import type { BookInfo, Loan } from './libraryLogic'

const WIDTH = 440
const SIDE_GAP = 16 // 좁은 화면(폰)에서 창 양옆에 남길 여유 합
const NARROW_PX = WIDTH + SIDE_GAP // 이보다 좁으면 화면 너비에 맞추고 왼쪽 끝에서 시작
const bar: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#7a5b3c', color: '#fff', borderRadius: '8px 8px 0 0', fontFamily: PRINT, fontSize: 13 }
const btn: CSSProperties = { background: 'rgba(255,255,255,0.18)', color: '#fff', border: 'none', borderRadius: 5, padding: '2px 8px', cursor: 'pointer', fontSize: 13 }
const body: CSSProperties = { position: 'relative', height: 'min(60vh, 520px)', overflowY: 'auto', background: '#fbf6ea', color: '#2d2820', padding: '12px 16px', fontSize: 15, lineHeight: 1.85, fontFamily: PRINT, overscrollBehavior: 'contain' }
const note: CSSProperties = { padding: 24, textAlign: 'center', fontSize: 14 }

export function ReaderWindow({ loan, info, onClose, onPosition }: { loan: Loan; info: BookInfo; onClose: () => void; onPosition: (paragraph: number) => void }) {
  const { status, book, retry } = useBookText(info.id)
  const box = useRef<HTMLDivElement>(null)
  const last = useRef(loan.position) // 마지막으로 알린(또는 처음) 문단 번호
  const frame = useRef(0)
  const startPosition = useRef(loan.position) // 열 때의 자리 (이후 loan 이 바뀌어도 처음 한 번만 씀)
  const [viewW, setViewW] = useState(() => window.innerWidth) // 폰 화면 폭에 맞추려고 창 크기 변화를 따라감
  useEffect(() => {
    const onResize = () => setViewW(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const width = Math.min(WIDTH, viewW - SIDE_GAP)
  // 문단 요소는 책이 바뀔 때만 만듦: 읽는 자리가 바뀌어 다시 그려져도 수천 개 <p> 를 비교하지 않게
  const paragraphs = useMemo(
    () => book?.paragraphs.map((p, i) => <p key={i} style={{ margin: '0 0 0.9em', whiteSpace: 'pre-line' }}>{p}</p>) ?? null,
    [book],
  )

  // 본문이 그려지면 읽던 문단으로 스크롤 (처음 한 번)
  useLayoutEffect(() => {
    const el = box.current
    if (!book || !el) return
    const target = el.children[Math.min(startPosition.current, book.paragraphs.length - 1)] as HTMLElement | undefined
    if (target) el.scrollTop = target.offsetTop
  }, [book])

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  // 스크롤은 프레임당 한 번만 계산: 맨 위 문단을 이진 탐색으로 찾고, 바뀌었을 때만 알림
  const onScroll = () => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const el = box.current
      if (!el || !book) return
      const kids = el.children // body 가 position: relative 라 offsetTop 은 본문 맨 위 기준. 끝의 출처 줄은 문단 수에서 뺌
      const i = topParagraph(book.paragraphs.length, (n) => (kids[n] as HTMLElement).offsetTop, el.scrollTop)
      if (i !== last.current) {
        last.current = i
        onPosition(i)
      }
    })
  }

  return (
    <FloatingWindow
      id="reader"
      initial={{ x: viewW < NARROW_PX ? 0.01 : 0.3, y: 0.1 }}
      width={width}
      handle={
        <div style={bar}>
          <span style={{ fontWeight: 700 }}>📖 {info.title}</span>
          <span style={{ opacity: 0.8, fontSize: 12 }}>{info.author}</span>
          <span style={{ flex: 1 }} />
          <button style={btn} onClick={onClose} aria-label="책 덮기">✕</button>
        </div>
      }
    >
      {status === 'ready' && book ? (
        <div ref={box} style={body} onScroll={onScroll}>
          {paragraphs}
          <p style={{ margin: '1.2em 0 0', fontSize: 12, opacity: 0.75, textAlign: 'right' }}>
            <a href={info.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>출처: 위키문헌</a>
          </p>
        </div>
      ) : (
        <div style={{ ...body, ...note }}>
          {status === 'loading' ? (
            '책을 펼치는 중…'
          ) : (
            <>
              <div>책을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</div>
              <button style={{ ...btn, background: '#7a5b3c', marginTop: 10 }} onClick={retry}>다시 시도</button>
            </>
          )}
        </div>
      )}
    </FloatingWindow>
  )
}
