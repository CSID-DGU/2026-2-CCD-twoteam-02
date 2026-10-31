// 공부 시간 순위 (#59, 광장 순위 게시판). React 와 무관한 순수 로직입니다. (Node 로 검사)
//
// 순위 자체는 DB 함수 study_ranking(0037)이 매깁니다. 공개 범위가 '모두'인 사람만, 분 단위로, 같은 분이면 같은 등수.
// 여기서는 받은 값을 확인하고(parseRanking), 화면에 보일 글자를 만듭니다.
//   이름   닉네임만. 같은 목록 안에 같은 닉네임이 있을 때만 "닉네임#태그"(태그는 친구 찾기와 같은 tagOf)
//   시간   "3시간 12분"(내 기록 화면과 같은 formatHM)
//   내 줄  늘 나에게 보임. 내가 순위에 안 나오는 공개 범위면 그 이유를 알려 줌
import { tagOf } from '../friends/friendsLogic'
import { formatHM } from '../study/recordsLogic'
import type { Visibility } from '../profile/useProfile'

export type Period = 'today' | 'week'
export type RankRow = { rank: number; id: string; nickname: string; minutes: number }
export type MyRank = { minutes: number; rank: number | null; visibility: Visibility } // rank: 내가 공개 순위에 들어갔다면의 등수. 0분이면 null
export type Ranking = { period: Period; top: RankRow[]; me: MyRank }

export const TOP_N = 20 // 순위 창에 보이는 줄 수 (DB 함수와 같은 값)
export const BOARD_TOP = 3 // 광장 게시판 판에 그리는 줄 수
export const REFRESH_MS = 5 * 60_000 // 게시판 판의 순위를 다시 읽는 간격

export const PERIOD_LABEL: Record<Period, string> = { today: '오늘', week: '이번 주' }
const VISIBILITY_NAME: Record<Visibility, string> = { private: '나만', friends: '친구만', public: '모두' }
export const EMPTY_BOARD = '아직 오늘 기록이 없어요'

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isPeriod = (v: unknown): v is Period => v === 'today' || v === 'week'
const isVisibility = (v: unknown): v is Visibility => v === 'private' || v === 'friends' || v === 'public'

// DB 함수가 돌려준 값 확인. 모양이 틀리면 null, 목록의 틀린 줄은 그 줄만 뺍니다.
export function parseRanking(json: unknown): Ranking | null {
  if (!json || typeof json !== 'object') return null
  const { period, top, me } = json as Record<string, unknown>
  if (!isPeriod(period) || !Array.isArray(top) || !me || typeof me !== 'object') return null
  const m = me as Record<string, unknown>
  if (!isNum(m.minutes) || !(m.rank === null || isNum(m.rank)) || !isVisibility(m.visibility)) return null
  const rows: RankRow[] = []
  for (const r of top as Record<string, unknown>[]) {
    if (r && isNum(r.rank) && typeof r.id === 'string' && typeof r.nickname === 'string' && isNum(r.minutes)) {
      rows.push({ rank: r.rank, id: r.id, nickname: r.nickname, minutes: r.minutes })
    }
  }
  return { period, top: rows, me: { minutes: m.minutes, rank: m.rank, visibility: m.visibility } }
}

// 보일 이름. 같은 닉네임이 둘 이상인 사람만 태그를 붙입니다.
export function labelNames(rows: { id: string; nickname: string }[]): string[] {
  const count = new Map<string, number>()
  for (const r of rows) count.set(r.nickname, (count.get(r.nickname) ?? 0) + 1)
  return rows.map((r) => ((count.get(r.nickname) ?? 0) > 1 ? `${r.nickname}#${tagOf(r.id)}` : r.nickname))
}

// 분 → "3시간 12분", "45분", "0분"
export const minutesText = (minutes: number) => formatHM(minutes * 60)

// 맨 아래 "내 기록" 줄
export function myLine(me: MyRank): { text: string; note: string } {
  if (me.minutes < 1 || me.rank === null) return { text: '아직 없어요', note: '공부를 시작하면 순위에 올라요' }
  const text = `${minutesText(me.minutes)} · ${me.rank}위`
  if (me.visibility === 'public') return { text, note: '' }
  return { text, note: `공개 범위가 '${VISIBILITY_NAME[me.visibility]}'이라 다른 사람 순위에는 안 나와요` }
}

// 광장 게시판 판에 그릴 줄 (1~3위)
export function boardLines(ranking: Ranking | null): string[] {
  const all = ranking?.top ?? []
  const top = all.slice(0, BOARD_TOP)
  if (top.length === 0) return [EMPTY_BOARD]
  const names = labelNames(all) // 순위 창과 같은 이름이 되도록 20줄 전체에서 겹치는 닉네임을 봄
  return top.map((r, i) => `${r.rank}위  ${names[i]}  ${minutesText(r.minutes)}`)
}

// ── 분필 칠판 (게시판·순위 창의 1~3등 시상대) ──────────────────────────
// 시상대 한 칸: 자리(1·2·3등 단), 그 줄, 보일 이름
export type PodiumSlot = { place: 1 | 2 | 3; row: RankRow; name: string }

// 시상대 자리 순서 [2등, 1등, 3등] (가운데가 1등). 사람이 모자라면 그 자리는 null.
// 동점이어도 받은 순서(DB 가 정함)대로 자리를 채우고, 글자에 보이는 등수는 DB 등수(row.rank)입니다.
export function podium(rows: RankRow[]): (PodiumSlot | null)[] {
  const names = labelNames(rows) // 순위 창과 같은 이름 (겹치는 닉네임엔 태그)
  const slot = (i: number, place: 1 | 2 | 3): PodiumSlot | null => (rows[i] ? { place, row: rows[i], name: names[i] } : null)
  return [slot(1, 2), slot(0, 1), slot(2, 3)]
}

// 얼굴 사진이 아직 없을 때 동그라미에 쓰는 첫 글자 (영문은 대문자)
export const initialOf = (nickname: string) => nickname.trim().charAt(0).toUpperCase() || '?'
