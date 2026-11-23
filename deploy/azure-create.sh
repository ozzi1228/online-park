#!/usr/bin/env bash
# Azure에 처음 한 번: 리소스 그룹 + VM + PostgreSQL + 운영 비밀값(.env)을 만듦.
# 미리: Azure CLI 설치, `az login`. 실행(레포 루트, Git Bash): bash deploy/azure-create.sh
# 이름·크기는 환경변수로 바꿀 수 있음 (예: SIZE=Standard_B2pts_v2 bash deploy/azure-create.sh)
set -euo pipefail
cd "$(dirname "$0")/.."

RG=${RG:-sakura-park}
LOC=${LOC:-koreacentral}
VM=${VM:-sakura-vm}
SIZE=${SIZE:-Standard_B2ats_v2}          # 무료 계정 12개월 무료 대상 (2코어·1GB)
DNS=${DNS:-sakura-park-$((RANDOM % 9000 + 1000))}
DB=${DB:-sakura-db-$((RANDOM % 9000 + 1000))}
DB_SKU=${DB_SKU:-Standard_B1ms}
REPO=${REPO:-https://github.com/ozzi1228/online-park.git}
HOST="$DNS.$LOC.cloudapp.azure.com"
rand() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "$1"; }

echo "▶ 리소스 그룹 $RG ($LOC)"
az group create -n "$RG" -l "$LOC" -o none

echo "▶ VM $VM ($SIZE) — 주소 https://$HOST"
az vm create -g "$RG" -n "$VM" --image Ubuntu2404 --size "$SIZE" \
  --admin-username sakura --generate-ssh-keys \
  --public-ip-sku Standard --public-ip-address-dns-name "$DNS" \
  --os-disk-size-gb 30 --custom-data deploy/cloud-init.yaml -o none
az vm open-port -g "$RG" -n "$VM" --port 80,443 --priority 900 -o none
VM_IP=$(az vm show -d -g "$RG" -n "$VM" --query publicIps -o tsv)

echo "▶ PostgreSQL $DB ($DB_SKU, 32GB) — VM에서만 접속 허용"
DB_PASS="$(rand 28)Aa9"
az postgres flexible-server create -g "$RG" -n "$DB" -l "$LOC" \
  --tier Burstable --sku-name "$DB_SKU" --storage-size 32 --version 17 \
  --admin-user sakura --admin-password "$DB_PASS" --public-access "$VM_IP" --yes -o none
az postgres flexible-server db create -g "$RG" -s "$DB" -d sakura -o none

echo "▶ 월 2만 원 예산 알림 (실패해도 계속 — 포털 '비용 관리 > 예산'에서 직접 걸어도 됨)"
az consumption budget create --budget-name sakura-monthly --amount 20000 --time-grain Monthly \
  --start-date "$(date +%Y-%m-01)" --end-date "$(( $(date +%Y) + 3 ))-12-31" --category Cost -o none 2>/dev/null \
  || echo "  (예산 알림은 포털에서 직접 설정해 주세요)"

echo "▶ VM 준비 기다리는 중 (Docker 설치)…"
for _ in $(seq 1 60); do ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 "sakura@$HOST" "docker --version" >/dev/null 2>&1 && break; sleep 10; done

echo "▶ 운영 비밀값 만들기 (DB 비밀번호·인증 비밀값은 새로 생성, 내 PC엔 저장 안 함)"
# 관리자 비밀번호·토스 키는 사람이 직접: 터미널이면 여기서 입력, 아니면 나중에 deploy/set-secret.sh 로
ADMIN_PASSWORD=${ADMIN_PASSWORD:-} TOSS_CLIENT_KEY=${TOSS_CLIENT_KEY:-} TOSS_SECRET_KEY=${TOSS_SECRET_KEY:-}
if [ -t 0 ]; then
  read -rsp "  관리자 비밀번호: " ADMIN_PASSWORD; echo
  read -rsp "  토스 클라이언트 키 (없으면 엔터): " TOSS_CLIENT_KEY; echo
  read -rsp "  토스 시크릿 키 (없으면 엔터): " TOSS_SECRET_KEY; echo
fi
ssh "sakura@$HOST" "umask 077 && cat > ~/sakura.env" <<EOF
SITE_HOST=$HOST
DATABASE_URL=postgres://sakura:$DB_PASS@$DB.postgres.database.azure.com:5432/sakura?sslmode=require
BETTER_AUTH_SECRET=$(rand 48)
REALTIME_SECRET=$(rand 48)
ADMIN_PASSWORD=$ADMIN_PASSWORD
TOSS_CLIENT_KEY=$TOSS_CLIENT_KEY
TOSS_SECRET_KEY=$TOSS_SECRET_KEY
EOF
ssh "sakura@$HOST" "[ -d app ] || git clone $REPO app"

cat > deploy/.target <<EOF
HOST=$HOST
RG=$RG
VM=$VM
DB=$DB
EOF
[ -n "$ADMIN_PASSWORD" ] || echo "  ※ 관리자 비밀번호가 비어 있어요: bash deploy/set-secret.sh ADMIN_PASSWORD (직접 실행)"
echo "✔ 준비 끝: https://$HOST  (이제 bash deploy/deploy.sh 로 배포)"
