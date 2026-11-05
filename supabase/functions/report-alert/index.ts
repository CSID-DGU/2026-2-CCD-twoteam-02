// 새 신고를 신고 전용 Slack 채널로 보내는 Edge Function (#471)
//   POST : pg_cron 이 안 보낸 신고가 있을 때만 부릅니다 (1분 주기)
// 요청은 x-monitor-secret 헤더가 CRON_SECRET 과 같아야 합니다.
// 신고 표를 읽고 쓰려고 service role 키를 씁니다. 이 키는 함수 안에만 있고 화면에는 가지 않습니다.

import { createClient } from "npm:@supabase/supabase-js@2";
import { MAX_BATCH, runAlert, type UnsentReport } from "./lib.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");
// 사용량 모니터의 SLACK_WEBHOOK_URL 과 다른 채널입니다
const WEBHOOK_URL = Deno.env.get("REPORT_SLACK_WEBHOOK_URL");
const SLACK_TIMEOUT_MS = 10_000;

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function fetchUnsent(): Promise<UnsentReport[]> {
  const { data, error } = await sb.from("reports")
    .select("id, created_at, kind, detail, message, context")
    .is("notified_at", null)
    .order("created_at", { ascending: true })
    .limit(MAX_BATCH);
  if (error) throw new Error(`신고 조회 실패: ${error.message}`);
  return (data ?? []) as UnsentReport[];
}

async function send(text: string): Promise<void> {
  if (!WEBHOOK_URL) throw new Error("REPORT_SLACK_WEBHOOK_URL 미설정");
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // 사용자가 쓴 링크의 미리보기를 띄우지 않습니다
    body: JSON.stringify({ text, unfurl_links: false, unfurl_media: false }),
    signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
  });
  // 오류 문구에 웹훅 주소를 넣지 않습니다
  if (!res.ok) throw new Error(`Slack 전송 실패: ${res.status}`);
}

async function markSent(ids: string[]): Promise<void> {
  const { error } = await sb.from("reports")
    .update({ notified_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw new Error(`알림 시각 기록 실패: ${error.message}`);
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-monitor-secret") !== CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  try {
    return Response.json(await runAlert({ fetchUnsent, send, markSent }));
  } catch (e) {
    const error = (e as Error).message;
    console.error(error);
    return Response.json({ error }, { status: 500 });
  }
});
