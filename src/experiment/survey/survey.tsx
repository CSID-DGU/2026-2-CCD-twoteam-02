// 실험 설문 화면 입구. 주소: /survey.html (앱 라우터·로그인 밖, Supabase·웹캠 없음)
// 화면은 SurveyApp.tsx, 문항은 surveyItems.ts, 순수 로직은 surveyLogic.ts 에 있습니다.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SurveyApp from "./SurveyApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SurveyApp />
  </StrictMode>,
);
