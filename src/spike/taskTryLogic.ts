// 사용자 실험 과제 후보 시험(spike)의 순수 로직. 화면(taskTry.tsx)과 분리해 Node로 바로 검사할 수 있게 둡니다.
//
// 목적: docs/사용자-실험-재설계.md 3절 "과제 선정 절차" 1단계 — 팀원이 후보 ① 단순 계산, ② 오탈자 찾기를
// 각 10분씩 혼자 해 보고 지루함·피로·"공부 같음"을 메모해 과제를 정합니다. 실제 과제 창(#191)은 정한 뒤 따로 만듭니다.
// 영상·개인정보는 다루지 않고, 남는 것은 문항·입력·시각 숫자뿐입니다.

export const TRY_SECONDS = 600; // 후보당 시험 시간 (문서: 10분)
export const CHECK_SECONDS = 120; // 화면이 잘 도는지 보는 짧은 점검용
export const CALC_MIN = 10; // 계산 과제 피연산자 범위: 두 자리 수
export const CALC_MAX = 99;
export const CARRY_RATIO = 0.5; // 받아올림이 있는 문제 비율 (난이도를 세트마다 같게 하려는 규칙)

export type Candidate = "calc" | "typo";
export const CANDIDATE_LABEL: Record<Candidate, string> = { calc: "① 단순 계산", typo: "② 오탈자 찾기" };

// ── 난수: 시드를 기록해 같은 문제 세트를 다시 만들 수 있게 합니다 (mulberry32) ──
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── ① 단순 계산: 두 자리 + 두 자리 덧셈 ──
export type CalcProblem = { a: number; b: number; answer: number; carry: boolean };

export const hasCarry = (a: number, b: number) => (a % 10) + (b % 10) >= 10;

// 받아올림 여부를 먼저 정하고, 그 조건에 맞는 수가 나올 때까지 뽑습니다.
export function makeCalcProblem(rand: () => number): CalcProblem {
  const wantCarry = rand() < CARRY_RATIO;
  for (;;) {
    const a = CALC_MIN + Math.floor(rand() * (CALC_MAX - CALC_MIN + 1));
    const b = CALC_MIN + Math.floor(rand() * (CALC_MAX - CALC_MIN + 1));
    if (hasCarry(a, b) === wantCarry) return { a, b, answer: a + b, carry: wantCarry };
  }
}

