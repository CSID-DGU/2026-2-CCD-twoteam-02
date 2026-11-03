// Supabase 사용량 + DB 상태 모니터 Edge Function
//   POST ?mode=check      : 5분마다. 지표 수집·저장
//                            - 사용량이 Free 한도의 50/80/95/100%를 처음 넘으면 경고
//                            - DB 상태(메모리·CPU·연결 수·장기 쿼리·락)가 나빠지면 경고, 계속되면 재알림, 회복되면 복구 알림
//   POST ?mode=summary    : 하루 한 번. 사용량 + DB 상태 요약(느린 쿼리, 캐시 적중률, 정리 필요 테이블 포함)
//   POST ?mode=discover   : 필요한 Metrics API 지표가 있는지 확인 (설치 시 1회)
//   POST ?mode=test-slack : Slack 연결 테스트
// 모든 요청은 x-monitor-secret 헤더가 CRON_SECRET과 같아야 합니다.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  accumulate, bar, cpuPct, cpuTotals, type CpuTotals, CUMULATIVE_METRICS, cycleEnd, cycleStart, fmt,
  fmtHealth, FREE_PLAN_LIMITS, HEALTH_DEFS, healthDecision, healthLevel, icon, LABELS, levelIcon,
  newThresholds, parsePrometheus, pickMetric, type Series, sumByName,
  type CronJob, describeQuery, overallSummary, type SummaryInput,
} from "./lib.ts";

const I = "    ";        // 1단계 들여쓰기
const I2 = I + I;        // 2단계 들여쓰기

const env = (k: string) => Deno.env.get(k) ?? undefined;

const SUPABASE_URL = env("SUPABASE_URL")!;
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY")!;
const METRICS_KEY = env("METRICS_KEY") ?? SERVICE_KEY; // sb_secret_... 또는 service_role 키
const SLACK_WEBHOOK_URL = env("SLACK_WEBHOOK_URL");
const CRON_SECRET = env("CRON_SECRET");
const CYCLE_DAY = Number(env("BILLING_CYCLE_DAY") ?? "1");
const PROJECT_LABEL = env("PROJECT_LABEL") ?? new URL(SUPABASE_URL).hostname.split(".")[0];
const THRESHOLDS = (env("ALERT_THRESHOLDS") ?? "50,80,95,100")
  .split(",").map(Number).filter((n) => n > 0).sort((a, b) => a - b);
const LIMITS: Record<string, number> = { ...FREE_PLAN_LIMITS, ...JSON.parse(env("LIMITS_JSON") ?? "{}") };
const REALERT_MIN = Number(env("HEALTH_REALERT_MINUTES") ?? "60");
// Egress 근사치는 내부 트래픽이 섞여 실제보다 훨씬 크게 잡히므로 기본은 참고용(경고·요약 판단 제외)
const EGRESS_ALERTS = env("EGRESS_ALERTS") === "true";
const isReferenceOnly = (metric: string) => metric === "egress_bytes_approx" && !EGRESS_ALERTS;
const RETENTION_DAYS = Number(env("SNAPSHOT_RETENTION_DAYS") ?? "14");

// DB 상태 기준값 덮어쓰기: {"mem_used_pct":[85,95], ...}
const HEALTH: typeof HEALTH_DEFS = structuredClone(HEALTH_DEFS);
for (const [k, v] of Object.entries(JSON.parse(env("HEALTH_THRESHOLDS_JSON") ?? "{}") as Record<string, [number, number]>)) {
  if (HEALTH[k]) { HEALTH[k].warn = v[0]; HEALTH[k].crit = v[1]; }
}

