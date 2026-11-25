// 관리자 운영 대시보드 (#590). 오른쪽 위 메뉴의 "관리자 대시보드"로 넓은 창에 뜹니다(팀만, #612).
//
// 위에서부터: 어느 DB 인지·기간, 같이 공부하는 봇 켜고 끄기(#50), 지금 접속 중·최근 로그인(#612),
// 요약 숫자, 에러 그래프, FPS 그래프, 많이 난 에러(누르면 진단과 AI 프롬프트), FPS 이상치 구간.
// 열려 있는 동안 1분마다 다시 받습니다. 데이터는 DB 함수 ops_dashboard 가 팀인지 확인하고 돌려줍니다.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { envLabel, fetchDashboard, RANGES } from './opsApi'
import type { Dashboard, RangeKey } from './opsApi'
import { ErrorBars, FpsLine } from './OpsCharts'
import { KIND_COLOR, KIND_LABEL } from './opsColors'
import { buildPrompt, diagnose } from './diagnosis'
import type { TopError } from './diagnosis'
import { FLUSH_MS } from './opsLogic'
import { OpsPeople } from './OpsPeople'
import { BotSwitch } from '../bots/BotSwitch'

const REFRESH_MS = FLUSH_MS

type Loaded = { data: Dashboard; from: number; to: number; at: number }

const fmtTime = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '–')

