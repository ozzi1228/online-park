# 웹앱 운영 이미지 (Next.js standalone). 빌드 문맥 = 레포 루트: docker build -f web/Dockerfile .
FROM node:24-slim AS deps
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci

# 빌드 단계 (DB 스키마 반영용 migrate 서비스도 이 단계를 씀: drizzle-kit이 여기 있음)
FROM deps AS build
COPY web/ ./
# 브라우저 코드에 박히는 값이라 빌드 때 필요
ARG NEXT_PUBLIC_REALTIME_URL
ENV NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/web/.next/standalone ./
COPY --from=build /app/web/.next/static ./.next/static
COPY --from=build /app/web/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
