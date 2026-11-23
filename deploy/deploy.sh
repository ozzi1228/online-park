#!/usr/bin/env bash
# 배포: GitHub Actions가 이 커밋으로 빌드한 이미지(ghcr.io)를 VM이 받아서 DB 스키마 반영 → 재시작.
# 미리: azure-create.sh 를 한 번 실행(deploy/.target), 코드는 GitHub에 push 되어 있어야 함.
# 실행: bash deploy/deploy.sh   (VM에서 직접 빌드하려면: BUILD_ON_VM=1 bash deploy/deploy.sh — 느림)
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
source deploy/.target
BRANCH=${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}
git fetch -q origin "$BRANCH"
SHA=$(git rev-parse "origin/$BRANCH")
[ "$(git rev-parse HEAD)" = "$SHA" ] || echo "  ※ 내 PC의 최신 커밋이 아직 push 안 됐어요 — GitHub에 있는 $BRANCH(${SHA:0:7})를 배포해요"

echo "▶ $HOST 에 $BRANCH ${SHA:0:7} 배포"
ssh -i "${KEY:-$HOME/.ssh/sakura_azure}" -o IdentitiesOnly=yes "sakura@$HOST" bash -s <<EOF
set -euo pipefail
cd ~/app
git fetch -q origin && git checkout -q "$BRANCH" && git reset -q --hard "$SHA"
cp ~/sakura.env deploy/.env
export TAG="$SHA"
C="docker compose -f deploy/docker-compose.yml --env-file deploy/.env"
if [ "${BUILD_ON_VM:-}" = "1" ]; then
  \$C build
else
  echo "  GitHub에서 이미지 빌드가 끝나길 기다리는 중…"
  for i in \$(seq 1 60); do
    if \$C --profile migrate pull -q web realtime migrate 2>/dev/null; then break; fi
    [ "\$i" = 60 ] && { echo "  ✘ 15분 기다려도 이미지가 없어요 (GitHub Actions 확인)"; exit 1; }
    sleep 15
  done
fi
\$C --profile migrate run --rm -T migrate < /dev/null  # 입력을 막아야 이 뒤 명령이 먹히지 않음
\$C up -d --remove-orphans
docker image prune -af --filter "until=72h" >/dev/null
\$C ps --format '{{.Service}} {{.State}} {{.Status}}'
EOF
echo "✔ 배포 끝: https://$HOST"
