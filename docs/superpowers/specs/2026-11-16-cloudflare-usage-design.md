# Cloudflare 하루 사용량 모니터 설계

작성일: 2026-11-16 · Issue #574

## 목적

위치 중계·접속 표시·채널 목록을 Cloudflare `relay` Worker(Durable Objects)로 옮긴 뒤, 다음 한계는 Cloudflare 무료 플랜의 하루 한도다(`docs/실시간-부하-측정-결과.md` 결과 9·10). 지금 사용량 모니터(`usage-monitor`)는 Supabase만 본다. 무료 한도를 넘으면 그 종류의 요청이 실패하므로, 넘기 전에 Slack으로 알아야 한다.

### 범위

- 포함: `relay` Worker와 Durable Objects의 하루 사용량 측정, 80·95·100% 경고, 아침 요약에 어제 하루 사용량 추가
- 제외: Vercel 사용량, Cloudflare 요금 계산, 월 $5 플랜 전환 판단 자동화, `relay` 코드 수정

## 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 어디서 재나 | 기존 `usage-monitor`에 추가 | "합쳐서 보내기"에 맞고, 경고 기록·예약 작업·Slack 채널을 그대로 쓴다. 감시 대상(Worker)이 스스로 보내지 않으므로 Worker가 고장 나도 알 수 있다 |
| 경고 단계 | 하루 한도의 80·95·100% (2026-11-16 결정) | 매일 초기화돼서 50%부터 보내면 사용이 많은 날마다 경고가 반복된다. 50%대 추세는 아침 요약으로 본다 |
| 기간 | UTC 하루 (한국 시간 오전 9시 ~ 다음 날 오전 9시) | Cloudflare 무료 한도가 UTC 0시에 초기화된다 |

## Cloudflare 무료 한도

공식 문서 기준(2026-11-16 확인). 항목마다 따로 걸리며, 하나를 넘으면 그 종류만 실패한다.

| 지표 이름 | 항목 | 하루 한도 | 넘으면 |
|---|---|---|---|
| `cf_worker_requests` | Worker 요청 | 100,000건 | 1027 오류 |
| `cf_do_requests` | Durable Objects 요청 | 100,000건 | DO 호출 실패 |
| `cf_do_duration_gbs` | Durable Objects 실행 시간 | 13,000 GB-s | DO 호출 실패 |
| `cf_do_rows_read` | SQLite 읽은 행 | 5,000,000행 | 읽기 실패 |
| `cf_do_rows_written` | SQLite 쓴 행 | 100,000행 | 쓰기 실패 |
| `cf_do_storage_bytes` | 저장 용량 (하루가 아니라 누적) | 5GB | 쓰기 실패 |

한도는 코드 위쪽 상수로 두고, 기존 `LIMITS_JSON`처럼 비밀값 `CF_LIMITS_JSON`으로 덮어쓸 수 있게 한다(월 $5 플랜으로 바꿨을 때).

## 수집

- `https://api.cloudflare.com/client/v4/graphql`에 `Authorization: Bearer <토큰>`으로 질의 한 번을 보낸다.
- 데이터셋: `workersInvocationsAdaptive`(Worker 요청, `scriptName = twoteam-relay`), `durableObjectsInvocationsAdaptiveGroups`(DO 요청), `durableObjectsPeriodicGroups`(실행 시간, SQLite 행), `durableObjectsSqlStorageGroups`(SQLite 저장 용량, `max storedBytes`. relay DO 가 모두 SQLite 기반이라 `durableObjectsStorageGroups` 에는 행이 없음).
- 필드 이름은 공식 문서에 다 나오지 않는다. 기존 `discover` 모드에 Cloudflare 확인을 더해 설치할 때 실제 응답을 한 번 보고 정한다. 없는 항목은 "수집 안 됨"으로 표시하고 경고에서 뺀다.
- 실행 시간이 GB-s로 오지 않으면 `activeTime`(마이크로초) × 128MB로 환산한다(Cloudflare 과금 기준).

### WebSocket 메시지

Cloudflare는 받은 WebSocket 메시지를 20건당 요청 1건으로 과금하지만, 이 비율이 무료 하루 한도에도 적용되는지는 문서에 없다. 결과 10에서 원시 요청이 10만 건을 넘은 뒤에도 서비스가 정상이었다.

- DO 요청을 WebSocket 메시지와 나머지로 나눠 셀 수 있으면, 메시지를 20:1로 환산한 값을 경고 기준으로 쓰고 원시값을 옆에 적는다.
- 나눠 셀 수 없으면 원시값을 참고용으로 보여 주고 경고에서 뺀다(매일 거짓 경고가 나는 것을 막는다). 요약에 그 사실을 적는다.

## 5분 확인 (`mode=check`)

