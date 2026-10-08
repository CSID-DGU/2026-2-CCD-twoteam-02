import type { ReactNode } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import HeadTrackingTest from './HeadTrackingTest'
import { BranchScene } from './space/BranchScene'
import LoginPage from './auth/LoginPage'
import SignupPage from './auth/SignupPage'
import RequireAuth from './auth/RequireAuth'
import LogoutButton from './auth/LogoutButton'

// 우측 상단 버튼 공통 모양
const cornerButton = {
  position: 'fixed', right: 16, zIndex: 10, padding: '6px 12px',
  borderRadius: 8, background: '#fff', color: '#20232a',
  font: '14px system-ui, sans-serif', textDecoration: 'none',
  boxShadow: '0 1px 4px rgba(0,0,0,.3)',
} as const

// 로그인한 사람만 통과시키고, 아니면 /login 으로 보냅니다.
function Protected({ children }: { children: ReactNode }) {
  return <RequireAuth fallback={<Navigate to="/login" replace />}>{children}</RequireAuth>
}

// 트래킹 검증 ↔ 지점 공간 전환 버튼
function SwitchLink({ to, label }: { to: string; label: string }) {
  return <Link to={to} style={{ ...cornerButton, top: 16 }}>{label}</Link>
}

function AppRoutes() {
  const navigate = useNavigate()
  const { hash } = useLocation()

  // 예전 주소(#space)로 들어오면 /space 로 넘깁니다. 북마크가 깨지지 않게 하려는 것입니다.
  if (hash === '#space') return <Navigate to="/space" replace />

  return (
    <Routes>
      <Route
        path="/login"
        element={<LoginPage onSuccess={() => navigate('/')} onGoSignup={() => navigate('/signup')} />}
      />
      <Route
        path="/signup"
        element={<SignupPage onSuccess={() => navigate('/login')} onGoLogin={() => navigate('/login')} />}
      />
      {/* 로비(LobbyScene)가 develop 에 들어오기 전까지는 지점 공간으로 바로 보냅니다. */}
      <Route path="/" element={<Navigate to="/space" replace />} />
      <Route
        path="/space"
        element={
          <Protected>
            <div style={{ width: '100vw', height: '100vh' }}><BranchScene /></div>
            <SwitchLink to="/tracking" label="트래킹 검증으로" />
            <LogoutButton style={{ ...cornerButton, top: 56 }} />
          </Protected>
        }
      />
      <Route
        path="/tracking"
        element={
          <Protected>
            <HeadTrackingTest />
            <SwitchLink to="/space" label="지점 공간으로" />
          </Protected>
        }
      />
      {/* 없는 주소는 첫 화면으로 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  // BrowserRouter: 주소창의 경로(/space 등)를 읽어 맞는 화면을 고르고, 새로고침 없이 화면을 바꿉니다.
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App
