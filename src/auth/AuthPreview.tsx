// 로그인부터 자리 배정까지 전체 흐름 미리보기.
//
// App.tsx 는 지점 공간 파트(김현)의 파일이라 라우터 도입을 상의하기 전까지 건드리지 않는다.
// 그동안 흐름을 눈으로 확인하려고 따로 띄운다. (localhost:5173/auth-preview.html)
// 여기서 BranchScene 은 가져다 쓰기만 하고 고치지 않는다.
// react-router 가 들어오면 이 파일과 preview.tsx, auth-preview.html 은 지운다.
import { useState } from 'react'
import LoginPage from './LoginPage'
import SignupPage from './SignupPage'
import RequireAuth from './RequireAuth'
import LogoutButton from './LogoutButton'
import DbCheck from './DbCheck'
import { useSession } from './useSession'
import { styles } from './authStyles'
import { BranchScene } from '../space/BranchScene'
import KioskScreen from '../kiosk/KioskScreen'
import LobbyScene from '../lobby/LobbyScene'

type Branch = { id: number; slug: string; name: string }

const bar: React.CSSProperties = {
  position: 'fixed',
  top: 16,
  right: 16,
  zIndex: 10,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 8,
}

const button: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 8,
  border: 'none',
  background: '#fff',
  color: '#20232a',
  font: '14px system-ui, sans-serif',
  cursor: 'pointer',
  boxShadow: '0 1px 4px rgba(0,0,0,.3)',
}

export default function AuthPreview() {
  const [screen, setScreen] = useState<'login' | 'signup'>('login')
  const [branch, setBranch] = useState<Branch | null>(null) // null 이면 로비
  const [kiosk, setKiosk] = useState(false)
  const [assigned, setAssigned] = useState<number | null>(null)
  const [showCheck, setShowCheck] = useState(false)
  const { session } = useSession()

  const fallback =
    screen === 'login' ? (
      <LoginPage onGoSignup={() => setScreen('signup')} />
    ) : (
      <SignupPage onSuccess={() => setScreen('login')} onGoLogin={() => setScreen('login')} />
    )

  return (
    <RequireAuth fallback={fallback}>
      <div style={{ width: '100vw', height: '100vh' }}>
        {branch ? <BranchScene /> : <LobbyScene onEnter={setBranch} />}
      </div>

      <div style={bar}>
        {branch && (
          <>
            {/* 실제로는 공간에서 키오스크 앞에 섰을 때 열려야 한다. 접근 감지는 Player.tsx 몫이라 임시 버튼을 둔다. */}
            <button type="button" style={button} onClick={() => setKiosk(true)}>
              키오스크 열기
            </button>
            <button
              type="button"
              style={button}
              onClick={() => {
                setBranch(null)
                setAssigned(null)
              }}
            >
              로비로 나가기
            </button>
          </>
        )}
        {assigned !== null && (
          <div style={{ ...button, background: '#4ade80', cursor: 'default' }}>
            {assigned}번 자리 배정됨
          </div>
        )}
        <button type="button" style={button} onClick={() => setShowCheck((v) => !v)}>
          {showCheck ? 'DB 확인 닫기' : 'DB 확인'}
        </button>
        <LogoutButton />
      </div>

      {showCheck && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            left: 16,
            zIndex: 10,
            width: 360,
            maxHeight: '80vh',
            overflowY: 'auto',
            padding: 20,
            borderRadius: 12,
            background: 'rgba(43,47,56,.95)',
            color: '#fff',
            font: '14px/1.6 system-ui, sans-serif',
          }}
        >
          <p style={{ ...styles.hint, color: '#fff', marginTop: 0 }}>
            {session?.user.email} · {String(session?.user.user_metadata?.nickname ?? '(닉네임 없음)')}
          </p>
          <DbCheck />
        </div>
      )}

      {kiosk && session && branch && (
        <KioskScreen
          userId={session.user.id}
          branchId={branch.id}
          onClose={() => setKiosk(false)}
          onAssigned={(n) => setAssigned(n)}
        />
      )}
    </RequireAuth>
  )
}
