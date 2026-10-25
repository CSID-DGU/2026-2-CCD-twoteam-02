// 내 상태 구간(study_segments)을 기간으로 읽어 옵니다. RLS 로 본인 것만 보입니다. (#235)
// 하루 띠에만 쓰므로 enabled 가 false 면(월·년 탭) 읽지 않습니다.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { SegmentRow } from './bandLogic'
import type { SegmentKind } from './segmentLogic'

const PAGE = 1000

type DbRow = { id: number; kind: SegmentKind; subject_id: number; started_at: string; ended_at: string }

export function useStudySegments(start: Date, end: Date, enabled: boolean) {
  const startIso = start.toISOString()
  const endIso = end.toISOString()
  const key = `${startIso}|${endIso}`
  const [result, setResult] = useState<{ key: string; rows: SegmentRow[]; error: string } | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    async function load() {
      const all: SegmentRow[] = []
      for (let from = 0; ; from += PAGE) {
        // 자정을 걸친 구간도 잡히도록 "기간과 겹치는" 구간을 읽습니다. 자르는 것은 bandLogic 에서 합니다.
        const { data, error } = await supabase
          .from('study_segments')
          .select('id, kind, subject_id, started_at, ended_at')
          .lt('started_at', endIso)
          .gt('ended_at', startIso)
          .order('started_at')
          .range(from, from + PAGE - 1)
        if (cancelled) return
        if (error) {
          console.error('상태 구간을 불러오지 못했습니다:', error.message)
          setResult({ key: `${startIso}|${endIso}`, rows: [], error: '공부 흐름을 불러오지 못했어요.' })
          return
        }
        for (const r of (data ?? []) as DbRow[]) {
          all.push({ id: r.id, kind: r.kind, subjectId: r.subject_id, startedAt: Date.parse(r.started_at), endedAt: Date.parse(r.ended_at) })
        }
        if (!data || data.length < PAGE) break
      }
      setResult({ key: `${startIso}|${endIso}`, rows: all, error: '' })
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [startIso, endIso, enabled])

  const current = enabled && result?.key === key ? result : null
  return { rows: current ? current.rows : null, error: current?.error ?? '' } // rows 가 null 이면 읽는 중
}
