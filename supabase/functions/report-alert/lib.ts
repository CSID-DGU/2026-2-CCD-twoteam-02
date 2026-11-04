// 신고 알림(#471)의 순수 로직. Deno 전용 API 와 외부 패키지를 쓰지 않습니다.
// 사용자가 쓴 값은 Slack 서식으로 동작하지 않게 처리하고, 닉네임·판정 수치·브라우저 정보는 싣지 않습니다.

export const MAX_BATCH = 50; // 한 번에 읽는 신고 수
export const MAX_DETAILED = 5; // 한 메시지에 자세히 싣는 신고 수
export const MAX_MESSAGE_CHARS = 200; // 설명 글자 수
export const MAX_BRANCH_CHARS = 30; // 지점 이름 글자 수

const SERVICE_URL = "https://twoteam.vercel.app";

// src/report/reportLogic.ts 의 KIND_LABEL·DETAIL_LABEL 과 같은 문구.
// Edge Function 은 src/ 를 가져올 수 없어 복사해 둡니다.
const KIND_LABEL = { judgment: "판정 오류", bug: "화면·기능 버그", other: "기타·의견" } as const;
const DETAIL_LABEL = {
  false_alarm: "공부 중인데 노랑·빨강",
  missed: "안 하는데 초록",
  unsure: "모르겠음",
} as const;

export type UnsentReport = {
  id: string;
  created_at: string;
  kind: "judgment" | "bug" | "other";
  detail: "false_alarm" | "missed" | "unsure" | null;
  message: string;
  context: unknown; // 사용자 브라우저가 넣는 값이라 모양을 믿지 않습니다
};

// Slack 이 서식으로 읽는 세 글자만 바꿉니다. <!channel> 같은 전체 멘션과 가짜 링크를 막습니다.
export function escapeSlack(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// 줄바꿈을 공백으로 바꾸고 자른 뒤 이스케이프합니다. 이 순서라야 &lt; 가 중간에 잘리지 않습니다.
// Array.from 은 글자 단위로 나누므로 이모지가 반으로 깨지지 않습니다.
function clean(text: string, maxChars: number): string {
  const oneLine = text.replace(/\s*[\r\n]+\s*/g, " ").trim();
  return escapeSlack(Array.from(oneLine).slice(0, maxChars).join(""));
}

function branchOf(context: unknown): string {
  if (context === null || typeof context !== "object") return "-";
  const branch = (context as { branch?: unknown }).branch;
  if (typeof branch !== "string") return "-";
  return clean(branch, MAX_BRANCH_CHARS) || "-";
}

const kstFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// 예: 11/04 16:20
function kstTime(iso: string): string {
  const part = (type: string) => kstFormat.formatToParts(new Date(iso)).find((p) => p.type === type)?.value;
  return `${part("month")}/${part("day")} ${part("hour")}:${part("minute")}`;
}

function kindText(r: UnsentReport): string {
  return r.detail ? `${KIND_LABEL[r.kind]}(${DETAIL_LABEL[r.detail]})` : KIND_LABEL[r.kind];
}

export function buildAlertText(rows: UnsentReport[]): string {
  const items = rows.slice(0, MAX_DETAILED).map((r) => {
    const message = clean(r.message, MAX_MESSAGE_CHARS) || "(설명 없음)";
    return `• ${kindText(r)} · ${branchOf(r.context)} · ${kstTime(r.created_at)}\n> ${message}`;
  });
  const rest = rows.length - items.length;
  return [
    `🐞 새 신고 ${rows.length}건`,
    ...items,
    ...(rest > 0 ? [`외 ${rest}건`] : []),
    `신고 목록에서 확인: ${SERVICE_URL}`,
  ].join("\n");
}

// 보낸 뒤에 기록합니다. 전송이나 기록이 실패하면 오류를 던지고, 기록되지 않은 신고는 다음 실행 때 다시 보냅니다.
export async function runAlert(deps: {
  fetchUnsent: () => Promise<UnsentReport[]>;
  send: (text: string) => Promise<void>;
  markSent: (ids: string[]) => Promise<void>;
}): Promise<{ sent: number }> {
  const rows = await deps.fetchUnsent();
  if (rows.length === 0) return { sent: 0 };
  await deps.send(buildAlertText(rows));
  await deps.markSent(rows.map((r) => r.id));
  return { sent: rows.length };
}
