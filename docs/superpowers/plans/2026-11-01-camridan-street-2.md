# 캠리단길 2단계 (잔디·풀·나무·벤치) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 캠리단길을 정원 카페 거리처럼: 진짜 풀 같은 잔디(바닥 무늬 + 바람에 흔들리는 풀 포기), 여러 가지 풀(관목·장미·라벤더·고사리·들꽃), 풍성한 활엽수, 사진 같은 정원 벤치.

**Architecture:** 어디에 무엇을 둘지는 순수 함수(`gardenLogic.ts`: 풀 포기 자리, 화단 자리 — 광장·자갈·길·건물·문을 피함, 정해진 난수). 그리기는 `Garden.tsx`(InstancedMesh 로 종류마다 한 번), 풀 흔들림은 셰이더에 바람 한 줄(onBeforeCompile). 캠퍼스(ground 'lawn')는 지금 그대로.

**Tech Stack:** R3F, three, drei Instances. 새 라이브러리·DB 변경 없음.

## Global Constraints
- 캠퍼스는 바뀌지 않음. 벤치 크기(BENCH 1.6×0.6)·앉는 자리·부딪힘 그대로.
- 30FPS: 종류마다 InstancedMesh 하나, 그림자 끔, 풀 포기 수는 상수.
- 눈이 오면 풀·잎도 하얘짐(addSnowy).
- 주석 한국어, 기준값 상수, 커밋 전 lint·build.

## Review Focus
1. 풀·화단이 길·문 앞·벤치·게시판·건물 입구를 덮거나 막지 않는지.
2. 새 나무가 길·건물·문과 겹치지 않는지 (부딪힘 상자 포함).
3. FPS (풀 포기 수).
4. 캠퍼스가 그대로인지.
5. 눈 올 때 풀이 초록으로 남지 않는지.

### Task 1: 자리 계산 (순수, 검사 먼저) — `gardenLogic.ts`: `grassTufts`, `flowerBeds`
### Task 2: 잔디 바닥 무늬 + 흔들리는 풀 포기
### Task 3: 화단 (관목·장미·라벤더·고사리·들꽃)
### Task 4: 풍성한 활엽수 + 광장 둘레 나무 추가 (`world.json`)
### Task 5: 정원 벤치 (나무 살 + 둥근 등받이 + 팔걸이 + 주철 다리)
