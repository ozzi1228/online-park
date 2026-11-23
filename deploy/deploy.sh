#!/usr/bin/env bash
# 배포: VM에서 최신 코드를 받아 이미지를 다시 만들고, DB 스키마를 반영한 뒤 재시작.
# 미리: azure-create.sh 를 한 번 실행했어야 함 (deploy/.target 생김). 실행: bash deploy/deploy.sh
# 레포(GitHub)에 push된 코드가 배포됨 — 배포 전에 push 먼저
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
source deploy/.target
BRANCH=${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}

echo "▶ $HOST 에 $BRANCH 배포"
ssh -i "${KEY:-$HOME/.ssh/sakura_azure}" -o IdentitiesOnly=yes "sakura@$HOST" bash -s <<EOF
set -euo pipefail
cd ~/app
git fetch -q origin && git checkout -q "$BRANCH" && git reset -q --hard "origin/$BRANCH"
cp ~/sakura.env deploy/.env
C="docker compose -f deploy/docker-compose.yml --env-file deploy/.env"
\$C build
\$C --profile migrate run --rm migrate
\$C up -d --remove-orphans
docker image prune -f >/dev/null
\$C ps
EOF
echo "✔ 배포 끝: https://$HOST"
