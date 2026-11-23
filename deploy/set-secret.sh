#!/usr/bin/env bash
# 운영 비밀값 하나를 VM의 ~/sakura.env 에 넣거나 바꿈 (값은 화면에 안 보이게 직접 입력). 바꾼 뒤엔 deploy.sh 로 재배포
# 예: bash deploy/set-secret.sh ADMIN_PASSWORD   /   bash deploy/set-secret.sh TOSS_SECRET_KEY
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/.target
KEY=${1:?바꿀 이름을 적어 주세요 (예: ADMIN_PASSWORD)}
[[ "$KEY" =~ ^[A-Z0-9_]+$ ]] || { echo "이름은 영문 대문자·숫자·_ 만"; exit 1; }
read -rsp "$KEY 값: " VAL; echo
printf '%s' "$VAL" | ssh "sakura@$HOST" "umask 077; V=\$(cat); grep -v '^$KEY=' ~/sakura.env > ~/sakura.env.tmp || true; printf '%s=%s\n' '$KEY' \"\$V\" >> ~/sakura.env.tmp; mv ~/sakura.env.tmp ~/sakura.env"
echo "✔ $KEY 저장 (적용하려면 bash deploy/deploy.sh)"