// Metrics API 지표 이름
const CONN_METRICS = env("REALTIME_CONN_METRICS");
const MSG_METRICS = env("REALTIME_MSG_METRICS");
const EGRESS_METRICS = env("EGRESS_METRICS") ?? "node_network_transmit_bytes_total";

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type Usage = Record<string, { value: number | null; note?: string }>;
type Health = Record<string, number | null>;
type HealthDetails = {
  connections?: number; max_connections?: number; long_running_count?: number;
  cache_hit_pct?: number | null; cpu_steal_pct?: number | null; swap_used_pct?: number | null;
  slow_queries?: { query: string; role: string; calls: number; mean_ms: number; total_sec: number; pct: number }[] | null;
  dead_tuples?: { tbl: string; dead: number; live: number; dead_pct: number; last_vacuum: string | null }[];
  cron_jobs?: CronJob[];
  fn_comments?: Record<string, string>;
};

async function fetchMetricsText(): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/customer/v1/privileged/metrics`, {
    headers: { Authorization: "Basic " + btoa(`service_role:${METRICS_KEY}`) },
  });
  if (!res.ok) throw new Error(`Metrics API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return await res.text();
}

async function slack(text: string) {
  if (!SLACK_WEBHOOK_URL) throw new Error("SLACK_WEBHOOK_URL 미설정");
  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Slack ${res.status}: ${await res.text()}`);
}

async function updateCounter(metric: string, raw: number, cycle: string): Promise<number> {
  const { data: prev } = await sb.from("usage_monitor_counters").select("*").eq("metric", metric).maybeSingle();
  const acc = accumulate(
    prev ? { cycle_start: prev.cycle_start, last_raw: prev.last_raw === null ? null : Number(prev.last_raw), accumulated: Number(prev.accumulated) } : null,
    raw, cycle,
  );
  const { error } = await sb.from("usage_monitor_counters").upsert({
    metric, cycle_start: cycle, last_raw: raw, accumulated: acc, updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return acc;
}

async function updatePeak(metric: string, current: number, cycle: string): Promise<number> {
  const { data: prev } = await sb.from("usage_monitor_peaks").select("peak")
    .eq("cycle_start", cycle).eq("metric", metric).maybeSingle();
  const prevPeak = prev ? Number(prev.peak) : -Infinity;
  if (current > prevPeak) {
    const { error } = await sb.from("usage_monitor_peaks").upsert({
      cycle_start: cycle, metric, peak: current, peak_at: new Date().toISOString(),
    });
    if (error) throw error;
    return current;
  }
  return prevPeak;
}

/** Metrics API에서 메모리·CPU 계산 */
async function collectHostHealth(series: Series[], sums: Map<string, number>, health: Health, details: HealthDetails) {
  const total = sums.get("node_memory_MemTotal_bytes");
  const avail = sums.get("node_memory_MemAvailable_bytes");
  health.mem_used_pct = total && avail !== undefined ? (1 - avail / total) * 100 : null;

  const swapTotal = sums.get("node_memory_SwapTotal_bytes");
  const swapFree = sums.get("node_memory_SwapFree_bytes");
  details.swap_used_pct = swapTotal && swapFree !== undefined ? (1 - swapFree / swapTotal) * 100 : null;

  const cur = cpuTotals(series);
  health.cpu_busy_pct = null;
  health.cpu_iowait_pct = null;
  details.cpu_steal_pct = null;
  if (cur) {
    const { data: prevRow } = await sb.from("usage_monitor_kv").select("value").eq("key", "cpu_prev").maybeSingle();
    const pct = cpuPct((prevRow?.value as CpuTotals) ?? null, cur);
    if (pct) {
      health.cpu_busy_pct = pct.busy;
      health.cpu_iowait_pct = pct.iowait;
      details.cpu_steal_pct = pct.steal;
    }
    await sb.from("usage_monitor_kv").upsert({ key: "cpu_prev", value: cur, updated_at: new Date().toISOString() });
  }
}

/** 모든 지표 수집 + 상태 갱신 */
async function collect(now: Date) {
  const start = cycleStart(now, CYCLE_DAY);
  const cycle = start.toISOString().slice(0, 10);
  const usage: Usage = {};
  const health: Health = {};
  const details: HealthDetails = {};
  const warnings: string[] = [];

  // 1) DB 기반 사용량: DB 크기, Storage, MAU
  const { data: db, error: dbErr } = await sb.rpc("usage_monitor_db_stats", { p_cycle_start: start.toISOString() });
  if (dbErr) {
    warnings.push(`사용량 조회 실패: ${dbErr.message}`);
  } else {
    usage.db_size_bytes = { value: Number(db.db_size_bytes) };
    usage.storage_bytes = { value: Number(db.storage_bytes) };
    usage.mau = { value: Number(db.mau), note: "로그인/세션 갱신 기준 근사치" };
  }

  // 2) DB 내부 상태: 연결 수, 장기 쿼리, 락, 캐시, 느린 쿼리, dead tuple
  const { data: hs, error: hsErr } = await sb.rpc("usage_monitor_health_stats");
  if (hsErr) {
    warnings.push(`DB 상태 조회 실패: ${hsErr.message}`);
  } else {
    const connections = Number(hs.connections);
    const maxConnections = Number(hs.max_connections);
    details.connections = connections;
    details.max_connections = maxConnections;
    details.long_running_count = Number(hs.long_running_count);
    details.cache_hit_pct = hs.cache_hit_pct === null ? null : Number(hs.cache_hit_pct);
    details.slow_queries = hs.slow_queries;
    details.dead_tuples = hs.dead_tuples ?? [];
    details.cron_jobs = hs.cron_jobs ?? [];
    details.fn_comments = hs.fn_comments ?? {};
    health.conn_pct = maxConnections ? (connections / maxConnections) * 100 : null;
    health.longest_running_min = Number(hs.longest_running_min);
    health.idle_in_tx = Number(hs.idle_in_tx);
    health.blocked = Number(hs.blocked);
  }

  // 3) Metrics API: 메모리·CPU, Realtime, 네트워크 송신량
  try {
    const series = parsePrometheus(await fetchMetricsText());
    const sums = sumByName(series);

    await collectHostHealth(series, sums, health, details);

    const conn = pickMetric(sums, CONN_METRICS, /^realtime_.*connect/i, {
      exclude: /(_total|_bucket|_sum|_count|_seconds.*)$/, single: true,
    });
    if (conn.value === null) {
      usage.realtime_peak_connections = { value: null, note: "Metrics API 미제공 → 대시보드 Usage 페이지에서 확인" };
    } else {
      const peak = await updatePeak("realtime_peak_connections", conn.value, cycle);
      usage.realtime_peak_connections = {
        value: peak, note: `현재 ${Math.round(conn.value)} · ${conn.auto ? "자동탐지 " : ""}${conn.names.join("+")}`,
      };
    }

    const msg = pickMetric(sums, MSG_METRICS, /^realtime_.*(messages|events).*_total$/i);
    if (msg.value === null) {
      usage.realtime_messages = { value: null, note: "Metrics API 미제공 → 대시보드 Usage 페이지에서 확인" };
    } else {
      usage.realtime_messages = {
        value: await updateCounter("realtime_messages", msg.value, cycle),
        note: `설치 이후 누적 · ${msg.auto ? "자동탐지 " : ""}${msg.names.join("+")}`,
      };
    }

    const eg = pickMetric(sums, EGRESS_METRICS, /^$/);
    if (eg.value !== null) {
      usage.egress_bytes_approx = {
        value: await updateCounter("egress_bytes_approx", eg.value, cycle),
        note: "DB 서버 전체 송신량(내부 트래픽 포함)이라 실제 과금 Egress보다 훨씬 큼 · 실제 값은 대시보드 Usage 페이지",
      };
    }
  } catch (e) {
    warnings.push(`Metrics API 조회 실패: ${(e as Error).message}`);
  }

  // 4) 스냅샷 기록 + 오래된 기록 정리
  const rows = [
    ...Object.entries(usage).filter(([, u]) => u.value !== null)
      .map(([metric, u]) => ({ cycle_start: cycle, metric, value: u.value })),
    ...Object.entries(health).filter(([, v]) => v !== null && Number.isFinite(v))
      .map(([metric, v]) => ({ cycle_start: cycle, metric: `health_${metric}`, value: v })),
  ];
  if (rows.length) await sb.from("usage_monitor_snapshots").insert(rows);
  await sb.from("usage_monitor_snapshots").delete()
    .lt("taken_at", new Date(now.getTime() - RETENTION_DAYS * 86400_000).toISOString());

  return { start, cycle, usage, health, details, warnings };
}

function projectedPct(metric: string, value: number, now: Date, start: Date): number | null {
  if (!CUMULATIVE_METRICS.has(metric) || isReferenceOnly(metric)) return null;
  const end = cycleEnd(start);
  const elapsed = (now.getTime() - start.getTime()) / (end.getTime() - start.getTime());
  if (elapsed <= 0.1) return null;
  return (value / elapsed / LIMITS[metric]) * 100;
}

function line(metric: string, value: number, now: Date, start: Date, indent = ""): string {
  const limit = LIMITS[metric];
  const pct = (value / limit) * 100;
  if (isReferenceOnly(metric)) {
    return `${indent}⚪ *${LABELS[metric] ?? metric} · 참고용*  ${fmt(metric, value)}`;
  }
  let s = `${indent}${icon(pct)} *${LABELS[metric] ?? metric}*  ${bar(pct)}  ${fmt(metric, value)} / ${fmt(metric, limit)} (${pct.toFixed(1)}%)`;
  const pp = projectedPct(metric, value, now, start);
  if (pp !== null && pp >= 80) {
    s += `\n${indent}${I}↳ 이 속도면 주기 말 약 ${fmt(metric, (pp / 100) * limit)} (${pp.toFixed(0)}%) 예상`;
  }
  return s;
}

function healthText(metric: string, v: number, details: HealthDetails): string {
  if (metric === "conn_pct" && details.max_connections) {
    return `${details.connections}/${details.max_connections} (${v.toFixed(0)}%)`;
  }
  return fmtHealth(metric, v);
}

/** DB 상태 경고·재알림·복구 판단 */
async function evaluateHealth(health: Health, details: HealthDetails, now: Date): Promise<string[]> {
  const { data: states } = await sb.from("usage_monitor_health_state").select("*");
  const byMetric = new Map((states ?? []).map((s) => [s.metric, s]));
  const alerts: string[] = [];
  const recovered: string[] = [];

  for (const [metric, def] of Object.entries(HEALTH)) {
    const v = health[metric];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    const prev = byMetric.get(metric) ?? null;
    const prevLevel = prev?.level ?? 0;
    const level = healthLevel(v, def);
    const decision = healthDecision(prev, level, now, REALERT_MIN);

    const changedState = (prevLevel === 0) !== (level === 0);
    const since = changedState || !prev ? now.toISOString() : prev.since;
    const sinceMin = Math.round((now.getTime() - new Date(since).getTime()) / 60_000);

    if (decision === "alert" || decision === "realert") {
      const limitTxt = level >= 2 ? `위험 기준 ${fmtHealth(metric, def.crit)}` : `주의 기준 ${fmtHealth(metric, def.warn)}`;
      const dur = decision === "realert" ? ` · ${sinceMin}분째 지속` : "";
      alerts.push(`${I}${levelIcon(level)} *${def.label}*  ${healthText(metric, v, details)}  (${limitTxt}${dur})`);
    } else if (decision === "recover") {
      recovered.push(`${I}✅ *${def.label}*  ${healthText(metric, v, details)}  정상 복귀`);
    }

    await sb.from("usage_monitor_health_state").upsert({
      metric, level, since, value: v,
      last_alert_at: decision === "alert" || decision === "realert" ? now.toISOString() : prev?.last_alert_at ?? null,
    });
  }

  const out: string[] = [];
  if (alerts.length) {
    out.push(
      `🚨 *DB 상태 경고* — \`${PROJECT_LABEL}\`\n\n${alerts.join("\n")}` +
      (recovered.length ? `\n\n${recovered.join("\n")}` : "") +
      `\n\n대시보드 *Reports → Database*, *Query Performance*에서 원인을 확인하세요. 상태가 계속되면 ${REALERT_MIN}분마다 다시 알려드려요.`,
    );
  } else if (recovered.length) {
    out.push(`✅ *DB 상태 정상 복귀* — \`${PROJECT_LABEL}\`\n\n${recovered.join("\n")}`);
  }
  return out;
}

