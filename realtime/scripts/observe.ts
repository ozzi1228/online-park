// 다른 사람 눈에 보이는 상태 확인: 관찰자로 잠깐 들어가 모두의 위치·동작을 출력
// 실행: npx tsx --env-file=.env scripts/observe.ts
import { createHmac } from "node:crypto";
import { Client } from "@colyseus/sdk";

const body = Buffer.from(JSON.stringify({ uid: "observer", nickname: "관찰자", preset: "p01", exp: Date.now() + 60_000 })).toString("base64url");
const token = `${body}.${createHmac("sha256", process.env.REALTIME_SECRET!).update(body).digest("base64url")}`;
const room = await new Client(`ws://localhost:${process.env.PORT ?? 2567}`).joinOrCreate<any>("park", { token });
await new Promise((r) => setTimeout(r, 800));
room.state.players.forEach((p: any, id: string) => {
  if (id !== room.sessionId) console.log(`${p.nickname}: (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) anim=${p.anim}`);
});
await room.leave();
process.exit(0);
