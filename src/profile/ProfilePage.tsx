// 프로필 페이지: /profile 은 내 프로필, /profile/:id 는 그 사람의 프로필입니다.
// 친구 목록·검색 결과에서 이름을 누르거나, 로비의 "내 프로필"로 들어옵니다.
import type { CSSProperties } from 'react'
import { Link, useParams } from 'react-router'
import { useSession } from '../auth/useSession'
import { ProfileView } from './ProfileView'

export default function ProfilePage() {
  const { id } = useParams()
  const { session } = useSession()
  const myId = session?.user.id
  const userId = id ?? myId

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <h1 style={styles.title}>{userId === myId ? '내 프로필' : '프로필'}</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/friends" style={styles.link}>친구</Link>
            <Link to="/" style={styles.link}>로비로</Link>
          </div>
        </header>
        <section style={styles.card}>
          {userId ? <ProfileView userId={userId} isMe={userId === myId} /> : <p style={{ margin: 0 }}>…</p>}
        </section>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: '#16181d', color: '#fff', font: '14px/1.6 system-ui, sans-serif' },
  container: { maxWidth: 560, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 12 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { margin: 0, fontSize: 22 },
  link: { color: '#fff', padding: '6px 12px', borderRadius: 8, background: 'rgba(255,255,255,.08)', textDecoration: 'none' },
  card: { padding: 16, borderRadius: 12, background: '#20232a' },
}
