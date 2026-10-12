// 내 공부 기록을 기간으로 읽어 옵니다. study_logs 는 RLS 로 본인 것만 보입니다.
//
// Supabase 는 한 번에 최대 1000줄까지만 돌려주므로, 1000줄씩 나눠 끝까지 읽습니다.
// (5분 조각이라 하루 6시간씩 1년 공부하면 약 2만 6천 줄입니다. 기록이 훨씬 많아지면
//  DB에서 날짜별로 미리 더해 두는 뷰를 만드는 편이 낫습니다.)
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { LogRow } from './recordsLogic'

const PAGE = 1000

type DbRow = { started_at: string; subject_id: number; focused_seconds: number }

export function useStudyLogs(start: Date, end: Date) {
  const startIso = start.toISOString()
  const endIso = end.toISOString()
  const key = `${startIso}|${endIso}`
  // 어느 기간을 읽은 결과인지 같이 둡니다. 기간을 바꾸면 key 가 달라져 "읽는 중"으로 보입니다.
  const [result, setResult] = useState<{ key: string; rows: LogRow[]; error: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const all: LogRow[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('study_logs')
          .select('started_at, subject_id, focused_seconds')
          .gte('started_at', startIso)
          .lt('started_at', endIso)
          .order('started_at')
          .range(from, from + PAGE - 1)
        if (cancelled) return
        if (error) {
          console.error('공부 기록을 불러오지 못했습니다:', error.message)
          setResult({ key: `${startIso}|${endIso}`, rows: [], error: '공부 기록을 불러오지 못했어요. 새로고침해 주세요.' })
          return
        }
        for (const r of (data ?? []) as DbRow[]) {
          all.push({ startedAt: r.started_at, subjectId: r.subject_id, focusedSeconds: r.focused_seconds })
        }
        if (!data || data.length < PAGE) break
      }
      setResult({ key: `${startIso}|${endIso}`, rows: all, error: '' })
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [startIso, endIso])

  const current = result?.key === key ? result : null
  return { rows: current ? current.rows : null, error: current?.error ?? '' } // rows 가 null 이면 읽는 중
}
