# 실시간 서버 운영 이미지. 빌드 문맥 = 레포 루트: docker build -f realtime/Dockerfile .
# 공원 배치·고양이 두뇌는 웹앱과 같은 파일을 씀 (web/src/game)
FROM node:24-slim
WORKDIR /app/realtime
COPY realtime/package.json realtime/package-lock.json ./
RUN npm ci
COPY realtime/ ./
COPY web/src/game/park-map.ts web/src/game/cat-brain.ts /app/web/src/game/
ENV NODE_ENV=production PORT=2567
USER node
EXPOSE 2567
CMD ["npx", "tsx", "src/index.ts"]
