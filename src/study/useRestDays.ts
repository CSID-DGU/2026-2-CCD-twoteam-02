// 쉬는 날(OFF, rest_days 0052) 읽고 켜고 끄기. RLS 로 내 것만.
// 보고 있는 기간(달)만 읽습니다. 누르면 바로 바뀌어 보이고 저장, 실패하면 되돌리고 안내문을 돌려줍니다.
// 읽기 실패(0052 실행 전이라 표가 없을 때 포함)면 OFF 없이 비어 있고 화면은 그대로입니다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dayKey } from './calendarLogic'

export function useRestDays(start: Date, end: Date) {
  const from = dayKey(start)
  const to = dayKey(end)
  const [loaded, setLoaded] = useState<{ range: string; days: Set<string> } | null>(null)
  const range = `${from}~${to}`

  useEffect(() => {
    let alive = true
    supabase
      .from('rest_days')
      .select('day')
      .gte('day', from)
      .lt('day', to)
      .then(({ data, error }) => {
        if (!alive) return
        if (error) console.error('쉬는 날을 불러오지 못했습니다:', error.message)
        setLoaded({ range: `${from}~${to}`, days: new Set((data ?? []).map((r) => r.day as string)) })
      })
    return () => {
      alive = false
    }
  }, [from, to])

  const days = useMemo(() => (loaded?.range === range ? loaded.days : new Set<string>()), [loaded, range])

  // 켜고 끄기. 성공하면 '', 실패하면 안내문.
  // 아직 그달 쉬는 날을 다 읽기 전에는 무시(빈 목록으로 잘못 판단하지 않게), 같은 날 저장이 끝나기 전 다시 누르면 무시
  // (insert·delete 가 동시에 가면 도착 순서가 바뀌어 화면과 DB 가 어긋날 수 있어서)
  const pending = useRef(new Set<string>())
  const toggle = useCallback(
    async (key: string) => {
      if (loaded?.range !== range || pending.current.has(key)) return ''
      pending.current.add(key)
      const on = !days.has(key)
      const flip = (want: boolean) =>
        setLoaded((cur) => {
          if (!cur || cur.range !== range) return cur
          const next = new Set(cur.days)
          if (want) next.add(key)
          else next.delete(key)
          return { range: cur.range, days: next }
        })
      flip(on)
      // 이미 있으면 그대로 둠(다른 탭에서 먼저 찍은 경우 중복 오류가 나지 않게)
      const { error } = on
        ? await supabase.from('rest_days').upsert({ day: key }, { onConflict: 'user_id,day', ignoreDuplicates: true })
        : await supabase.from('rest_days').delete().eq('day', key)
      pending.current.delete(key)
      if (!error) return ''
      console.error('쉬는 날을 저장하지 못했습니다:', error.message)
      flip(!on)
      return '쉬는 날을 저장하지 못했어요'
    },
    [days, loaded, range],
  )

  return { days, toggle }
}
