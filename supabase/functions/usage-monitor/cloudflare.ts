// Cloudflare 하루 사용량 (#574) — 위치 중계 Worker(relay)와 Durable Objects 무료 한도 감시
// 순수 로직 + 조회 함수. 네트워크는 인자로 받은 fetch 로만 해서 가짜 fetch 로 검사할 수 있게 둡니다.
// Cloudflare 무료 한도는 계정 단위로 UTC 0시(한국 오전 9시)에 초기화됩니다.

import { bar, GB, icon, iGa, MB } from "./lib.ts";

export type CfMetric =
  | "cf_worker_requests" | "cf_do_requests" | "cf_do_duration_gbs"
  | "cf_do_rows_read" | "cf_do_rows_written" | "cf_do_storage_bytes";

export const CF_METRICS: CfMetric[] = [
  "cf_worker_requests", "cf_do_requests", "cf_do_duration_gbs",
  "cf_do_rows_read", "cf_do_rows_written", "cf_do_storage_bytes",
];

// 무료 플랜 하루 한도 (저장 용량만 누적). CF_LIMITS_JSON 으로 덮어쓸 수 있음 (월 $5 플랜 전환 때)
export const CF_FREE_LIMITS: Record<CfMetric, number> = {
  cf_worker_requests: 100_000,
  cf_do_requests: 100_000,
  cf_do_duration_gbs: 13_000,
  cf_do_rows_read: 5_000_000,
  cf_do_rows_written: 100_000,
  cf_do_storage_bytes: 5 * GB,
};

export const CF_LABELS: Record<CfMetric, string> = {
  cf_worker_requests: "Worker 요청",
  cf_do_requests: "DO 요청",
  cf_do_duration_gbs: "DO 실행 시간",
  cf_do_rows_read: "DO 읽은 행",
  cf_do_rows_written: "DO 쓴 행",
  cf_do_storage_bytes: "DO 저장 용량",
};

// 하루마다 초기화돼서 50%부터 보내면 사용이 많은 날마다 반복되므로 80%부터 (2026-11-16 결정)
export const CF_THRESHOLDS = [80, 95, 100];

const DO_MEMORY_GB = 0.125;  // Cloudflare 과금 기준: 실행 시간 × 128MB
const WS_RATIO = 20;         // 받은 WebSocket 메시지 20건 = 요청 1건
const GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";
const DEFAULT_TIMEOUT_MS = 10_000;
const ERROR_CHARS = 200;

export type CfValue = { value: number | null; note?: string; alert: boolean }; // alert false = 참고용 또는 수집 안 됨
export type CfResult = { values: Record<CfMetric, CfValue>; errors: string[] };

// 데이터셋마다 따로 묻습니다. GraphQL 은 필드 하나가 틀려도 문서 전체를 거절하기 때문입니다.
// 필드 이름은 문서 기준 추정값이고, 배포 후 mode=discover 로 실제 이름을 확인해 맞춥니다.
type Dataset = {
  name: string;
  block: "sum" | "max";
  fields: Record<string, string>;          // 응답 필드 → 원시 키
  filter: { geq: string; leq: string; kind: "time" | "date" };
  today?: boolean;                         // 누적 값이라 어제 요약에서도 오늘 날짜로 묻기
};

export const CF_DATASETS: Dataset[] = [
  {
    name: "workersInvocationsAdaptive", block: "sum",
    fields: { requests: "workerRequests" },
    filter: { geq: "datetime_geq", leq: "datetime_leq", kind: "time" },
  },
  {
    name: "durableObjectsInvocationsAdaptiveGroups", block: "sum",
    fields: { requests: "doRequests" },
    filter: { geq: "datetime_geq", leq: "datetime_leq", kind: "time" },
  },
  {
    name: "durableObjectsPeriodicGroups", block: "sum",
    fields: { activeTime: "doActiveUs", inboundWebsocketMsgCount: "doWsIn", rowsRead: "doRowsRead", rowsWritten: "doRowsWritten" },
    filter: { geq: "datetimeHour_geq", leq: "datetimeHour_leq", kind: "time" },
  },
  {
    name: "durableObjectsStorageGroups", block: "max",
    fields: { storedBytes: "doStoredBytes" },
    filter: { geq: "date_geq", leq: "date_leq", kind: "date" },
    today: true,
  },
];

