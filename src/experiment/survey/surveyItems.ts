// 실험 설문 문항 데이터. 기준 문서는 docs/실험-설문지.md 이며, 문서가 바뀌면 이 파일을 같이 고칩니다.
// 문항 코드·순서·척도를 문서 그대로 옮겼습니다. 출처 표기([원문]/[번안]/[자작])와 근거는 문서에 있습니다.
import type { Group, Phase, Scale } from "./surveyLogic";
import { PLACE_TOKEN } from "./surveyLogic";

// ── 척도 ──
export const LIKERT5: Scale = { kind: "likert", min: 1, max: 5, labels: { 1: "전혀 그렇지 않다", 2: "그렇지 않다", 3: "보통이다", 4: "그렇다", 5: "매우 그렇다" } };
export const LIKERT6: Scale = { kind: "likert", min: 1, max: 6, labels: { 1: "전혀 아니다", 2: "아니다", 3: "약간 아니다", 4: "약간 그렇다", 5: "그렇다", 6: "매우 그렇다" } };
export const LIKERT7: Scale = { kind: "likert", min: 1, max: 7, labels: { 1: "전혀 그렇지 않다", 4: "보통이다", 7: "매우 그렇다" } };
export const PAAS9: Scale = {
  kind: "likert", min: 1, max: 9,
  labels: { 1: "매우 매우 적음", 2: "매우 적음", 3: "적음", 4: "조금 적음", 5: "적지도 많지도 않음", 6: "조금 많음", 7: "많음", 8: "매우 많음", 9: "매우 매우 많음" },
};
// ASRS 공식 한국어판 응답 라벨 [원문]
export const ASRS5: Scale = { kind: "likert", min: 0, max: 4, labels: { 0: "전혀 그렇지 않다", 1: "거의 그렇지 않다", 2: "약간 혹은 가끔 그렇다", 3: "자주 그렇다", 4: "매우 자주 그렇다" } };
const choice = (...options: string[]): Scale => ({ kind: "choice", options });
const TEXT: Scale = { kind: "text" };

// ── 사전 설문 ──
const PRE_BASIC: Group = {
  id: "pre_basic",
  title: "기본 정보와 경험",
  note: "실험을 시작하기 전에 몇 가지 여쭙습니다. 정답은 없고, 응답은 참가자 번호로만 저장됩니다.",
  items: [
    { code: "PRE_GENDER", text: "성별", scale: choice("여성", "남성", "기타", "답하지 않음") },
    { code: "PRE_GRADE", text: "소속", scale: choice("학부 1·2학년", "학부 3·4학년", "대학원", "기타") },
    { code: "PRE_LAPTOP", text: "노트북으로 공부하는 빈도", scale: choice("거의 안 함", "월 1~3회", "주 1~2회", "주 3회 이상", "거의 매일") },
    { code: "PRE_CAMSTUDY", text: "캠스터디(서로 캠을 켜고 공부하는 온라인 모임) 경험", scale: choice("없음", "1~2번 해 봄", "가끔 함", "자주 함") },
    { code: "PRE_STUDYCAFE", text: "스터디카페·열람실 이용 빈도", scale: choice("거의 안 함", "월 1~3회", "주 1~2회", "주 3회 이상") },
    { code: "PRE_SWM", text: "\"Study with me\" 영상(남이 공부하는 영상을 틀어 놓고 공부)을 본 경험", scale: choice("없음", "1~2번", "가끔", "자주") },
    { code: "PRE_KNOWN", text: "실험 진행자들과의 친분", scale: choice("모름", "얼굴만 앎", "아는 사이") },
  ],
};

const PRE_BODY_DOUBLING: Group = {
  id: "pre_bd",
  title: "함께 공부하기 경험",
  items: [
    { code: "PRE_BD_HEARD", text: "\"바디더블링(body doubling)\"이라는 말을 들어 본 적이 있나요?", scale: choice("예", "아니오") },
    {
      code: "PRE_BD_USE",
      text:
        "다음 설명을 읽고 답해 주세요. \"바디더블링이란, 어떤 일에 집중하기 위해 다른 사람과 함께 있는 것을 이용하는 것을 말합니다. " +
        "같은 공간에 있어도 되고 온라인이어도 되며, 모르는 사람이어도 아는 사람이어도 됩니다. 상대가 같은 일을 할 필요는 없습니다.\" " +
        "이런 방식을 써 본 적이 있나요?",
      scale: choice("예", "아니오", "잘 모르겠다"),
    },
  ],
};

