// 친구 화면 (/friends): 친구 찾기·요청, 받은 요청 수락·거절, 보낸 요청 취소, 친구 목록·삭제.
// 새 요청이 와도 실시간으로 뜨지는 않습니다. 화면을 열 때와 새로고침 버튼으로 갱신합니다.
import { useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import { Link } from 'react-router'
import { useSession } from '../auth/useSession'
import { useFriends } from './useFriends'
import type { UserCard } from './useFriends'
import { displayName, matchUsers, otherOf, relationOf, splitFriendships } from './friendsLogic'

export default function FriendsPage() {
  const { session } = useSession()
  const myId = session?.user.id ?? ''
  const myNickname = String(session?.user.user_metadata?.nickname ?? '나')
  const { list, names, loading, error, reload, search, request, accept, remove } = useFriends(myId || undefined)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserCard[] | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const { friends, received, sent } = splitFriendships(list, myId)
  const nameOf = (id: string) => displayName(names.get(id) ?? '…', id)

  // 버튼 하나를 누르는 동안 다른 버튼을 막고, 실패하면 안내를 띄웁니다.
  async function run(action: () => Promise<string>) {
    setBusy(true)
    setMessage('')
    const result = await action()
    setBusy(false)
    if (result) setMessage(result)
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    setMessage('')
    const found = await search(query)
    if (typeof found === 'string') {
      setMessage(found)
      setResults(null)
      return
    }
    setResults(matchUsers(found, query, myId))
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <h1 style={styles.title}>친구</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={styles.ghost} onClick={reload}>새로고침</button>
            <Link to="/" style={styles.ghost}>로비로</Link>
          </div>
        </header>

        <p style={styles.muted}>
          내 이름: <strong style={{ color: '#fff' }}>{myId ? displayName(myNickname, myId) : '…'}</strong>
          {' '}· 닉네임이 같은 사람이 있으면 # 뒤의 태그로 구분해요.
        </p>
        {error && <p style={styles.error}>{error}</p>}
        {message && <p style={styles.error}>{message}</p>}

        <Section title="친구 찾기">
          <form style={styles.row} onSubmit={handleSearch}>
            <input
              style={styles.input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="닉네임 또는 닉네임#태그"
              maxLength={20}
            />
            <button type="submit" style={styles.primary} disabled={!query.trim()}>찾기</button>
          </form>
          {results !== null &&
            (results.length === 0 ? (
              <p style={styles.muted}>찾는 사람이 없어요.</p>
            ) : (
              results.map((u) => {
                const relation = relationOf(list, myId, u.id)
                return (
                  <Item key={u.id} name={displayName(u.nickname, u.id)} userId={u.id}>
                    {relation === 'friend' && <span style={styles.muted}>친구</span>}
                    {relation === 'sent' && <span style={styles.muted}>요청 보냄</span>}
                    {relation === 'received' && <span style={styles.muted}>받은 요청에서 수락해 주세요</span>}
                    {relation === 'none' && (
                      <button type="button" style={styles.primary} disabled={busy} onClick={() => run(() => request(u.id))}>
                        친구 요청
                      </button>
                    )}
                  </Item>
                )
              })
            ))}
        </Section>

        <Section title={`받은 요청 ${received.length}`}>
          {received.length === 0 ? (
            <p style={styles.muted}>받은 요청이 없어요.</p>
          ) : (
            received.map((f) => (
              <Item key={f.id} name={nameOf(otherOf(f, myId))} userId={otherOf(f, myId)}>
                <button type="button" style={styles.primary} disabled={busy} onClick={() => run(() => accept(f.id))}>수락</button>
                <button type="button" style={styles.ghost} disabled={busy} onClick={() => run(() => remove(f.id))}>거절</button>
              </Item>
            ))
          )}
        </Section>

        <Section title={`보낸 요청 ${sent.length}`}>
          {sent.length === 0 ? (
            <p style={styles.muted}>보낸 요청이 없어요.</p>
          ) : (
            sent.map((f) => (
              <Item key={f.id} name={nameOf(otherOf(f, myId))} userId={otherOf(f, myId)}>
                <span style={styles.muted}>수락 기다리는 중</span>
                <button type="button" style={styles.ghost} disabled={busy} onClick={() => run(() => remove(f.id))}>취소</button>
              </Item>
            ))
          )}
        </Section>

        <Section title={`친구 ${friends.length}`}>
          {loading ? (
            <p style={styles.muted}>불러오는 중…</p>
          ) : friends.length === 0 ? (
            <p style={styles.muted}>아직 친구가 없어요. 위에서 찾아 요청해 보세요.</p>
          ) : (
            friends.map((f) => (
              <Item key={f.id} name={nameOf(otherOf(f, myId))} userId={otherOf(f, myId)}>
                <button
                  type="button"
                  style={styles.ghost}
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`${nameOf(otherOf(f, myId))} 님을 친구에서 삭제할까요?`)) void run(() => remove(f.id))
                  }}
                >
                  삭제
                </button>
              </Item>
            ))
          )}
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={styles.card}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  )
}

// 이름을 누르면 그 사람의 프로필로 갑니다.
function Item({ name, userId, children }: { name: string; userId: string; children: ReactNode }) {
  return (
    <div style={styles.item}>
      <Link to={`/profile/${userId}`} style={styles.nameLink}>{name}</Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>{children}</div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: '#16181d', color: '#fff', font: '14px/1.6 system-ui, sans-serif' },
  container: { maxWidth: 560, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 12 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { margin: 0, fontSize: 22 },
  card: { padding: 16, borderRadius: 12, background: '#20232a', display: 'flex', flexDirection: 'column', gap: 8 },
  sectionTitle: { margin: 0, fontSize: 15 },
  row: { display: 'flex', gap: 6 },
  item: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.06)' },
  input: { flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #4b5563', background: '#111318', color: '#fff', font: 'inherit' },
  primary: { padding: '4px 12px', borderRadius: 6, border: 'none', background: '#22c55e', color: '#0b1a10', fontWeight: 600, cursor: 'pointer', font: 'inherit' },
  ghost: { padding: '4px 10px', borderRadius: 6, border: '1px solid #4b5563', background: 'transparent', color: '#fff', cursor: 'pointer', font: 'inherit', textDecoration: 'none' },
  muted: { color: '#aab0bb', margin: 0, fontSize: 13 },
  nameLink: { color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,.3)' },
  error: { color: '#f87171', margin: 0 },
}
