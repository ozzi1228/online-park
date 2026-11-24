#!/usr/bin/env bash
# 운영 비밀값 하나를 VM의 ~/sakura.env 에 넣거나 바꿈 (값은 화면에 안 보이게 직접 입력). 바꾼 뒤엔 deploy.sh 로 재배포
# 예: bash deploy/set-secret.sh ADMIN_PASSWORD   /   bash deploy/set-secret.sh TOSS_SECRET_KEY
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/.target
NAME=${1:?바꿀 이름을 적어 주세요 (예: ADMIN_PASSWORD)}
[[ "$NAME" =~ ^[A-Z0-9_]+$ ]] || { echo "이름은 영문 대문자·숫자·_ 만"; exit 1; }
read -rsp "$NAME 값 (붙여넣기는 마우스 오른쪽 클릭): " VAL; echo
# Ctrl+V는 이 창에서 붙여넣기가 안 되고 보이지 않는 글자(^V)만 들어감 → 막음
if [ -z "$VAL" ] || [[ "$VAL" =~ [[:cntrl:]] ]]; then echo "✘ 값이 비었거나 붙여넣기가 안 됐어요. 마우스 오른쪽 클릭으로 붙여넣어 다시 해 주세요"; exit 1; fi
echo "  (${#VAL}글자 입력됨)"
printf '%s' "$VAL" | ssh -i "${KEY:-$HOME/.ssh/sakura_azure}" -o IdentitiesOnly=yes "sakura@$HOST" "umask 077; V=\$(cat); grep -v '^$NAME=' ~/sakura.env > ~/sakura.env.tmp || true; printf '%s=%s\n' '$NAME' \"\$V\" >> ~/sakura.env.tmp; mv ~/sakura.env.tmp ~/sakura.env"
echo "✔ $NAME 저장 (적용하려면 bash deploy/deploy.sh)"
