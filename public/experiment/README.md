# 실험 팀원 3명의 녹화 파일 (A 영상, C 행동 데이터)

`peers.json`에 영상 서버 주소(`videoServer`)와 세 사람의 목록(`peers`)이 있다. 참가자 화면이 이 폴더를 사이트에서 직접 받아 쓴다. 진행자가 참가자마다 할 일은 없다.

- `name`: 이름표 (room A 영상 칸, room C 캐릭터 머리 위). 두 조건에서 같은 이름이 같은 사람이다.
- `model`: room C 캐릭터 모습 (`public/models/character-<글자>.glb`).
- `record`: 이 폴더의 기록 파일(JSON, 기록 모드 `?record=자리번호`로 내려받은 것). 수치뿐이라 git에 올린다. 자리 번호는 파일 안에 있다.
- `video`: 같은 수행을 녹화한 영상의 **파일 이름**(영상 서버에 올린 그대로). 영상은 얼굴이 있고 커서 git에 올리지 않는다. 비어 있으면 room A에서 그 칸에 영상이 안 나온다.
- `videoServer`: 영상 서버(Cloudflare Worker) 주소. 비어 있으면 영상이 안 나온다.

## 영상 서버 (로그인한 사람만 보게)

영상은 비공개 R2 버킷에 있고, Worker가 **로그인한 실험 계정에만** 잠깐 유효한 주소를 내준다. 화면(`src/videoRoom/VideoRoom.tsx`)이 쓰는 약속:

1. `GET {videoServer}/sign?file=<파일 이름>` — 헤더 `Authorization: Bearer <Supabase access token>`.
   Worker는 `{SUPABASE_URL}/auth/v1/user`에 `apikey: <실험 프로젝트 Publishable 키>`와 같은 Bearer로 물어 200이면 `{"url": "..."}`(10분 유효한 서명 주소)를 돌려준다. 아니면 401.
2. 그 `url`로 `GET` — 영상을 스트리밍한다. `<video>`가 보내는 `Range` 요청을 R2에 그대로 넘기고 `Accept-Ranges: bytes`, `Content-Type: video/mp4`를 준다.
3. CORS: `https://twoteam-experiment.vercel.app`, `http://localhost:5173` 허용 (1번은 fetch, 2번은 `<video src>`라 CORS 없이도 됨).

Worker 비밀값: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`(실험 프로젝트), `SIGN_SECRET`. 코드는 저장소 안 폴더 하나(`relay/`처럼)에 두고 `npx wrangler deploy`로 올린다. 머지해도 자동 배포되지 않는다.

세 사람의 순서는 room C에 들어오는 순서다 (`src/replay/botLogic.ts`의 ENTER_DELAY_MS).
파일을 바꾸면(예: 다시 녹화) 여기에 새 파일을 넣고 `peers.json`의 이름을 고친다. 어느 참가자부터 바뀌었는지는 실험 기록에 적는다.
