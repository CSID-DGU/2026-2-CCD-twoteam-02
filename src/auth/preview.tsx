// auth-preview.html 의 진입점. 화면 내용은 AuthPreview.tsx 에 있다.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AuthPreview from './AuthPreview'
import '../index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthPreview />
  </StrictMode>
)
