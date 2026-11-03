// 순수 로직 (DB·네트워크 없음) — 테스트 가능하도록 분리

export const MB = 1024 ** 2;
export const GB = 1024 ** 3;

// Supabase Free 플랜 기본 한도 (조직 단위). LIMITS_JSON 환경변수로 덮어쓸 수 있음.
export const FREE_PLAN_LIMITS: Record<string, number> = {
  realtime_peak_connections: 200,
  realtime_messages: 2_000_000,
  db_size_bytes: 500 * MB,
  storage_bytes: 1 * GB,
  mau: 50_000,
  egress_bytes_approx: 5 * GB,
};

export const LABELS: Record<string, string> = {
  realtime_peak_connections: "Realtime 동시접속 피크",
  realtime_messages: "Realtime 메시지",
  db_size_bytes: "DB 크기",
  storage_bytes: "Storage 용량",
  mau: "MAU",
  egress_bytes_approx: "Egress (근사치)",
};

export const BYTE_METRICS = new Set(["db_size_bytes", "storage_bytes", "egress_bytes_approx"]);
// 주기 동안 계속 쌓이는 지표 → 주기 말 예상치를 계산
export const CUMULATIVE_METRICS = new Set(["realtime_messages", "egress_bytes_approx", "mau"]);

/** Prometheus 텍스트를 시리즈 단위로 파싱 */
export type Series = { name: string; labels: string; value: number };

export function parsePrometheus(text: string): Series[] {
  const out: Series[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{.*\})?\s+(\S+)/);
    if (!m) continue;
    const value = Number(m[3]);
    if (!Number.isFinite(value)) continue;
    out.push({ name: m[1], labels: m[2] ?? "", value });
  }
  return out;
}

/** 이름별 합계. loopback 네트워크 장치(device="lo")는 제외 */
export function sumByName(series: Series[]): Map<string, number> {
  const sums = new Map<string, number>();
  for (const s of series) {
    if (/device="lo"/.test(s.labels)) continue;
    sums.set(s.name, (sums.get(s.name) ?? 0) + s.value);
  }
  return sums;
}

/**
 * 지표 고르기: 환경변수에 이름(쉼표 구분)이 있으면 그것들의 합,
 * 없으면 패턴으로 자동 탐지(single=true면 첫 번째 하나만).
 */
export function pickMetric(
  sums: Map<string, number>,
  configured: string | undefined,
  pattern: RegExp,
  opts: { exclude?: RegExp; single?: boolean } = {},
): { value: number | null; names: string[]; auto: boolean } {
  let names: string[];
  const auto = !configured?.trim();
  if (!auto) {
    names = configured!.split(",").map((s) => s.trim()).filter((n) => sums.has(n));
  } else {
    names = [...sums.keys()]
      .filter((n) => pattern.test(n) && !(opts.exclude?.test(n)))
      .sort();
    if (opts.single) names = names.slice(0, 1);
  }
  if (!names.length) return { value: null, names, auto };
  return { value: names.reduce((a, n) => a + (sums.get(n) ?? 0), 0), names, auto };
}

/** 결제 주기 시작일(UTC). cycleDay는 1~28 */
export function cycleStart(now: Date, cycleDay: number): Date {
  const day = Math.min(Math.max(Math.trunc(cycleDay) || 1, 1), 28);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  let start = new Date(Date.UTC(y, m, day));
  if (now < start) start = new Date(Date.UTC(y, m - 1, day));
  return start;
}

export function cycleEnd(start: Date): Date {
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate()));
}

/**
 * 카운터 누적: 원시값이 줄었으면(서비스 재시작 등으로 리셋) 새 원시값 전체를 증가분으로 봄.
 * prev가 없으면(최초 실행) 기준점만 잡고 0.
 */
export function accumulate(
  prev: { cycle_start: string; last_raw: number | null; accumulated: number } | null,
  raw: number,
  currentCycle: string,
): number {
  if (!prev || prev.last_raw === null) return 0;
  const base = prev.cycle_start === currentCycle ? prev.accumulated : 0;
  const delta = raw >= prev.last_raw ? raw - prev.last_raw : raw;
  return base + delta;
}

/** 새로 넘은 경고 단계들 */
export function newThresholds(pct: number, thresholds: number[], alreadySent: Set<number>): number[] {
  return thresholds.filter((t) => pct >= t && !alreadySent.has(t));
}

export function fmt(metric: string, v: number): string {
  if (BYTE_METRICS.has(metric)) {
    if (v >= GB) return `${(v / GB).toFixed(2)} GB`;
    return `${(v / MB).toFixed(1)} MB`;
  }
  return Math.round(v).toLocaleString("en-US");
}

