// 카메라 안내 창 (#376). 공부 자리(SeatedStudy)와 회의실 자리(SeatedTracking)가 같이 씁니다.
//
//   CameraConsent  카메라를 켜기 전: 무엇을 보고 무엇을 보내지 않는지 크게 알리고 [카메라 켜기]를 누르면 시스템 허용 창이 뜸.
//                  앱스토어 심사에서 권하는 "우리 안내 → 시스템 허용 창" 순서. [나중에]면 일어나서 둘러보기를 그대로 할 수 있음
//   CameraTrouble  웹캠을 못 켰을 때: 원인별 제목, 지금 기기·브라우저(앱이면 앱 설정)에 맞는 해결 단계, [다시 시도]
// 문구는 cameraHelp.ts 한 곳에 있습니다(앱의 권한 설명에도 같은 문장을 씀).
import type { CSSProperties } from 'react'
import { CAMERA_PRIVACY, PROBLEM_TITLE, cameraProblem, cameraSteps, detectPlatform } from './cameraHelp'

// 앱 껍데기(Capacitor 등) 안인지. 라이브러리 없이, 껍데기가 넣어 주는 표시만 봅니다.
function inNativeApp(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return cap?.isNativePlatform?.() === true
}

export function CameraConsent({ onAgree, onLater }: { onAgree: () => void; onLater: () => void }) {
  return (
    <div style={styles.card} role="dialog" aria-label="카메라 안내">
      <div style={styles.title}>📷 {CAMERA_PRIVACY.title}</div>
      <p style={styles.text}>{CAMERA_PRIVACY.what}</p>
      <p style={styles.promise}>{CAMERA_PRIVACY.promise}</p>
      <div style={styles.row}>
        <button type="button" style={styles.ghost} onClick={onLater}>
          나중에
        </button>
        <button type="button" style={styles.primary} onClick={onAgree}>
          카메라 켜기
        </button>
      </div>
    </div>
  )
}

// [나중에]를 누른 뒤 남는 작은 막대
export function CameraLater({ onOpen }: { onOpen: () => void }) {
  return (
    <div style={styles.bar}>
      카메라를 켜야 공부를 시작할 수 있어요. 일어나도 둘러보기는 그대로 할 수 있어요.{' '}
      <button type="button" style={styles.link} onClick={onOpen}>
        카메라 켜기
      </button>
    </div>
  )
}

export function CameraTrouble({ errorName, onRetry }: { errorName: string; onRetry: () => void }) {
  const problem = cameraProblem(errorName, window.isSecureContext)
  const steps = cameraSteps(problem, detectPlatform(navigator.userAgent, inNativeApp()))
  return (
    <div style={styles.card} role="alert">
      <div style={styles.title}>📷 {PROBLEM_TITLE[problem]}</div>
      <ol style={styles.steps}>
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p style={styles.hint}>일어나도(E) 둘러보기는 계속할 수 있어요. {CAMERA_PRIVACY.promise}</p>
      {problem !== 'insecure' && (
        <div style={styles.row}>
          <button type="button" style={styles.primary} onClick={onRetry}>
            다시 시도
          </button>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  card: {
    position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 25,
    width: 'min(400px, calc(100vw - 32px))', padding: 20, borderRadius: 14, background: '#20232a', color: '#fff',
    font: '14px/1.6 system-ui, sans-serif', boxShadow: '0 8px 30px rgba(0,0,0,.4)',
  },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 8 },
  text: { margin: '0 0 8px', color: '#cbd5e1' },
  promise: { margin: '0 0 16px', padding: '10px 12px', borderRadius: 10, background: 'rgba(34,197,94,.12)', color: '#bbf7d0', fontSize: 15, fontWeight: 600 },
  steps: { margin: '0 0 12px', paddingLeft: 20, color: '#e5e7eb' },
  hint: { margin: '0 0 14px', color: '#9aa1ab', fontSize: 13 },
  row: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  primary: { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#0b1a10', font: 'inherit', fontWeight: 700, cursor: 'pointer' },
  ghost: { padding: '8px 16px', borderRadius: 8, border: '1px solid #4b5563', background: 'transparent', color: '#fff', font: 'inherit', cursor: 'pointer' },
  bar: {
    position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10, maxWidth: 'calc(100vw - 32px)',
    padding: '8px 14px', borderRadius: 8, background: 'rgba(32,35,42,.92)', color: '#fff', font: '14px system-ui, sans-serif', textAlign: 'center',
  },
  link: { padding: 0, border: 'none', background: 'none', color: '#86efac', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', fontWeight: 700 },
}
