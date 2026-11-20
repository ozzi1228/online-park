// 서버 판정 확인: B가 A 자리로 파고들어도 0.6m(두 사람 반지름 합) 안으로 못 들어가야 함
// 실행: npx tsx --env-file=.env scripts/overlap-check.ts  (서버가 켜져 있어야 함)
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { Client } from "@colyseus/sdk";

const sign = (uid: string) => {
  const body = Buffer.from(JSON.stringify({ uid, nickname: uid, preset: "p01", exp: Date.now() + 60_000 })).toString("base64url");
  return `${body}.${createHmac("sha256", process.env.REALTIME_SECRET!).update(body).digest("base64url")}`;
};
const url = `ws://localhost:${process.env.PORT ?? 2567}`;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const a = await new Client(url).joinOrCreate<any>("park", { token: sign("check-a") });
const b = await new Client(url).joinOrCreate<any>("park", { token: sign("check-b") });
await wait(300);
const target = { x: -40, z: 10 };
a.send("move", { ...target, yaw: 0, walking: false });
for (let i = 0; i < 40; i++) { a.send("move", { ...target, yaw: 0, walking: false }); await wait(80); } // A가 목표 지점에 도착
for (let i = 0; i < 60; i++) { b.send("move", { ...target, yaw: 0, walking: true }); await wait(80); }  // B가 같은 자리로 계속 밀고 들어감
await wait(300);
const pa = a.state.players.get(a.sessionId), pb = b.state.players.get(b.sessionId);
const d = Math.hypot(pa.x - pb.x, pa.z - pb.z);
console.log(`A(${pa.x.toFixed(2)}, ${pa.z.toFixed(2)})  B(${pb.x.toFixed(2)}, ${pb.z.toFixed(2)})  거리 ${d.toFixed(3)}m`);
assert.ok(d >= 0.6 - 1e-3, "겹쳤어요!");

// 순간이동 시도는 허용 거리만큼만
const before = { x: pb.x, z: pb.z };
b.send("move", { x: 40, z: 10, yaw: 0, walking: true });
await wait(300);
const jump = Math.hypot(b.state.players.get(b.sessionId).x - before.x, b.state.players.get(b.sessionId).z - before.z);
console.log(`순간이동 시도 → 실제 이동 ${jump.toFixed(2)}m`);
assert.ok(jump < 3, "순간이동이 막히지 않았어요!"); // 80m 요청 → 걸음 몇 걸음만큼만 허용
console.log("ok");
await a.leave(); await b.leave();
process.exit(0);