const PRE_ASRS: Group = {
  id: "pre_asrs",
  title: "평소 모습",
  note:
    "지난 6개월 동안 귀하가 어떻게 느끼고 행동하였는지를 가장 잘 설명하는 칸에 표시하십시오. " +
    "(ASRS v1.1 Screener. Copyright © World Health Organization. Kessler RC 외, 2005, Psychological Medicine 35(2), 245–256.)",
  items: [
    { code: "ASRS_1", text: "어떤 일의 어려운 부분은 끝내 놓고, 그 일을 마무리를 짓지 못해 곤란을 겪은 적이 있습니까?", scale: ASRS5 },
    { code: "ASRS_2", text: "체계가 필요한 일을 해야 할 때 순서대로 진행하기 어려운 경우가 있습니까?", scale: ASRS5 },
    { code: "ASRS_3", text: "약속이나 해야 할 일을 잊어버려 곤란을 겪은 적이 있습니까?", scale: ASRS5 },
    { code: "ASRS_4", text: "골치 아픈 일은 피하거나 미루는 경우가 있습니까?", scale: ASRS5 },
    { code: "ASRS_5", text: "오래 앉아 있을 때, 손을 만지작거리거나 발을 꼼지락거리는 경우가 있습니까?", scale: ASRS5 },
    { code: "ASRS_6", text: "마치 모터가 달린 것처럼, 과도하게 혹은 멈출 수 없이 활동을 하는 경우가 있습니까?", scale: ASRS5 },
  ],
};

// ── 조건 끝 설문 ──
const KSSAS: Group = {
  id: "kssas",
  title: "지금 이 순간",
  note: "일반적으로가 아니라 지금 이 순간 어떤지를 기준으로 답해 주세요.",
  items: [
    { code: "KSSAS_1", text: "지금 이 순간, 나는 내 주위환경에 있는 모든 것을 잘 알아차리고 있다.", scale: LIKERT7 },
    { code: "KSSAS_2", text: "지금 이 순간, 나는 내 안의 감정에 대해 잘 알아차리고 있다.", scale: LIKERT7 },
    { code: "KSSAS_3", text: "지금 이 순간, 나는 내가 내 자신을 나타내는 것에 대해 염려하고 있다.", scale: LIKERT7 },
    { code: "KSSAS_4", text: "지금 이 순간, 나는 내가 어떻게 보여지는 지에 대해 의식한다.", scale: LIKERT7 },
    { code: "KSSAS_5", text: "지금 이 순간, 나는 내 주변에서 어떤 일들이 일어나고 있는지 잘 알고 있다.", scale: LIKERT7 },
    { code: "KSSAS_6", text: "지금 이 순간, 나는 내 삶에 대해 깊이 생각한다.", scale: LIKERT7 },
    { code: "KSSAS_7", text: "지금 이 순간, 나는 다른 이들이 나를 어떻게 생각하는지에 대해 염려한다.", scale: LIKERT7 },
    { code: "KSSAS_8", text: "지금 이 순간, 나는 내 마음 속에 품은 생각들을 잘 알고 있다.", scale: LIKERT7 },
    { code: "KSSAS_9", text: "지금 이 순간, 나는 내 주변의 모든 대상들을 잘 인식하고 있다.", scale: LIKERT7 },
  ],
};

const FOCUS: Group = {
  id: "focus",
  title: "방금 끝난 세션에서",
  note: "방금 끝난 20분에 대해 여쭙습니다. 정답은 없습니다. 느낀 대로 답해 주세요.",
  items: [
    { code: "FLOW_1", text: "이번 세션에서 과제를 하는 동안 다른 생각을 전혀 하지 않았다.", scale: LIKERT6 },
    { code: "FLOW_2", text: "이번 세션에서 나는 과제에 완전히 빠져들었다.", scale: LIKERT6 },
    { code: "FLOW_3", text: "이번 세션에서 나는 과제에 완전히 집중했다.", scale: LIKERT6 },
    { code: "ARA_4", text: "이번 세션에서 나는 과제에 계속 집중할 수 있었다.", scale: LIKERT5 },
    { code: "ARA_5", text: "이번 세션에서 딴생각이 들거나 주의가 흐트러져도 과제로 쉽게 돌아올 수 있었다.", scale: LIKERT5 },
  ],
};

