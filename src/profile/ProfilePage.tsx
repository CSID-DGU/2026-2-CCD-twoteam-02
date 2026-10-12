// 프로필 페이지: /profile 은 내 프로필, /profile/:id 는 그 사람의 프로필입니다.
// 주소로 직접 들어왔을 때의 페이지. 로비·지점에서는 창(src/menu/InfoPanel)으로 엽니다.
import type { CSSProperties } from 'react'
import { useParams } from 'react-router'
import { BackLink } from '../menu/BackLink'
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
          <BackLink style={styles.link} />
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
  link: { color: '#fff', padding: '6px 12px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,.08)', cursor: 'pointer', font: 'inherit' },
  card: { padding: 16, borderRadius: 12, background: '#20232a' },
}
