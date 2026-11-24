# 웹앱 운영 이미지 (Next.js standalone). 빌드 문맥 = 레포 루트: docker build -f web/Dockerfile .
# 보통은 GitHub Actions가 빌드해 ghcr.io에 올림 (.github/workflows/images.yml). 주소·비밀값은 실행할 때 환경변수로
FROM node:24-slim AS deps
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci

# 빌드 단계 (DB 스키마 반영용 migrate 서비스도 이 단계를 씀: drizzle-kit이 여기 있음)
FROM deps AS build
COPY web/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/web/.next/standalone ./
COPY --from=build /app/web/.next/static ./.next/static
COPY --from=build /app/web/public ./public
RUN mkdir -p .next/cache && chown node:node .next/cache  # 이미지 최적화 캐시 (없으면 EACCES)
USER node
EXPOSE 3000
CMD ["node", "server.js"]
