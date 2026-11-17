// 에러 종류별 색과 이름 (#590). 어두운 카드(#20232a) 위에서 색약 구분·대비를 검사한 4색(dataviz 검사 통과)
import type { ErrorKind } from './opsLogic'

export const KIND_COLOR: Record<ErrorKind, string> = { supabase: '#3987e5', relay: '#d95926', realtime: '#199e70', js: '#c98500' }
export const KIND_LABEL: Record<ErrorKind, string> = { supabase: 'Supabase', relay: '중계 서버', realtime: '실시간 방', js: '화면 오류' }
