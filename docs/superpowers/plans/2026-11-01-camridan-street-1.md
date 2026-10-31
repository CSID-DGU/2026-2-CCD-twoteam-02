# 캠리단길 1단계 (이름·바닥·자갈·분수) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 광장을 카페거리 "캠리단길"로 바꾸는 3단계 중 1단계. 이름, 울퉁불퉁한 돌·벽돌 바닥, 자갈 테두리, 물이 튀고 흐르는 3단 분수.

**Architecture:** 무늬(돌·벽돌·자갈)는 정해진 난수로 캔버스에 그린 반복 텍스처(색 + 요철 bumpMap)를 재질에 붙임(`worldTextures.ts`). 배치 계산(자갈 띠 자리)은 순수 함수(`worldLogic`). 분수는 `WorldDecor` 의 Fountain 을 3단 접시 + 흐르는 물줄기(텍스처 오프셋) + 물결 + 튀는 물방울(Points 하나)로 다시 그림.

**Tech Stack:** R3F, three. 새 라이브러리·DB 변경 없음.

**Spec:** 대화 결정 — 이름 캠리단길, 순서 ① 바닥·분수 ② 나무·풀·벤치 ③ 파사드, 추가는 자갈 테두리만. 참고 사진 IMG_4573(벽돌 길·자갈 테두리), IMG_4574(3단 분수·조약돌 바닥).

## Global Constraints
- 화면에 보이는 "광장"만 "캠리단길"로. 코드 이름(lobby, plaza, PLAZA_WORLD)·DB·채널은 그대로.
- 30FPS 목표: 텍스처는 한 번 만들어 공유, 물방울은 Points 하나, 그림자 끔 유지.
- 눈 쌓임(setSnowCover)은 계속 동작. 캠퍼스(ground 'lawn')는 바뀌지 않음.
- 주석 한국어, 기준값 상수, 커밋 전 lint·build.

## Review Focus
1. 캠퍼스 월드가 바뀌지 않는지 (잔디 쿼드·캠퍼스 분수 없음 등).
2. 무늬가 반복될 때 이음매가 보이지 않는지, 바닥이 깜빡이지(z-fighting) 않는지.
3. 자갈 띠가 건물·길·문 앞을 덮거나 부딪힘을 바꾸지 않는지.
4. 화면 글자에 "광장"이 남는 곳(메뉴·출입문·지도·접속자).
5. 분수 물방울이 FPS 를 떨어뜨리지 않는지.

### Task 1: 이름
`worldConfig` PLAZA title, `world.json` title, `online.ts`, `keymap.ts`, `SceneMenu` 기본값 → 캠리단길. 커밋 `feat: 광장 이름을 캠리단길로`

### Task 2: 자갈 띠 자리 (순수, 검사 먼저)
`worldLogic.gravelStrips(plaza): Box[]` — 광장 네 변 바깥쪽 띠(GRAVEL_W), 길 양옆 띠. 길이 지나는 자리는 광장 띠를 끊음. 커밋 `feat: 캠리단길 자갈 띠 자리 계산`

### Task 3: 돌·벽돌·자갈 바닥
`worldTextures.ts`(cobble·brick·gravel 캔버스 텍스처 + bump), `worldMaterials` MAT.plaza·path 에 붙이고 MAT.gravel 추가, `Ground` 에 자갈 띠·반복 횟수. 커밋 `feat: 캠리단길 돌·벽돌 바닥과 자갈 테두리`

### Task 4: 분수
3단 접시·장식 기둥, 흐르는 물줄기, 물결, 튀는 물방울. 커밋 `feat: 캠리단길 3단 분수, 흐르고 튀는 물`