export function parseCfLimits(json: string | undefined): { limits: Record<CfMetric, number>; error: string | null } {
  if (!json?.trim()) return { limits: { ...CF_FREE_LIMITS }, error: null };
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const limits = { ...CF_FREE_LIMITS };
    for (const m of CF_METRICS) {
      const v = parsed?.[m];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) limits[m] = v;
    }
    return { limits, error: null };
  } catch {
    return { limits: { ...CF_FREE_LIMITS }, error: "CF_LIMITS_JSON 형식 오류 → 기본 한도 사용" };
  }
}

/** UTC 하루. 오늘(0)은 지금까지, 어제(-1)는 하루 전체 */
export function utcDay(now: Date, offsetDays: 0 | -1): { date: string; start: string; end: string } {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = new Date(today + offsetDays * 86_400_000);
  const date = start.toISOString().slice(0, 10);
  const end = offsetDays === 0 ? now.toISOString() : `${date}T23:59:59.000Z`;
  return { date, start: start.toISOString(), end };
}

function buildQuery(ds: Dataset): string {
  const t = ds.filter.kind === "date" ? "Date" : "Time";
  return `query($a: string!, $s: ${t}!, $e: ${t}!) { viewer { accounts(filter: {accountTag: $a}) { ` +
    `d: ${ds.name}(limit: 10000, filter: {${ds.filter.geq}: $s, ${ds.filter.leq}: $e}) { ` +
    `${ds.block} { ${Object.keys(ds.fields).join(" ")} } } } } }`;
}

const mask = (s: string, token: string) => (token ? s.split(token).join("***") : s);

function errorText(e: unknown): string {
  const err = e as { name?: string; message?: string };
  if (err?.name === "TimeoutError" || err?.name === "AbortError") return "시간 초과";
  return String(err?.message ?? e);
}

async function post(o: { fetch: typeof fetch; token: string; timeoutMs: number }, query: string, variables: Record<string, string>) {
  const res = await o.fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${o.token}` },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(o.timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, ERROR_CHARS)}`);
  let json: { data?: unknown; errors?: { message?: string }[] };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("응답이 JSON 이 아님");
  }
  if (json.errors?.length) throw new Error(String(json.errors[0]?.message ?? "GraphQL 오류").slice(0, ERROR_CHARS));
  return json.data as Record<string, unknown> | null | undefined;
}

/** 한 데이터셋을 묻고 원시 키별 값(sum 은 합, max 는 최댓값)을 돌려줍니다. 행이 없으면 모든 필드 0 */
async function fetchDataset(
  o: { fetch: typeof fetch; token: string; accountId: string; timeoutMs: number },
  ds: Dataset, range: { start: string; end: string }, todayDate: string,
): Promise<Record<string, number>> {
  const variables = ds.filter.kind === "date"
    ? { a: o.accountId, s: ds.today ? todayDate : range.start.slice(0, 10), e: ds.today ? todayDate : range.end.slice(0, 10) }
    : { a: o.accountId, s: range.start, e: range.end };
  const data = await post(o, buildQuery(ds), variables);
  const accounts = (data as { viewer?: { accounts?: { d?: unknown }[] } } | null)?.viewer?.accounts;
  const rows = accounts?.[0]?.d;
  if (!Array.isArray(rows)) throw new Error("응답 모양이 다름");

  const out: Record<string, number> = {};
  if (rows.length === 0) {
    for (const key of Object.values(ds.fields)) out[key] = 0;
    return out;
  }
  for (const row of rows) {
    const block = (row as Record<string, unknown>)?.[ds.block] as Record<string, unknown> | undefined;
    for (const [field, key] of Object.entries(ds.fields)) {
      const v = Number(block?.[field]);
      if (block?.[field] === undefined || block?.[field] === null || !Number.isFinite(v)) continue;
      out[key] = key in out ? (ds.block === "sum" ? out[key] + v : Math.max(out[key], v)) : v;
    }
  }
  return out;
}

