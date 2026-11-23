// 실시간 공원 서버. 모두가 같은 공원을 공유하고, 위치는 서버가 최종 판정(겹침·통과 금지).
// 방 하나 정원이 차면 Colyseus가 같은 공원 방을 하나 더 만듦 (= 채널 자동 분산).
import { createHmac, timingSafeEqual } from "node:crypto";
import { Room, defineRoom, defineServer, type Client } from "colyseus";
import { schema, t, type SchemaType } from "@colyseus/schema";
import { COLLIDERS, PLAYER_R, SPAWN, move, overlaps, type Collider } from "../../web/src/game/park-map.ts";
import { CatBrain, type CatConfig } from "../../web/src/game/cat-brain.ts";

const SECRET = process.env.REALTIME_SECRET;
if (!SECRET) throw new Error("REALTIME_SECRET 이 필요해요 (.env 참고)");
const PORT = Number(process.env.PORT ?? 2567);
const MAX_SPEED = 3.2;            // m/s, 클라이언트 걷기 속도(3.0)보다 약간 여유
const WEB_URL = process.env.WEB_URL ?? "http://localhost:3001"; // 관리자 설정(고양이 등)을 읽어 올 웹앱 주소

// 관리자 화면의 고양이 설정을 1분마다 웹앱에서 받아 옴 (실패하면 기존 값 유지)
let catConfig: Partial<CatConfig> = {};
async function loadCatConfig() {
  try { const r = await fetch(`${WEB_URL}/api/cat-config`); if (r.ok) catConfig = await r.json() as CatConfig; } catch { /* 다음에 다시 */ }
}
loadCatConfig(); setInterval(loadCatConfig, 60_000);

const Player = schema({
  x: t.number(), z: t.number(), yaw: t.number(), walking: t.boolean(),
  anim: t.string(), // "idle" | "sit" | "sitmat"(돗자리) | "sitbench"(벤치) | "wish" — 다른 사람에게 보이는 동작
  preset: t.string(), nickname: t.string(),
  uid: t.string(), // 쪽지 받는 사람 지정용 (웹앱 API가 다시 확인)
}, "Player");
type Player = SchemaType<typeof Player>;
// 공원 고양이: 서버가 움직이고 모두가 같은 고양이를 봄 (그리기는 각자 화면이)
const Cat = schema({
  active: t.boolean(), look: t.number(), x: t.number(), y: t.number(), z: t.number(), yaw: t.number(),
  act: t.string(), lx: t.number(), lz: t.number(),
}, "Cat");
const ParkState = schema({ players: t.map(Player), cat: Cat }, "ParkState");
type ParkState = SchemaType<typeof ParkState>;

type Auth = { uid: string; preset: string; nickname: string; exp: number };

/** 웹앱이 발급한 입장권 검증: base64url(json).base64url(hmac) */
function verify(token: unknown): Auth {
  if (typeof token !== "string") throw new Error("no token");
  const [body, sig] = token.split(".");
  const expect = createHmac("sha256", SECRET!).update(body).digest();
  const got = Buffer.from(sig ?? "", "base64url");
  if (got.length !== expect.length || !timingSafeEqual(got, expect)) throw new Error("bad token");
  const auth = JSON.parse(Buffer.from(body, "base64url").toString()) as Auth;
  if (auth.exp < Date.now()) throw new Error("expired");
  return auth;
}

class ParkRoom extends Room<{ state: ParkState }> {
  maxClients = 80;
  private last = new Map<string, number>(); // 마지막 이동 시각 (속도 검사)
  private uids = new Map<string, string>();  // sessionId → userId

  private cat = new CatBrain();

  onCreate() {
    const st = new ParkState(); st.cat = new Cat(); this.setState(st);
    this.setSimulationInterval((ms) => { // 10번/초 고양이를 움직이고 결과를 모두에게
      Object.assign(this.cat.cfg, catConfig);
      const ps: { x: number; z: number }[] = []; this.state.players.forEach((p) => ps.push({ x: p.x, z: p.z }));
      this.cat.update(Math.min(ms / 1000, 0.25), ps);
      Object.assign(this.state.cat, this.cat.s);
    }, 100);
  }

