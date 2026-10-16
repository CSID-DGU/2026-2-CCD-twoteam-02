import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import HeadTrackingTest from './HeadTrackingTest'
import { BranchScene } from './space/BranchScene'
import LoginPage from './auth/LoginPage'
import SignupPage from './auth/SignupPage'
import RequireAuth from './auth/RequireAuth'
import ForgotPasswordPage from './auth/ForgotPasswordPage'
import ResetPasswordPage from './auth/ResetPasswordPage'
import EmailChangedPage from './auth/EmailChangedPage'
import LogoutButton from './auth/LogoutButton'
import LobbyScene from './lobby/LobbyScene'
import RecordsPage from './study/RecordsPage'
import FriendsPage from './friends/FriendsPage'
import ProfilePage from './profile/ProfilePage'
import { rememberCondition } from './study/condition'
import { cornerButton } from './menu/cornerStyle' // 우측 상단 버튼 공통 모양


// 로그인한 사람만 통과시키고, 아니면 /login 으로 보냅니다.
function Protected({ children }: { children: ReactNode }) {
  return <RequireAuth fallback={<Navigate to="/login" replace />}>{children}</RequireAuth>
}

// 우측 상단 이동 버튼. top 으로 세로 위치를 정합니다.
function CornerLink({ to, label, top, state }: { to: string; label: string; top: number; state?: unknown }) {
  return <Link to={to} state={state} style={{ ...cornerButton, top }}>{label}</Link>
}

function AppRoutes() {
  const navigate = useNavigate()
  const { hash, search } = useLocation()

  // 실험 진행자가 준 링크(?condition=hidden|visible)로 들어오면 그 조건을 이 브라우저에 기억합니다.
  useEffect(() => {
    rememberCondition(search)
  }, [search])

  // 예전 주소(#space)로 들어오면 /space 로 넘깁니다. 북마크가 깨지지 않게 하려는 것입니다.
  if (hash === '#space') return <Navigate to="/space" replace />

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <LoginPage
            onSuccess={() => navigate('/')}
            onGoSignup={() => navigate('/signup')}
            onGoForgot={() => navigate('/forgot-password')}
          />
        }
      />
      <Route
        path="/signup"
        element={<SignupPage onSuccess={() => navigate('/login')} onGoLogin={() => navigate('/login')} />}
      />
      {/* 비밀번호를 잊은 사람은 로그인을 못 하므로 아래 두 주소는 울타리 밖에 둡니다. */}
      <Route path="/forgot-password" element={<ForgotPasswordPage onGoLogin={() => navigate('/login')} />} />
      <Route
        path="/reset-password"
        element={
          <ResetPasswordPage
            onDone={() => navigate('/login')}
            onGoForgot={() => navigate('/forgot-password')}
          />
        }
      />
      {/* 이메일 변경 확인 메일의 링크가 돌아오는 곳. 로그인 상태가 애매할 수 있어 울타리 밖에 둡니다. */}
      <Route path="/email-changed" element={<EmailChangedPage onGoLogin={() => navigate('/login')} />} />
      {/* 첫 화면은 로비입니다. 지점 문으로 들어가면 그 지점 공간으로 갑니다. */}
      <Route
        path="/"
        element={
          <Protected>
            <div style={{ width: '100vw', height: '100vh' }}>
              <LobbyScene onEnter={(branch, heading) => navigate(`/space?branch=${branch.slug}`, { state: { heading } })} />
            </div>
            {/* 내 기록·친구·내 프로필(16~96)은 LobbyScene 이 창으로 엽니다. (#70) */}
            <LogoutButton style={{ ...cornerButton, top: 136 }} />
          </Protected>
        }
      />
      <Route
        path="/space"
        element={
          <Protected>
            <div style={{ width: '100vw', height: '100vh' }}><BranchScene /></div>
            <CornerLink to="/tracking" label="트래킹 검증으로" top={16} />
            {/* 버튼으로 나가도 로비의 그 지점 문 앞에 섭니다. (문으로 나가기는 지점 안 출입문에서 E, #150) */}
            <CornerLink to="/" label="로비로" top={56} state={{ from: new URLSearchParams(search).get('branch') ?? undefined }} />
            {/* 내 기록·친구·내 프로필(96~176)은 BranchScene 이 창으로 엽니다. (#70) */}
            <LogoutButton style={{ ...cornerButton, top: 216 }} />
          </Protected>
        }
      />
      <Route
        path="/tracking"
        element={
          <Protected>
            <HeadTrackingTest />
            <CornerLink to="/space" label="지점 공간으로" top={16} />
          </Protected>
        }
      />
      <Route
        path="/records"
        element={
          <Protected>
            <RecordsPage />
          </Protected>
        }
      />
      <Route
        path="/friends"
        element={
          <Protected>
            <FriendsPage />
          </Protected>
        }
      />
      {/* /profile 은 내 프로필, /profile/:id 는 그 사람의 프로필 */}
      <Route path="/profile" element={<Protected><ProfilePage /></Protected>} />
      <Route path="/profile/:id" element={<Protected><ProfilePage /></Protected>} />
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
