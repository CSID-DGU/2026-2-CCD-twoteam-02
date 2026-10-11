#!/usr/bin/env bash
#
# 배포된 사이트가 제대로 떴는지 확인한다.
#
# 왜 필요한가:
#   배포 명령이 성공해도 화면이 하얗게 뜨는 경우가 있다. 환경 변수가 빠진 채로 빌드되면
#   그렇게 된다. 배포 직후에는 아무도 안 보고 넘어가서, 팀원이 들어가 보고서야 알게 된다.
#
#   Vite 는 빌드할 때 VITE_* 값을 코드에 박아 넣으므로, 번들을 열어 보면
#   값이 들어갔는지 바깥에서 확인할 수 있다.
#
# 쓰는 법
#   ./scripts/verify-deploy.sh
#   ./scripts/verify-deploy.sh https://다른주소.vercel.app

set -euo pipefail
cd "$(dirname "$0")/.."

SITE="${1:-https://twoteam.vercel.app}"
ENV_FILE=".env.local"

ok()   { printf '  ✅ %s\n' "$1"; }
bad()  { printf '  ❌ %s\n' "$1"; FAIL=$((FAIL + 1)); }
FAIL=0

printf '\n\033[1m배포된 사이트를 확인합니다\033[0m\n  %s\n\n' "$SITE"

# ---------------------------------------------------------------
# 1. 사이트가 응답하는가
code=$(curl -s -o /tmp/deploy-index.html -w '%{http_code}' --max-time 20 "$SITE" || echo 000)
[ "$code" = "200" ] && ok "사이트 응답 (HTTP $code)" || bad "사이트가 응답하지 않습니다 (HTTP $code)"

# ---------------------------------------------------------------
# 2. 번들에 환경 변수가 박혔는가
bundle=$(grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' /tmp/deploy-index.html | head -1 || true)
if [ -z "$bundle" ]; then
  bad "번들 파일을 찾지 못했습니다. 빌드 결과가 이상합니다."
else
  ok "번들: $bundle"
  curl -s --max-time 40 "$SITE$bundle" > /tmp/deploy-bundle.js

  if [ -f "$ENV_FILE" ]; then
    url=$(grep '^VITE_SUPABASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d ' \r')
    host=${url#https://}
    if [ -n "$host" ] && grep -q "$host" /tmp/deploy-bundle.js; then
      ok "Supabase 주소가 번들에 들어 있음"
    else
      bad "Supabase 주소가 번들에 없습니다 → ./scripts/deploy.sh --env 로 다시 배포하세요"
    fi
  fi

  if grep -q 'sb_publishable_[A-Za-z0-9]' /tmp/deploy-bundle.js; then
    ok "Publishable key 가 번들에 들어 있음"
  else
    bad "Publishable key 가 번들에 없습니다 → ./scripts/deploy.sh --env 로 다시 배포하세요"
  fi

  # 실제 키 값만 찾는다. supabase-js 안에는 'sb_secret_' 라는 글자가 비교용으로 들어 있어서,
  # 그 글자만 보고 판단하면 멀쩡한 배포를 유출로 오해한다. 뒤에 값이 붙은 경우만 센다.
  if grep -qE 'sb_secret_[A-Za-z0-9]{10,}' /tmp/deploy-bundle.js; then
    bad "Secret key 로 보이는 값이 번들에 있습니다. 즉시 Supabase 에서 키를 재발급하세요."
  else
    ok "Secret key 유출 없음"
  fi
fi

# ---------------------------------------------------------------
# 3. 주소별 화면이 뜨는가 (vercel.json rewrite 동작 확인)
for p in /login /signup / /space /tracking; do
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$SITE$p" || echo 000)
  [ "$c" = "200" ] && ok "경로 $p (HTTP $c)" \
    || bad "경로 $p 가 HTTP $c 입니다 → vercel.json 의 rewrite 설정을 확인하세요"
done

# ---------------------------------------------------------------
printf '\n'
if [ "$FAIL" = "0" ]; then
  printf '\033[1m배포 정상입니다.\033[0m 팀원에게 %s 를 공유하세요.\n' "$SITE"
else
  printf '\033[1m문제 %d건.\033[0m 위 메시지를 보고 조치하세요.\n' "$FAIL"
  exit 1
fi
