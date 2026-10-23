// 실험 진행 화면 입구. 주소: /experiment.html?participant=P01&order=CBA (앱 라우터·로그인 밖, Supabase·웹캠 없음)
// 화면은 SessionApp.tsx, 흐름 로직은 sessionLogic.ts, 설문은 ../survey/ 에 있습니다.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SessionApp from "./SessionApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SessionApp />
  </StrictMode>,
);
