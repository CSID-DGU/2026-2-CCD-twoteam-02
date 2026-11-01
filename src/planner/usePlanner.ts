// 스터디 플래너 하루 한 장 읽기·쓰기 (planner_pages, 0048). RLS 로 내 것만.
// 쓰면 바로 화면에 보이고, 서버에는 SAVE_DELAY_MS 동안 더 안 쓰면 한 번에 저장합니다(글자마다 저장하지 않게).
// 시간표 자동 칠하기용 집중 구간(study_segments)도 같이 읽고, 오늘 장이면 REFRESH_MS 마다 다시 읽습니다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dayWindow, normalizePlanner, plannerDayOf } from './plannerLogic'
import type { PlannerData } from './plannerLogic'
import type { SegmentKind } from '../study/segmentLogic'

const SAVE_DELAY_MS = 800
const REFRESH_MS = 60_000

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

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
        setLoaded({ day, data: normalizePlanner(data?.data) })
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