1. UTC 오늘 0시부터 지금까지의 값을 읽는다.
2. 지표마다 하루 한도 대비 %를 계산해 80·95·100%를 그날 처음 넘으면 경고한다.
3. 보낸 경고는 기존 `usage_monitor_alerts_sent`에 `cycle_start = UTC 날짜`, `metric = cf_...`로 남긴다. 날짜가 바뀌면 같은 단계를 다시 보낼 수 있다. 표 구조가 그대로 맞아 마이그레이션이 없다.
4. 경고는 기존 Supabase 사용량 경고 메시지에 `☁️ Cloudflare (오늘 9시부터)` 묶음으로 함께 싣는다. Supabase 경고가 없으면 Cloudflare 묶음만 보낸다.

Analytics 값은 몇 분 늦게 반영되고 많을 때는 표본으로 추정한다. 경고가 몇 분 늦을 수 있다.

## 아침 요약 (`mode=summary`, 매일 09:07)

- Cloudflare가 초기화된 직후라 **어제 하루(UTC) 전체**를 마감된 값으로 보여 준다. 기존 `line()`과 같은 막대·% 모양을 쓴다.
- 저장 용량은 지금 값을 보여 준다.
- "한눈에 보기"에 Cloudflare 한 줄을 넣는다. 예: `Cloudflare 어제 최고 Worker 요청 34%` 또는 `Cloudflare 어제 DO 요청이 한도의 85% — 월 $5 플랜 검토`. 80% 이상일 때만 검토 문구를 붙인다.
- 제목을 `Supabase 일일 점검`에서 `서비스 일일 점검`으로 바꾼다.

## 실패 처리

- Cloudflare 토큰이나 계정 id가 없으면 Cloudflare 부분을 건너뛰고 요약의 "수집 오류"에 `Cloudflare 설정 없음`을 적는다. Supabase 부분은 그대로 보낸다.
- 조회가 실패하면(HTTP 오류, GraphQL `errors`, 10초 초과) 같은 방식으로 원인만 적는다. 오류 문구에 토큰을 넣지 않는다.
- 5분 확인에서 조회가 실패하면 경고를 보내지 않고 다음 실행에 다시 본다. 실패가 계속되는지는 아침 요약에서 드러난다.

## 비밀값

| 이름 | 값 | 비고 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | 사용자 API 토큰 | 권한은 계정의 **Account Analytics: Read** 하나 |
| `CLOUDFLARE_ACCOUNT_ID` | 계정 id | 대시보드 오른쪽 아래에 보이는 값 |

Supabase Edge Function 비밀값에만 둔다. 저장소, 대화창, DB에 넣지 않는다.

## 코드

| 파일 | 변경 |
|---|---|
| `supabase/functions/usage-monitor/cloudflare.ts` (새 파일) | 순수 로직: 한도 상수, 라벨, UTC 하루 기간 계산, GraphQL 응답 → 지표 값 변환, WebSocket 환산, 경고 판단 |
| `supabase/functions/usage-monitor/index.ts` | Cloudflare 조회, `check`·`summary`·`discover`에 연결 |
| `supabase/functions/usage-monitor/lib.ts` | 필요하면 `overallSummary`에 Cloudflare 줄 입력 추가 |

DB 마이그레이션은 없다.

## 검증

| 대상 | 방법 | 확인 내용 |
|---|---|---|
| 순수 로직 | `cloudflare.ts` 검사 (`node --test`, 커밋 안 함) | UTC 하루 경계(한국 08:59·09:00), 80·95·100% 판단, 이미 보낸 단계 제외, 없는 필드 → 수집 안 됨, WebSocket 환산, 응답 모양이 이상해도 오류 없이 처리 |
| 함수 코드 | Deno 타입 검사 | 타입 오류 없음 |
| 실제 수치 | 배포 후 `discover`, `summary` 호출 | 필드 확인, 어제 값이 Cloudflare 대시보드와 맞음 |
| 실패 | 토큰을 빼고 호출 | Supabase 요약은 나가고 수집 오류에 `Cloudflare 설정 없음` |

## 적용 순서

1. 사용자: Cloudflare 대시보드에서 API 토큰 만들기(Account Analytics: Read), 계정 id 확인
2. 사용자: Supabase 비밀값 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` 등록
3. 사용자: `supabase functions deploy usage-monitor --no-verify-jwt`
4. Claude: `discover`로 필드 확인 후 필요하면 코드 수정·재배포 안내
5. 사용자: `summary`를 한 번 불러 Slack에서 모양 확인
6. PR 머지

함수는 머지와 상관없이 3번에서 서비스에 올라간다. 코드만 저장소에 남기는 것이 머지의 역할이다.

## 한계

- Analytics는 몇 분 늦고 표본 추정이라 대시보드 값과 조금 다를 수 있다.
- WebSocket 메시지가 무료 한도에 어떻게 세어지는지 확정하지 못했다.
- 경고는 5분 간격이라, 한 번에 몰리는 사용량은 100%를 넘은 뒤에 알 수 있다.