// ── ② 오탈자 찾기: 짧은 교과서 투 문단에 오탈자 1~3개 ──
// 지문은 저작권 문제가 없도록 직접 썼습니다. 표기 {정답|오타}는 그 자리 글자 하나를 오타로 바꿔 보여 준다는 뜻입니다.
export const TYPO_SOURCES: string[] = [
  "물은 섭씨 0도에서 얼고 100도에서 {끓|끌}는다. 하지만 높은 산에서는 기압이 낮아 더 낮은 온도에서 끓는다. 그래서 산 위에서 밥을 지으면 설익기 {쉽|쉼}다.",
  "조선은 1392년에 이성계가 세운 나라다. 수도는 한양이었고, 유교를 나라의 근본 사상으로 삼{았|앗}다. 세종 때에는 훈민정음이 만들어{졌|젔}다.",
  "식물은 햇빛을 받아 스스로 양분을 만든다. 이 과정을 광합성이라고 부{른|룬}다. 광합성에는 물과 이산화탄소가 필{요|오}하고, 그 결과 산소가 나온다.",
  "지구는 하루에 한 번 스스로 돈다. 이것을 자전이라고 한다. 자전 {때|떄}문에 낮과 밤이 생기고, 태양 주위를 도는 공전 때문에 계절이 바{뀐|뀌}다.",
  "민주주의에서는 국민이 나라의 주인이다. 국민은 선거로 대표를 {뽑|봅}고, 대표는 국민을 대신해 법을 만든다. 법은 모든 사람에게 똑같이 적용된다.",
  "소리는 공기의 떨림이 귀에 전해지는 것이다. 공기가 없는 우주에서는 소리가 들{리|려}지 {않|안}는다. 소리의 빠르기는 공기 중에서 1초에 약 340미터다.",
  "고려는 918년에 왕건이 세{웠|웟}다. 불교를 널리 믿었고, 세계에서 가장 오래된 금속 활자본인 직지심체요절을 남{겼|겻}다. 고려청자도 이 시기의 대{표|포}적인 문화재다.",
  "사람의 몸은 약 60퍼센트가 물이다. 물은 영양분을 나르고 체온을 조{절|졀}한다. 그래서 하루에 물을 충분{히|이} 마시는 것이 건강에 중요하다.",
  "달은 지구의 유일한 위성이다. 달이 지구를 한 바퀴 도는 데 약 한 달이 걸{린|닌}다. 달의 모양이 바뀌어 보이는 것은 햇빛을 받는 부분이 달{라|러}지기 때문이다.",
  "시장에서 물건의 값은 수요와 공급으로 정해{진|전}다. 사려는 사람이 많으면 값이 오르고, 팔려는 물건이 많으면 값이 내린다. 이것을 가격의 원리라고 한다.",
  "세포는 생물을 이루는 가장 작은 단위다. 사람의 몸은 수십조 개의 세포로 이루어{져|저} 있다. 세포는 분열을 통해 수를 늘{리|니}고 낡은 세포를 바{꾼|군}다.",
  "한글은 1443년에 세종이 만들고 1446년에 반포{했|햇}다. 자음은 발음 기관의 모양을, 모음은 하늘과 땅과 사람을 본{떠|더} 만들었다. 배우기 쉬워 백성들이 널리 쓰게 되었다.",
  "바람은 공기가 기압이 높은 곳에서 낮은 곳으로 {움|옴}직이는 것이다. 낮에는 바다에서 육지로, 밤에는 육지에서 바다로 바람이 분다. 이것을 해풍과 육풍이라고 한다.",
  "지도에서 축척은 실제 거리를 얼마나 줄{였|엿}는지 나타낸다. 축척이 클수록 좁은 지역을 자{세|새}히 보여 준다. 등고선은 높이가 같은 지점을 이{은|운} 선이다.",
  "전기는 전자의 흐름이다. 금속처럼 전기가 잘 {통|퉁}하는 물질을 도체, 고무처럼 통하지 않는 물질을 부도체라고 한다. 전선의 겉을 고무로 감{싸|사}는 것은 이 때문이다.",
  "인구가 도시로 몰리는 현상을 도시화라고 한다. 도시화가 빠르게 진행{되|돼}면 주택과 교통 문제가 생긴다. 반대로 농촌에서는 일할 사람이 줄어{든|둔}다.",
  "공룡은 약 6600만 년 전에 사라{졌|젓}다. 거대한 운석이 지구에 부{딪|딛}혀 기후가 크게 바뀐 것이 원인으로 꼽힌다. 오늘날의 새는 공룡의 후손으로 여겨진다.",
  "삼국 시대에는 고구려, 백제, 신라가 한반도에서 경{쟁|젱}했다. 신라는 당과 손잡고 백제와 고구려를 차례로 무너뜨{렸|렷}다. 이후 당을 몰아내고 삼국을 통{일|닐}했다.",
  "빛은 1초에 약 30만 킬로미터를 간다. 태양에서 나온 빛이 지구에 {닿|닫}기까지는 약 8분이 걸린다. 밤하늘의 별빛은 수백 년 전에 출발한 빛일 수도 있다.",
  "헌법은 나라의 가장 기본이 되는 법이다. 다른 모든 법은 헌법에 어긋{나|너}서는 안 된다. 헌법을 고치려면 국회의 의결과 국민 투표를 거{쳐|처}야 한다.",
  "화산은 땅속의 마그마가 지표로 {솟|솓}아 나오는 곳이다. 마그마가 땅 위로 나오면 용암이라고 부른다. 화산 주변의 땅은 화산재 덕분에 기{름|릅}진 경우가 많다.",
  "은행은 돈을 {맡|맏}아 두고 필요한 사람에게 빌{려|러}준다. 돈을 맡긴 사람은 이자를 받고, 빌린 사람은 이자를 낸다. 이 차이가 은행의 수입이 된다.",
  "눈은 빛을 받아{들|둘}여 뇌에 신호를 보낸다. 빛은 각막과 수정체를 지나 망막에 상을 {맺|맷}는다. 수정체가 두께를 바꾸어 가까운 것과 먼 것에 초점을 {맞|맟}춘다.",
  "산업 혁명은 18세기 영국에서 시작되{었|엇}다. 증기 기관이 발명되면서 공장에서 물건을 대량으로 만들 수 있게 되었다. 이로써 사람들의 생활 방식이 크게 달라{졌|젔}다.",
  "숲은 비가 올 때 물을 머{금|굼}었다가 천천히 내보낸다. 그래서 홍수와 가뭄을 줄이는 데 도움이 된다. 나무뿌리는 흙이 쓸려 내려가는 것도 막{아|어} 준다.",
  "온도계는 액체가 온도에 따라 부피가 {변|번}하는 성질을 이용한다. 온도가 오르면 액체가 팽{창|챵}해 눈금이 올라간다. 예전에는 수은을 {썼|썻}지만 지금은 알코올을 많이 쓴다.",
];

export type TypoPassage = {
  chars: string[]; // 화면에 보여 줄 글자(오타 포함), 글자 하나가 누르는 단위
  typoAt: number[]; // 오타 글자의 위치
  correct: string; // 오타 없는 원문 (기록용)
};

// "{정답|오타}" 표기를 풀어 보여 줄 글자 배열과 오타 위치를 만듭니다.
export function parsePassage(source: string): TypoPassage {
  const chars: string[] = [];
  const typoAt: number[] = [];
  let correct = "";
  const re = /\{(.)\|(.)\}/g;
  let last = 0;
  for (const m of source.matchAll(re)) {
    for (const ch of source.slice(last, m.index)) {
      chars.push(ch);
      correct += ch;
    }
    typoAt.push(chars.length);
    chars.push(m[2]);
    correct += m[1];
    last = m.index + m[0].length;
  }
  for (const ch of source.slice(last)) {
    chars.push(ch);
    correct += ch;
  }
  return { chars, typoAt, correct };
}

