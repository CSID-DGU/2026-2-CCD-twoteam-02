import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Vite는 기본으로 index.html만 빌드합니다. 실험용 별도 입구도 배포본에 들어가도록 여기에 등록합니다.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        experiment: fileURLToPath(new URL('./experiment.html', import.meta.url)), // 실험 진행 (사전 설문 → 조건 3개 → 마무리)
        survey: fileURLToPath(new URL('./survey.html', import.meta.url)), // 실험 설문 단독 (#201)
        taskTry: fileURLToPath(new URL('./task-try.html', import.meta.url)), // 과제 후보 시험 (spike)
      },
    },
  },
})
