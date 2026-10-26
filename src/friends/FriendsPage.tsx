// 친구 화면 (/friends): 친구 찾기·요청, 받은 요청 수락·거절, 보낸 요청 취소, 친구 목록·삭제.
// 새 요청이 와도 실시간으로 뜨지는 않습니다. 화면을 열 때와 새로고침 버튼으로 갱신합니다.
import { useEffect, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import { Link } from 'react-router'
import { useSession } from '../auth/useSession'
import { useMyNickname } from '../auth/useMyNickname'
import { BackLink } from '../menu/BackLink'
import { useFriends } from './useFriends'
import type { UserCard } from './useFriends'
import { displayName, matchUsers, otherOf, relationOf, splitFriendships } from './friendsLogic'
import { useOnline } from '../realtime/onlineContext'
import { placeLabel } from '../realtime/online'
import { InviteButton } from '../meeting/InviteButton'
import type { InviteTarget } from '../meeting/InviteButton'

// 친구 본문. 페이지(/friends)와 로비·지점 위 창이 같이 씁니다.
// onOpenProfile 을 주면 이름을 눌렀을 때 페이지를 옮기지 않고 그 함수를 부릅니다(창 안에서 프로필 열기).
// invite 를 주면(회의 중에 연 친구 창) 친구마다 "회의에 초대" 버튼이 보입니다. 이미 그 회의에 있는 친구는 "이 회의에 있음". (#45)
export function FriendsView({ onOpenProfile, invite }: { onOpenProfile?: (userId: string) => void; invite?: InviteTarget }) {
  const { session } = useSession()
  const myId = session?.user.id ?? ''
  const { nickname: myNickname } = useMyNickname() // 닉네임 원본은 profiles 다
  const { list, names, loading, error, reload, search, request, accept, remove } = useFriends(myId || undefined)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserCard[] | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const { friends: friendRows, received, sent } = splitFriendships(list, myId)
  // 접속 중인 친구를 위로 올리고, 있는 곳을 같이 보여 줍니다. (#176, 채팅 #49 는 접속 중인 친구에게만)
  const online = useOnline()
  const friends = [...friendRows].sort((a, b) => Number(online.has(otherOf(b, myId))) - Number(online.has(otherOf(a, myId))))
  // [임시 진단] 친구 탭이 보는 접속 목록과 친구 계정 번호. 원인을 찾으면 지웁니다.
  const onlineKeys = [...online.keys()].map((k) => k.slice(0, 4)).join(',')
  const friendKeys = friendRows.map((f) => otherOf(f, myId).slice(0, 4)).join(',')
  useEffect(() => {
    console.info('[접속진단] 친구 탭', '접속 목록', onlineKeys || '(없음)', '/ 친구', friendKeys || '(없음)')
  }, [onlineKeys, friendKeys])
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
    <div style={styles.body}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" style={styles.ghost} onClick={reload}>새로고침</button>
      </div>
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
                <Item key={u.id} name={displayName(u.nickname, u.id)} userId={u.id} onOpenProfile={onOpenProfile}>
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
            <Item key={f.id} name={nameOf(otherOf(f, myId))} userId={otherOf(f, myId)} onOpenProfile={onOpenProfile}>
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
            <Item key={f.id} name={nameOf(otherOf(f, myId))} userId={otherOf(f, myId)} onOpenProfile={onOpenProfile}>
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
            <Item key={f.id} name={nameOf(otherOf(f, myId))} userId={otherOf(f, myId)} onOpenProfile={onOpenProfile}>
              {online.has(otherOf(f, myId)) ? (
                <span style={styles.online}>
                  🟢 {placeLabel(online.get(otherOf(f, myId))?.place ?? '')}
                  {online.get(otherOf(f, myId))?.studying ? ' · 공부 중' : ''}
                </span>
              ) : (
                <span style={styles.muted}>접속 안 함</span>
              )}
              {invite &&
                (invite.memberIds.includes(otherOf(f, myId)) ? (
                  <span style={styles.muted}>이 회의에 있음</span>
                ) : (
                  <InviteButton meetingId={invite.meetingId} friendId={otherOf(f, myId)} onMessage={setMessage} />
                ))}
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
  )
}

// 주소로 직접 들어왔을 때의 페이지. 로비·지점에서는 창(src/menu/InfoPanel)으로 엽니다.
export default function FriendsPage() {
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <h1 style={styles.title}>친구</h1>
          <BackLink style={styles.ghost} />
        </header>
        <FriendsView />
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

// 이름을 누르면 그 사람의 프로필로 갑니다. (창 안이면 onOpenProfile, 페이지면 /profile/:id)
type ItemProps = { name: string; userId: string; onOpenProfile?: (userId: string) => void; children: ReactNode }
function Item({ name, userId, onOpenProfile, children }: ItemProps) {
  return (
    <div style={styles.item}>
      {onOpenProfile ? (
        <button type="button" style={{ ...styles.nameLink, ...styles.nameButton }} onClick={() => onOpenProfile(userId)}>
          {name}
        </button>
      ) : (
        <Link to={`/profile/${userId}`} style={styles.nameLink}>{name}</Link>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>{children}</div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  body: { display: 'flex', flexDirection: 'column', gap: 12 },
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
  online: { color: '#4ade80', fontSize: 13, whiteSpace: 'nowrap' },
  nameButton: { padding: 0, border: 'none', background: 'transparent', font: 'inherit', cursor: 'pointer', textAlign: 'left' },
  nameLink: { color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,.3)' },
  error: { color: '#f87171', margin: 0 },
}