async function runCheck(now: Date) {
  const { start, cycle, usage, health, details, warnings } = await collect(now);
  const alerts: string[] = [];

  for (const [metric, u] of Object.entries(usage)) {
    if (u.value === null || !LIMITS[metric] || isReferenceOnly(metric)) continue;
    const pct = (u.value / LIMITS[metric]) * 100;
    const { data: sent } = await sb.from("usage_monitor_alerts_sent").select("threshold")
      .eq("cycle_start", cycle).eq("metric", metric);
    const fresh = newThresholds(pct, THRESHOLDS, new Set((sent ?? []).map((r) => r.threshold)));
    if (!fresh.length) continue;
    await sb.from("usage_monitor_alerts_sent").insert(
      fresh.map((t) => ({ cycle_start: cycle, metric, threshold: t, value: u.value })),
    );
    alerts.push(`${line(metric, u.value, now, start, I)}\n${I2}↳ *${Math.max(...fresh)}% 단계 도달*`);
  }

  if (alerts.length) {
    await slack(
      `🚨 *Supabase 사용량 경고* — \`${PROJECT_LABEL}\` (Free 플랜)\n\n${alerts.join("\n")}\n\n` +
      `결제 주기 ${cycle} ~ ${cycleEnd(start).toISOString().slice(0, 10)} · 정확한 값은 대시보드 Usage 페이지 확인`,
    );
  }

  const healthMsgs = await evaluateHealth(health, details, now);
  for (const m of healthMsgs) await slack(m);

  return { mode: "check", cycle, usage, health, alerts: alerts.length, health_messages: healthMsgs.length, warnings };
}