  onAuth(_client: Client, options: { token?: string }) { return verify(options?.token); }

  /** 다른 사람 자리는 지나갈 수 없음: 나를 뺀 모두를 원형 장애물로 */
  private others(except: string): Collider[] {
    const out: Collider[] = [...COLLIDERS];
    this.state.players.forEach((p, id) => { if (id !== except) out.push({ t: "c", x: p.x, z: p.z, r: PLAYER_R }); });
    return out;
  }

  onJoin(client: Client, _options: unknown, auth: Auth) {
    // 같은 계정이 다른 창으로 또 들어오면 이전 접속을 정리
    for (const [sid, uid] of this.uids) if (uid === auth.uid) this.clients.find((c) => c.sessionId === sid)?.leave();
    this.uids.set(client.sessionId, auth.uid);
    // 입구가 붐비면 비어 있는 자리를 나선형으로 찾음
    const cs = this.others(client.sessionId);
    let x = SPAWN.x, z = SPAWN.z;
    for (let i = 0; i < 200 && overlaps(x, z, PLAYER_R, cs); i++) {
      const a = i * 2.4, r = 0.7 + i * 0.08;
      x = SPAWN.x + Math.cos(a) * r * 0.5; z = SPAWN.z + Math.sin(a) * r;
    }
    const p = new Player();
    Object.assign(p, { x, z, yaw: SPAWN.yaw, walking: false, anim: "idle", preset: auth.preset, nickname: auth.nickname, uid: auth.uid });
    this.state.players.set(client.sessionId, p);
    this.last.set(client.sessionId, Date.now());
    console.log(`[join] ${auth.nickname} (${this.state.players.size}명)`);
  }

  messages = {
    move: (client: Client, m: { x?: unknown; z?: unknown; yaw?: unknown; walking?: unknown }) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof m?.x !== "number" || typeof m.z !== "number" || typeof m.yaw !== "number" || !Number.isFinite(m.x + m.z + m.yaw)) return;
      const now = Date.now(), dt = Math.min((now - (this.last.get(client.sessionId) ?? now)) / 1000, 0.5);
      this.last.set(client.sessionId, now);
      // 너무 멀리 한 번에 가면 허용 거리만큼만
      let tx = m.x, tz = m.z;
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz), max = MAX_SPEED * dt * 1.5 + 0.25;
      if (d > max) { tx = p.x + (dx / d) * max; tz = p.z + (dz / d) * max; }
      const r = move(p.x, p.z, tx, tz, PLAYER_R, this.others(client.sessionId));
      p.x = r.x; p.z = r.z; p.yaw = m.yaw; p.walking = m.walking === true;
      if (p.walking) p.anim = "idle"; // 걸으면 앉기·소원은 풀림
    },
    // 쪽지를 건넸다는 알림만 전달 (쪽지 내용·검증은 웹앱 API가 담당, 받은 쪽은 API로 다시 불러옴)
    noteSent: (client: Client, m: { to?: unknown }) => {
      const from = this.state.players.get(client.sessionId);
      const to = this.clients.find((c) => c.sessionId === m?.to);
      if (from && to && to !== client) to.send("noteReceived", { from: from.nickname });
    },
    // 누가 소원나무에 쪽지를 달거나 떼면 모두 새로 불러오도록 알림 (내용은 웹앱 API에서)
    treeChanged: (client: Client) => { this.broadcast("treeChanged", {}, { except: client }); },
    anim: (client: Client, a: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (p && (a === "idle" || a === "sit" || a === "sitmat" || a === "sitbench" || a === "wish")) p.anim = a;
    },
  };

  onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.last.delete(client.sessionId); this.uids.delete(client.sessionId);
    console.log(`[leave] ${p?.nickname} (${this.state.players.size}명)`);
  }
}

const server = defineServer({ rooms: { park: defineRoom(ParkRoom) } });
await server.listen(PORT);
console.log(`벚꽃 공원 실시간 서버: ws://localhost:${PORT}`);
