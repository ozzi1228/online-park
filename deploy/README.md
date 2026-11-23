# Azure 배포

VM 한 대(웹앱 + 실시간 서버 + Caddy HTTPS, Docker Compose) + Azure Database for PostgreSQL.
월 예산 한도 2만 원 (PLAN.md 7장).

## 처음 한 번 (사람이 직접)

1. Azure 무료 계정 만들기 (카드 등록은 직접)
2. Azure CLI 설치 (PowerShell): `winget install -e --id Microsoft.AzureCLI`
3. 로그인: `az login` (브라우저가 열리면 로그인)

## 처음 한 번 (Claude에게 "Azure 만들어 줘")

```bash
bash deploy/azure-create.sh
```

- 리소스 그룹 `sakura-park`, VM `Standard_B2pts_v2`(Ubuntu 24.04 ARM, 일본 동부, 스왑 2GB), PostgreSQL `B1ms` 32GB, 80·443 포트, 월 2만 원 예산 알림
- 주소: `https://sakura-park-XXXX.japaneast.cloudapp.azure.com` (도메인 사면 바꿈)
- 운영 비밀값은 VM의 `~/sakura.env`에만 저장 (DB 비밀번호·인증 비밀값은 자동 생성)
- 관리자 비밀번호·토스 키는 직접 입력: `bash deploy/set-secret.sh ADMIN_PASSWORD`

## 배포 (Claude에게 "배포해 줘")

```bash
git push            # GitHub에 올라간 코드가 배포됨
bash deploy/deploy.sh
```

push하면 GitHub Actions가 ARM 이미지를 빌드해 ghcr.io에 올림(`.github/workflows/images.yml`, 공개 레포라 무료, 3~5분).
`deploy.sh`는 그 커밋의 이미지가 올라오길 기다렸다가 VM에서 받기 → DB 스키마 반영(drizzle push) → 재시작 (VM에선 1~2분).
급할 때 VM에서 직접 빌드: `BUILD_ON_VM=1 bash deploy/deploy.sh` (메모리가 작아 10~15분)

## 비용 줄이기 (무료 기간이 끝나면)

DB를 VM 안 Postgres로 옮기면 월 2만 원 안에 들어옴:
`.env`의 `DATABASE_URL=postgres://sakura:<LOCALDB_PASSWORD>@localdb:5432/sakura`, 실행할 때 `--profile localdb`.
(옮기기 전 `pg_dump`로 백업 → 복원)

## 지우기

```bash
az group delete -n sakura-park --yes   # VM·DB·주소 모두 삭제 (되돌릴 수 없음)
```