export function OpsDashboard() {
  const [range, setRange] = useState<RangeKey>('24h')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [tick, setTick] = useState(0) // 새로고침 버튼을 누를 때마다 1씩
  const env = envLabel()

  // 기간·새로고침이 바뀌면 받고, 열려 있는 동안 1분마다 다시 받음. 상태는 결과가 온 뒤에만 바꿈
  useEffect(() => {
    let alive = true
    const run = () =>
      fetchDashboard(range).then(
        (res) => {
          if (!alive) return
          setLoaded({ ...res, at: Date.now() })
          setError(null)
          setBusy(false)
        },
        (e: unknown) => {
          if (!alive) return
          setError(e instanceof Error ? e.message : String(e))
          setBusy(false)
        },
      )
    void run()
    const timer = window.setInterval(() => void run(), REFRESH_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [range, tick])
  const reload = (r: RangeKey) => {
    setBusy(true)
    if (r === range) setTick((t) => t + 1)
    else setRange(r)
  }

  const d = loaded?.data
  return (
    <div style={styles.stack}>
      <div style={styles.toolbar}>
        <span style={{ ...styles.badge, ...(env === '운영' ? styles.badgeMain : null) }}>{env} DB</span>
        <div style={styles.ranges} role="tablist">
          {RANGES.map((r) => (
            <button key={r.key} type="button" role="tab" aria-selected={range === r.key} style={{ ...styles.range, ...(range === r.key ? styles.rangeOn : null) }} onClick={() => reload(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        <span style={styles.muted}>{loaded ? `${fmtTime(new Date(loaded.at).toISOString())} 기준 · 1분마다 새로고침` : ''}</span>
        <button type="button" style={styles.ghost} disabled={busy} onClick={() => reload(range)}>
          {busy ? '불러오는 중…' : '↻ 새로고침'}
        </button>
      </div>

      <section style={styles.card}>
        <BotSwitch />
      </section>
      <OpsPeople range={range} rangeLabel={RANGES.find((r) => r.key === range)?.label ?? ''} tick={tick} />

      {error && <div style={styles.card}>{/권한|팀만/.test(error) ? '팀만 볼 수 있어요.' : `불러오지 못했어요: ${error}`}</div>}
      {!d && !error && <div style={styles.card}>불러오는 중…</div>}

      {d && loaded && (
        <>
          <div style={styles.tiles}>
            <Tile label="기록을 보낸 사람" value={String(d.summary.users)} />
            <Tile label="에러" value={String(d.summary.errors)} sub={`4xx ${d.summary.errors_4xx} · 5xx ${d.summary.errors_5xx}`} />
            <Tile label="FPS 이상치인 분" value={pct(d.summary.low_minutes, d.summary.fps_minutes)} sub={`${d.summary.low_minutes} / ${d.summary.fps_minutes}분`} />
            <Tile label="FPS 중앙값" value={d.summary.fps_median === null ? '–' : String(d.summary.fps_median)} />
          </div>

          <section style={styles.card}>
            <h3 style={styles.h3}>에러 수</h3>
            <ErrorBars series={d.error_series} bucketSec={d.bucket_seconds} from={loaded.from} to={loaded.to} />
          </section>
          <section style={styles.card}>
            <h3 style={styles.h3}>평균 FPS</h3>
            <FpsLine series={d.fps_series} bucketSec={d.bucket_seconds} from={loaded.from} to={loaded.to} />
          </section>

          <section style={styles.card}>
            <h3 style={styles.h3}>많이 난 에러</h3>
            {d.top_errors.length === 0 ? <p style={styles.muted}>이 기간에 기록된 에러가 없어요.</p> : <ErrorTable rows={d.top_errors} env={env === '운영' ? '운영' : '서비스'} />}
          </section>

          <section style={styles.card}>
            <h3 style={styles.h3}>FPS 이상치 구간</h3>
            <p style={styles.muted}>1분 평균이 30 미만이거나, 그 1분 동안 30 미만이었던 시간이 합쳐서 10초 이상인 분 (최근 100개)</p>
            {d.outliers.length === 0 ? (
              <p style={styles.muted}>이 기간에 이상치가 없어요.</p>
            ) : (
              <div style={styles.scroll}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {['시각', '장소', '평균 / 최저', '30 미만', '브라우저 · OS', '그래픽 카드', '버전'].map((h) => (
                        <th key={h} style={styles.th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.outliers.map((o) => (
                      <tr key={`${o.minute}-${o.place}-${o.gpu}-${o.fps_min}`}>
                        <td style={styles.td}>{fmtTime(o.minute)}</td>
                        <td style={styles.td}>{o.place}</td>
                        <td style={styles.td}>
                          {o.fps_avg} / {o.fps_min}
                        </td>
                        <td style={styles.td}>{o.low_seconds}초</td>
                        <td style={styles.td}>
                          {o.browser} · {o.os}
                          {o.mobile ? ' (모바일)' : ''}
                        </td>
                        <td style={{ ...styles.td, ...styles.gpu }} title={o.gpu}>
                          {o.gpu || '–'}
                        </td>
                        <td style={styles.td}>{o.version || '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={styles.tile}>
      <span style={styles.tileLabel}>{label}</span>
      <span style={styles.tileValue}>{value}</span>
      {sub && <span style={styles.muted}>{sub}</span>}
    </div>
  )
}

function ErrorTable({ rows, env }: { rows: TopError[]; env: '서비스' | '운영' }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div style={styles.scroll}>
      <table style={styles.table}>
        <thead>
          <tr>
            {['종류', '코드', '대상', '횟수', '사람', '마지막'].map((h) => (
              <th key={h} style={styles.th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const key = `${r.kind}|${r.code}|${r.target}`
            const isOpen = open === key
            return (
              <ErrorRowView key={key} row={r} env={env} open={isOpen} onToggle={() => setOpen(isOpen ? null : key)} />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ErrorRowView({ row, env, open, onToggle }: { row: TopError; env: '서비스' | '운영'; open: boolean; onToggle: () => void }) {
  const [copied, setCopied] = useState(false)
  const diag = diagnose(row)
  const copy = () => {
    navigator.clipboard.writeText(buildPrompt(row, env)).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      },
      () => {}, // 복사 권한이 없으면 버튼만 그대로
    )
  }
  return (
    <>
      <tr style={styles.clickRow} onClick={onToggle}>
        <td style={styles.td}>
          <span style={{ ...styles.dot, background: KIND_COLOR[row.kind] }} />
          {KIND_LABEL[row.kind]}
        </td>
        <td style={styles.td}>{row.code}</td>
        <td style={{ ...styles.td, ...styles.mono }}>{row.target || '–'}</td>
        <td style={styles.td}>{row.count}</td>
        <td style={styles.td}>{row.users}</td>
        <td style={styles.td}>{fmtTime(row.last)}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} style={styles.detail}>
            <div style={styles.detailGrid}>
              <div>
                <strong>{diag ? diag.title : '진단표에 없는 에러'}</strong>
                {diag && (
                  <>
                    <p style={styles.p}>{diag.meaning}</p>
                    <p style={styles.p}>
                      <span style={styles.muted}>흔한 원인</span> {diag.causes.join(' · ')}
                    </p>
                    <ol style={styles.ol}>
                      {diag.steps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                  </>
                )}
              </div>
              <div style={styles.facts}>
                <span>상세: {row.detail || '–'}</span>
                <span>장소: {row.place || '–'} · 브라우저: {row.browser || '–'} · 버전: {row.version || '–'}</span>
                <span>
                  처음 {fmtTime(row.first)} · 마지막 {fmtTime(row.last)}
                </span>
                <button type="button" style={styles.copy} onClick={copy}>
                  {copied ? '복사됨' : 'AI 프롬프트 복사'}
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

const styles: Record<string, CSSProperties> = {
  stack: { display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left' }, // 메뉴 창의 가운데 정렬을 물려받으면 표 제목과 칸이 어긋남
  toolbar: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  badge: { padding: '2px 10px', borderRadius: 999, background: '#2e323b', color: '#d1d5db', fontWeight: 700, fontSize: 13 },
  badgeMain: { background: '#7f1d1d', color: '#fff' },
  ranges: { display: 'flex', gap: 2, padding: 3, borderRadius: 8, background: '#20232a' },
  range: { padding: '4px 12px', borderRadius: 6, border: 'none', background: 'transparent', color: '#aab0bb', cursor: 'pointer', font: 'inherit' },
  rangeOn: { background: '#3a3f4b', color: '#fff', fontWeight: 700 },
  ghost: { marginLeft: 'auto', padding: '4px 12px', borderRadius: 6, border: '1px solid #3a3f4b', background: 'transparent', color: '#d1d5db', cursor: 'pointer', font: 'inherit' },
  muted: { color: '#8b93a1', fontSize: 12, margin: 0 },
  card: { padding: 16, borderRadius: 12, background: '#20232a', display: 'flex', flexDirection: 'column', gap: 8 },
  h3: { margin: 0, fontSize: 15, color: '#fff' },
  tiles: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  tile: { padding: 16, borderRadius: 12, background: '#20232a', display: 'flex', flexDirection: 'column', gap: 2 },
  tileLabel: { color: '#aab0bb', fontSize: 13 },
  tileValue: { color: '#fff', fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  scroll: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '6px 8px', color: '#8b93a1', fontWeight: 600, borderBottom: '1px solid #2e323b', whiteSpace: 'nowrap' },
  td: { padding: '6px 8px', borderBottom: '1px solid #2a2e36', color: '#e5e7eb', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  gpu: { maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' },
  mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
  clickRow: { cursor: 'pointer' },
  dot: { display: 'inline-block', width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  detail: { padding: 12, background: '#1a1d23', borderBottom: '1px solid #2a2e36', color: '#e5e7eb' },
  detailGrid: { display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 16, whiteSpace: 'normal' },
  p: { margin: '6px 0 0' },
  ol: { margin: '6px 0 0', paddingLeft: 20 },
  facts: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#aab0bb', wordBreak: 'break-all' },
  copy: { alignSelf: 'flex-start', marginTop: 6, padding: '6px 14px', borderRadius: 8, border: 'none', background: '#3987e5', color: '#fff', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
}
