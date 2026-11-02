// 도서관 책 목록. 본문은 public/books/<id>.json 에 따로 두고, 책을 펼칠 때 fetch 로만 불러옵니다.
// (본문을 import 하면 첫 화면 번들이 커지므로 src 에서는 본문을 가져오지 않습니다.)
// 출처·저작권 확인 내용: docs/도서-출처.md
import type { BookInfo } from './libraryLogic'

const WIKISOURCE = 'https://ko.wikisource.org/wiki/' // 모든 책의 출처는 위키문헌

export const BOOKS: BookInfo[] = [
  { id: 'bombom', title: '봄봄', author: '김유정', shelf: '한국 단편', sourceUrl: `${WIKISOURCE}봄봄` },
  { id: 'dongbaek', title: '동백꽃', author: '김유정', shelf: '한국 단편', sourceUrl: `${WIKISOURCE}동백꽃` },
  { id: 'unsu-joeun-nal', title: '운수 좋은 날', author: '현진건', shelf: '한국 단편', sourceUrl: `${WIKISOURCE}운수_좋은_날` },
  { id: 'memil', title: '메밀꽃 필 무렵', author: '이효석', shelf: '한국 단편', sourceUrl: `${WIKISOURCE}메밀꽃_필_무렵` },
  { id: 'gamja', title: '감자', author: '김동인', shelf: '한국 단편', sourceUrl: `${WIKISOURCE}감자` },
  { id: 'nalgae', title: '날개', author: '이상', shelf: '한국 단편', sourceUrl: `${WIKISOURCE}날개` },
  { id: 'taepyeong-cheonha', title: '태평천하', author: '채만식', shelf: '한국 장편', sourceUrl: `${WIKISOURCE}태평천하` },
  { id: 'yun-dongju-poems', title: '하늘과 바람과 별과 시', author: '윤동주', shelf: '시', sourceUrl: `${WIKISOURCE}하늘과_바람과_별과_시_(1955년)` },
]

export const bookUrl = (id: string) => `/books/${id}.json`
