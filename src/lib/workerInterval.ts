// 다른 탭으로 가서 페이지가 숨겨져도 제 주기로 도는 반복.
//
// 브라우저는 숨긴 탭의 requestAnimationFrame을 멈추고 setInterval도 늦춥니다(Chrome은 숨긴 지 5분 뒤 1분 1회).
// Web Worker(페이지와 따로 도는 작은 실행기) 안의 타이머는 늦추지 않으므로, 워커는 주기마다 신호만 보내고
// 실제 일(얼굴 인식·집중 판정)은 신호를 받은 메인 스레드에서 합니다.
// 시험: hidden-spike.html (2026-10-16, 숨긴 동안 1초 신호 10초에 10번, 얼굴 인식도 매번 실행됨)
export function workerInterval(ms: number, onTick: () => void): () => void {
  const code = `setInterval(() => postMessage(0), ${ms});`;
  const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  const worker = new Worker(url);
  worker.onmessage = () => onTick();
  // 멈추는 함수를 돌려줍니다. (화면이 사라질 때 호출)
  return () => {
    worker.terminate();
    URL.revokeObjectURL(url);
  };
}
