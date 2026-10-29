// 생일(양력 월·일) 고르기 (#321). 회원가입·계정 탭·운세 창이 같이 씁니다.
// 월·일을 둘 다 골라야 값이 생깁니다. 달만 고른 동안은 이 칸 안에만 달을 기억하고 바깥에는 null 을 줍니다
// (달만 고르고 넘어가면 1일로 저장되는 일이 없게). 달을 바꾸면 그 달에 없는 날(예: 2월 30일)은 마지막 날로 맞춥니다.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { Birthday } from './useMyBirthday'

const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] // 2월은 29일생도 받으려고 29

export function BirthdayInput({ value, onChange, style }: { value: Birthday | null; onChange: (b: Birthday | null) => void; style?: CSSProperties }) {
  const [pendingMonth, setPendingMonth] = useState(0) // 달만 고르고 날은 아직 고르지 않은 동안의 달
  const month = value?.month ?? pendingMonth
  const day = value?.day ?? 0
  const setMonth = (m: number) => {
    setPendingMonth(m)
    if (!m) return onChange(null)
    if (value) onChange({ month: m, day: Math.min(value.day, DAYS_IN[m - 1]) })
  }
  const setDay = (d: number) => {
    if (!d) {
      setPendingMonth(month) // 날을 비우면 달은 남겨 둡니다
      return onChange(null)
    }
    if (month) onChange({ month, day: d })
  }
  return (
    <span style={{ display: 'inline-flex', gap: 6, ...style }}>
      <select value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="생일 달">
        <option value={0}>월</option>
        {DAYS_IN.map((_, i) => (
          <option key={i} value={i + 1}>
            {i + 1}월
          </option>
        ))}
      </select>
      <select value={day} onChange={(e) => setDay(Number(e.target.value))} disabled={!month} aria-label="생일 날">
        <option value={0}>일</option>
        {Array.from({ length: month ? DAYS_IN[month - 1] : 31 }, (_, i) => (
          <option key={i} value={i + 1}>
            {i + 1}일
          </option>
        ))}
      </select>
    </span>
  )
}
