// 사용자 실험 참가자 계정과 기록 재생용 팀원 계정을 실험 전용 Supabase 프로젝트에 한 번에 만듭니다. (#194, #195)
//
// 실행 (내 컴퓨터에서만). 키를 명령줄에 그대로 쓰면 셸 기록에 남으므로 read -s 로 안 보이게 입력합니다:
//   read -rs "SUPABASE_SERVICE_ROLE_KEY?Secret 키: " && export SUPABASE_SERVICE_ROLE_KEY
//   node scripts/create-experiment-accounts.mjs
//   unset SUPABASE_SERVICE_ROLE_KEY
//   node scripts/create-experiment-accounts.mjs --dry-run   # 만들 목록만 보기 (키 없이)
//
// - Secret 키는 파일에 두지 않고 실행할 때만 넘깁니다. 이 키는 RLS를 지나가므로 화면 코드·저장소에 절대 넣지 않습니다.
// - 주소는 .env.experiment.local 에서 읽고, 실험 프로젝트가 아니면 멈춥니다. (서비스 DB에 만드는 실수 방지)
// - 이미 있는 이메일은 건너뜁니다. 여러 번 돌려도 중복으로 생기지 않습니다.
// - 비밀번호는 계정마다 무작위로 만들고 저장소 밖 파일(OUT_FILE)에만 남깁니다.
// - 가입하면 DB 트리거(0001 handle_new_user)가 user_metadata.nickname 으로 profiles 행을 만듭니다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const EXPERIMENT_REF = 'eimxyjlarbbbnqmpmmex' // 실험 전용 Supabase 프로젝트 (#218)
const ENV_FILE = '.env.experiment.local'
const OUT_FILE = join(homedir(), 'twoteam-experiment-accounts.csv') // 저장소 밖
const EMAIL_DOMAIN = 'twoteam.test' // .test 는 실제 메일이 갈 수 없는 예약 도메인
const PARTICIPANTS = 24 // 본 실험 참가자 P01~P24 (조건 순서 6가지 × 4명)

// C 조건 기록 재생용 팀원 계정 (#195). /replay 화면에서 이 계정으로 로그인해 18·19·20번 자리 기록을 하나씩 재생합니다.
// 닉네임은 참가자 화면의 캐릭터 이름표로 보이므로 room A 화면의 이름표(videoStore.ts 의 DEFAULT_PEERS)와 같게 둡니다.
// 이름을 바꾸려면 두 곳을 같이 바꿉니다. (이미 만든 계정은 프로필 화면에서 닉네임을 바꿉니다)
const REPLAY_NICKNAMES = ['참여자 1', '참여자 2', '참여자 3']

// 만들 계정 목록. 예비 실험용이 필요해지면 여기에 더하고 다시 돌립니다.
const pad = (n) => String(n).padStart(2, '0')
const ACCOUNTS = [
  ...Array.from({ length: PARTICIPANTS }, (_, i) => ({
    email: `p${pad(i + 1)}@${EMAIL_DOMAIN}`,
    nickname: `P${pad(i + 1)}`, // 실험 진행 화면의 참가자 번호와 같은 꼴
  })),
  ...REPLAY_NICKNAMES.map((nickname, i) => ({ email: `r${pad(i + 1)}@${EMAIL_DOMAIN}`, nickname })),
]

const dryRun = process.argv.includes('--dry-run')

function readEnv(file) {
  if (!existsSync(file)) throw new Error(`${file} 이 없습니다. 실험 프로젝트 주소를 넣어 두세요.`)
  const env = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

const url = readEnv(ENV_FILE).VITE_SUPABASE_URL
if (!url?.includes(EXPERIMENT_REF)) {
  console.error(`중단: ${ENV_FILE} 의 주소(${url})가 실험 프로젝트(${EXPERIMENT_REF})가 아닙니다.`)
  process.exit(1)
}

if (dryRun) {
  console.log(`[미리보기] ${url} 에 만들 계정 ${ACCOUNTS.length}개`)
  for (const a of ACCOUNTS) console.log(`  ${a.email}  ${a.nickname}`)
  process.exit(0)
}

const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!key) {
  console.error('중단: SUPABASE_SERVICE_ROLE_KEY 를 실행할 때 넘겨 주세요. (실험 프로젝트 > Project Settings > API Keys > Secret)')
  process.exit(1)
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

// 이미 있는 이메일 (한 페이지 1000개씩)
const existing = new Set()
for (let page = 1; ; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
  if (error) {
    console.error('계정 목록을 읽지 못했습니다:', error.message)
    process.exit(1)
  }
  for (const u of data.users) existing.add(u.email)
  if (data.users.length < 1000) break
}

const rows = []
let created = 0
let skipped = 0
let failed = 0
for (const a of ACCOUNTS) {
  if (existing.has(a.email)) {
    console.log(`건너뜀 (이미 있음): ${a.email}`)
    skipped++
    continue
  }
  const password = randomBytes(9).toString('base64url') // 12자
  const { error } = await admin.auth.admin.createUser({
    email: a.email,
    password,
    email_confirm: true, // 인증 메일 없이 바로 로그인
    user_metadata: { nickname: a.nickname },
  })
  if (error) {
    console.error(`실패: ${a.email} — ${error.message}`)
    failed++
    continue
  }
  rows.push(`${a.email},${a.nickname},${password}`)
  created++
  console.log(`만듦: ${a.email} (${a.nickname})`)
}

// 새로 만든 계정의 비밀번호만 덧붙입니다. 건너뛴 계정의 비밀번호는 처음 만들 때의 파일에 있습니다.
if (rows.length) {
  const header = existsSync(OUT_FILE) ? '' : 'email,nickname,password\n'
  writeFileSync(OUT_FILE, header + rows.join('\n') + '\n', { flag: 'a', mode: 0o600 })
  console.log(`\n비밀번호를 ${OUT_FILE} 에 저장했습니다. 이 파일은 진행자만 보고 공유하지 마세요.`)
}
console.log(`\n끝: 새로 ${created}개, 건너뜀 ${skipped}개, 실패 ${failed}개`)
if (failed) process.exit(1)