const fmtCount = (v: number) => Math.round(v).toLocaleString("en-US");

/** 원시 값 → 지표. 원시 키가 없으면 수집 안 됨 */
function toValues(raw: Record<string, number>): Record<CfMetric, CfValue> {
  const missing: CfValue = { value: null, alert: false, note: "수집 안 됨" };
  const has = (k: string) => k in raw;
  const plain = (k: string, f: (v: number) => number = (v) => v): CfValue =>
    has(k) ? { value: f(raw[k]), alert: true } : { ...missing };

  let doReq: CfValue = { ...missing };
  if (has("doRequests") && has("doWsIn")) {
    const ws = raw.doWsIn;
    const billed = Math.max(0, raw.doRequests - ws) + ws / WS_RATIO;
    doReq = { value: billed, alert: true, note: `원시 요청 ${fmtCount(raw.doRequests)} · WebSocket 메시지 ${fmtCount(ws)}건은 ${WS_RATIO}:1 환산` };
  } else if (has("doRequests")) {
    doReq = { value: raw.doRequests, alert: false, note: "WebSocket 메시지를 나눠 셀 수 없어 참고용" };
  }

  return {
    cf_worker_requests: plain("workerRequests"),
    cf_do_requests: doReq,
    cf_do_duration_gbs: plain("doActiveUs", (us) => (us / 1e6) * DO_MEMORY_GB),
    cf_do_rows_read: plain("doRowsRead"),
    cf_do_rows_written: plain("doRowsWritten"),
    cf_do_storage_bytes: plain("doStoredBytes"),
  };
}

export async function queryCloudflare(o: {
  fetch: typeof fetch; token?: string; accountId?: string; now: Date; offsetDays: 0 | -1; timeoutMs?: number;
}): Promise<CfResult> {
  if (!o.token || !o.accountId) return { values: toValues({}), errors: ["Cloudflare 설정 없음"] };
  const ctx = { fetch: o.fetch, token: o.token, accountId: o.accountId, timeoutMs: o.timeoutMs ?? DEFAULT_TIMEOUT_MS };
  const range = utcDay(o.now, o.offsetDays);
  const todayDate = utcDay(o.now, 0).date;

  const results = await Promise.all(CF_DATASETS.map(async (ds) => {
    try {
      return { raw: await fetchDataset(ctx, ds, range, todayDate), error: null };
    } catch (e) {
      return { raw: {}, error: `${ds.name}: ${mask(errorText(e), o.token!)}` };
    }
  }));
  const raw = Object.assign({}, ...results.map((r) => r.raw)) as Record<string, number>;
  return { values: toValues(raw), errors: results.flatMap((r) => (r.error ? [r.error] : [])) };
}

export function fmtCf(metric: CfMetric, v: number): string {
  if (metric === "cf_do_storage_bytes") return v >= GB ? `${(v / GB).toFixed(2)} GB` : `${(v / MB).toFixed(1)} MB`;
  if (metric === "cf_do_duration_gbs") return `${fmtCount(v)} GB-s`;
  return fmtCount(v);
}

/** 기존 사용량 line() 과 같은 막대·% 모양 */
export function cfAlertLine(metric: CfMetric, v: number, limit: number, indent: string): string {
  const pct = (v / limit) * 100;
  return `${indent}${icon(pct)} *${CF_LABELS[metric]}*  ${bar(pct)}  ${fmtCf(metric, v)} / ${fmtCf(metric, limit)} (${pct.toFixed(1)}%)`;
}

