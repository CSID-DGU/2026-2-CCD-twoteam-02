// 신고 한 건을 만들고 보냅니다 (#121). Supabase 호출은 여기 한 곳에만 둡니다.
// supabase 클라이언트는 화면(ReportPanel)이 넘겨 줍니다. 이 파일이 직접 가져오면 환경 변수가 없는 곳(Node 검사)에서 못 불러서입니다.
import type { Sample } from './recentSamples'
import { currentStudyContext, recentSamples } from './recentSamples'
import { buildContext } from './reportLogic'
import type { Draft, JudgmentDetail, ReportContext, ReportKind } from './reportLogic'

// reports 표에 넣는 모양 (id·created_at 은 DB 가 채움)
export type ReportInsert = {
  user_id: string
  kind: ReportKind
  detail: JudgmentDetail | null
  message: string
  context: ReportContext
  samples: Sample[]
}

// 보낼 수 있는 client 의 최소 모양. 실제로는 supabase 를 넘기고, 검사에서는 가짜를 넘깁니다.
export type ReportClient = {
  from: (table: string) => { insert: (row: ReportInsert) => PromiseLike<{ error: { message: string } | null }> }
}

// 지금 화면과 버퍼에서 신고 한 건을 만듭니다. 종류가 판정 오류가 아니면 보조 선택은 버립니다.
export function buildInsert(args: {
  myId: string
  draft: Draft
  nowMs: number
  page: string
  search: string
  userAgent: string
}): ReportInsert {
  const { myId, draft, nowMs, page, search, userAgent } = args
  if (draft.kind === null) throw new Error('신고 종류가 없습니다. validateDraft 를 먼저 거쳐야 합니다.')
  const samples = recentSamples(nowMs)
  return {
    user_id: myId,
    kind: draft.kind,
    detail: draft.kind === 'judgment' ? draft.detail : null,
    message: draft.message,
    context: buildContext({ page, search, userAgent, study: currentStudyContext(), last: samples[samples.length - 1] ?? null }),
    samples,
  }
}

// 성공이면 null, 실패면 한국어 문구
export async function sendReport(row: ReportInsert, client: ReportClient): Promise<string | null> {
  const { error } = await client.from('reports').insert(row)
  return error ? `신고를 보내지 못했습니다: ${error.message}` : null
}
