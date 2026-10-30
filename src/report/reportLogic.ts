// 신고(#121)의 순수 로직. 화면(ReportPanel·ReportsPanel)은 여기 함수를 부르기만 합니다. React·Supabase 와 무관합니다.
import type { FocusStatus } from '../focus/focusLogic'
import type { Sample, StudyContext } from './recentSamples'

export const MESSAGE_MAX = 500 // reports.message 의 check 제약과 같은 값
export const LIST_LIMIT = 200 // 신고 목록에 불러오는 최대 건수
// 주소에 ?branch= 가 없는 바깥 화면의 이름 (#342). 광장은 DB 지점 이름과 같은 plaza(벤치 공부, 0038)
const PAGE_BRANCH: Record<string, string> = { '/': 'plaza', '/campus': 'campus' }

export type ReportKind = 'judgment' | 'bug' | 'other'
export type JudgmentDetail = 'false_alarm' | 'missed' | 'unsure'

export const KIND_LABEL: Record<ReportKind, string> = {
  judgment: '판정 오류',
  bug: '화면·기능 버그',
  other: '기타·의견',
}

// 판정 오류일 때 하나 더 고르는 것
export const DETAIL_LABEL: Record<JudgmentDetail, string> = {
  false_alarm: '공부 중인데 노랑·빨강',
  missed: '안 하는데 초록',
  unsure: '모르겠음',
}

export type Draft = { kind: ReportKind | null; detail: JudgmentDetail | null; message: string }

// 보내기 전 화면에서 막는 것. 오류 문구 또는 null (DB 의 check 제약과 같은 기준, 화면이 먼저 알려 줄 뿐)
export function validateDraft(d: Draft): string | null {
  if (d.kind === null) return '신고 종류를 골라 주세요.'
  if (d.message.length > MESSAGE_MAX) return `설명은 ${MESSAGE_MAX}자까지 적을 수 있어요.`
  return null
}

// 신고에 같이 저장하는 화면 정보. 공부 중이 아니면 sessionId·status·hold·allow 둘은 null
export type ReportContext = {
  page: string
  branch: string | null // ?branch= 값. 없으면 광장 'plaza'·캠퍼스 'campus' (그 밖의 화면은 null)
  sessionId: string | null // seat_sessions.id (공부 중일 때)
  userAgent: string
  status: FocusStatus | null
  hold: Sample['hold']
  allowOtherScreen: boolean | null
  allowDevices: boolean | null
}

export function buildContext(input: {
  page: string
  search: string
  userAgent: string
  study: StudyContext | null
  last: Sample | null // 최근 수치의 마지막 줄 (없으면 null)
}): ReportContext {
  return {
    page: input.page,
    branch: new URLSearchParams(input.search).get('branch') ?? PAGE_BRANCH[input.page] ?? null,
    sessionId: input.study?.sessionId ?? null,
    userAgent: input.userAgent,
    status: input.last?.status ?? null,
    hold: input.last?.hold ?? null,
    allowOtherScreen: input.study?.allowOtherScreen ?? null,
    allowDevices: input.study?.allowDevices ?? null,
  }
}

// 고개 각도는 라디안으로 들어오므로 저장·표시용으로 도로 바꿉니다 (소수 1자리)
export function toDegrees(rad: number): number {
  return Math.round((rad * 180) / Math.PI * 10) / 10
}

export function round2(v: number | null | undefined): number | null {
  return v == null ? null : Math.round(v * 100) / 100
}

// reports 표의 한 줄 (목록 화면이 읽는 모양)
export type ReportRow = {
  id: string
  user_id: string
  created_at: string
  kind: ReportKind
  detail: JudgmentDetail | null
  message: string
  context: ReportContext
  samples: Sample[]
  checked_at: string | null
  checked_by: string | null
}

export type Filter = { kind: ReportKind | 'all'; checked: 'all' | 'unchecked' | 'checked' }
export const DEFAULT_FILTER: Filter = { kind: 'all', checked: 'unchecked' }

export function applyFilter(rows: ReportRow[], f: Filter): ReportRow[] {
  return rows.filter((r) => {
    if (f.kind !== 'all' && r.kind !== f.kind) return false
    if (f.checked === 'unchecked' && r.checked_at !== null) return false
    if (f.checked === 'checked' && r.checked_at === null) return false
    return true
  })
}

// 수치 표의 첫 열: 신고 시각 기준 몇 초 전인지 (-29 … 0)
export function relativeSeconds(sample: Sample, reportedAt: number): number {
  return Math.round((sample.at - reportedAt) / 1000)
}
