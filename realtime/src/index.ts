// 실시간 공원 서버. 모두가 같은 공원을 공유하고, 위치는 서버가 최종 판정(겹침·통과 금지).
// 방 하나 정원이 차면 Colyseus가 같은 공원 방을 하나 더 만듦 (= 채널 자동 분산).
import { createHmac, timingSafeEqual } from "node:crypto";
import { Room, defineRoom, defineServer, type Client } from "colyseus";
import { schema, t, type SchemaType } from "@colyseus/schema";
import { COLLIDERS, PLAYER_R, SPAWN, move, overlaps, resolve, type Collider } from "../../web/src/game/park-map.ts";
import { CatColony, type CatConfig, type CatReaction } from "../../web/src/game/cat-brain.ts";

const SECRET = process.env.REALTIME_SECRET;
if (!SECRET) throw new Error("REALTIME_SECRET 이 필요해요 (.env 참고)");
const PORT = Number(process.env.PORT ?? 2567);
const MAX_SPEED = 6.3;            // m/s, 관리자 설정 걷기 빠르기 최대(6m/초)보다 약간 여유
const WEB_URL = process.env.WEB_URL ?? "http://localhost:3001"; // 관리자 설정(고양이 등)을 읽어 올 웹앱 주소

// 관리자 화면의 고양이 설정을 1분마다 웹앱에서 받아 옴 (실패하면 기존 값 유지)
let catConfig: Partial<CatConfig> = {};
async function loadCatConfig() {
  try { const r = await fetch(`${WEB_URL}/api/cat-config`); if (r.ok) catConfig = await r.json() as CatConfig; } catch { /* 다음에 다시 */ }
}
loadCatConfig(); setInterval(loadCatConfig, 60_000);

const Player = schema({
  x: t.number(), z: t.number(), yaw: t.number(), walking: t.boolean(),
  anim: t.string(), // "idle" | "sit" | "sitmat"(돗자리) | "sitbench"(벤치) | "lie"(정자에 드러눕기) | "wish" — 다른 사람에게 보이는 동작
  preset: t.string(), nickname: t.string(),
  uid: t.string(), // 쪽지 받는 사람 지정용 (웹앱 API가 다시 확인)
}, "Player");
type Player = SchemaType<typeof Player>;
// 공원 고양이: 서버가 움직이고 모두가 같은 고양이를 봄 (그리기는 각자 화면이)
const Cat = schema({
  active: t.boolean(), look: t.number(), x: t.number(), y: t.number(), z: t.number(), yaw: t.number(),
  act: t.string(), lx: t.number(), lz: t.number(),
}, "Cat");
const ParkState = schema({ players: t.map(Player), cats: t.array(Cat) }, "ParkState");
type ParkState = SchemaType<typeof ParkState>;

type Auth = { uid: string; preset: string; nickname: string; exp: number };
type CallTicket = { kind: "catCall"; uid: string; cat: number; score: number; comes: boolean; exp: number };

/** 웹앱이 서명한 값 검증: base64url(json).base64url(hmac) (입장권, 고양이 부르기 결과) */
function verifySigned<T extends { exp: number }>(token: unknown): T {
  if (typeof token !== "string") throw new Error("no token");
  const [body, sig] = token.split(".");
  const expect = createHmac("sha256", SECRET!).update(body).digest();
  const got = Buffer.from(sig ?? "", "base64url");
  if (got.length !== expect.length || !timingSafeEqual(got, expect)) throw new Error("bad token");
  const v = JSON.parse(Buffer.from(body, "base64url").toString()) as T;
  if (v.exp < Date.now()) throw new Error("expired");
  return v;
}
function verify(token: unknown): Auth {
  const a = verifySigned<Auth & { kind?: string }>(token);
  if (a.kind) throw new Error("not an entry token"); // 고양이 부르기 결과를 입장권으로 쓰지 못하게
  return a;
}

class ParkRoom extends Room<{ state: ParkState }> {
  maxClients = 80;
  private last = new Map<string, number>(); // 마지막 이동 시각 (속도 검사)
  private uids = new Map<string, string>();  // sessionId → userId
  private budget = new Map<string, number>(); // 움직여도 되는 남은 거리 (속도 검사)

