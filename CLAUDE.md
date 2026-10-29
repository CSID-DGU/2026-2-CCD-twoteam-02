# 아바타 캠스터디 (팀 두뜀)

웹캠 트래킹으로 내 행동이 반영되는 3D 캐릭터가 나 대신 앉아 있는 웹 기반 온라인 스터디카페.
얼굴은 숨기고, 함께 공부하는 긴장감은 유지하는 것이 목적이다.
2026-2 융합캡스톤디자인 프로젝트이다. 팀 두뜀(최원준, 김현, 육심호)이 개발한다.

- 저장소: https://github.com/CSID-DGU/2026-2-CCD-twoteam-02
- Issue와 PR은 이 저장소에서 관리한다.

## 절대 규칙

- 웹캠 영상은 저장하지도, 기기 밖으로 전송하지도 않는다. 서버로 보내는 것은 위치·고개 각도·상태 같은 수치 데이터뿐이다.
- 얼굴·자세·물체 인식은 모두 브라우저 안(MediaPipe)에서 처리한다. 영상을 외부 API로 보내는 코드를 제안하지 않는다.
- Supabase 테이블에는 RLS를 적용한다. 본인 데이터만 조회·수정할 수 있어야 한다.
- 비밀 키는 `.env`에 두고 커밋하지 않는다. service role 키는 클라이언트 코드에 넣지 않는다.
- `main`, `develop`, `experiment`에 직접 커밋하지 않는다.

## 기술 스택

현재 쓰는 것:

