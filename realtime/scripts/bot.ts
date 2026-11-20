// 테스트용 가짜 방문자. 입구 근처를 빙빙 돌며 걸음.
// 실행: npx tsx --env-file=.env scripts/bot.ts [인원수]
import { createHmac } from "node:crypto";
import { Client } from "@colyseus/sdk";

const n = Number(process.argv[2] ?? 1);
const sign = (uid: string, nickname: string, preset: string) => {
  const body = Buffer.from(JSON.stringify({ uid, nickname, preset, exp: Date.now() + 60_000 })).toString("base64url");
  return `${body}.${createHmac("sha256", process.env.REALTIME_SECRET!).update(body).digest("base64url")}`;
};

for (let i = 0; i < n; i++) {
  const room = await new Client(`ws://localhost:${process.env.PORT ?? 2567}`)
    .joinOrCreate("park", { token: sign(`bot-${i}`, `산책봇${i + 1}`, `p${String((i * 7) % 20 + 1).padStart(2, "0")}`) });
  const cx = -50 + i * 2, cz = 10 + (i % 2) * 3, r = 2.5;
  let a = i;
  setInterval(() => {
    a += 0.08;
    room.send("move", { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, yaw: Math.atan2(-Math.sin(a), Math.cos(a)), walking: true });
  }, 1000 / 12);
  console.log(`bot ${i + 1} joined`);
}
