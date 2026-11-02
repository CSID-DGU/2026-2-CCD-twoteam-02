// 해변 입구 간판의 판 모양과 글자 배치. React·three.js 와 무관한 순수 로직입니다. (Node 로 검사)
// 글자는 글꼴 파일 없이 가는 획(선)으로 정의해, 어느 컴퓨터에서나 같은 모양의 입체 글자로 뽑습니다(BeachScenery).
// 좌표: 간판 가운데가 (0, 0), 글자 안쪽은 왼쪽 아래 (0, 0) ~ 오른쪽 위 (폭, 1).

export const SIGN_TEXT = 'CAMBIT BEACH'
export const SIGN_SHAPE = { w: 9.4, top: 1.1, bottom: 0.3, bow: 0.42 } // 판 폭, 가운데 위·아래 높이, 휘는 정도
export const SIGN_SCALE = 1.45 // 간판을 키우는 배율
// 입구 야자수 길 (문 기준, +z 가 앞). 앞쪽은 간판을 가리지 않게 간판 폭과 잎 크기 바깥에 세움. 뒤쪽은 간판 뒤라 길가에 촘촘히
const AVENUE = {
  frontX: [10, 13], // 앞쪽 줄이 길에서 떨어진 폭
  front: { toBeach: [1.6, 4.2], inBeach: [5.5] }, // 앞쪽 거리: 광장 쪽 문, 해변 쪽 문
  back: [2, 7, 12, 17, 22, 28, 34, 41], // 뒤쪽 거리
  backX: 3.9, jitter: 0.7,
}
const LETTER = { h: 0.86, gap: 0.14, space: 0.42, maxSpan: 8.3 } // 글자 높이, 글자 사이, 단어 사이, 전체 최대 폭

type Pt = [number, number]
// 글자 폭 (높이 1 기준)
const WIDTH: Record<string, number> = { C: 0.72, A: 0.78, M: 0.92, B: 0.66, I: 0.12, T: 0.72, E: 0.6, H: 0.72 }

function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number, n = 12): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry])
  }
  return out
}

// 글자 하나의 획들 (이어진 점 목록). 없는 글자는 빈 목록
export function glyphStrokes(ch: string): Pt[][] {
  const w = WIDTH[ch] ?? 0
  switch (ch) {
    case 'C': return [arc(w / 2, 0.5, w / 2, 0.5, 48, 312, 18)]
    case 'A': return [[[0, 0], [w / 2, 1], [w, 0]], [[w * 0.2, 0.36], [w * 0.8, 0.36]]]
    case 'M': return [[[0, 0], [0.06, 1], [w / 2, 0.22], [w - 0.06, 1], [w, 0]]]
    case 'B': return [[[0, 0], [0, 1]], [[0, 1], [w * 0.5, 1], ...arc(w * 0.5, 0.75, w * 0.42, 0.25, 90, -90), [0, 0.5]], [[0, 0.5], [w * 0.52, 0.5], ...arc(w * 0.52, 0.25, w * 0.48, 0.25, 90, -90), [0, 0]]]
    case 'I': return [[[w / 2, 0], [w / 2, 1]]]
    case 'T': return [[[0, 1], [w, 1]], [[w / 2, 1], [w / 2, 0]]]
    case 'E': return [[[w, 1], [0, 1], [0, 0], [w, 0]], [[0, 0.52], [w * 0.82, 0.52]]]
    case 'H': return [[[0, 0], [0, 1]], [[w, 0], [w, 1]], [[0, 0.52], [w, 0.52]]]
    default: return []
  }
}

// 판의 위·아래 곡선 (2차 베지어: 양끝 낮고 가운데 솟음) x 에서의 높이
export function signEdges(x: number): { top: number; bottom: number } {
  const { w, top, bottom, bow } = SIGN_SHAPE
  const t = Math.min(1, Math.abs(x) / (w / 2))
  // 양끝이 end, 가운데(조절점의 절반 지점)가 mid 인 곡선
  const curve = (mid: number, end: number) => mid + (end - mid) * t * t
  return { top: curve(top, top - bow * 0.9), bottom: curve(bottom * -1, -bottom - bow) }
}

// 글자 자리: 판 곡선의 가운데를 따라 놓고 그 기울기만큼 돌림. 넘치면 전체를 줄임
export type SignLetter = { ch: string; x: number; y: number; rot: number; h: number; w: number }
export function signLetters(text: string): SignLetter[] {
  const chars = text.split('')
  const raw = chars.reduce((sum, ch, i) => sum + (ch === ' ' ? LETTER.space : (WIDTH[ch] ?? 0) * LETTER.h + (i < chars.length - 1 ? LETTER.gap : 0)), 0)
  const scale = Math.min(1, LETTER.maxSpan / raw)
  const mid = (x: number) => {
    const e = signEdges(x)
    return (e.top + e.bottom) / 2
  }
  let run = (-raw * scale) / 2
  const out: SignLetter[] = []
  for (const ch of chars) {
    if (ch === ' ') {
      run += LETTER.space * scale
      continue
    }
    const w = (WIDTH[ch] ?? 0) * LETTER.h * scale
    const x = run + w / 2
    const rot = Math.atan2(mid(x + 0.05) - mid(x - 0.05), 0.1)
    out.push({ ch, x, y: mid(x), rot, h: LETTER.h * scale, w })
    run += w + LETTER.gap * scale
  }
  return out
}

// 입구 앞뒤 야자수 자리. toBeach: 광장에 있는 해변 쪽 문인지 (해변 안쪽 문은 앞에 산책로가 있어 앞줄이 적음)
export function avenuePalms(toBeach: boolean): { x: number; z: number }[] {
  const A = AVENUE
  const wob = (i: number) => (((i * 37) % 11) / 10 - 0.5) * A.jitter
  const out: { x: number; z: number }[] = []
  for (const x of A.frontX) {
    for (const z of toBeach ? A.front.toBeach : A.front.inBeach) {
      for (const sx of [-1, 1]) out.push({ x: sx * x, z: z + wob(x + sx + 2) })
    }
  }
  A.back.forEach((z, i) => {
    for (const sx of [-1, 1]) out.push({ x: sx * (A.backX + wob(i * 5 + sx + 2)), z: -z })
  })
  return out
}
