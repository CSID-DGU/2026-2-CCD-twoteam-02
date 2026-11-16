# 회의실 음성 신호·채팅의 보낸 사람 확인 (짧은 설계, #512)

- 작성: 최원준, 2026-11-16
- 브랜치: `fix/wonjun/meeting-sender-verify` (base `develop`), 마이그레이션 `0070_meeting_secure_events.sql`

## 왜

`useParticipants` 는 받은 메시지 안의 `userId`/`from` 을 그대로 믿는다. 광장·지점은 중계 서버가 로그인 토큰으로 보낸 사람을 덮어쓰지만, 회의실은 서비스에서도 늘 Supabase 비공개 방이라 **같은 회의 참가자끼리 서로 흉내낼 수 있다**: 남의 이름으로 채팅, 음성 연결 신호(WebRTC offer·answer·ICE)를 남인 척 보내 음성 연결 가로채기.

## 고른 방법 (B)

| | 방법 | 결정 |
|---|---|---|
| A | 회의실도 중계 서버로 (서버가 회의 멤버 확인) | Worker 변경·배포가 커서 안 함 |
| **B** | 음성 신호·채팅만 DB 함수가 보냄 (`auth.uid()` 로 보낸 사람을 넣어 `realtime.send`) | **고름** (사용자 결정) |
| C | 메시지마다 서명 | 열쇠 교환 코드가 커서 안 함 |

## 만든 것

- 보안 방 `meeting:회의번호:secure`: 참가자만 **듣기**(select 정책), 보내기 정책은 없음. 0021 의 보내기 정책은 세 번째 칸이 있는 이름을 거절하므로 화면은 이 방에 보낼 수 없다.
- `send_meeting_event(p_meeting_id, p_event, p_payload)`: 로그인·참가자·이벤트(`signal`·`chat`)·크기(32KB) 확인 → `from` 을 `auth.uid()` 로 덮어써 보안 방에 `realtime.send`.
- 화면(`src/realtime/secureEvents.ts`, `useParticipants.ts`): 회의실이면 신호·채팅을 RPC 로 보내고 보안 방에서 온 것만 받는다. 회의 방으로 온 신호·채팅은 버린다.
- 들어가는 순서: 보안 방에 먼저 들어간 뒤 회의 방에 들어간다(반대면 나를 보고 남이 바로 보낸 첫 신호를 놓침). 보안 방이 5초 안에 안 열리면 회의 방에는 그냥 들어간다.
- ICE 가 offer 보다 먼저 와도 `voiceMesh.ts` 가 모아 두었다 처리하므로 RPC 로 순서가 바뀌어도 된다.

## 남은 위험 (하지 않는 것)

- 위치·고개 각도·공부 상태(MOVE, 초당 4번)는 매번 DB 를 거치면 무거워 지금처럼 회의 방으로 보낸다. 회의 참가자가 다른 참가자의 위치·상태를 흉내내는 것은 남는다(피해 작음).
- experiment 배포·로컬(중계 서버 없음)의 광장·지점, 귓속말·그룹 채팅 방(`ChatProvider`)은 이번 범위 밖. experiment 는 실험 기간이라 머지하지 않는다.
- `send_meeting_event` 횟수 제한은 없다(참가자만 부를 수 있음).

## 확인

`npm run lint`·`npm run build`. 서비스 DB 에 0070 실행 뒤 두 계정으로 같은 회의: 음성 연결, 채팅 주고받기, 다시 들어오기. 개발자 도구로 회의 방에 `from` 을 바꾼 채팅을 보내도 상대 화면에 안 뜨는지.