- 언어·프론트: TypeScript, React 19, Vite, react-router(주소별 화면 전환)
- 2D·3D 화면: Three.js, React Three Fiber, drei (2D 이동과 3D 좌석은 같은 공간에서 카메라만 전환)
- 캐릭터: GLB 모델(`public/models/character-a.glb`)을 drei `useGLTF`로 불러온다. 18종은 모양이 같고 스킨만 달라서 모델 하나에 맨몸(피부색)과 고른 부품(머리·상의·하의·신발, `public/models/Parts/`)을 겹치고 색을 입힌 스킨을 입힌다(#56). 눈·눈썹·입은 얼굴 앞에 붙인 판에 스티커처럼 얹어, 사용자가 위치·크기를 옮길 수 있다(#293). VRM·three-vrm은 쓰지 않는다.
- 트래킹: MediaPipe Face Landmarker (`@mediapipe/tasks-vision`, 고개·눈), Pose Landmarker (팔·카메라 가이드라인), Object Detector (휴대폰, EfficientDet-Lite0)
- 백엔드: Supabase (`@supabase/supabase-js` — Auth, PostgreSQL, Realtime(Broadcast·Presence), 좌석 배정 DB 함수). 접속 정보는 `.env.local`에 두고 `src/lib/supabase.ts`에서만 읽는다. 스키마 변경은 `supabase/migrations/`에 번호 순서대로 파일을 추가한다.
- 배포: Vercel. `develop`과 `experiment`가 각각 따로 배포된다(아래 "배포" 참고).

위 목록에 없는 라이브러리를 추가해야 하면 먼저 이유를 설명하고 확인을 받는다.

## 명령어

- 개발 서버: `npm run dev`
- 빌드(타입 검사 포함): `npm run build`
- 린트: `npm run lint`
- 빌드 결과 미리보기: `npm run preview`
- 테스트 도구는 아직 없다. 추가하려면 먼저 확인을 받는다.

커밋 전에 `npm run lint`와 `npm run build`가 통과하는지 확인한다.

## 폴더 구조

```
src/
  App.tsx              주소별 화면 표 (/login, /signup, /, /space, /meeting/:id, /tracking, /records, /friends, /profile)와 출입 통제
  HeadTrackingTest.tsx 트래킹 검증 화면
  tracking/            얼굴·팔(Pose) 트래킹 훅, 트래킹이 반영되는 캐릭터 (armLogic.ts는 순수 로직)
  focus/               집중 상태 판정·집중 시간 (focusLogic.ts는 React와 무관한 순수 로직)
  space/               지점 공간, 2D 이동, 3D 좌석, 내 모습 화면, 성능 표시
    branches/*.json    지점 배치 데이터 (크기, 벽, 좌석, 회의실 문, 키오스크 또는 커피 바, 시작 위치, 로비로 나가는 출입문). index.ts 에 등록
                       별다방(byeol, 스터디카페: 키오스크로 자리 배정), 솔카페(sol, 카페: 앉으면 내 자리)
  auth/                로그인·회원가입 화면, 로그인 상태 확인, 출입 통제
  lobby/               로비 (지점 문 앞에서 E로 입장, lobby.json에 배치)
  kiosk/               키오스크 (이용 시간 선택, 좌석 배치도, 자리 배정)
  study/               공부 시작(과목·허용 설정 선택), 집중 타이머, 공부 기록 저장, 내 기록 화면 (studyLogic.ts·recordsLogic.ts는 순수 로직)
  friends/             친구 찾기·요청·수락·목록 (friendsLogic.ts는 순수 로직, 닉네임#태그로 구분)
  avatar/              캐릭터 꾸미기 (부품 목록 parts.json, 모델 면 자리 uvFaces.json, 부품을 겹쳐 스킨 만들기. avatarLogic.ts는 순수 로직)
  meeting/             회의실 (문 앞 회의 목록·만들기 창, 회의 화면. meetingLogic.ts는 원형 테이블 자리 계산 순수 로직)
  profile/             프로필(공부 기록 요약)과 공개 범위, 지점에서 캐릭터를 누르면 뜨는 프로필 창
  report/              오판·버그 신고 (메뉴 "신고하기", 최근 30초 판정 수치 첨부)와 팀용 신고 목록 (recentSamples.ts·reportLogic.ts는 순수 로직)
  lib/supabase.ts      Supabase 연결 (화면에서는 이 파일만 가져다 쓴다)
supabase/migrations/   DB 스키마 변경 이력 (번호 순서대로 Supabase SQL Editor에서 실행)
public/models/         캐릭터 GLB와 텍스처
art/                   캐릭터 눈·입 원본 그림(2048 얼굴 캔버스)과 그리기 밑그림. scripts/import-face-drawings.mjs 로 부품을 만든다
prototype/             초기 Python 트래킹 프로토타입 (참고용)
docs/                  제안서·주간발표 자료
```

- 새 기능은 기능별 폴더로 나누고, 폴더끼리는 정해진 타입으로만 주고받는다.
- 판정·계산 로직은 `focusLogic.ts`처럼 화면과 분리된 순수 함수로 둔다.
- 지점 배치는 코드에 직접 쓰지 않고 `src/space/branches/`의 JSON으로 관리한다.
- 기준값(초, 점수, 거리)은 파일 위쪽에 이름 붙인 상수로 모아 둔다. 판정 기준은 `focusLogic.ts`의 상수가 기준이며 현재는 임시값이다.

## 브랜치와 PR

- `main`: 배포본. PR로만 합치고, 다른 팀원 1명의 승인이 있어야 한다.
- `develop`: 통합·테스트용이자 저장소의 기본(default) 브랜치. 기능 브랜치는 여기서 따고 여기로 합친다. PR의 base는 기본으로 `develop`이 잡힌다.
- 기능 브랜치: `feat/이름/설명` (예: `feat/hyun/minimap`). 버그 수정은 `fix/이름/설명`, 문서는 `docs/이름/설명`.
- PR은 Merge commit으로 합친다. `develop` → `main`은 Squash를 쓰지 않는다(두 브랜치의 기록이 갈라진다).
- 합친 기능 브랜치는 삭제한다.
- worktree나 새 브랜치를 만들 때도 위 이름 규칙을 따른다.

### experiment (사용자 실험용)

- `experiment`: 사용자 실험(`docs/사용자-실험-재설계.md`)에 쓰는 버전. 2026-10-17에 `develop`을 통째로 복사해 만들었다. 실험 기간에 참가자마다 화면이 달라지지 않도록 `develop`과 따로 간다.
- 실험에만 쓰는 작업(실험에 필요 없는 기능 정리, 조건 B·C, 봇, A 조건 재생 웹)은 `experiment`에서 브랜치를 따고 `experiment`로 PR한다. 브랜치 이름 규칙은 같다.
  ```
  git switch experiment
  git pull origin experiment
  git switch -c feat/이름/설명
  gh pr create --base experiment
  ```
  PR의 base는 기본으로 `develop`이 잡히므로 반드시 `experiment`로 바꾼다.
- `experiment`를 `develop`으로 합치지 않는다. 실험용 삭제와 조건 코드가 서비스에 들어간다.
- `develop` → `experiment` 합치기는 실험에 필요 없는 기능을 정리(삭제)하기 전까지만 한다. 정리한 뒤에 합치면 지운 파일마다 충돌이 난다.
- 정리한 뒤에는 서비스와 실험에 둘 다 걸리는 버그(트래킹 등)를 `develop`에서 먼저 고치고, 그 커밋만 `experiment`로 가져온다. `experiment`에서 딴 `fix/` 브랜치에서 `git cherry-pick 커밋번호`로 가져와 PR한다. `experiment`에서 먼저 고치면 `develop`이 그 수정을 놓친다.
- `experiment`는 **실험 전용 Supabase 프로젝트**를 쓴다(2026-10-22 결정). `develop`이 쓰는 서비스 프로젝트와 계정·DB·실시간 방이 모두 따로다.
  - 실험 기간에 `develop` 쪽 마이그레이션을 실행해도 실험 화면은 바뀌지 않는다. 개발 테스트하는 사람이 실험 로비·지점에 섞이지도 않는다.
  - `experiment` 배포와 `experiment`에서 하는 로컬 개발은 실험 프로젝트의 URL·Publishable 키를 쓴다. 로컬에서는 `.env.experiment.local`에 두고 git에 올리지 않는다(아래 "배포"의 로컬 실행 참고).
  - 실험 프로젝트에는 `experiment` 브랜치의 `supabase/migrations/`를 번호 순서대로 실행한다. `0019_whisper_channels.sql`은 `develop`에만 있고 실험에서는 쓰지 않는다.
  - 실험에만 필요한 마이그레이션은 `experiment`에만 두고, 파일 이름에 `experiment`를 넣는다(예: `0020_experiment_rooms.sql`). 번호가 `develop`과 겹쳐도 이름으로 구분된다.
  - 서비스와 실험에 둘 다 필요한 스키마 변경은 `develop`에 먼저 올리고 그 커밋을 `experiment`로 가져와, 두 프로젝트에서 각각 실행한다.
  - 무료 플랜은 7일 동안 사용이 적으면 프로젝트가 일시정지된다(90일 안에 다시 켤 수 있음). 실험 날 전에 켜져 있는지 확인한다.
- 팀원 녹화 영상(A 조건 자극)은 git에 올리지 않는다. 용량이 크고(GitHub 파일당 100MB 제한) 저장소가 공개라 얼굴이 그대로 올라간다. 실험용 컴퓨터에만 둔다.

## 배포 (브랜치마다 따로)

`develop`과 `experiment`는 서로 다른 Vercel 프로젝트·Supabase 프로젝트로 배포된다(#218). **PR이 어느 브랜치로 머지되느냐가 어디에 배포되느냐를 정한다.**

| 브랜치 | Vercel 프로젝트 | 주소 | Supabase 프로젝트 | 로컬 환경 파일 |
|---|---|---|---|---|
| `develop` | `twoteam` | https://twoteam.vercel.app | 서비스 (`lkvsbdbssrictnrxmdig`) | `.env.local` |
| `experiment` | `twoteam-experiment` | https://twoteam-experiment.vercel.app | 실험 (`eimxyjlarbbbnqmpmmex`) | `.env.experiment.local` |
| `main` | 아직 없음 | — | 아직 없음 (실험이 끝나고 실험 프로젝트를 정지한 뒤 만든다) | — |

- **머지하면 바로 배포된다.** 따로 배포 명령을 돌리지 않는다. 기능 브랜치를 push해도 실서비스 주소는 바뀌지 않는다.
- **PR을 만들 때 base를 먼저 확인한다.** 서비스 기능은 `develop`, 실험 작업은 `experiment`(`gh pr create --base experiment`). base를 잘못 고르면 실험 코드가 서비스에, 서비스 코드가 실험 참가자 화면에 올라간다.
- **마이그레이션이 든 PR은 머지 전에 그 브랜치의 DB에 SQL을 먼저 실행한다.** 코드가 먼저 배포되면 화면이 없는 함수·컬럼을 불러 깨진다. 컬럼 삭제처럼 기존 코드가 쓰던 것을 없애는 경우만 반대로(코드 먼저, DB 나중) 한다.
  - `develop`으로 가는 PR → 서비스 Supabase에 실행
  - `experiment`로 가는 PR → 실험 Supabase에 실행
  - 둘 다 필요한 변경 → `develop`에 먼저 올리고 커밋을 `experiment`로 가져와, 두 프로젝트에 각각 실행
  - PR 설명에 "적용할 DB"와 파일명을 적는다. Supabase 대시보드 권한은 육심호에게 있으니 적용을 요청한다.
- 적용됐는지는 `develop`에서 아래로 확인한다(브랜치를 바꾸지 않아도 된다).
  ```
  ./scripts/check-db.sh                                          # 서비스 DB
  ./scripts/check-db.sh .env.experiment.local origin/experiment  # 실험 DB
  ```
- **로컬 실행**: 서비스 DB는 `npm run dev`, 실험 DB는 `npm run dev -- --mode experiment`. Vite는 `--mode experiment`일 때 `.env.experiment.local`을 `.env.local`보다 먼저 읽는다. 두 파일의 값은 육심호에게 받는다(Publishable 키만, Secret 키는 쓰지 않는다).
- **실험을 진행하는 기간에는 `experiment`에 머지하지 않는다.** 머지하는 순간 다시 배포돼 참가자마다 화면이 달라진다.
- Vercel 설정 중 아래는 바꾸지 않는다. 바꾸면 한 브랜치가 다른 DB를 보는 화면으로 배포된다.
  - `twoteam`: Production Branch `develop`, Ignored Build Step `[ "$VERCEL_GIT_COMMIT_REF" = "experiment" ]` (experiment는 빌드하지 않음)
  - `twoteam-experiment`: Production Branch `experiment`, Ignored Build Step `[ "$VERCEL_GIT_COMMIT_REF" != "experiment" ]` (experiment만 빌드)
  - Vercel의 Supabase 연동(Integrations → Supabase "Add")은 쓰지 않는다. 환경 변수를 직접 넣어 두었다.

## 커밋 메시지

- 형식: `종류: 한국어 설명` (예: `feat: 3D 좌석 모드 시점 회전 추가`)
- 종류: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`
- 한 커밋에는 한 가지 변경만 담는다.

## 작업 방식

- 작업을 시작하기 전에 관련 GitHub Issue를 확인하고, PR 설명에 Issue 번호를 적는다.
- 요청받은 범위만 구현한다.
- 3D 화면·캐릭터·웹캠 트래킹처럼 눈으로 봐야 하는 부분은 개발 서버를 띄워 직접 확인하는 방법을 안내한다.
- 팀원이 코드를 설명할 수 있어야 한다. 새로운 개념이나 API를 쓰면 무엇을 왜 쓰는지 짧게 설명하고, 코드 주석은 한국어로 쓴다.
- 확실하지 않은 것은 추측해서 구현하지 말고 질문한다.

## 담당

- 최원준: 트래킹, 카메라 가이드라인, 전자기기 감지, 집중 판정, 타이머
- 김현: 캐릭터, 지점 공간, 2D 이동, 3D 좌석 시점, 상태 시각 효과
- 육심호: Supabase, 키오스크, 좌석 배정, 실시간 동기화, 배포

## 용어

- 지점: 가상의 스터디카페 한 곳. 라운지(개인 좌석)와 회의실로 구성된다. 코드에서는 회의실이 `rooms`이고 주석에는 스터디룸이라고도 적혀 있다.
- 키오스크: 이용 유형과 시간을 고르고 좌석(또는 회의실) 번호를 지정해 이용권을 받는 화면.
- 2D 이동 모드: 위에서 내려다보는 시점으로 캐릭터를 움직이는 상태.
- 3D 좌석 모드: 착석 후 1인칭 시점으로 공부하는 상태. 좌우 60도씩, 합쳐 120도까지 둘러볼 수 있다.
- 초록불: 공부 중. 타이머가 올라간다. 코드의 `focus`.
- 노란불: 의심 중. 얼굴 안 보임·눈 감음·휴대폰이 기준 시간(60초·21초·3초) 전이라 타이머는 아직 올라간다(보류, 코드의 `hold`). 가이드라인 이탈(`outframe`)도 노란불이다.
- 빨간불: 기준을 넘겨 타이머가 멈춘 상태. 코드의 `away`(자리 이탈), `drowsy`(졸음), `offscreen`(다른 화면 사용 — 즉시), `phone`(휴대폰 사용).
- 표시 없음: 2D 이동 중, 앉았지만 공부 시작 전(코드의 `idle`). 미접속은 따로 표시하지 않는다. 화면이 1분마다 접속 신호(`heartbeat`)를 보내고, 5분 넘게 신호가 없으면 자리를 자동 반납한다(`0017_disconnect_release.sql`).
- 다른 탭·앱 사용함: 공부를 시작할 때 고르는 설정. 끄면(기본) 다른 탭이나 다른 앱으로 가는 즉시 `offscreen`이 된다. 켜면 다른 탭에 가 있어도 공부로 인정하되 얼굴 인식은 계속해 자리 이탈·졸음은 그대로 판정한다. 코드의 `allowOtherScreen`.
- 휴대폰·학습기기 사용함: 끄면(기본) 휴대폰이 3초 넘게 보이면 `phone`이 된다. 켜면 휴대폰·패드 등이 보여도 공부로 인정한다(휴대폰 감지를 켜지 않음). 자리 이탈·졸음 판정은 그대로다. 코드의 `allowDevices`. 두 설정은 따로 켤 수 있다(#172). 예전의 "학습기기 사용함" 하나는 둘을 합친 것이었다.
- 캐릭터 숨김 모드: 다른 참여자의 캐릭터와 표시등을 숨기고 접속 인원 수만 보여 주는 실험용 모드. 트래킹과 타이머는 그대로 동작한다.

## 성능 목표

- 트래킹 → 내 캐릭터 반영 200ms 이하
- 다른 참여자 화면 반영 500ms 이하
- 2D·3D 모두 일반 노트북에서 30FPS 이상
- 2D → 3D 전환 1초 이내
- 좌석 동시 지정 시 중복 배정 0건
- 물체 인식과 가이드라인용 Pose 확인은 초당 1~2회, 팔 트래킹용 Pose 인식은 초당 15회로 제한해 연산 부담을 줄인다