export const TYPO_PASSAGES: TypoPassage[] = TYPO_SOURCES.map(parsePassage);

// 지문 순서도 시드로 섞습니다. 지문이 바닥나면 처음부터 다시 돕니다(기록에 회차가 남음).
export function passageOrder(rand: () => number): number[] {
  const order = TYPO_PASSAGES.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export type TypoScore = {
  hits: number;
  misses: number;
  falseMarks: number;
  missed: string; // 놓친 오타를 "원문→오타" 꼴로 (예: "졌→젔")
  wrong: string; // 잘못 누른 글자
};

export function scoreTypo(passage: TypoPassage, marked: Set<number>): TypoScore {
  const correctChars = [...passage.correct];
  const hitAt = passage.typoAt.filter((i) => marked.has(i));
  const missedAt = passage.typoAt.filter((i) => !marked.has(i));
  const wrongAt = [...marked].filter((i) => !passage.typoAt.includes(i)).sort((x, y) => x - y);
  return {
    hits: hitAt.length,
    misses: missedAt.length,
    falseMarks: wrongAt.length,
    missed: missedAt.map((i) => `${correctChars[i]}→${passage.chars[i]}`).join(" "),
    wrong: wrongAt.map((i) => passage.chars[i]).join(" "),
  };
}

// ── 기록 ──
export type TrialRow = {
  index: number; // 몇 번째 문항
  shownMs: number; // 문항이 보인 시각 (시작 기준 경과 ms)
  answeredMs: number; // 답한 시각 (시작 기준 경과 ms)
  problem: string; // 계산: "34+58" / 오탈자: 지문 번호
  answer: string; // 계산: 정답 / 오탈자: 오타 글자 수
  input: string; // 계산: 입력값 / 오탈자: 누른 글자 수
  correct: boolean; // 계산: 정답 여부 / 오탈자: 오타를 다 찾고 잘못 누른 것이 없음
  detail: string; // 계산: "받아올림" 여부 / 오탈자: "맞힘/놓침/잘못" 수
  missed: string; // 오탈자: 놓친 오타 "원문→오타" (계산은 빈칸)
  wrong: string; // 오탈자: 잘못 누른 글자 (계산은 빈칸)
};

export type Memo = { boring: number | null; tired: number | null; studyLike: number | null; comment: string };

export type TrialSummary = {
  done: number; // 답한 문항 수
  correct: number; // 계산: 맞힌 수 / 오탈자: 맞게 찾은 오타 수
  perMinute: number; // 분당 맞힌 수 (주 지표와 같은 꼴)
  medianMs: number; // 문항당 걸린 시간의 중앙값
};

export function summarize(rows: TrialRow[], seconds: number, candidate: Candidate): TrialSummary {
  const correct =
    candidate === "calc"
      ? rows.filter((r) => r.correct).length
      : rows.reduce((s, r) => s + Number(r.detail.split("/")[0] || 0), 0);
  const times = rows.map((r) => r.answeredMs - r.shownMs).sort((x, y) => x - y);
  const medianMs = times.length === 0 ? 0 : times[Math.floor(times.length / 2)];
  return { done: rows.length, correct, perMinute: seconds > 0 ? (correct / seconds) * 60 : 0, medianMs };
}

export type TrialRecord = {
  name: string;
  candidate: Candidate;
  seed: number;
  seconds: number;
  startedAt: number; // Date.now()
  rows: TrialRow[];
  memo: Memo;
};

const csvCell = (v: string | number | boolean | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// 위쪽에 요약·메모(# 로 시작), 아래에 문항별 표. 한 파일로 두어 회의에서 바로 비교하기 쉽게 합니다.
export function toCsv(t: TrialRecord): string {
  const s = summarize(t.rows, t.seconds, t.candidate);
  const head = [
    ["# 이름", t.name],
    ["# 후보", CANDIDATE_LABEL[t.candidate]],
    ["# 시작", new Date(t.startedAt).toISOString()],
    ["# 시간(초)", t.seconds],
    ["# 시드", t.seed],
    ["# 답한 문항", s.done],
    ["# 맞힌 수", s.correct],
    ["# 분당 맞힌 수", s.perMinute.toFixed(2)],
    ["# 문항당 중앙값(ms)", s.medianMs],
    ["# 지루함(1~5)", t.memo.boring],
    ["# 피로(1~5)", t.memo.tired],
    ["# 공부 같음(1~5)", t.memo.studyLike],
    ["# 한 줄 메모", t.memo.comment],
  ];
  const header = ["문항", "보인 시각ms", "답한 시각ms", "걸린ms", "문제", "정답", "입력", "맞음", "세부", "놓침", "잘못 누름"];
  const body = t.rows.map((r) => [
    r.index, r.shownMs, r.answeredMs, r.answeredMs - r.shownMs, r.problem, r.answer, r.input, r.correct ? 1 : 0, r.detail, r.missed, r.wrong,
  ]);
  return [...head, header, ...body].map((row) => row.map(csvCell).join(",")).join("\n");
}
