# 신고 Slack 알림과 심각도 설계

작성일: 2026-11-04

## 목적

사용자가 신고를 보내도 팀이 신고 목록을 열기 전에는 알 수 없다. 신고가 들어오면 Slack으로 바로 알고, 신고 목록에서 심각도를 정해 우선순위를 나눈다.

### 운영 흐름

1. 사용자가 신고를 보낸다.
2. 1분 안에 Slack으로 알림이 온다.
3. 관리자 계정으로 신고 목록에서 내용을 보고 심각도를 정한다.
4. 버그를 해결한다.
5. 신고 목록에서 "확인함"으로 처리한다. 팀에서 "확인함"은 "해결함"의 뜻으로 쓴다.

### 범위

- 포함: 모든 종류(판정 오류, 화면·기능 버그, 기타·의견)의 Slack 알림, 심각도 칸, 심각도 지정, 심각도 필터
- 제외: 서비스 접속 불가 알림, 심각도 자동 판정, Slack에서 바로 처리하기, GitHub Issue 자동 생성, 실험 DB 적용

GitHub Issue를 자동으로 만들지 않는 이유는 저장소가 공개라 사용자가 쓴 글이 그대로 공개되기 때문이다.

## 전체 구조

```
사용자 신고 → reports 행 추가 (notified_at = null)
                  │
pg_cron 1분마다 ──┤ 안 보낸 신고가 있을 때만
                  ▼
        Edge Function report-alert
          1. 안 보낸 신고를 읽음
          2. Slack으로 보냄
          3. 성공하면 notified_at 기록
```

### 트리거 즉시 전송 대신 1분 확인을 쓰는 이유

| | 1분 확인 + `notified_at` (채택) | 트리거 즉시 전송 |
|---|---|---|
| 알림 지연 | 최대 약 1분 | 몇 초 |
| Slack 실패 시 | 다음 분에 다시 보냄 | 그 알림은 사라짐 |
| 신고가 몰릴 때 | 1분에 메시지 1개로 묶임 | 건수만큼 메시지가 옴 |
| 신고 저장과의 관계 | 분리됨 | 같은 트랜잭션에 묶임 |

신고는 초를 다투지 않고, 놓치지 않는 것이 더 중요하다.

## DB

새 마이그레이션 하나를 추가한다. 번호는 커밋 직전에 `develop` 최신을 다시 보고 정한다(현재 기준 `0064`). 서비스 DB에만 적용한다.

```sql
alter table public.reports
  add column severity text check (severity in ('critical', 'normal', 'low')),
  add column notified_at timestamptz;

-- 이미 있는 신고가 한꺼번에 Slack으로 가지 않게 보낸 것으로 표시한다
update public.reports set notified_at = now();

-- 1분마다 도는 확인이 표 전체를 훑지 않게 한다
create index reports_unnotified_idx on public.reports (created_at)
  where notified_at is null;

grant update (severity) on public.reports to authenticated;
```

| 칸 | 값 | 쓸 수 있는 곳 |
|---|---|---|
| `severity` | `null`(미지정), `critical`(긴급), `normal`(보통), `low`(낮음) | 팀 (기존 update 정책 적용) |
| `notified_at` | Slack으로 보낸 시각, `null`은 아직 안 보냄 | Edge Function(service role)만 |

권한은 칸 단위 grant로 나눈다. 사용자의 insert 권한은 정해진 칸(`0030`)에만 있어서 새 칸을 직접 넣을 수 없다. `notified_at`은 `authenticated`에 update 권한을 주지 않아, 팀 계정도 화면 API로 바꿀 수 없다.

## Edge Function `report-alert`

- 위치: `supabase/functions/report-alert/` (`index.ts`, 순수 로직 `lib.ts`)
- 인증: `usage-monitor`와 같이 `verify_jwt` 끔, `x-monitor-secret` 헤더가 `CRON_SECRET`과 같아야 실행
- 비밀값: 새 `REPORT_SLACK_WEBHOOK_URL`과 기존 `CRON_SECRET`을 쓴다. 사용량 모니터의 `SLACK_WEBHOOK_URL`은 쓰지 않는다. 비밀값이 비어 있으면 전송하지 않고 오류로 끝나며, 신고는 안 보낸 상태로 남는다.

### 처리 순서

1. `notified_at is null`인 신고를 오래된 순으로 최대 50건 읽는다. 없으면 끝낸다.
2. 메시지를 만들어 Slack으로 보낸다. 요청은 10초가 지나면 끊는다.
3. 성공하면 읽은 신고에 `notified_at = now()`를 기록한다.
4. 실패하면 기록하지 않아 다음 분에 다시 시도한다.

Slack 전송은 성공했는데 기록이 실패하거나 실행이 겹치면 같은 알림이 한 번 더 갈 수 있다. 놓치는 것보다 중복이 낫다고 보고 잠금을 따로 두지 않는다.

### 메시지

```
🐞 새 신고 3건
• 화면·기능 버그 · plaza · 11/04 16:20
  > 의자에 앉으면 화면이 멈춰요
• 판정 오류(공부 중인데 노랑·빨강) · byeol · 11/04 16:20
  > (설명 없음)
• 기타·의견 · - · 11/04 16:21
  > 음악 기능이 있으면 좋겠어요
신고 목록에서 확인: https://twoteam.vercel.app
```

- 한 메시지에 최대 5건을 자세히 싣고, 나머지는 `외 N건`으로 적는다.
- 설명은 200자까지 싣고 줄바꿈은 공백으로 바꾼다.
- 시각은 한국 시간으로 적는다.
- 신고 전용 Slack 채널로 멘션 없이 보낸다. 사용량 알림과 섞이지 않게 웹훅을 새로 만든다.

