// 문을 지나 로비 ↔ 지점을 옮길 때 넘기는 값 (#150)
//
// 화면은 바로 바뀌지만, 건너편 문 앞에서 보던 방향 그대로 나타나게 합니다.
// 로비의 지점 문은 북쪽 벽, 지점의 출입문은 남쪽 벽에 있어서 걷던 방향이 그대로 이어집니다.
//   로비 → 지점: 북쪽(-Z)으로 걸어 들어가면 지점 출입문 앞에서 안쪽(-Z)을 보고 섭니다.
//   지점 → 로비: 남쪽(+Z)으로 걸어 나가면 로비의 그 지점 문 앞에서 로비 쪽(+Z)을 보고 섭니다.
// react-router 의 이동 상태(navigate 의 state)로 넘기므로 주소에는 드러나지 않습니다.

export type Passage = {
  from?: string // 나온 지점 (로비에서 그 지점 문 앞에 섭니다)
  heading?: number // 문을 지날 때 바라보던 방향(라디안, 0이면 +Z)
}

// location.state 를 안전하게 읽습니다. 주소로 바로 들어오면 비어 있습니다.
export function passageOf(state: unknown): Passage {
  if (!state || typeof state !== 'object') return {}
  const { from, heading } = state as Record<string, unknown>
  return {
    from: typeof from === 'string' ? from : undefined,
    heading: typeof heading === 'number' && Number.isFinite(heading) ? heading : undefined,
  }
}
