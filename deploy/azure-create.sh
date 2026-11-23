#!/usr/bin/env bash
# Azure에 처음 한 번: 리소스 그룹 + VM + PostgreSQL + 운영 비밀값(.env)을 만듦.
# 미리: Azure CLI 설치, `az login`. 실행(레포 루트, Git Bash): bash deploy/azure-create.sh
# 이름·크기는 환경변수로 바꿀 수 있음 (예: SIZE=Standard_B2pts_v2 bash deploy/azure-create.sh)
set -euo pipefail
cd "$(dirname "$0")/.."

RG=${RG:-sakura-park}
LOC=${LOC:-japaneast}   # 한국 중부는 무료 체험 구독에 작은 VM이 막혀 있어서(2026-11) 일본 동부
VM=${VM:-sakura-vm}
SIZE=${SIZE:-Standard_B2pts_v2}          # 무료 계정 12개월 무료 대상 (ARM 2코어·1GB)
IMAGE=${IMAGE:-Canonical:ubuntu-24_04-lts:server-arm64:latest}  # ARM VM이라 arm64 우분투
DNS=${DNS:-sakura-park-$((RANDOM % 9000 + 1000))}
DB=${DB:-sakura-db-$((RANDOM % 9000 + 1000))}
DB_SKU=${DB_SKU:-Standard_B1ms}
REPO=${REPO:-https://github.com/ozzi1228/online-park.git}
HOST="$DNS.$LOC.cloudapp.azure.com"
KEY=${KEY:-$HOME/.ssh/sakura_azure}
SSH="ssh -i $KEY -o IdentitiesOnly=yes"
rand() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "$1"; }

# 중간에 실패해도 다시 실행하면 이미 만든 건 건너뛰고 이어서 함
echo "▶ 리소스 그룹 $RG ($LOC)"
az group show -n "$RG" -o none 2>/dev/null || az group create -n "$RG" -l "$LOC" -o none
az provider register --namespace Microsoft.DBforPostgreSQL --wait -o none # 새 구독은 DB 서비스 등록부터

# 이 배포 전용 SSH 키 (~/.ssh/sakura_azure). 없으면 새로 만듦. 설명(-C)은 영문만 (윈도우 Azure CLI가 한글을 못 읽음)
[ -f "$KEY" ] || ssh-keygen -t ed25519 -N "" -C "sakura-deploy" -f "$KEY" -q
if [ "$(az vm list -g "$RG" --query "length([?name=='$VM'])" -o tsv)" = "1" ]; then
  DNS=$(az network public-ip show -g "$RG" -n "${VM}PublicIP" --query dnsSettings.domainNameLabel -o tsv)
  HOST="$DNS.$LOC.cloudapp.azure.com"
  echo "▶ VM $VM 이미 있음 — https://$HOST"
else
  echo "▶ VM $VM ($SIZE) — 주소 https://$HOST"
  az vm create -g "$RG" -n "$VM" --image "$IMAGE" --size "$SIZE" \
    --admin-username sakura --ssh-key-values "$KEY.pub" \
    --public-ip-sku Standard --public-ip-address-dns-name "$DNS" \
    --os-disk-size-gb 30 --custom-data deploy/cloud-init.yaml -o none || az vm show -g "$RG" -n "$VM" -o none
fi
for i in 1 2 3 4 5 6; do az vm open-port -g "$RG" -n "$VM" --port 80,443 --priority 900 -o none 2>/dev/null && break; echo "  (포트 열기 재시도 $i)"; sleep 20; done
VM_IP=$(az vm show -d -g "$RG" -n "$VM" --query publicIps -o tsv)

EXISTING_DB=$(az postgres flexible-server list -g "$RG" --query "[0].name" -o tsv)
DB_PASS="$(rand 28)Aa9"
if [ -n "$EXISTING_DB" ]; then
  DB=$EXISTING_DB
  echo "▶ PostgreSQL $DB 이미 있음 — 비밀번호를 새로 정해 이어서 진행"
  az postgres flexible-server update -g "$RG" -n "$DB" --admin-password "$DB_PASS" -o none
else
  echo "▶ PostgreSQL $DB ($DB_SKU, 32GB) — VM에서만 접속 허용"
  az postgres flexible-server create -g "$RG" -n "$DB" -l "$LOC" \
    --tier Burstable --sku-name "$DB_SKU" --storage-size 32 --version 17 \
    --admin-user sakura --admin-password "$DB_PASS" --public-access "$VM_IP" --yes -o none
fi
az postgres flexible-server db show -g "$RG" -s "$DB" -n sakura -o none 2>/dev/null || az postgres flexible-server db create -g "$RG" -s "$DB" -n sakura -o none

echo "▶ 월 2만 원 예산 알림 (실패해도 계속 — 포털 '비용 관리 > 예산'에서 직접 걸어도 됨)"
az consumption budget create --budget-name sakura-monthly --amount 20000 --time-grain Monthly \
  --start-date "$(date +%Y-%m-01)" --end-date "$(( $(date +%Y) + 3 ))-12-31" --category Cost -o none 2>/dev/null \
  || echo "  (예산 알림은 포털에서 직접 설정해 주세요)"

echo "▶ VM 준비 기다리는 중 (Docker 설치)…"
for _ in $(seq 1 60); do $SSH -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 "sakura@$HOST" "docker --version" >/dev/null 2>&1 && break; sleep 10; done

echo "▶ 운영 비밀값 만들기 (DB 비밀번호·인증 비밀값은 새로 생성, 내 PC엔 저장 안 함)"
# 관리자 비밀번호·토스 키는 사람이 직접: 터미널이면 여기서 입력, 아니면 나중에 deploy/set-secret.sh 로
ADMIN_PASSWORD=${ADMIN_PASSWORD:-} TOSS_CLIENT_KEY=${TOSS_CLIENT_KEY:-} TOSS_SECRET_KEY=${TOSS_SECRET_KEY:-}
if [ -t 0 ]; then
  read -rsp "  관리자 비밀번호: " ADMIN_PASSWORD; echo
  read -rsp "  토스 클라이언트 키 (없으면 엔터): " TOSS_CLIENT_KEY; echo
  read -rsp "  토스 시크릿 키 (없으면 엔터): " TOSS_SECRET_KEY; echo
fi
$SSH "sakura@$HOST" "umask 077 && cat > ~/sakura.env" <<EOF
SITE_HOST=$HOST
DATABASE_URL=postgres://sakura:$DB_PASS@$DB.postgres.database.azure.com:5432/sakura?sslmode=require
BETTER_AUTH_SECRET=$(rand 48)
REALTIME_SECRET=$(rand 48)
ADMIN_PASSWORD=$ADMIN_PASSWORD
TOSS_CLIENT_KEY=$TOSS_CLIENT_KEY
TOSS_SECRET_KEY=$TOSS_SECRET_KEY
EOF
$SSH "sakura@$HOST" "[ -d app ] || git clone $REPO app"

cat > deploy/.target <<EOF
HOST=$HOST
KEY=$KEY
RG=$RG
VM=$VM
DB=$DB
EOF
[ -n "$ADMIN_PASSWORD" ] || echo "  ※ 관리자 비밀번호가 비어 있어요: bash deploy/set-secret.sh ADMIN_PASSWORD (직접 실행)"
echo "✔ 준비 끝: https://$HOST  (이제 bash deploy/deploy.sh 로 배포)"