async function max24h(metric: string, now: Date): Promise<number | null> {
  const { data } = await sb.from("usage_monitor_snapshots").select("value")
    .eq("metric", `health_${metric}`)
    .gte("taken_at", new Date(now.getTime() - 86400_000).toISOString())
    .order("value", { ascending: false }).limit(1).maybeSingle();
  return data ? Number(data.value) : null;
}

type HealthReport = { text: string; summary: SummaryInput["health"]; watch: string[]; available: boolean };

async function healthSection(health: Health, details: HealthDetails, now: Date): Promise<HealthReport> {
  const lines: string[] = [];
  const summary: SummaryInput["health"] = [];
  const watch: string[] = [];

  for (const [metric, def] of Object.entries(HEALTH)) {
    const v = health[metric];
    const mx = await max24h(metric, now);
    if (v === null || v === undefined || !Number.isFinite(v)) {
      lines.push(`${I}⚪ *${def.label}*  수집 안 됨`);
      continue;
    }
    const worst = Math.max(v, mx ?? v);
    const level = healthLevel(worst, def);
    let s = `${I}${levelIcon(level)} *${def.label}*  ${healthText(metric, v, details)}`;
    if (mx !== null) s += `  · 24시간 최대 ${metric === "conn_pct" && details.max_connections
      ? `${Math.round((mx / 100) * details.max_connections)}개` : fmtHealth(metric, mx)}`;
    lines.push(s);
    summary.push({
      label: def.label.replace(/\(.*\)$/, ""),
      level,
      valueText: metric === "conn_pct" && details.max_connections
        ? `${Math.round((worst / 100) * details.max_connections)}/${details.max_connections}개`
        : fmtHealth(metric, worst),
      warnText: fmtHealth(metric, def.warn),
      closeness: def.warn > 0 ? worst / def.warn : 0,
    });
  }

  if (details.cpu_steal_pct !== null && details.cpu_steal_pct !== undefined && details.cpu_steal_pct >= 10) {
    lines.push(`${I}🟠 *CPU steal*  ${details.cpu_steal_pct.toFixed(1)}%`);
    lines.push(`${I2}공유 CPU를 다른 사용자에게 빼앗기는 중 (일시적이면 무시해도 됨)`);
    watch.push(`CPU steal ${details.cpu_steal_pct.toFixed(0)}%`);
  }
  if (details.swap_used_pct !== null && details.swap_used_pct !== undefined) {
    const high = details.swap_used_pct >= 50;
    lines.push(`${I}${high ? "🟠" : "🟢"} *스왑 사용률*  ${details.swap_used_pct.toFixed(0)}%`);
    if (high) {
      lines.push(`${I2}메모리가 부족해 디스크를 메모리처럼 쓰는 중. 계속 오르면 메모리 부족 신호`);
      watch.push(`스왑 사용률 ${details.swap_used_pct.toFixed(0)}%`);
    }
  }
  if (details.cache_hit_pct !== null && details.cache_hit_pct !== undefined) {
    const ok = details.cache_hit_pct >= 99;
    lines.push(`${I}${ok ? "🟢" : "🟠"} *캐시 적중률*  ${details.cache_hit_pct.toFixed(2)}%`);
    if (!ok) {
      lines.push(`${I2}99% 미만이면 메모리 대비 자주 읽는 데이터가 많다는 뜻`);
      watch.push(`캐시 적중률 ${details.cache_hit_pct.toFixed(1)}%`);
    }
  }

  let out = `🩺 *DB 상태* (현재값 · 지난 24시간 최대)\n` + lines.join("\n");

  if (details.slow_queries === null) {
    out += `\n\n🐢 *느린 쿼리*\n${I}pg_stat_statements를 읽을 수 없음`;
  } else if (details.slow_queries?.length) {
    const ctx = { cronJobs: details.cron_jobs ?? [], fnComments: details.fn_comments ?? {} };
    out += `\n\n🐢 *DB 시간을 가장 많이 쓴 쿼리 Top ${details.slow_queries.length}* (통계 초기화 이후 누적)\n` +
      details.slow_queries.map((q, i) => {
        const d = describeQuery(q.query, q.role, ctx);
        const shown = q.query.length > 100 ? q.query.slice(0, 100) + "…" : q.query;
        return `${I}${i + 1}. *[${d.kind}]* ${d.desc}\n` +
          `${I2}\`${shown.replace(/`/g, "'")}\`\n` +
          `${I2}전체의 ${q.pct}% · ${Number(q.calls).toLocaleString("en-US")}회 · 평균 ${q.mean_ms}ms · 실행 계정 ${q.role}`;
      }).join("\n");
  }

  if (details.dead_tuples?.length) {
    out += `\n\n🧹 *정리가 밀린 테이블* (죽은 행 20% 이상)\n` +
      details.dead_tuples.map((t) =>
        `${I}• \`${t.tbl}\`  죽은 행 ${Number(t.dead).toLocaleString("en-US")}개 (${t.dead_pct}%) · 마지막 정리 ${t.last_vacuum ? t.last_vacuum.slice(0, 16).replace("T", " ") + " UTC" : "없음"}`
      ).join("\n");
    watch.push(`정리가 밀린 테이블 ${details.dead_tuples.length}개`);
  }

  return { text: out, summary, watch, available: summary.length > 0 };
}

