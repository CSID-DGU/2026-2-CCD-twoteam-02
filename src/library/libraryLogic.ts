// 도서관 책 대여. React·DB 와 무관한 순수 로직입니다. (Node 로 검사)
// 설계: docs/superpowers/specs/2026-11-02-library-books-design.md
//
// 시각은 문자열(ISO)로 받아 Date.parse 로 비교합니다. 기한 시각이 되면 대여가 끝난 것으로 봅니다.
//
//   isActive / activeLoans   지금 빌려 둔 상태인지(반납 안 했고 기한 전)
//   canBorrow                빌릴 수 있는지 ('ok' | 'already' | 'full')
//   daysLeft / dueLabel      남은 날(올림)과 "D-3" 글자
//   booksOfShelf             선반별 책 목록 (null 이면 전체)
//   parseBook                책 본문 JSON 검사 (깨졌으면 null)
//   loanErrorText            대여 실패 때 보여 줄 문장

// 아래 두 값은 DB 함수 borrow_book(0055_book_loans.sql)에도 같은 값(14일·5권)으로 들어 있습니다. 바꾸면 SQL 도 같이 고치세요.
export const LOAN_DAYS = 14 // 대여 기간(일)
export const MAX_LOANS = 5 // 동시에 빌릴 수 있는 권수
export const SHELVES = ['한국 단편', '한국 장편', '시'] as const
export type BookShelf = (typeof SHELVES)[number] // theme.ts 의 Shelf(벽 선반)와 다른 타입

const DAY_MS = 86_400_000

export type Loan = { id: number; bookId: string; dueAt: string; returnedAt: string | null; position: number }
export type BookInfo = { id: string; title: string; author: string; shelf: BookShelf; sourceUrl: string } // sourceUrl: 읽기 화면에 보여 줄 출처 페이지 주소
export type BookText = { id: string; title: string; author: string; paragraphs: string[] }

export const isActive = (loan: Loan, nowMs: number) => loan.returnedAt === null && Date.parse(loan.dueAt) > nowMs

export const activeLoans = (loans: Loan[], nowMs: number) => loans.filter((l) => isActive(l, nowMs))

export function canBorrow(bookId: string, loans: Loan[], nowMs: number): 'ok' | 'already' | 'full' {
  const active = activeLoans(loans, nowMs)
  if (active.some((l) => l.bookId === bookId)) return 'already'
  return active.length >= MAX_LOANS ? 'full' : 'ok'
}

export const daysLeft = (dueAt: string, nowMs: number) => Math.ceil((Date.parse(dueAt) - nowMs) / DAY_MS) // 올림: 남은 동안은 최소 1

export const dueLabel = (dueAt: string, nowMs: number) => `D-${Math.max(0, daysLeft(dueAt, nowMs))}`

export const booksOfShelf = (books: BookInfo[], shelf: BookShelf | null) => (shelf === null ? books : books.filter((b) => b.shelf === shelf))

export function parseBook(raw: unknown): BookText | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || typeof r.title !== 'string' || typeof r.author !== 'string') return null
  if (!Array.isArray(r.paragraphs) || r.paragraphs.length === 0 || !r.paragraphs.every((p) => typeof p === 'string')) return null
  return { id: r.id, title: r.title, author: r.author, paragraphs: r.paragraphs as string[] }
}

export function loanErrorText(code: string | undefined, message: string): string {
  if (code === '23505') return '이미 빌린 책이에요.'
  if (code === 'P0001') return message // DB 함수가 보낸 문장 그대로
  return `책을 빌리지 못했어요: ${message}`
}

// 화면 맨 위에 걸친(또는 처음으로 보이는) 문단 번호. 문단 위치(offsetTop)는 위에서 아래로 늘어나므로 이진 탐색으로 찾습니다.
// 긴 책(문단 수천 개)에서 스크롤마다 모든 문단을 훑지 않으려는 것. 마지막으로 scrollTop 이하에서 시작한 문단을 돌려줍니다.
export function topParagraph(count: number, offsetOf: (i: number) => number, scrollTop: number): number {
  let lo = 0
  let hi = count - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (offsetOf(mid) <= scrollTop) lo = mid
    else hi = mid - 1
  }
  return Math.max(0, lo)
}

// 공부 시작 창에서 `+ 독서` 칩을 권할지: 빌린 책이 있고, 이름이 `독서`인 과목이 (쓰는 것이든 정리한 것이든) 하나도 없을 때.
// 정리해 둔 `독서`가 있으면 새로 만들 때 이름이 겹치므로 권하지 않습니다(과목 관리에서 꺼내 쓰면 됨).
export const READING_SUBJECT = '독서'
export const suggestReadingSubject = (loanCount: number, subjects: { name: string; archivedAt: string | null }[]) =>
  loanCount > 0 && !subjects.some((s) => s.name === READING_SUBJECT)