  private cats = new CatColony(); // 늘 공원에 있는 고양이들 (서로 다른 무늬)
  private petAt = new Map<string, number>(); private ticketAt = new Map<string, number>();
  /** 고양이별 지금 낚싯대로 놀아 주는 사람 */
  private playMate = new Map<number, string>();
  /** 고양이별로 1.5초 동안 모은 부르기 → 온다고 나온 사람 중 호감도가 가장 높은 사람에게 (같으면 무작위) */
  private calls = new Map<number, { sid: string; score: number; comes: boolean }[]>();
  private resolveCalls(cat: number) {
    const list = this.calls.get(cat) ?? []; this.calls.delete(cat);
    const b = this.cats.brains.find((x) => x.s.look === cat);
    const here = list.filter((c) => this.state.players.has(c.sid));
    const send = (sid: string, result: string, to = "") => this.clients.find((c) => c.sessionId === sid)?.send("catCallResult", { cat, result, to });
    if (!b) { here.forEach((c) => send(c.sid, "gone")); return; }
    if (b.busy) { here.forEach((c) => send(c.sid, "busy")); return; }
    const ok = here.filter((c) => c.comes), top = Math.max(-1, ...ok.map((c) => c.score)), best = ok.filter((c) => c.score === top);
    const win = best[Math.floor(Math.random() * best.length)];
    if (win) b.react("come", this.state.players.get(win.sid)!);
    const winner = win ? this.state.players.get(win.sid)?.nickname ?? "" : "";
    for (const c of here) send(c.sid, c === win ? "came" : c.comes ? "other" : "ignored", winner);
  }

  onCreate() {
    const st = new ParkState(); this.setState(st);
    this.setSimulationInterval((ms) => { // 10번/초 고양이들을 움직이고 결과를 모두에게
      Object.assign(this.cats.cfg, catConfig);
      const ps: { x: number; z: number }[] = []; this.state.players.forEach((p) => ps.push({ x: p.x, z: p.z }));
      this.cats.update(Math.min(ms / 1000, 0.25), ps);
      const list = this.cats.states, arr = this.state.cats;
      while (arr.length > list.length) arr.pop();
      while (arr.length < list.length) arr.push(new Cat());
      list.forEach((c, i) => Object.assign(arr[i], c));
    }, 100);
  }

  onAuth(_client: Client, options: { token?: string }) { return verify(options?.token); }

  /** 다른 사람 자리는 지나갈 수 없음: 나를 뺀 모두를 원형 장애물로 */
  private others(except: string): Collider[] {
    const out: Collider[] = [...COLLIDERS];
    this.state.players.forEach((p, id) => { if (id !== except) out.push({ t: "c", x: p.x, z: p.z, r: PLAYER_R }); });
    return out;
  }

