// 오늘의 별자리 운세 (#321). React 와 무관한 순수 로직입니다.
//
// 오하아사처럼 12별자리 순위와 한 줄 운세를 보여 주지만, 진짜 오하아사(TV아사히)를 가져오지 않고 우리가 정합니다.
//   - 서울 날짜(예: 20261030)를 씨앗값으로 12별자리를 섞어 1~12위를 정합니다. 같은 날에는 모두 같은 순위이고 서울 자정에 바뀝니다.
//   - 한 줄 운세는 순위 구간(1위, 2~4위, 5~8위, 9~11위, 12위)별 문구 묶음에서, 행운의 공부 시간·과목은 목록에서 씨앗값으로 고릅니다.
//   - 문구는 공부 앱에 맞게 썼고, 12위도 응원하는 말투입니다. (설계 문서 6절, 사용자 승인)
// 서울 날짜는 로컬 시간대 함수 없이 UTC+9 로 계산합니다. 다른 시간대 컴퓨터도 같은 순위를 봅니다.
import { SIGNS } from './starLogic'

export type Fortune = { sign: string; rank: number; text: string; luckyTime: string; luckySubject: string }

const KST_MS = 9 * 3_600_000

export const TEXTS = {
  top: [
    '오늘은 집중력 최고! 미뤄 둔 어려운 과목부터 시작해 봐요',
    '무엇을 해도 잘 풀리는 날, 목표를 하나 더 얹어도 좋아요',
    '오늘 공부한 건 오래 기억에 남아요. 새 단원을 열어 보세요',
  ],
  high: [
    '흐름이 좋아요. 계획한 만큼 차근차근 해내는 날',
    '질문이 술술 풀리는 날, 막혔던 문제를 다시 꺼내 봐요',
    '짧게 끊어 집중하면 효과가 두 배',
    '함께 공부하는 사람 덕을 보는 날, 광장 친구에게 인사해 봐요',
  ],
  mid: [
    '평범하지만 꾸준함이 빛나는 날. 정해 둔 시간만 지켜도 충분해요',
    '조금 산만할 수 있어요. 휴대폰은 멀리 두고 시작해요',
    '복습이 잘 되는 날, 어제 한 걸 10분만 다시 봐요',
    '작은 목표 세 개를 정하면 하나씩 지우는 재미가 있어요',
  ],
  low: [
    '속도보다 방향! 오늘은 천천히 정리하는 날',
    '졸리면 잠깐 스트레칭하고 다시 앉아요',
    '쉬운 것부터 하나 끝내면 기분이 풀려요',
    '오답 노트를 펼치면 행운이 따라와요',
  ],
  last: [
    '오늘은 복습의 날, 어제 한 걸 다시 보면 행운이 따라와요',
    '쉬어 가도 괜찮아요. 딱 25분만 집중해 봐요',
    '내일의 1위를 위해 오늘은 정리 정돈부터',
  ],
}

export const LUCKY_TIMES = ['오전 7시', '오전 9시', '오전 11시', '오후 1시', '오후 3시', '오후 5시', '오후 7시', '오후 9시', '밤 11시']
export const LUCKY_SUBJECTS = ['암기 과목', '수학·계산', '읽기·독해', '글쓰기', '영어 단어', '오답 노트', '새 단원 예습', '지난 단원 복습']

// 순위 → 문구 묶음
const tierOf = (rank: number): keyof typeof TEXTS =>
  rank === 1 ? 'top' : rank <= 4 ? 'high' : rank <= 8 ? 'mid' : rank <= 11 ? 'low' : 'last'

// 씨앗 의사난수 (mulberry32). 날짜 숫자가 1씩만 달라도 결과가 고르게 퍼지도록 씨앗을 한 번 섞습니다.
function seeded(seed: number) {
  let a = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T,>(list: readonly T[], rand: () => number) => list[Math.floor(rand() * list.length)]

// 서울 날짜의 12별자리 순위와 운세. date 'YYYYMMDD', label '10월 30일', ranks 는 1위부터
export function dailyRanking(ms: number): { date: string; label: string; ranks: Fortune[] } {
  const k = new Date(ms + KST_MS)
  const [y, m, d] = [k.getUTCFullYear(), k.getUTCMonth() + 1, k.getUTCDate()]
  const date = `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`
  const rand = seeded(Number(date))
  const order = SIGNS.map((s) => s.id)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const ranks = order.map((sign, i) => ({
    sign,
    rank: i + 1,
    text: pick(TEXTS[tierOf(i + 1)], rand),
    luckyTime: pick(LUCKY_TIMES, rand),
    luckySubject: pick(LUCKY_SUBJECTS, rand),
  }))
  return { date, label: `${m}월 ${d}일`, ranks }
}
