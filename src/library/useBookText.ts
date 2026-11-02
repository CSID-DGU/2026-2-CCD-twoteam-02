// 책 본문(public/books/<id>.json)을 펼칠 때 불러옵니다. 실패하면 retry 로 다시 시도.
import { useCallback, useEffect, useState } from 'react'
import { bookUrl } from './catalog'
import { parseBook } from './libraryLogic'
import type { BookText } from './libraryLogic'

type State = { status: 'loading' | 'error' | 'ready'; book: BookText | null }

export function useBookText(id: string) {
  const [state, setState] = useState<State & { key: string }>({ status: 'loading', book: null, key: '' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    const key = `${id}#${attempt}`
    fetch(bookUrl(id))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<unknown>
      })
      .then((raw) => {
        if (!alive) return
        const book = parseBook(raw)
        setState(book ? { status: 'ready', book, key } : { status: 'error', book: null, key })
      })
      .catch((e: unknown) => {
        if (!alive) return
        console.error('책 본문을 불러오지 못했습니다:', e)
        setState({ status: 'error', book: null, key })
      })
    return () => {
      alive = false
    }
  }, [id, attempt])

  const retry = useCallback(() => {
    setState({ status: 'loading', book: null, key: '' })
    setAttempt((a) => a + 1)
  }, [])

  // 책이 바뀐 직후 한 번은 이전 결과를 보여 주지 않도록 key 가 맞을 때만 인정
  const current = state.key === `${id}#${attempt}` ? state : { status: 'loading' as const, book: null }
  return { status: current.status, book: current.book, retry }
}
