import { useSyncExternalStore } from 'react'
import HeadTrackingTest from './HeadTrackingTest'
import { BranchScene } from './space/BranchScene'

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

function App() {
  // 주소의 #space 여부로 화면을 고릅니다. 새로고침 없이 바로 바뀝니다.
  const space = useSyncExternalStore(subscribe, () => location.hash === '#space')
  return (
    <>
      {space ? (
        <div style={{ width: '100vw', height: '100vh' }}><BranchScene /></div>
      ) : (
        <HeadTrackingTest />
      )}
      <a
        href={space ? '#' : '#space'}
        style={{
          position: 'fixed', top: 16, right: 16, zIndex: 10, padding: '6px 12px',
          borderRadius: 8, background: '#fff', color: '#20232a',
          font: '14px system-ui, sans-serif', textDecoration: 'none',
          boxShadow: '0 1px 4px rgba(0,0,0,.3)',
        }}
      >
        {space ? '트래킹 검증으로' : '지점 공간으로'}
      </a>
    </>
  )
}

export default App
