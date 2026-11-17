// 운영 대시보드 데이터 받기 (#590). DB 함수 ops_dashboard 가 팀인지 확인하고 요약을 한 번에 돌려줍니다(0071).
import { supabase } from '../lib/supabase'
import type { ErrorKind } from './opsLogic'
import type { TopError } from './diagnosis'

export const RANGES = [
  { key: '1h', label: '1시간', ms: 3_600_000 },
  { key: '24h', label: '24시간', ms: 86_400_000 },
  { key: '7d', label: '7일', ms: 604_800_000 },
  { key: '30d', label: '30일', ms: 2_592_000_000 },
] as const
export type RangeKey = (typeof RANGES)[number]['key']

export type ErrorPoint = { t: string; kind: ErrorKind; n: number }
export type FpsPoint = { t: string; avg: number; low_pct: number }
export type Outlier = {
  minute: string
  place: string
  fps_avg: number
  fps_min: number
  low_seconds: number
  browser: string
  os: string
  mobile: boolean
  gpu: string
  version: string
}
export type Dashboard = {
  bucket_seconds: number
  summary: { users: number; errors: number; errors_4xx: number; errors_5xx: number; fps_minutes: number; low_minutes: number; fps_median: number | null }
  error_series: ErrorPoint[]
  fps_series: FpsPoint[]
  top_errors: TopError[]
  outliers: Outlier[]
}

// 받은 기간(화면 그래프의 가로축과 맞춤)과 함께 돌려줌
export async function fetchDashboard(range: RangeKey): Promise<{ data: Dashboard; from: number; to: number }> {
  const ms = RANGES.find((r) => r.key === range)?.ms ?? RANGES[1].ms
  const to = Date.now()
  const from = to - ms
  const { data, error } = await supabase.rpc('ops_dashboard', { p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString() })
  if (error) throw new Error(error.message)
  return { data: data as Dashboard, from, to }
}

// 지금 화면이 붙은 DB. 서비스와 운영 기록을 헷갈리지 않게 대시보드 위에 띄움
const PROJECTS: Record<string, '서비스' | '운영' | '실험'> = {
  lkvsbdbssrictnrxmdig: '서비스',
  rpmkqbbmymvptziroyzg: '운영',
  eimxyjlarbbbnqmpmmex: '실험',
}
export function envLabel(): '서비스' | '운영' | '실험' | '로컬' {
  const url: string = import.meta.env.VITE_SUPABASE_URL ?? ''
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url)?.[1] ?? ''
  return PROJECTS[ref] ?? '로컬'
}
