// 내 손글씨 글씨체 (플래너·메모에 직접 쓴 글씨). 고른 값은 계정(profiles.hand_font, 0048)에 저장합니다.
// 글씨체는 CSS 변수 --hand-font·--hand-scale 로 바꿉니다. 손글씨를 쓰는 곳은 모두 paperStyle 의 HAND·handSize 를 쓰므로
// 이 변수만 바꾸면 플래너·붙인 메모·가방 속 메모가 한꺼번에 따라 바뀝니다.
// @font-face 와 라이선스는 index.css. 고르기 버튼의 "가나다"는 글씨체 파일 대신 그림(public/fonts/hand-preview-*.png):
// 묘은또박체 파일이 3.8MB 라, 버튼 때문에 모두가 받지 않고 고른 사람만 받게 하려고.

export type HandFontId = 'ochungi' | 'sangju' | 'myoeun'

// scale: 지금 칸 크기(오춘기 김작가 기준)에 맞추는 글자 크기 배율
export const HAND_FONTS: { id: HandFontId; label: string; family: string; scale: number; preview: string }[] = [
  { id: 'ochungi', label: '오춘기 김작가', family: "'OchungiKim', 'KyoboHandwriting2020A', cursive", scale: 1, preview: '/fonts/hand-preview-ochungi.png' },
  { id: 'sangju', label: '상주다정다감', family: "'SANGJUDajungdagam', 'OchungiKim', cursive", scale: 1.15, preview: '/fonts/hand-preview-sangju.png' }, // 글자가 작게 그려져 키움 (키워도 칸 너비는 오춘기보다 좁음)
  { id: 'myoeun', label: '묘은또박', family: "'BelovedMyoeunttobak', 'OchungiKim', cursive", scale: 0.95, preview: '/fonts/hand-preview-myoeun.png' }, // 획이 굵고 커 보여 조금 줄임
]

export const DEFAULT_HAND_FONT: HandFontId = 'ochungi'

// DB 값 → 글씨체. 목록에 없거나 비어 있으면 기본값
export function handFontFromDb(v: unknown): HandFontId {
  return HAND_FONTS.some((f) => f.id === v) ? (v as HandFontId) : DEFAULT_HAND_FONT
}

// 화면 전체의 손글씨를 이 글씨체로
export function applyHandFont(id: HandFontId): void {
  const f = HAND_FONTS.find((x) => x.id === id) ?? HAND_FONTS[0]
  const root = document.documentElement.style
  root.setProperty('--hand-font', f.family)
  root.setProperty('--hand-scale', String(f.scale))
}
