#!/usr/bin/env bash
#
# Vercel 배포 스크립트
#
# GitHub 연동이 조직(CSID-DGU) 승인 문제로 막혀 있어 CLI 로 배포한다.
# CLI 배포는 "지금 내 로컬 폴더"를 그대로 올리므로, 옛날 코드가 올라가기 쉽다.
# 그걸 막으려고 올리기 전에 아래를 확인한다.
#
#   1. 작업 트리가 깨끗한가        (커밋 안 한 변경이 섞여 올라가지 않도록)
#   2. 원격 develop 과 같은가       (팀원 코드가 빠진 채 올라가지 않도록)
#   3. lint 와 build 가 통과하는가  (깨진 코드를 올리지 않도록)
#
# 쓰는 법
#   ./scripts/deploy.sh            배포
#   ./scripts/deploy.sh --env      .env.local 의 값을 Vercel 에 먼저 올리고 배포
#   ./scripts/deploy.sh --dry-run  확인만 하고 배포는 하지 않음
#
# 환경 변수는 이 파일에 적지 않는다. .env.local 에서 읽어 간다.
# Vite 는 빌드할 때 VITE_* 값을 코드에 박아 넣으므로, 값을 바꾸면 --env 로 다시 올리고
# 배포해야 반영된다. 변수만 바꾸고 배포하지 않으면 예전 값이 그대로 돈다.

set -euo pipefail

cd "$(dirname "$0")/.."

BRANCH="${DEPLOY_BRANCH:-develop}"   # 배포 기준 브랜치. main 으로 옮길 때는 DEPLOY_BRANCH=main 으로 실행한다.
ENV_FILE=".env.local"
SYNC_ENV=0
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --env) SYNC_ENV=1 ;;
    --dry-run) DRY_RUN=1 ;;
    *) echo "모르는 옵션: $arg"; exit 1 ;;
  esac
done

step() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  ✅ %s\n' "$1"; }
fail() { printf '  ❌ %s\n' "$1"; exit 1; }

# ---------------------------------------------------------------
step "1. 올릴 코드가 맞는지 확인"

[ -f "$ENV_FILE" ] || fail "$ENV_FILE 이 없습니다. .env.example 을 복사해 값을 채우세요."

current=$(git branch --show-current)
[ "$current" = "$BRANCH" ] || fail "지금 '$current' 브랜치입니다. '$BRANCH' 에서 배포하세요."
ok "브랜치: $BRANCH"

[ -z "$(git status --porcelain)" ] || {
  git status --short | sed 's/^/     /'
  fail "커밋하지 않은 변경이 있습니다. 커밋하거나 되돌린 뒤 다시 실행하세요."
}
ok "작업 트리 깨끗함"

git fetch origin --quiet
behind=$(git rev-list --count "HEAD..origin/$BRANCH")
ahead=$(git rev-list --count "origin/$BRANCH..HEAD")
[ "$behind" = "0" ] || fail "원격 $BRANCH 보다 ${behind}개 뒤처져 있습니다. 'git pull && npm install' 후 다시 실행하세요."
[ "$ahead" = "0" ] || fail "원격에 없는 커밋이 ${ahead}개 있습니다. 먼저 PR 로 합치세요."
ok "원격 $BRANCH 와 동일 ($(git rev-parse --short HEAD))"

command -v vercel >/dev/null || fail "vercel 명령이 없습니다. 'npm i -g vercel' 로 설치하세요."
ok "vercel CLI 있음"

# ---------------------------------------------------------------
step "2. 로컬 검증"

npm run lint >/dev/null || fail "lint 실패. 고치고 다시 실행하세요."
ok "lint 통과"

npm run build >/dev/null || fail "build 실패. 고치고 다시 실행하세요."
ok "build 통과"

# ---------------------------------------------------------------
if [ "$SYNC_ENV" = "1" ]; then
  step "3. 환경 변수 올리기 (.env.local → Vercel)"
  # 값은 화면에 찍지 않는다. 이름과 길이만 보여 준다.
  while IFS= read -r line; do
    name=${line%%=*}
    value=${line#*=}
    [ -n "$value" ] || { printf '  ⚠️  %s 값이 비어 있어 건너뜁니다\n' "$name"; continue; }
    # 이미 있으면 지우고 다시 올린다. 없으면 그냥 실패하므로 무시한다.
    vercel env rm "$name" production --yes >/dev/null 2>&1 || true
    printf '%s' "$value" | vercel env add "$name" production >/dev/null
    printf '  ✅ %s (%d자)\n' "$name" "${#value}"
  done < <(grep -E '^VITE_[A-Z_]+=' "$ENV_FILE" || true)
else
  step "3. 환경 변수"
  echo "  건너뜀 (값을 바꿨으면 --env 를 붙여 실행하세요)"
fi

# ---------------------------------------------------------------
step "4. 배포"

if [ "$DRY_RUN" = "1" ]; then
  echo "  --dry-run 이라 여기서 멈춥니다. 실제로 올리려면 옵션 없이 실행하세요."
  exit 0
fi

vercel --prod

printf '\n\033[1m끝났습니다.\033[0m 위에 찍힌 주소로 접속해 확인하세요.\n'
printf '화면이 하얗게 뜨면 환경 변수 문제입니다. ./scripts/deploy.sh --env 로 다시 실행하세요.\n'