const EFFORT: Group = {
  id: "effort",
  title: "정신적 노력",
  items: [{ code: "PAAS", text: "이번 세션의 과제를 하는 데 들인 정신적 노력은 어느 정도였습니까?", scale: PAAS9 }],
};

const ALONE_NOTE = "이번 세션에는 함께 있던 사람이 없었습니다. 그렇더라도 느낀 대로 답해 주세요.";

const CAMERA: Group = {
  id: "camera",
  title: "내 모습",
  noteByPhase: { B: ALONE_NOTE },
  items: [
    { code: "CAM_1", text: "이번 세션 동안 내 모습이 상대에게 어떻게 보일지 신경 쓰였다.", scale: LIKERT5 },
    { code: "CAM_2", text: "이번 세션 동안 내 모습을 확인하게 됐다.", scale: LIKERT5 },
  ],
};

// Networked Minds 공존감 8문항 번역 초안 (역번역 전). {장소}는 시점에 따라 "공간"/"열람실"로 바뀝니다.
const P = PLACE_TOKEN;
const COPRESENCE: Group = {
  id: "copresence",
  title: "함께 있던 사람에 대해",
  noteByPhase: { B: ALONE_NOTE },
  items: [
    { code: "NM_1", text: `나는 함께 있던 두 사람과 내가 같은 ${P}에 있다고 자주 느꼈다.`, scale: LIKERT7 },
    { code: "NM_2", text: `함께 있던 두 사람도 우리가 같은 ${P}에 있다고 자주 느꼈을 것 같다.`, scale: LIKERT7 },
    { code: "NM_3", text: `나는 ${P}에 있는 그 두 사람을 자주 의식했다.`, scale: LIKERT7 },
    { code: "NM_4", text: `그 두 사람도 ${P}에 있는 나를 자주 의식했을 것이다.`, scale: LIKERT7 },
    { code: "NM_5", text: `나는 ${P}에 있는 그 두 사람을 거의 알아차리지 못했다.`, scale: LIKERT7, reverse: true },
    { code: "NM_6", text: `그 두 사람은 ${P}에 있는 나를 알아차리지 못했다.`, scale: LIKERT7, reverse: true },
    { code: "NM_7", text: `나는 우리가 같은 ${P}에 함께 있다기보다 서로 다른 곳에 있다고 자주 느꼈다.`, scale: LIKERT7, reverse: true },
    { code: "NM_8", text: `그 두 사람도 우리가 같은 ${P}에 함께 있다기보다 서로 다른 곳에 있다고 자주 느꼈을 것 같다.`, scale: LIKERT7, reverse: true },
  ],
};

// ── 마무리 (진행자가 입력) ──
const FINAL: Group = {
  id: "final",
  title: "마무리 (진행자 입력)",
  note: "인터뷰 → 의심 확인 → 사후 설명 순서를 지킵니다. 인터뷰 답은 녹음·메모로 남기고 여기에는 순위와 의심 확인, 철회 여부만 적습니다.",
  items: [
    { code: "INT_1_RANK", text: "선호 순위 (가장 잘됐다고 느낀 환경부터)", scale: choice("A>B>C", "A>C>B", "B>A>C", "B>C>A", "C>A>B", "C>B>A") },
    { code: "SUSP_1", text: "함께 있던 두 사람이 실제로 지금 접속해 있었다고 생각하셨나요?", scale: choice("예", "아니오", "잘 모르겠다") },
    { code: "SUSP_2", text: "다르게 느낀 점 (참가자의 말을 그대로 메모)", scale: TEXT },
    { code: "WITHDRAW", text: "사후 설명 뒤 자료 사용 철회", scale: choice("아니오 (사용 동의 유지)", "예 (자료 삭제)") },
    { code: "FEEDBACK", text: "과제·설문·흐름에 대한 참가자 피드백 (예비·팀 시험용 메모. 본 실험에서는 비워 둠)", scale: TEXT },
  ],
};

const CONDITION_END: Group[] = [KSSAS, FOCUS, EFFORT, CAMERA, COPRESENCE]; // 순서 고정: 상태 척도 먼저, 공존감 마지막

export const GROUPS_BY_PHASE: Record<Phase, Group[]> = {
  pre: [PRE_BASIC, PRE_BODY_DOUBLING, PRE_ASRS, KSSAS],
  A: CONDITION_END,
  B: CONDITION_END,
  C: CONDITION_END,
  final: [FINAL],
};