### 입력값 처리

사용자가 쓴 값이 Slack 서식으로 동작하지 않게 한다.

- `message`, `context.branch`의 `&`, `<`, `>`를 `&amp;`, `&lt;`, `&gt;`로 바꾼다. `<!channel>` 같은 전체 멘션과 가짜 링크를 막는다.
- `context`는 사용자 브라우저가 넣는 값이므로 `branch`가 문자열이 아니면 `-`로 적고, 30자까지만 싣는다.
- 링크 미리보기를 끈다(`unfurl_links: false`, `unfurl_media: false`).

### Slack에 보내지 않는 것

닉네임, 사용자 id, 판정 수치(`samples`), 브라우저 정보, 좌석 이용 기록 id. 자세한 내용은 팀 권한이 필요한 신고 목록에서만 본다.

## 예약 작업

```sql
select cron.schedule('report-alert', '* * * * *', $$
  select net.http_post(
    url := 'https://lkvsbdbssrictnrxmdig.supabase.co/functions/v1/report-alert',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-monitor-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  )
  where exists (select 1 from public.reports where notified_at is null)
$$);
```

- 안 보낸 신고가 있을 때만 함수를 부른다. 평소에는 인덱스로 확인하는 쿼리 하나만 돈다.
- 비밀값이 들어가므로 이 SQL은 저장소에 올리지 않고 SQL Editor에서 직접 실행한다. `usage-monitor`와 같은 방식이다.

## 화면

`src/report/`만 고친다.

| 파일 | 변경 |
|---|---|
| `reportLogic.ts` | `Severity` 타입, `SEVERITY_LABEL`, `ReportRow.severity`, `Filter.severity`, `applyFilter` 조건 |
| `useReports.ts` | `setSeverity(id, severity)`. `setChecked`처럼 성공하면 목록을 자리에서 바꾼다 |
| `ReportsPanel.tsx` | 심각도 필터, 목록 줄의 심각도 표시, 펼친 영역의 심각도 선택 |

- 신호등 표시: 🔴 긴급, 🟡 보통, 🟢 낮음, ⚪ 미지정. 색만으로 구분하지 않도록 항상 글자와 함께 적는다.
- 필터: 종류, 확인 옆에 심각도(전체, ⚪ 미지정, 🔴 긴급, 🟡 보통, 🟢 낮음)를 둔다. 기본값은 전체이고, 기존 기본값인 미확인은 유지한다.
- 목록 줄: 신호등과 글자로 심각도를 표시한다. 미지정도 표시해 아직 안 정한 신고를 찾게 한다.
- 지정: 신고를 펼친 영역의 "확인함" 버튼 옆에서 고른다. 내용을 읽고 정하는 흐름에 맞춘다. 미지정으로 되돌릴 수 있다.
- 실패하면 기존 `rowError` 자리에 문구를 띄운다.
- 정렬은 지금처럼 최신순이다.
- "확인함" 문구는 바꾸지 않는다. 팀이 이미 "해결함"의 뜻으로 이해하고 있다(2026-11-04 결정).
- `useReports`는 `select('*')`로 읽어 조회 코드는 바꾸지 않아도 된다.

## 적용 순서

1. Slack에 신고 전용 채널과 Incoming Webhook을 만들고, 주소를 Supabase 비밀값 `REPORT_SLACK_WEBHOOK_URL`로 등록
2. 서비스 DB SQL Editor에서 마이그레이션 실행
3. `supabase functions deploy report-alert --no-verify-jwt`
4. SQL Editor에서 예약 작업 등록
5. 시험 신고를 보내 신고 전용 채널에 도착하는지 확인
6. PR 머지 (화면 배포)

DB에 칸이 먼저 있어야 화면이 깨지지 않는다. 5번까지는 기존 화면에 영향이 없다.

## 검증

커밋 전에 로컬에서 확인한다.

| 대상 | 방법 | 확인 내용 |
|---|---|---|
| 마이그레이션 | 임시 PostgreSQL에 전체 적용 | 기존 신고는 `notified_at`이 채워지고 새 신고는 비어 있음 |
| 권한 | 역할을 바꿔서 실행 | 사용자는 심각도·`notified_at`을 못 넣고 못 바꿈, 팀은 심각도만 바꿈, `notified_at`은 팀도 못 바꿈, 잘못된 심각도 값은 거절 |
| 메시지 | `lib.ts` 순수 함수 실행 | `<!channel>`, `<http://x|y>`가 글자로만 나옴, 200자 자름, 6건이면 `외 1건`, `branch`가 문자열이 아닐 때 `-` |
| 함수 | 임시 DB + 가짜 Slack 서버 | 성공 시 기록, Slack 실패 시 미기록 후 재시도 성공, 비밀값이 틀리면 401 |
| 화면 | `npm run lint`, `npm run build`, 개발 서버 | 심각도 지정·해제, 필터, 새로고침 후 유지 |

배포 후 실제 신고 한 건으로 Slack 도착을 확인한다.

## 한계

- 알림은 최대 약 1분 늦다.
- 웹훅 고장이나 예약 작업 중단을 따로 알리지 않는다. 그동안 신고는 안 보낸 상태로 남고, 고치면 다음 실행 때 묶여서 온다.
- 같은 신고가 드물게 두 번 올 수 있다.
- 신고를 많이 보내는 사용자를 막는 제한은 이 작업에 없다. 메시지는 1분에 하나로 묶여 Slack 도배는 막히지만, 신고 행은 그대로 쌓인다.