async function runSummary(now: Date) {
  const { start, cycle, usage, health, details, warnings } = await collect(now);
  const end = cycleEnd(start);
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86400_000);
  const order = ["db_size_bytes", "storage_bytes", "mau", "egress_bytes_approx", "realtime_peak_connections", "realtime_messages"];
  const lines = order.map((m) => {
    const u = usage[m];
    if (!u || u.value === null) return `${I}⚪ *${LABELS[m]}*  ${u?.note ?? "수집 안 됨"}`;
    return line(m, u.value, now, start, I) + (u.note ? `\n${I2}_${u.note}_` : "");
  });

  const hr = await healthSection(health, details, now);
  const usageForSummary = order
    .filter((m) => usage[m] && usage[m].value !== null && LIMITS[m] && !isReferenceOnly(m))
    .map((m) => ({
      label: LABELS[m].replace(/ \(.*\)$/, ""),
      pct: (usage[m].value! / LIMITS[m]) * 100,
      projectedPct: projectedPct(m, usage[m].value!, now, start),
    }));
  const overview = overallSummary({
    health: hr.summary,
    watch: hr.watch,
    usage: usageForSummary,
    cycleDay: start.getUTCDate(),
    nextResetText: `${end.getUTCMonth() + 1}월 ${end.getUTCDate()}일`,
    daysLeft,
    healthAvailable: hr.available,
  });

  const warn = warnings.length ? `\n\n⚠️ *수집 오류*\n${warnings.map((w) => `${I}${w}`).join("\n")}` : "";
  await slack(
    `📊 *Supabase 일일 점검* — \`${PROJECT_LABEL}\`\n\n` +
    `📝 *한눈에 보기*\n${overview.map((o) => `${I}• ${o}`).join("\n")}\n\n` +
    hr.text +
    `\n\n📦 *사용량* (결제 주기 ${cycle} ~ ${end.toISOString().slice(0, 10)}, 남은 ${daysLeft}일)\n` +
    lines.join("\n") + warn,
  );
  return { mode: "summary", cycle, usage, health, warnings };
}

