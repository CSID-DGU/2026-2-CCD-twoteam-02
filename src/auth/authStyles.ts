// 로그인·회원가입 화면이 같이 쓰는 모양값.
// 디자인은 기능이 보이는 최소한으로 한다. 꾸미는 건 나중에.
import type { CSSProperties } from 'react'

export const styles = {
  page: {
    position: 'fixed',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    background: '#20232a',
    font: '14px/1.6 system-ui, sans-serif',
    color: '#fff',
  },
  card: {
    width: 320,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 28,
    borderRadius: 12,
    background: '#2b2f38',
  },
  title: { margin: 0, fontSize: 20 },
  label: { display: 'flex', flexDirection: 'column', gap: 4 },
  input: {
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid #4b515c',
    background: '#20232a',
    color: '#fff',
    font: 'inherit',
  },
  button: {
    marginTop: 4,
    padding: '10px 12px',
    borderRadius: 6,
    border: 'none',
    background: '#4ade80',
    color: '#20232a',
    font: 'inherit',
    fontWeight: 600,
    cursor: 'pointer',
  },
  link: {
    background: 'none',
    border: 'none',
    color: '#9ec1ff',
    font: 'inherit',
    textDecoration: 'underline',
    cursor: 'pointer',
    padding: 0,
  },
  error: { color: '#f87171', margin: 0 },
  notice: { color: '#4ade80', margin: 0 },
  hint: { color: '#9aa1ab', margin: 0, fontSize: 13 },
} satisfies Record<string, CSSProperties>
