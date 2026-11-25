// 목표 카드의 순수 로직. 화면(GoalScreens.tsx)과 분리해 Node로 검사합니다.
// 설계: docs/superpowers/specs/2026-11-24-four-comparison-experiment-design.md 4절
//
// 참가자는 조건 순서를 알기 전에 카드 3장(첫째·둘째·셋째 공부 시간용)을 씁니다. 한 장에 목표 1~3개를 셀 수 있게 적고
// 목표마다 예상 난이도(1~7)를 답합니다. 조건이 끝날 때마다 그 카드의 목표를 얼마나 했는지(0~100%) 적습니다.
// 달성률은 참고 수치입니다. 카드마다 난이도가 달라 "성과가 올랐다"는 근거로는 쓰지 않습니다.
import type { Store } from "../survey/surveyLogic";
import { STORE_PREFIX, localIso } from "../survey/surveyLogic";

export const CARD_COUNT = 3; // 카드 수 = 조건 수
export const MAX_GOALS = 3; // 카드 한 장의 목표 수 상한
export const DIFFICULTY_MIN = 1; // 예상 난이도 척도 (1 매우 쉬움 ~ 7 매우 어려움)
export const DIFFICULTY_MAX = 7;
export const ACHIEVE_STEP = 10; // 달성률 선택지 간격 (0, 10, …, 100%)
export const CARD_NAME = ["첫째", "둘째", "셋째"];

export type Goal = { text: string; difficulty: number | null };
export type GoalData = {
  cards: Goal[][]; // 카드 3장. 쓰는 순서 = 진행 순서(1→2→3). 조건 순서가 돌아가므로 카드와 조건이 섞이지 않습니다
  writtenAt?: string; // 카드를 낸 시각
  achieved: (number[] | null)[]; // 카드별 목표 달성률(%). 아직 안 적었으면 null
  achievedAt: (string | null)[];
};

export const emptyGoalData = (): GoalData => ({
  cards: Array.from({ length: CARD_COUNT }, () => [{ text: "", difficulty: null }]),
  achieved: Array.from({ length: CARD_COUNT }, () => null),
  achievedAt: Array.from({ length: CARD_COUNT }, () => null),
});

// 글을 적은 목표만 남깁니다 (빈 줄은 목표가 아님).
export const filledGoals = (card: Goal[]) => card.filter((g) => g.text.trim() !== "");

// 카드 한 장이 다 쓰였는지: 목표가 1개 이상이고, 적은 목표마다 난이도를 골랐는지.
export const cardComplete = (card: Goal[]) => {
  const goals = filledGoals(card);
  return goals.length >= 1 && goals.length <= MAX_GOALS && goals.every((g) => g.difficulty !== null);
};

export const cardsComplete = (cards: Goal[][]) => cards.length === CARD_COUNT && cards.every(cardComplete);

// 낼 때 빈 줄을 지우고 앞뒤 공백을 다듬습니다.
export const cleanCards = (cards: Goal[][]): Goal[][] => cards.map((c) => filledGoals(c).map((g) => ({ ...g, text: g.text.trim() })));

// 카드의 평균 난이도. 조건 사이에 난이도가 비슷했는지 표로 낼 때 씁니다.
export function meanDifficulty(card: Goal[]): number | null {
  const ds = filledGoals(card).flatMap((g) => (g.difficulty === null ? [] : [g.difficulty]));
  return ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null;
}

// 카드의 평균 달성률(%). 목표마다 같은 무게로 평균 냅니다.
export const meanAchieved = (values: number[] | null): number | null => (values && values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

// ── CSV: 목표 하나가 한 줄 ──
export const GOAL_HEADER = ["participant", "order", "position", "condition", "goal_index", "goal", "difficulty", "achieved_percent", "written_at", "achieved_at"];

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function goalsCsv(participant: string, order: string, data: GoalData): string {
  const rows = data.cards.flatMap((card, pos) =>
    card.map((g, i) =>
      [
        participant, order, pos + 1, order[pos] ?? "", i + 1, g.text, g.difficulty ?? "",
        data.achieved[pos]?.[i] ?? "", data.writtenAt ?? "", data.achievedAt[pos] ?? "",
      ].map(csvCell).join(",")
    )
  );
  return [GOAL_HEADER.join(","), ...rows].join("\n");
}

export const goalsCsvName = (participant: string, at: Date) => `goals-${participant}-${localIso(at).slice(0, 19).replace(/[:T]/g, "-")}.csv`;

// ── 저장소 ──
const goalsKey = (p: string) => `${STORE_PREFIX}${p}:goals`;

export function loadGoals(store: Store, participant: string): GoalData {
  try {
    const raw = store.get(goalsKey(participant));
    return raw ? (JSON.parse(raw) as GoalData) : emptyGoalData();
  } catch {
    return emptyGoalData();
  }
}

export function saveGoals(store: Store, participant: string, data: GoalData): boolean {
  try {
    store.set(goalsKey(participant), JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
