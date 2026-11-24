// 테스트용: 방에 들어가 서버 고양이 상태를 5초마다 출력 (모두에게 같은 고양이인지 확인)
// 실행: npx tsx --env-file=.env scripts/cat-watch.ts [초]
import { createHmac } from "node:crypto";
import { Client } from "@colyseus/sdk";

const secs = Number(process.argv[2] ?? 90);
const body = Buffer.from(JSON.stringify({ uid: "cat-watch", nickname: "관찰봇", preset: "p01", exp: Date.now() + 60_000 })).toString("base64url");
const token = `${body}.${createHmac("sha256", process.env.REALTIME_SECRET!).update(body).digest("base64url")}`;
const room = await new Client(`ws://localhost:${process.env.PORT ?? 2567}`).joinOrCreate("park", { token });
room.send("move", { x: -50, z: 8, yaw: 0, walking: false });
const timer = setInterval(() => {
  const cats = Array.from((room.state as { cats?: Iterable<{ active: boolean; look: number; x: number; z: number; act: string }> }).cats ?? []);
  console.log(new Date().toISOString().slice(11, 19), cats.length ? cats.map((c) => `[look=${c.look} x=${c.x.toFixed(1)} z=${c.z.toFixed(1)} ${c.act}]`).join(" ") : "no cat");
}, 5000);
setTimeout(() => { clearInterval(timer); room.leave(); process.exit(0); }, secs * 1000);
