// 브라우저에만 있는 것(저장소, 파일 내려받기)을 한곳에 모읍니다. 순수 로직(surveyLogic.ts)은 이 파일을 모릅니다.
import { toCsv } from "./surveyLogic";
import type { Answer, Store } from "./surveyLogic";

// 브라우저 저장소를 Store 꼴로 감쌉니다. 못 쓰는 환경이면 get이 null을 주고 set이 던져 저장 실패로 표시됩니다.
export const browserStore: Store = {
  get: (k) => localStorage.getItem(k),
  set: (k, v) => localStorage.setItem(k, v),
};

export function downloadCsv(rows: Answer[], name: string) {
  downloadText(toCsv(rows), name);
}

export function downloadText(text: string, name: string) {
  const blob = new Blob(["\uFEFF" + text], { type: "text/csv" }); // 엑셀에서 한글이 깨지지 않게 BOM
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