  onJoin(client: Client, options: { resume?: { x?: unknown; z?: unknown; yaw?: unknown } }, auth: Auth) {
    // 같은 계정이 다른 창으로 또 들어오면 이전 접속을 정리
    for (const [sid, uid] of this.uids) if (uid === auth.uid) this.clients.find((c) => c.sessionId === sid)?.leave();
    this.uids.set(client.sessionId, auth.uid);
    // 입구가 붐비면 비어 있는 자리를 나선형으로 찾음
    const cs = this.others(client.sessionId);
    let x = SPAWN.x, z = SPAWN.z, yaw = SPAWN.yaw;
    // 결제·새로고침으로 잠깐 나갔다 오면 있던 자리에서 (걸을 수 있는 곳이고 다른 사람과 안 겹칠 때만)
    const rs = options?.resume;
    if (rs && typeof rs.x === "number" && typeof rs.z === "number" && Number.isFinite(rs.x) && Number.isFinite(rs.z)) {
      const p = resolve(rs.x, rs.z);
      if (Math.hypot(p.x - rs.x, p.z - rs.z) < 0.5 && !overlaps(p.x, p.z, PLAYER_R, cs)) { x = p.x; z = p.z; if (typeof rs.yaw === "number" && Number.isFinite(rs.yaw)) yaw = rs.yaw; }
    }
    for (let i = 0; i < 200 && overlaps(x, z, PLAYER_R, cs); i++) {
      const a = i * 2.4, r = 0.7 + i * 0.08;
      x = SPAWN.x + Math.cos(a) * r * 0.5; z = SPAWN.z + Math.sin(a) * r;
    }
    const p = new Player();
    Object.assign(p, { x, z, yaw, walking: false, anim: "idle", preset: auth.preset, nickname: auth.nickname, uid: auth.uid });
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
      // 너무 멀리 가면 허용 거리만큼만. 허용량은 시간 따라 쌓였다가 쓰는 방식이라
      // 신호가 몰려서(망 지연) 짧은 간격으로 두 번 와도 정상 걸음은 잘리지 않음 (1.5초 걸음까지 저장)
      const budget = Math.min((this.budget.get(client.sessionId) ?? 1) + MAX_SPEED * 1.3 * dt, MAX_SPEED * 1.5 + 0.5);
      let tx = m.x, tz = m.z;
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      if (d > budget) { tx = p.x + (dx / d) * budget; tz = p.z + (dz / d) * budget; }
      this.budget.set(client.sessionId, Math.max(0, budget - Math.min(d, budget)));
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
    // 돗자리 같이 앉기: 묻기 → 깐 사람에게 전달, 대답 → 물어본 사람에게 전달 (자리 판정은 각자 화면에서)
    matAsk: (client: Client, m: { to?: unknown }) => {
      const from = this.state.players.get(client.sessionId), owner = this.state.players.get(String(m?.to));
      const to = this.clients.find((c) => c.sessionId === m?.to);
      if (from && owner?.anim.startsWith("sitmat") && to && to !== client) to.send("matAsked", { from: client.sessionId, nickname: from.nickname });
    },
    matAnswer: (client: Client, m: { to?: unknown; ok?: unknown }) => {
      const owner = this.state.players.get(client.sessionId), to = this.clients.find((c) => c.sessionId === m?.to);
      if (owner && to && to !== client) to.send("matAnswered", { ok: m?.ok === true, owner: owner.nickname, id: client.sessionId });
    },
    // 잠깐 하는 몸짓(손 흔들기·고개 젓기·발 동동)을 다른 사람 화면에도
    gesture: (client: Client, kind: unknown) => {
      if (kind === "wave" || kind === "shake" || kind === "stomp" || kind === "cheer") this.broadcast("gesture", { id: client.sessionId, kind }, { except: client });
    },
    // 고양이 부르기: 웹앱이 굴린 결과(서명됨)를 1.5초 동안 모아서 판정
    catCall: (client: Client, m: { ticket?: unknown }) => {
      let t: CallTicket;
      try { t = verifySigned<CallTicket>(m?.ticket); } catch { return; }
      if (t.kind !== "catCall" || t.uid !== this.uids.get(client.sessionId) || t.exp <= (this.ticketAt.get(client.sessionId) ?? 0)) return;
      this.ticketAt.set(client.sessionId, t.exp); // 같은 결과를 다시 보내 여러 번 부르지 못하게
      const list = this.calls.get(t.cat);
      if (list) { if (!list.some((c) => c.sid === client.sessionId)) list.push({ sid: client.sessionId, score: t.score, comes: t.comes }); return; }
      this.calls.set(t.cat, [{ sid: client.sessionId, score: t.score, comes: t.comes }]);
      this.clock.setTimeout(() => this.resolveCalls(t.cat), 1500);
    },
    // 낚싯대 놀이: 노는 사람이 단계(watch·crouch·pounce·roll·end)와 깃털 자리를 알려 줌 → 모두에게 같은 고양이
    catPlay: (client: Client, m: { cat?: unknown; phase?: unknown; x?: unknown; z?: unknown }) => {
      const p = this.state.players.get(client.sessionId), b = this.cats.brains.find((x) => x.s.look === m?.cat);
      const ph = m?.phase, x = Number(m?.x), z = Number(m?.z);
      if (!p || !b || !Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x - p.x, z - p.z) > 3 || Math.hypot(b.s.x - p.x, b.s.z - p.z) > 8) return;
      const mine = this.playMate.get(m?.cat as number);
      if (mine && mine !== client.sessionId && b.busy) return; // 다른 사람과 노는 중
      if (ph === "watch" || ph === "crouch" || ph === "pounce" || ph === "roll" || ph === "end") {
        if (ph === "end") this.playMate.delete(m?.cat as number); else this.playMate.set(m?.cat as number, client.sessionId);
        b.play(ph, { x, z });
      }
    },
    // 고양이를 쓰다듬었을 때의 반응 (반응 종류는 웹 서버가 호감도로 정해 줌. 화면에 보이는 것뿐이라 거리·횟수만 확인)
    catPet: (client: Client, m: { cat?: unknown; kind?: unknown }) => {
      const p = this.state.players.get(client.sessionId), now = Date.now(), huff = m?.kind === "huff";
      if (!p || (!huff && (this.petAt.get(client.sessionId) ?? 0) > now - 800)) return; // 질투는 여러 마리가 한꺼번에
      const b = this.cats.brains.find((x) => x.s.look === m?.cat);
      if (!b || (b.busy && m?.kind !== "eatEnd") || Math.hypot(b.s.x - p.x, b.s.z - p.z) > (huff ? 12 : 4)) return; // 다 먹었다는 알림은 먹는 중에도
      // 사람 위치는 살아 있는 값(p)을 넘김 → 따라다니기·부비부비가 사람이 움직여도 따라감
      if (m?.kind === "flee" || m?.kind === "content" || m?.kind === "rub" || m?.kind === "eat" || m?.kind === "eatEnd" || huff) { b.react(m.kind as CatReaction, p); if (!huff) this.petAt.set(client.sessionId, now); }
    },
    anim: (client: Client, a: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (p && typeof a === "string" && /^(idle|sit|sitbench|wish|lie|sitmat(:(pink|yellow|blue|green|white))?)$/.test(a)) p.anim = a; // sitmat:색
    },
  };

  onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.last.delete(client.sessionId); this.uids.delete(client.sessionId); this.budget.delete(client.sessionId); this.petAt.delete(client.sessionId); this.ticketAt.delete(client.sessionId);
    console.log(`[leave] ${p?.nickname} (${this.state.players.size}명)`);
  }
}

const server = defineServer({ rooms: { park: defineRoom(ParkRoom) } });
await server.listen(PORT);
console.log(`벚꽃 공원 실시간 서버: ws://localhost:${PORT}`);