export function bar(pct: number, width = 10): string {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

export function icon(pct: number): string {
  if (pct >= 95) return "🔴";
  if (pct >= 80) return "🟠";
  if (pct >= 50) return "🟡";
  return "🟢";
}

// ───────────── DB 상태 점검 ─────────────

export function labelValue(labels: string, key: string): string | undefined {
  const m = labels.match(new RegExp(`${key}="([^"]*)"`));
  return m?.[1];
}

/** node_cpu_seconds_total을 mode별로 합산 */
export type CpuTotals = { total: number; idle: number; iowait: number; steal: number };

export function cpuTotals(series: Series[]): CpuTotals | null {
  const t: CpuTotals = { total: 0, idle: 0, iowait: 0, steal: 0 };
  let found = false;
  for (const s of series) {
    if (s.name !== "node_cpu_seconds_total") continue;
    found = true;
    const mode = labelValue(s.labels, "mode");
    if (mode === "guest" || mode === "guest_nice") continue; // user에 이미 포함
    t.total += s.value;
    if (mode === "idle") t.idle += s.value;
    if (mode === "iowait") t.iowait += s.value;
    if (mode === "steal") t.steal += s.value;
  }
  return found ? t : null;
}

/** 직전 값과 비교한 구간 CPU 비율(%). 재시작 등으로 값이 줄면 null */
export function cpuPct(prev: CpuTotals | null, cur: CpuTotals) {
  if (!prev) return null;
  const dt = cur.total - prev.total;
  if (dt <= 0 || cur.idle < prev.idle) return null;
  const pct = (a: number, b: number) => Math.max(0, Math.min(100, ((a - b) / dt) * 100));
  const idle = pct(cur.idle, prev.idle);
  const iowait = pct(cur.iowait, prev.iowait);
  return {
    busy: Math.max(0, 100 - idle - iowait), // 실제로 일한 비율
    iowait,                                  // 디스크 기다린 비율
    steal: pct(cur.steal, prev.steal),       // 공유 CPU에서 빼앗긴 비율
  };
}

export type HealthDef = { label: string; unit: string; warn: number; crit: number };

export const HEALTH_DEFS: Record<string, HealthDef> = {
  mem_used_pct:        { label: "메모리 사용률",          unit: "%",  warn: 85, crit: 95 },
  cpu_busy_pct:        { label: "CPU 사용률(5분 평균)",    unit: "%",  warn: 80, crit: 95 },
  cpu_iowait_pct:      { label: "디스크 대기(iowait)",     unit: "%",  warn: 20, crit: 40 },
  conn_pct:            { label: "DB 연결 수",              unit: "%",  warn: 70, crit: 90 },
  longest_running_min: { label: "가장 오래 실행 중인 쿼리", unit: "분", warn: 5,  crit: 30 },
  idle_in_tx:          { label: "열린 채 방치된 트랜잭션(5분+)", unit: "개", warn: 1, crit: 3 },
  blocked:             { label: "락 대기 쿼리(1분+)",      unit: "개", warn: 1,  crit: 5 },
};

export function healthLevel(value: number, def: { warn: number; crit: number }): 0 | 1 | 2 {
  if (value >= def.crit) return 2;
  if (value >= def.warn) return 1;
  return 0;
}

/**
 * 알림 여부 결정
 *  - 단계가 올라가면 즉시 알림
 *  - 같은 비정상 단계가 계속되면 realertMin 분마다 재알림
 *  - 비정상 → 정상이면 복구 알림
 */
export function healthDecision(
  prev: { level: number; last_alert_at: string | null } | null,
  level: number,
  now: Date,
  realertMin: number,
): "alert" | "realert" | "recover" | null {
  const prevLevel = prev?.level ?? 0;
  if (level > prevLevel) return "alert";
  if (level === 0) return prevLevel > 0 ? "recover" : null;
  const last = prev?.last_alert_at ? new Date(prev.last_alert_at).getTime() : 0;
  if (now.getTime() - last >= realertMin * 60_000) return "realert";
  return null;
}

export function fmtHealth(metric: string, v: number): string {
  const d = HEALTH_DEFS[metric];
  if (!d) return String(v);
  if (d.unit === "%") return `${v.toFixed(1)}%`;
  if (d.unit === "분") return `${v.toFixed(1)}분`;
  return `${Math.round(v)}개`;
}

export function levelIcon(level: number): string {
  return level >= 2 ? "🔴" : level === 1 ? "🟠" : "🟢";
}

// ───────────── 쿼리 설명 ─────────────

export type CronJob = { jobname: string; schedule: string; command: string };
export type QueryCtx = { cronJobs: CronJob[]; fnComments: Record<string, string> };
export type QueryDesc = { kind: "앱" | "내부" | "예약 작업"; desc: string };

export function scheduleKo(s: string): string {
  const t = s.trim();
  if (t === "* * * * *") return "1분마다";
  let m = t.match(/^\*\/(\d+) \* \* \* \*$/);
  if (m) return `${m[1]}분마다`;
  m = t.match(/^(\d+) \* \* \* \*$/);
  if (m) return `매시 ${m[1]}분`;
  m = t.match(/^(\d+) seconds?$/);
  if (m) return `${m[1]}초마다`;
  return t;
}

function withComment(desc: string, fn: string, ctx: QueryCtx): string {
  const c = ctx.fnComments[fn];
  return c ? `${desc} — ${c}` : desc;
}

const ROLE_DESC: Record<string, QueryDesc> = {
  authenticated: { kind: "앱", desc: "로그인한 앱 사용자의 요청" },
  anon: { kind: "앱", desc: "로그인하지 않은 앱 사용자의 요청" },
  service_role: { kind: "앱", desc: "서버(관리자 키)에서 보낸 요청" },
  authenticator: { kind: "내부", desc: "Supabase API 서버의 내부 쿼리" },
};

/** 쿼리 내용·실행 역할을 보고 어떤 쿼리인지 짧게 설명 */
export function describeQuery(query: string, role: string, ctx: QueryCtx): QueryDesc {
  const q = query;
  const l = q.toLowerCase();

  // 1) 이름이 드러나는 함수 호출 (예약 작업 / API RPC / 직접 실행)
  const rpc = q.match(/"(\w+)"\."(\w+)"\([^)]*\)\s+pgrst_call/);
  if (rpc) return { kind: "앱", desc: withComment(`앱이 Supabase API로 호출한 함수 \`${rpc[2]}()\``, rpc[2], ctx) };

  const direct = q.match(/^\s*select\s+(?:"?\w+"?\.)?"?(\w+)"?\s*\(.*\)\s*;?\s*$/i);
  const fn = direct?.[1];
  if (fn && !/^(count|now|pg_\w+|set_config|current_setting|version)$/i.test(fn)) {
    const job = ctx.cronJobs.find((j) => new RegExp(`\\b${fn}\\s*\\(`).test(j.command));
    if (job) {
      return { kind: "예약 작업", desc: withComment(`${scheduleKo(job.schedule)} 자동 실행되는 함수 \`${fn}()\` (예약 작업 이름: ${job.jobname})`, fn, ctx) };
    }
    return { kind: role in ROLE_DESC ? ROLE_DESC[role].kind : "앱", desc: withComment(`함수 \`${fn}()\` 실행`, fn, ctx) };
  }

  // 2) Supabase 내부·대시보드 쿼리
  if (l.includes("usage_monitor_")) return { kind: "내부", desc: "이 모니터의 점검 쿼리" };
  if (l.includes("pg_timezone_names")) {
    return { kind: "내부", desc: "Supabase API 서버가 시간대 목록을 읽는 쿼리. 마이그레이션 등으로 DB 구조가 바뀔 때마다 다시 실행돼요" };
  }
  if (/realtime\.|list_changes|pg_logical_slot|wal2json/.test(l)) {
    return { kind: "내부", desc: "Realtime이 DB 변경사항을 읽어 구독자에게 보내는 쿼리" };
  }
  if (/pg_available_extensions|pg_extension|default_version/.test(l)) {
    return { kind: "내부", desc: "대시보드가 확장(Extensions) 목록을 불러오는 쿼리" };
  }
  if (/arg_modes|pg_proc|pg_get_function/.test(l)) {
    return { kind: "내부", desc: "대시보드나 API 서버가 함수 목록·정의를 읽는 쿼리" };
  }
  if (/\bcron\./.test(l)) return { kind: "내부", desc: "pg_cron이 예약 작업을 관리하는 쿼리" };
  if (/\bnet\.|net\._http/.test(l)) return { kind: "내부", desc: "pg_net이 HTTP 요청을 처리하는 쿼리" };
  if (/information_schema|pg_catalog\.|pg_class|pg_attribute|pg_namespace|pg_type|pg_index/.test(l)) {
    return { kind: "내부", desc: "대시보드나 API 서버가 테이블 구조를 읽는 쿼리" };
  }
  if (/\bauth\./.test(l)) return { kind: "내부", desc: "로그인·인증(Supabase Auth) 처리 쿼리" };
  if (/\bstorage\./.test(l)) return { kind: "내부", desc: "파일 저장소(Storage) 처리 쿼리" };

  // 3) Supabase API(PostgREST)를 거친 테이블 요청
  if (l.includes("pgrst_source")) {
    const ins = q.match(/insert\s+into\s+"\w+"\."(\w+)"/i);
    if (ins) return { kind: "앱", desc: `앱이 \`${ins[1]}\` 테이블에 데이터를 추가하는 요청` };
    const upd = q.match(/update\s+"\w+"\."(\w+)"/i);
    if (upd) return { kind: "앱", desc: `앱이 \`${upd[1]}\` 테이블을 수정하는 요청` };
    const del = q.match(/delete\s+from\s+"\w+"\."(\w+)"/i);
    if (del) return { kind: "앱", desc: `앱이 \`${del[1]}\` 테이블에서 삭제하는 요청` };
    const sel = q.match(/from\s+"\w+"\."(\w+)"/i);
    if (sel) return { kind: "앱", desc: `앱이 \`${sel[1]}\` 테이블을 조회하는 요청` };
    return { kind: "앱", desc: "앱이 Supabase API로 보낸 요청" };
  }

  // 4) 실행 역할로 추정
  if (ROLE_DESC[role]) return ROLE_DESC[role];
  if (role === "postgres" || role === "supabase_admin") {
    return { kind: "내부", desc: "관리자 계정 쿼리 (대시보드 SQL Editor, 마이그레이션, 예약 작업 등)" };
  }
  return { kind: "내부", desc: `${role} 계정의 쿼리` };
}

