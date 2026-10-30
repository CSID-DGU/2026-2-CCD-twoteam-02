// 비동기 작업을 들어온 순서대로 하나씩 실행하는 줄 (#340). React 와 무관한 순수 로직입니다. (Node 로 검사)
//
// 카페·광장 벤치 자리 요청(잡기 sit_cafe_seat · 놓기 leave_cafe_seat · 반납 release_my_place)은 서로 기다리지 않으면
// 일어나자마자 다시 앉을 때 "잡기"가 "놓기"보다 서버에 먼저 도착할 수 있습니다. 그러면 한 사람 한 자리 규칙 때문에
// 방금 일어난 자기 자리 때문에 "○번 자리를 이용 중이에요" 창이 엉뚱하게 뜹니다. 이 줄에 넣으면 앞 요청의 응답을 받은 뒤
// 다음 요청을 보내므로 순서가 지켜집니다.
// 앞 작업이 실패해도 다음 작업은 실행하고, 실패는 그 작업을 넣은 쪽에만 전해집니다.
export function serialQueue() {
  let tail: Promise<unknown> = Promise.resolve()
  return <T>(task: () => PromiseLike<T>): Promise<T> => {
    const run = tail.then(task, task)
    tail = run.catch(() => undefined)
    return run
  }
}
