import HeadTrackingTest from './HeadTrackingTest'
import { BranchScene } from './space/BranchScene'

function App() {
  if (location.hash === '#space') {
    return <div style={{ width: '100vw', height: '100vh' }}><BranchScene /></div>
  }
  return <HeadTrackingTest />
}

export default App