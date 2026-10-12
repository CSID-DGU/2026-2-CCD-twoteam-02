#!/usr/bin/env bash
#
# 마이그레이션이 Supabase 에 전부 적용됐는지 확인한다.
#
# 왜 필요한가:
#   마이그레이션은 손으로 SQL Editor 에 붙여 넣어 적용한다. 코드만 배포하고 DB 를 빠뜨리면
#   "함수를 찾을 수 없음" 같은 오류가 화면에서만 터진다. 배포 스크립트는 이걸 알 수 없다.
#
# 어떻게 확인하는가:
#   supabase/migrations/*.sql 에서 만드는 테이블·뷰·함수 이름을 뽑아, 실제 Supabase 에
#   그 이름이 있는지 하나씩 물어본다. 로그인하지 않은 상태로 물어도 "있다/없다"는 구분된다.
#
#     테이블·뷰  →  있으면 [] 또는 권한 오류, 없으면 PGRST205
#     함수       →  있으면 권한 오류(42501), 없으면 PGRST202
#
#   함수는 반드시 올바른 인자 이름으로 불러야 한다. 인자 없이 부르면 있는 함수도 PGRST202 가
#   나와서 없는 것과 구분되지 않는다. 그래서 SQL 에서 인자 이름까지 뽑아 쓴다.
#
#   drop 된 객체(예: 0010 에서 없앤 nicknames 뷰)는 확인 대상에서 뺀다.
#
# 쓰는 법
#   ./scripts/check-db.sh

set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env.local"
[ -f "$ENV_FILE" ] || { echo "❌ $ENV_FILE 이 없습니다."; exit 1; }

URL=$(grep '^VITE_SUPABASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d ' \r')
KEY=$(grep '^VITE_SUPABASE_PUBLISHABLE_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d ' \r')
[ -n "$URL" ] && [ -n "$KEY" ] || { echo "❌ $ENV_FILE 에 Supabase 값이 비어 있습니다."; exit 1; }

printf '\n\033[1mSupabase 에 마이그레이션이 적용됐는지 확인합니다\033[0m\n'
printf '  %s\n\n' "$URL"

# 마이그레이션에서 확인할 객체 목록을 만든다. (drop 된 것은 제외)
PLAN=$(python3 - <<'PY'
import re, glob

src = ""
for f in sorted(glob.glob('supabase/migrations/*.sql')):
    src += open(f).read() + "\n"

tables, views, funcs = {}, {}, {}

for m in re.finditer(r'create\s+table\s+public\.(\w+)', src):
    tables[m.group(1)] = True
for m in re.finditer(r'create\s+(?:or replace\s+)?view\s+public\.(\w+)', src):
    views[m.group(1)] = True
for m in re.finditer(r'create\s+(?:or replace\s+)?function\s+public\.(\w+)\s*\(([^)]*)\)', src, re.S):
    name, args = m.group(1), m.group(2).strip()
    params = []
    for a in [x.strip() for x in args.split(',') if x.strip()]:
        parts = a.split()
        pname = parts[0]
        ptype = parts[1].lower() if len(parts) > 1 else 'text'
        # 존재 확인이 목적이라 값은 아무거나 괜찮다. 타입만 맞춰 준다.
        if 'int' in ptype:     val = '1'
        elif 'uuid' in ptype:  val = '"00000000-0000-0000-0000-000000000000"'
        elif 'bool' in ptype:  val = 'true'
        else:                  val = '"x"'
        params.append(f'"{pname}":{val}')
    funcs[name] = '{' + ','.join(params) + '}'

# drop 된 것은 뺀다
for m in re.finditer(r'drop\s+view\s+(?:if exists\s+)?public\.(\w+)', src):
    views.pop(m.group(1), None)
for m in re.finditer(r'drop\s+table\s+(?:if exists\s+)?public\.(\w+)', src):
    tables.pop(m.group(1), None)
for m in re.finditer(r'drop\s+function\s+(?:if exists\s+)?public\.(\w+)', src):
    funcs.pop(m.group(1), None)

# 트리거 전용 함수는 RPC 로 부를 수 없으므로 확인 대상에서 뺀다.
for m in re.finditer(r'create\s+(?:or replace\s+)?function\s+public\.(\w+)[^$]*?returns\s+trigger', src, re.S):
    funcs.pop(m.group(1), None)

for t in sorted(tables): print(f'table\t{t}\t')
for v in sorted(views):  print(f'view\t{v}\t')
for f in sorted(funcs):  print(f'func\t{f}\t{funcs[f]}')
PY
)

missing=0
total=0

while IFS=$'\t' read -r kind name payload; do
  [ -n "$kind" ] || continue
  total=$((total + 1))
  case "$kind" in
    table|view)
      body=$(curl -s --max-time 15 "$URL/rest/v1/$name?select=*&limit=1" \
             -H "apikey: $KEY" -H "Authorization: Bearer $KEY")
      ;;
    func)
      body=$(curl -s --max-time 15 -X POST "$URL/rest/v1/rpc/$name" \
             -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
             -H "Content-Type: application/json" -d "$payload")
      ;;
  esac

  case "$body" in
    *PGRST205*|*PGRST202*)
      printf '  ❌ %-6s %-24s 없음 — 마이그레이션 미적용\n' "$kind" "$name"
      missing=$((missing + 1))
      ;;
    *)
      printf '  ✅ %-6s %-24s 있음\n' "$kind" "$name"
      ;;
  esac
done <<< "$PLAN"

printf '\n'
if [ "$missing" = "0" ]; then
  printf '\033[1m%d개 전부 적용돼 있습니다.\033[0m\n' "$total"
else
  printf '\033[1m%d개 중 %d개가 없습니다.\033[0m\n' "$total" "$missing"
  printf 'supabase/migrations/ 의 파일을 번호 순서대로 Supabase SQL Editor 에서 실행하세요.\n'
  printf '이미 적용한 파일은 다시 실행하지 않습니다.\n'
  exit 1
fi
