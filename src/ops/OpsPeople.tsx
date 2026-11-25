// 관리자 대시보드의 사람 보기 (#612): 지금 접속 중인 사람과 최근 로그인한 사람.
//
// 지금 접속 중: 사이트 전체 접속 표시(useOnline, 중계 서버 /online)를 그대로 씁니다. 닉네임·있는 곳·채널·공부 중만 보여 줍니다.
//   같이 공부하는 봇(#50)도 접속 목록에 사람처럼 들어가 있어서, 팀이 구별할 수 있게 "봇"으로 표시하고 따로 셉니다.
// 최근 로그인: DB 함수 ops_recent_logins(팀만, 0078). 고른 기간 안에 로그인한 사람과 시각. 기간 안에 가입했으면 "새 계정".
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../lib/supabase'
import { useOnline } from '../realtime/onlineContext'
import { placeLabel } from '../realtime/online'
import { displayName } from '../friends/friendsLogic'
import { useBotPresence } from '../bots/botStore'
import { fetchRecentLogins } from './opsApi'
import type { RangeKey, RecentLogin } from './opsApi'

const fmtTime = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function OpsPeople({ range, rangeLabel, tick }: { range: RangeKey; rangeLabel: string; tick: number }) {
  const people = useOnline()
  const bots = useBotPresence()
  const botNames = new Map(bots.rows.map((b) => [b.id, b.nickname]))

  // 접속 중인 사람의 닉네임 (봇은 현황에 닉네임이 있어 읽지 않음). 한 번 읽은 사람은 다시 읽지 않습니다
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const missing = [...people.keys()].filter((id) => !botNames.has(id) && !names.has(id))
  const missingKey = missing.sort().join(',')
  useEffect(() => {
    if (!missingKey) return
    let alive = true
    supabase
      .from('avatars')
      .select('id, nickname')
      .in('id', missingKey.split(','))
      .then(({ data }) => {
        if (!alive || !data) return
        setNames((prev) => new Map([...prev, ...data.map((r) => [r.id as string, r.nickname as string] as const)]))
      })
    return () => {
      alive = false
    }
  }, [missingKey])

  const [logins, setLogins] = useState<{ rows: RecentLogin[]; from: number } | null>(null)
  const [loginError, setLoginError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    fetchRecentLogins(range).then(
      (res) => {
        if (!alive) return
        setLogins(res)
        setLoginError(null)
      },
      (e: unknown) => alive && setLoginError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      alive = false
    }
  }, [range, tick])

  // 사람 먼저, 그다음 봇. 같은 무리 안에서는 있는 곳·닉네임 순
  const rows = [...people.entries()]
    .map(([id, e]) => {
      const bot = botNames.has(id)
      const nickname = botNames.get(id) ?? names.get(id) ?? '…'
      return { id, bot, name: displayName(nickname, id), place: placeLabel(e.place), channel: e.channel, studying: e.studying }
    })
    .sort((a, b) => Number(a.bot) - Number(b.bot) || a.place.localeCompare(b.place) || a.name.localeCompare(b.name))
  const botCount = rows.filter((r) => r.bot).length

  return (
    <>
      <section style={styles.card}>
        <h3 style={styles.h3}>
          지금 접속 중 <span style={styles.count}>사람 {rows.length - botCount}명 · 봇 {botCount}명</span>
        </h3>
        {rows.length === 0 ? (
          <p style={styles.muted}>지금 접속한 사람이 없어요.</p>
        ) : (
          <div style={styles.scroll}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['닉네임', '구분', '있는 곳', '채널', '공부'].map((h) => (
                    <th key={h} style={styles.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={styles.td}>{r.name}</td>
                    <td style={styles.td}>{r.bot ? <span style={styles.bot}>봇</span> : '사람'}</td>
                    <td style={styles.td}>{r.place}</td>
                    <td style={styles.td}>{r.channel ?? '–'}</td>
                    <td style={styles.td}>{r.studying ? '공부 중' : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={styles.card}>
        <h3 style={styles.h3}>
          최근 로그인 <span style={styles.count}>{rangeLabel} · {logins ? `${logins.rows.length}명` : '…'}</span>
        </h3>
        {loginError ? (
          <p style={styles.muted}>{/권한|팀만/.test(loginError) ? '팀만 볼 수 있어요.' : `불러오지 못했어요: ${loginError}`}</p>
        ) : !logins ? (
          <p style={styles.muted}>불러오는 중…</p>
        ) : logins.rows.length === 0 ? (
          <p style={styles.muted}>이 기간에 로그인한 사람이 없어요.</p>
        ) : (
          <div style={styles.scroll}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['로그인 시각', '닉네임', '새 계정', '게스트'].map((h) => (
                    <th key={h} style={styles.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logins.rows.map((r) => (
                  <tr key={r.id}>
                    <td style={styles.td}>{fmtTime(r.last_sign_in_at)}</td>
                    <td style={styles.td}>{displayName(r.nickname, r.id)}</td>
                    <td style={styles.td}>{Date.parse(r.created_at) >= logins.from ? `새 계정 (${fmtTime(r.created_at)} 가입)` : '–'}</td>
                    <td style={styles.td}>{r.is_guest ? '게스트' : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

// OpsDashboard 의 카드·표 모양과 같게
const styles: Record<string, CSSProperties> = {
  card: { padding: 16, borderRadius: 12, background: '#20232a', display: 'flex', flexDirection: 'column', gap: 8 },
  h3: { margin: 0, fontSize: 15, color: '#fff' },
  count: { marginLeft: 8, color: '#8b93a1', fontSize: 13, fontWeight: 400 },
  muted: { color: '#8b93a1', fontSize: 12, margin: 0 },
  scroll: { overflowX: 'auto', maxHeight: 320, overflowY: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '6px 8px', color: '#8b93a1', fontWeight: 600, borderBottom: '1px solid #2e323b', whiteSpace: 'nowrap' },
  td: { padding: '6px 8px', borderBottom: '1px solid #2a2e36', color: '#e5e7eb', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  bot: { padding: '1px 8px', borderRadius: 999, background: '#3b2f5c', color: '#d8ccff', fontWeight: 700, fontSize: 12 },
}
