// 스터디 플래너 하루 한 장 읽기·쓰기 (planner_pages, 0045). RLS 로 내 것만.
// 쓰면 바로 화면에 보이고, 서버에는 SAVE_DELAY_MS 동안 더 안 쓰면 한 번에 저장합니다(글자마다 저장하지 않게).
// 시간표 자동 칠하기용 집중 구간(study_segments)도 같이 읽고, 오늘 장이면 REFRESH_MS 마다 다시 읽습니다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dayWindow, normalizePlanner, plannerDayOf } from './plannerLogic'
import type { PlannerData } from './plannerLogic'
import { writtenDays } from './notebookLogic'
import type { SegmentKind } from '../study/segmentLogic'

const SAVE_DELAY_MS = 800
const REFRESH_MS = 60_000

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// 이 화면에서 마지막으로 쓴 내용 (날짜별). 쓰고 바로 넘겼다 돌아오면 저장이 서버에 닿기 전에 다시 읽어
// 예전 내용이 뜰 수 있어서, 읽을 때 이 값이 있으면 서버 값 대신 씀(이 브라우저가 쓴 게 가장 새것).
// 계정이 바뀌면 비움 (다른 사람에게 보이지 않게)
const lastWritten = new Map<string, PlannerData>()
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') lastWritten.clear()
})

export function usePlannerPage(day: string) {
  const [loaded, setLoaded] = useState<{ day: string; data: PlannerData } | null>(null)
  const [save, setSave] = useState<SaveState>('idle')
  const pending = useRef<{ day: string; data: PlannerData } | null>(null)
  const timer = useRef<number | null>(null)

  const flush = useCallback(async () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    const p = pending.current
    if (!p) return
    pending.current = null
    setSave('saving')
    const { error } = await supabase.from('planner_pages').upsert({ day: p.day, data: p.data, updated_at: new Date().toISOString() })
    if (error) console.error('플래너를 저장하지 못했습니다:', error.message)
    setSave(error ? 'error' : 'saved')
  }, [])

  useEffect(() => {
    let alive = true
    supabase
      .from('planner_pages')
      .select('data')
      .eq('day', day)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return
        if (error) console.error('플래너를 불러오지 못했습니다:', error.message)
        setLoaded({ day, data: lastWritten.get(day) ?? normalizePlanner(data?.data) })
      })
    return () => {
      alive = false
      void flush() // 다른 날로 넘기거나 닫을 때 쓰던 것 저장
    }
  }, [day, flush])

  const update = useCallback(
    (change: (d: PlannerData) => PlannerData) => {
      setLoaded((cur) => {
        if (!cur || cur.day !== day) return cur
        const next = { day, data: change(cur.data) }
        lastWritten.set(day, next.data)
        pending.current = next
        if (timer.current !== null) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS)
        return next
      })
    },
    [day, flush],
  )

  return { data: loaded?.day === day ? loaded.data : null, update, save }
}

type Seg = { kind: SegmentKind; subjectId: number | null; startedAt: number; endedAt: number }

// 그날(5시~다음 날 5시) 공부 상태 구간. 오늘 장이면 1분마다 다시 읽어 시간표가 따라 칠해짐
export function useDaySegments(day: string) {
  const [rows, setRows] = useState<{ day: string; segs: Seg[] } | null>(null)
  useEffect(() => {
    let alive = true
    const { start, end } = dayWindow(day)
    async function load() {
      const { data, error } = await supabase
        .from('study_segments')
        .select('kind, subject_id, started_at, ended_at')
        .lt('started_at', new Date(end).toISOString())
        .gt('ended_at', new Date(start).toISOString())
        .order('started_at')
        .limit(2000)
      if (!alive) return
      if (error) {
        console.error('공부 기록을 불러오지 못했습니다:', error.message)
        return
      }
      setRows({
        day,
        segs: (data ?? []).map((r) => ({ kind: r.kind as SegmentKind, subjectId: r.subject_id as number | null, startedAt: Date.parse(r.started_at), endedAt: Date.parse(r.ended_at) })),
      })
    }
    void load()
    const live = plannerDayOf(Date.now()) === day ? window.setInterval(() => void load(), REFRESH_MS) : null
    return () => {
      alive = false
      if (live !== null) window.clearInterval(live)
    }
  }, [day])
  return rows?.day === day ? rows.segs : []
}

const PAGE_ROWS = 1000 // Supabase 한 번에 돌려주는 최대 줄 수. 넘으면 나눠서 끝까지 읽음

// 표 하나를 PAGE_ROWS 줄씩 끝까지 읽기
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[] | null> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1)
    if (error) {
      console.error('플래너 쓴 날을 불러오지 못했습니다:', error.message)
      return null
    }
    all.push(...(data ?? []))
    if (!data || data.length < PAGE_ROWS) return all
  }
}

// 노트 더미용 쓴 날 목록 (notebookLogic.writtenDays)과 집중 기록이 있는 날. 플래너를 열 때 한 번 읽고, 넘길 때마다 다시 읽지 않음.
// 오늘이 바뀌면(새벽 5시) 읽어 둔 것으로 다시 계산만 함. 읽는 중이거나 실패하면 null
export function useWrittenDays(today: string): { days: string[]; focusDays: Set<string> } | null {
  const [raw, setRaw] = useState<{ pages: { day: string; data: unknown }[]; focus: number[] } | null>(null)
  useEffect(() => {
    let alive = true
    void (async () => {
      const pages = await readAll<{ day: string; data: unknown }>((a, b) => supabase.from('planner_pages').select('day, data').order('day').range(a, b))
      // 같은 시각 줄이 나눠 읽는 경계에서 빠지거나 겹치지 않게 id 로 한 번 더 정렬
      const segs = await readAll<{ started_at: string }>((a, b) => supabase.from('study_segments').select('started_at').eq('kind', 'focus').order('started_at').order('id').range(a, b))
      if (!alive || !pages || !segs) return
      setRaw({ pages, focus: segs.map((s) => Date.parse(s.started_at)) })
    })()
    return () => {
      alive = false
    }
  }, [])
  return useMemo(() => (raw ? { days: writtenDays(raw.pages, raw.focus, today), focusDays: new Set(raw.focus.map(plannerDayOf)) } : null), [raw, today])
}

// 넘길 때 드러날 옆 장 (읽기 전용, 저장 안 함). day 가 null 이면 읽지 않음
export function usePlannerPeek(day: string | null): PlannerData | null {
  const [loaded, setLoaded] = useState<{ day: string; data: PlannerData } | null>(null)
  useEffect(() => {
    if (!day) return
    let alive = true
    supabase
      .from('planner_pages')
      .select('data')
      .eq('day', day)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return
        if (error) console.error('플래너 옆 장을 불러오지 못했습니다:', error.message)
        setLoaded({ day, data: lastWritten.get(day) ?? normalizePlanner(data?.data) })
      })
    return () => {
      alive = false
    }
  }, [day])
  return day && loaded?.day === day ? loaded.data : null
}
