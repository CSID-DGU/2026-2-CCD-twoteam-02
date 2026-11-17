// Supabase 요청 감시 (#590). supabase.ts 의 createClient 에 global.fetch 로 넣습니다.
//
// 응답이 400 이상이면 대상(rpc/assign_seat)·코드·DB 에러 번호를 운영 기록에 남깁니다.
// 응답은 손대지 않고 그대로 돌려줍니다. 본문은 복제본(clone)으로 뒤에서 읽어, 화면이 원래 응답을 그대로 읽게 합니다.
// 기록하다 생긴 오류는 모두 삼킵니다. 감시 때문에 앱 요청이 깨지면 안 되기 때문입니다.
import { recordError } from './collector.ts'
import { errorDetail, normalizeTarget } from './opsLogic.ts'

// 기록을 저장하는 요청 자체의 실패는 세지 않음 (실패가 또 실패 기록을 부르는 고리)
const SELF = 'rpc/ops_report'

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

function note(code: string, target: string, detail: string) {
  try {
    recordError({ kind: 'supabase', code, target, detail })
  } catch {
    // 기록 실패는 무시
  }
}

export async function opsFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let target = ''
  try {
    target = normalizeTarget(urlOf(input))
  } catch {
    // 주소를 못 읽어도 요청은 그대로 보냄
  }
  let res: Response
  try {
    res = await fetch(input, init)
  } catch (e) {
    // 사용자가 취소한 요청(AbortError)은 에러가 아님
    if (target !== SELF && !(e instanceof DOMException && e.name === 'AbortError')) note('network', target, '')
    throw e
  }
  if (res.status >= 400 && target !== SELF) {
    try {
      res
        .clone()
        .json()
        .then(
          (body: unknown) => note(String(res.status), target, errorDetail(body)),
          () => note(String(res.status), target, ''),
        )
    } catch {
      note(String(res.status), target, '')
    }
  }
  return res
}
