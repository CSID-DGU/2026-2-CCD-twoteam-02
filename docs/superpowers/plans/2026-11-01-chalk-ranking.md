# 오늘의 공부왕 분필 칠판·프로필 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 광장 "오늘의 공부왕" 게시판과 E 순위 창을 분필 칠판 느낌(케리스 케듀체, 분필 번짐·낙서)으로 바꾸고, 순위마다 그 사람 캐릭터 얼굴(프로필 사진)을 보여 준다.

**Architecture:** 순위 → 그릴 칸(시상대 1~3, 목록 4~) 계산은 순수 함수(`rankingLogic`). 얼굴 사진은 화면 밖 작은 R3F 화면 하나(`PortraitStudio`)가 차림(아바타 키)마다 한 번 찍어 그림(dataURL)으로 저장하고(`portraitStore`), 게시판(캔버스 텍스처)과 순위 창(img)이 같이 쓴다. 글꼴은 웹폰트로 불러오고 3D 게시판은 글꼴·얼굴이 준비되면 다시 그린다.

**Tech Stack:** TypeScript, React 19, R3F, Supabase(`avatars` 읽기만). 새 라이브러리 없음, DB 변경 없음.

**Spec:** 이 대화의 결정 — 시안 `chalk-board-v2`(게시판: 제목 띠 위·시상대 아래로 겹치지 않게, 1등 왕관·크게, 분필 낙서 / 순위 창: 시상대 + 4등부터 작은 얼굴 목록 + 내 줄 강조), 글꼴 케리스 케듀체(KERIS, OFL, 눈누 jsDelivr woff2 400·700, 출처 표기), 프로필 = 그 사람이 고른 캐릭터 얼굴.

## Global Constraints
- 새 라이브러리 없음, DB 변경 없음. 현님 기능(#59 순위)의 동작(5분마다 갱신, 공개 범위 '모두'만, 이름 누르면 프로필 창, Esc 닫기)은 그대로.
- 글꼴 출처: "케리스 케듀체 © KERIS(한국교육학술정보원), SIL OFL" 를 글꼴 선언 옆 주석과 PR 에 적는다.
- WebGL 화면은 얼굴 찍는 것 하나만 더 (사람마다 만들지 않음).
- 주석·화면 글자 한국어, 기준값 상수. 커밋 전 lint·build. 검사는 scratchpad.

## Review Focus
1. 얼굴을 못 찍었거나 아직일 때(로딩·오류·차림 없음) 빈 동그라미/이니셜로 보이고 깨지지 않는지.
2. 같은 차림을 여러 번 찍거나, 순위가 바뀔 때마다 다시 찍는지(캐시).
3. 글꼴이 늦게 와도 게시판이 결국 케듀체로 다시 그려지는지.
4. 같은 분(동점)·1~2명뿐·0명일 때 시상대가 비거나 어긋나지 않는지.
5. 순위 창에서 이름·얼굴을 누르면 지금처럼 프로필 창이 뜨는지.

---

### Task 1: 그릴 칸 계산 (순수)
**Files:** Modify `src/ranking/rankingLogic.ts`; Test `<scratchpad>/tests/ranking-chalk.test.mjs`
- `export function podium(rows: RankRow[]): (RankRow | null)[]` — [2등, 1등, 3등] 자리 순서(가운데가 1등), 없으면 null
- `export const initialOf = (nickname: string) => string` — 얼굴 없을 때 이니셜(첫 글자)
- [ ] 실패하는 검사(0·1·2·3명, 동점 순서 유지) → 실패 확인 → 구현 → 통과 → 커밋 `feat: 순위 시상대 자리 계산`

### Task 2: 캐릭터 얼굴 사진
**Files:** Create `src/ranking/portraitStore.ts`(아바타 키 → dataURL 저장·구독·요청 대기열, useSyncExternalStore), `src/ranking/PortraitStudio.tsx`(화면 밖 128px R3F 화면: 대기열에서 하나씩 꺼내 캐릭터(useSkin·useHair·useFace)를 앉혀 머리를 찍고 저장), `src/ranking/useAvatarModels.ts`(순위 id → 아바타 키, `avatars` 에서 읽고 캐시); Modify `src/world/WorldScene.tsx`(PortraitStudio 한 번 두기)
- Test: portraitStore 대기열(같은 키 한 번만 요청, 저장되면 알림) 검사 먼저
- [ ] 검사 → 구현 → lint·build → 커밋 `feat: 순위용 캐릭터 얼굴 사진 찍기`

### Task 3: 글꼴
**Files:** Modify `src/index.css`(또는 전역 CSS) `@font-face 'KerisKedyuche'` 400·700 + 출처 주석; `src/ranking/chalk.ts`(분필 글자 그리기 도우미: 번짐 그림자, 낙서, 글꼴 준비 `fontsReady()`)
- [ ] 구현 → lint·build → 커밋 `feat: 케리스 케듀체 글꼴과 분필 그리기 도우미`

### Task 4: 광장 게시판
**Files:** Modify `src/world/RankingBoard.tsx`(lines 대신 ranking·얼굴을 받아 시안대로 그림: 제목 띠·점선·시상대·왕관·낙서·분필 질감, 글꼴·얼굴 준비되면 다시 그림), `src/world/WorldScene.tsx`
- [ ] 구현 → lint·build → 커밋 `feat: 오늘의 공부왕 게시판을 분필 칠판으로`

### Task 5: 순위 창
**Files:** Modify `src/ranking/RankingPanel.tsx`(칠판 판·케듀체·시상대 + 4등부터 얼굴 목록 + 내 줄 강조, 기존 탭·닫기·이름 누르기 그대로)
- [ ] 구현 → lint·build → 커밋 `feat: 순위 창을 분필 칠판으로, 얼굴 사진`

### Task 6: 화면 확인 안내
- [ ] 광장 게시판(밤에도 읽히는지), E 순위 창, 얼굴이 내 캐릭터와 같은지, 이름 눌러 프로필, FPS
