import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // 배포 버전(커밋 앞 7자). Vercel 이 빌드할 때 넣어 주는 값이고, 로컬은 dev. 운영 대시보드에서 "어느 배포부터 난 에러인지" 보는 데 씀 (#590)
    'import.meta.env.VITE_APP_VERSION': JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev').slice(0, 7)),
  },
})