// ───────────── 전체 요약 문장 ─────────────

export type SummaryInput = {
  health: { label: string; level: number; valueText: string; warnText: string; closeness: number }[];
  watch: string[];                 // 기준 미만이지만 지켜볼 만한 것
  usage: { label: string; pct: number; projectedPct: number | null }[];
  cycleDay: number;
  nextResetText: string;           // 예: "11월 5일"
  daysLeft: number;
  healthAvailable: boolean;
};

/** 받침에 따라 이/가 선택. 한글이 아니면 '이(가)' */
export function iGa(word: string): string {
  const c = word.trim().slice(-1).charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 ? "이" : "가";
  return "이(가)";
}

/** 받침에 따라 이에요/예요 */
export function ieyo(word: string): string {
  const c = word.trim().slice(-1).charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 ? "이에요" : "예요";
  return "이에요";
}

export function overallSummary(i: SummaryInput): string[] {
  const out: string[] = [];

  // DB 상태
  if (!i.healthAvailable || !i.health.length) {
    out.push("DB 상태를 수집하지 못했어요. 아래 경고 메시지를 확인하세요.");
  } else {
    const bad = i.health.filter((h) => h.level > 0);
    if (bad.length) {
      out.push(`DB 상태에 주의가 필요해요. 지난 24시간 동안 기준을 넘은 항목: ${bad.map((h) => `${h.label} ${h.valueText}(기준 ${h.warnText})`).join(", ")}`);
    } else {
      const top = [...i.health].sort((a, b) => b.closeness - a.closeness)[0];
      out.push(`DB 상태는 문제없이 돌아가고 있어요. 그나마 가장 높은 건 ${top.label}(24시간 최대 ${top.valueText}, 주의 기준 ${top.warnText})${ieyo(top.label)}.`);
    }
    if (i.watch.length) out.push(`지켜볼 부분: ${i.watch.join(" / ")}`);
  }

  // 사용량
  if (i.usage.length) {
    const sorted = [...i.usage].sort((a, b) => b.pct - a.pct);
    const top = sorted[0];
    const near = sorted.filter((u) => u.pct >= 80);
    if (near.length) {
      out.push(`사용량 중 한도에 가까운 항목이 있어요: ${near.map((u) => `${u.label} ${u.pct.toFixed(1)}%`).join(", ")}`);
    } else if (top.pct >= 50) {
      out.push(`사용량 중 가장 높은 항목은 ${top.label} ${top.pct.toFixed(1)}%로 한도의 절반을 넘었어요. 나머지는 여유 있어요.`);
    } else {
      out.push(`사용량 중 가장 높은 항목은 ${top.label} ${top.pct.toFixed(1)}%이고, 대체로 여유 있어요.`);
    }
    const proj = sorted.filter((u) => u.projectedPct !== null && u.projectedPct >= 80 && u.pct < 80);
    if (proj.length) {
      out.push(`다만 지금 속도면 주기 말 예상치가 높아요: ${proj.map((u) => `${u.label} 약 ${u.projectedPct!.toFixed(0)}%`).join(", ")}`);
    }
  }

  // 결제 주기
  out.push(
    `결제 주기는 매월 ${i.cycleDay}일 오전 9시(KST)에 초기화돼요(다음 초기화 ${i.nextResetText}, ${i.daysLeft}일 남음). ` +
    `그 전에 대량 데이터 이관·파일 업로드·부하 테스트처럼 사용량이 급격히 늘어나는 작업을 한다면 주의하세요.`,
  );
  out.push("Realtime 사용량은 자동 수집이 안 되니 대시보드 Usage 페이지에서 가끔 확인하세요.");
  return out;
}
