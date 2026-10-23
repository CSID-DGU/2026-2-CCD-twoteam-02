// 사용자 실험 과제 후보 시험 (spike) 입구. 실제 서비스 코드가 아니라 과제를 고르기 위한 일회용 화면입니다. 주소: /task-try.html
// 화면은 TaskTryApp.tsx, 순수 로직은 taskTryLogic.ts 에 있습니다.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import TaskTryApp from "./TaskTryApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TaskTryApp />
  </StrictMode>,
);