/** "한눈에 보기" 한 줄. 경고 대상 값이 하나도 없으면 null */
export function cfOverview(values: Record<CfMetric, CfValue>, limits: Record<CfMetric, number>): string | null {
  const items = CF_METRICS
    .filter((m) => values[m].alert && values[m].value !== null)
    .map((m) => ({ label: CF_LABELS[m], pct: (values[m].value! / limits[m]) * 100 }))
    .sort((a, b) => b.pct - a.pct);
  if (!items.length) return null;
  const top = items[0];
  const pct = top.pct.toFixed(0);
  return top.pct >= 80
    ? `Cloudflare 어제 ${top.label}${iGa(top.label)} 한도의 ${pct}% — 월 $5 플랜 검토`
    : `Cloudflare 어제 가장 높은 항목은 ${top.label} ${pct}%예요.`;
}

// ───────────── discover: 실제 필드 이름 확인 ─────────────

type TypeRef = { name: string | null; kind?: string; ofType?: TypeRef | null };
type TypeInfo = {
  name: string;
  fields: { name: string; args?: { name: string; type: TypeRef }[]; type: TypeRef }[] | null;
  inputFields: { name: string }[] | null;
} | null;

const TYPE_QUERY = `query($n: String!) { __type(name: $n) { name ` +
  `fields { name args { name type { name kind ofType { name kind ofType { name kind ofType { name kind } } } } } ` +
  `type { name kind ofType { name kind ofType { name kind ofType { name kind } } } } } inputFields { name } } }`;

const unwrap = (t: TypeRef | null | undefined): string | null => {
  let cur = t;
  while (cur && !cur.name) cur = cur.ofType;
  return cur?.name ?? null;
};

/** 스키마를 따라가 데이터셋별 sum·max 필드와 기간 필터 이름을 모읍니다 (설치 때 1회) */
export async function cfDiscover(o: { fetch: typeof fetch; token?: string; accountId?: string }): Promise<unknown> {
  if (!o.token || !o.accountId) return { error: "Cloudflare 설정 없음" };
  const ctx = { fetch: o.fetch, token: o.token, timeoutMs: DEFAULT_TIMEOUT_MS };
  try {
    const typeOf = async (n: string | null): Promise<TypeInfo> =>
      n ? ((await post(ctx, TYPE_QUERY, { n }))?.__type as TypeInfo) ?? null : null;
    const field = (t: TypeInfo, name: string) => t?.fields?.find((f) => f.name === name);

    const root = await post(ctx, `{ __schema { queryType { name } } }`, {});
    const queryName = (root as { __schema?: { queryType?: { name?: string } } } | null)?.__schema?.queryType?.name ?? null;
    const viewer = await typeOf(unwrap(field(await typeOf(queryName), "viewer")?.type));
    const account = await typeOf(unwrap(field(viewer, "accounts")?.type));

    const datasets: Record<string, unknown> = {};
    for (const ds of CF_DATASETS) {
      const f = field(account, ds.name);
      if (!f) { datasets[ds.name] = { found: false }; continue; }
      const row = await typeOf(unwrap(f.type));
      const block = await typeOf(unwrap(field(row, ds.block)?.type));
      const filter = await typeOf(unwrap(f.args?.find((a) => a.name === "filter")?.type));
      datasets[ds.name] = {
        found: true,
        fields: (block?.fields ?? []).map((x) => x.name),
        filter: (filter?.inputFields ?? []).map((x) => x.name).filter((n) => /date|time/i.test(n)),
      };
    }
    const durable = (account?.fields ?? []).map((f) => f.name).filter((n) => /durableObjects|workers/i.test(n));
    return { datasets, durable_objects_datasets: durable };
  } catch (e) {
    return { error: mask(errorText(e), o.token) };
  }
}