async function runDiscover() {
  const series = parsePrometheus(await fetchMetricsText());
  const sums = sumByName(series);
  const count = (n: string) => series.filter((s) => s.name === n).length;
  const required = [
    "node_memory_MemTotal_bytes", "node_memory_MemAvailable_bytes",
    "node_memory_SwapTotal_bytes", "node_memory_SwapFree_bytes", "node_cpu_seconds_total",
  ].map((name) => ({ name, series: count(name), value: sums.get(name) ?? null }));
  const cpuModes = [...new Set(series.filter((s) => s.name === "node_cpu_seconds_total")
    .map((s) => s.labels.match(/mode="([^"]*)"/)?.[1]).filter(Boolean))];
  const realtime = [...sums.keys()].filter((n) => /^realtime_/.test(n)).sort();
  return { mode: "discover", total_metric_names: sums.size, required, cpu_modes: cpuModes, realtime };
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-monitor-secret") !== CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  const mode = new URL(req.url).searchParams.get("mode") ?? "check";
  const now = new Date();
  try {
    const result = mode === "summary" ? await runSummary(now)
      : mode === "discover" ? await runDiscover()
      : mode === "test-slack" ? (await slack(`✅ Supabase 모니터 연결 테스트 — \`${PROJECT_LABEL}\``), { mode })
      : await runCheck(now);
    return Response.json(result);
  } catch (e) {
    const msg = (e as Error).message;
    console.error(msg);
    // 모니터 자체가 고장 나면 조용히 멈추지 않도록 Slack에도 알림 (Slack 자체 오류는 제외).
    // check 모드는 5분마다 돌기 때문에 스팸을 막으려고 매시 정각 직후 실행분에서만 알림.
    const notify = mode !== "check" || now.getUTCMinutes() < 5;
    if (notify && !msg.startsWith("Slack") && !msg.includes("SLACK_WEBHOOK_URL")) {
      try { await slack(`⚠️ 모니터 실행 오류 (\`${PROJECT_LABEL}\`, ${mode}): ${msg}`); } catch { /* ignore */ }
    }
    return Response.json({ error: msg }, { status: 500 });
  }
});
