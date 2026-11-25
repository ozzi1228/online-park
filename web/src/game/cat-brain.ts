// 고양이 두뇌: 어디로 가서 무엇을 할지 정함. 화면과 상관없는 순수 계산이라
// 실시간 서버가 이걸 돌려 모두에게 같은 고양이를 보여줌 (서버 없이 혼자 놀 땐 브라우저가 직접 돌림).
import { BENCH_SEATS, BENCH_TOP, BOUNDS, COLLIDERS, canSit, groundY, move } from "./park-map";

export const CAT_LOOKS = 6; // cat.ts의 무늬 종류 수
/** 고양이(무늬 번호) 이름: 관리자 화면용 (cat.ts LOOKS 순서와 같게) */
export const CAT_COATS = ["치즈 태비", "고등어 태비", "하양 오드아이", "크림", "삼색이", "턱시도"] as const;
/** flee = 놀라서 후다닥, content = 쓰다듬어지며 눈 지그시, rub = 다리에 부비부비, come = 부르면 옴, eat = 츄르 할짝, follow = 졸졸 따라옴 (사람에게 반응) */
export type CatAct = "walk" | "leave" | "idle" | "sit" | "stretch" | "groom" | "look" | "jump" | "flee" | "content" | "rub" | "come" | "eat" | "follow" | "watch" | "crouch" | "roll" | "pounce";
/** 낚싯대 놀이 단계: watch = 깃털을 눈으로 좇음, crouch = 엉덩이 씰룩, pounce = 덮침, roll = 신나서 뒹굴, end = 그만 */
export type PlayPhase = "watch" | "crouch" | "pounce" | "roll" | "end";
/** huff = 질투: 흘끗 보고 꼬리 휙, 가 버림 */
export type CatReaction = "flee" | "content" | "rub" | "come" | "eat" | "eatEnd" | "pet" | "petEnd" | "huff";
export type CatConfig = { enabled: number; count: number };
/** 화면이 그리는 데 필요한 것 (서버가 모두에게 보내는 값) */
export type CatState = { active: boolean; look: number; x: number; y: number; z: number; yaw: number; act: CatAct; lx: number; lz: number };
type P = { x: number; z: number };
type Act =
  | { k: "walk"; tx: number; tz: number; speed?: number }
  | { k: "idle" | "sit" | "stretch" | "groom"; dur: number }
  | { k: "look"; dur: number; who: P }
  | { k: "jump"; tx: number; ty: number; tz: number; dur: number }
  | { k: "leave" }
  | { k: "flee"; dur: number; who: P; speed?: number }
  | { k: "eat"; dur: number; who: P }
  | { k: "follow"; dur: number; who: P }
  | { k: "watch" | "crouch"; dur: number; at: P }
  | { k: "roll"; dur: number }
  | { k: "pounce"; tx: number; tz: number; dur: number }
  | { k: "content"; dur: number; who: P }
  | { k: "rub"; dur: number; who: P; a: number }
  | { k: "come"; dur: number; who: P; near?: number; next?: Act[] };

const RAIL = { z: BOUNDS.minZ - 0.25, y: 0.94, minX: -60, maxX: 60 };
/** 고양이 몸 반 길이: 이만큼 떨어져서 지나가야 머리·꼬리가 나무·벤치·가로등에 박히지 않음 */
const CAT_R = 0.32;
/** 벤치 위 고양이 자리: 등받이에 엉덩이가 박히지 않게 판 가운데보다 살짝 앞으로 */
const benchSpot = (b: { x: number; z: number; yaw: number }) => ({ x: b.x + Math.sin(b.yaw) * 0.14, z: b.z + Math.cos(b.yaw) * 0.14 });
const RAIL_STAND_Z = BOUNDS.minZ + 0.35;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const turn = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const near = (ps: P[], x: number, z: number) => ps.reduce<P | null>((m, p) => (!m || Math.hypot(p.x - x, p.z - z) < Math.hypot(m.x - x, m.z - z) ? p : m), null);

export class CatBrain {
  s: CatState = { active: false, look: 0, x: 0, y: 0, z: 0, yaw: 0, act: "idle", lx: 0, lz: 0 };
  private t = 0;
  /** 다른 고양이 위치 (벤치 자리 겹치지 않게) */
  others: P[] = [];
  private queue: Act[] = []; private cur: Act | null = null; private actT = 0;
  private from = { x: 0, y: 0, z: 0 };
  private onRail = false; private onBench = false; private stuck = 0;

  /** 공원 잔디 어딘가에 나타남 (늘 공원 안에서 지내다 찾을 수 있게). look = 무늬 */
  spawn(look: number) {
    for (let i = 0; i < 60; i++) {
      const x = BOUNDS.minX + 3 + Math.random() * (BOUNDS.maxX - BOUNDS.minX - 6), z = BOUNDS.minZ + 2 + Math.random() * (BOUNDS.maxZ - BOUNDS.minZ - 4);
      if (!canSit(x, z)) continue;
      Object.assign(this.s, { active: true, look, x, z, y: groundY(x, z), yaw: Math.random() * 6.28, act: "idle" as CatAct });
      this.queue = []; this.cur = null; this.onRail = this.onBench = false;
      return;
    }
  }
  hide() { this.s.active = false; }

  /** 사람이 쓰다듬었을 때: 하던 걸 멈추고 바로 반응 (벤치·난간 위면 그 자리에서) */
  react(kind: CatReaction, who: P) {
    const s = this.s;
    if (kind === "petEnd") { if (this.cur?.k === "content") this.cur = null; return; } // 다 쓰다듬었으면 하던 일로
    if (kind === "eatEnd") { // 츄르를 다 짰으면 그만 먹고 부비부비 → 졸졸 (하던 순서는 그대로, 아직 오는 중이면 먹기만 건너뜀)
      const a = this.cur;
      if (a?.k === "eat") this.cur = null;
      else if (a?.k === "come" && a.next) a.next = a.next.filter((x) => x.k !== "eat");
      return;
    }
    this.queue = [];
    if (kind === "flee") { if (this.onRail || this.onBench) this.queue.push(this.hopDown()); this.queue.push({ k: "flee", dur: 2.4, who }); }
    else if (kind === "content") this.queue.push({ k: "content", dur: 4, who });
    else if (kind === "pet") this.queue.push({ k: "content", dur: 40, who }); // 내 손으로 쓰다듬는 동안 그 자리(벤치 위여도)에 앉아서 기다림 (petEnd 까지)
    else if (kind === "eat") { // 츄르: 와서 앞에 앉아 할짝할짝 → 다리에 부비 → 잠깐 졸졸 따라다님
      if (this.onRail || this.onBench) this.queue.push(this.hopDown());
      this.queue.push({ k: "come", dur: 15, who, near: 0.55, next: [{ k: "eat", dur: 40, who }, { k: "rub", dur: 2.6, who, a: 0 }, { k: "follow", dur: 20, who }] });
    }
    else if (kind === "huff") this.queue.push({ k: "look", dur: 1.1, who }, { k: "flee", dur: 3, who, speed: 0.8 });
    else if (kind === "come") { if (this.onRail || this.onBench) this.queue.push(this.hopDown()); this.queue.push({ k: "come", dur: 15, who }); } // 불렀을 때: 종종걸음으로 와서 앞에 앉음
    else { // 다가와서 다리에 몸을 비비며 한 바퀴 반
      if (this.onRail || this.onBench) this.queue.push(this.hopDown());
      this.queue.push({ k: "rub", dur: 6, who, a: Math.atan2(s.x - who.x, s.z - who.z) }); // 다가가는 것부터 (막혀도 포기하지 않고 비빌 자리로)
    }
    this.cur = null;
  }
  /** 지금 사람과 하는 중인지 (쓰다듬기 반응 중엔 다른 사람이 끼어들지 않게) */
  get busy() { const k = this.cur?.k; return k === "content" || k === "rub" || k === "come" || k === "eat" || k === "watch" || k === "crouch" || k === "roll" || k === "pounce" || this.playUntil > this.t || this.calledUntil > this.t; }
  private playUntil = 0;
  /** 낚싯대 놀이: 노는 사람이 단계마다 알려 줌 (at = 깃털 자리). 놀이 중엔 다른 사람이 끼어들지 못함 */
  play(phase: PlayPhase, at: P) {
    const s = this.s, a = this.cur;
    this.playUntil = phase === "end" ? 0 : this.t + 6; // 알림이 끊기면 6초 뒤 저절로 놀이 끝
    if ((phase === "watch" || phase === "crouch") && a && a.k === phase) { a.at = at; return; } // 같은 단계면 깃털 자리만
    if (phase === "watch" && a?.k === "crouch") { this.cur = { k: "watch", dur: 30, at }; this.actT = 0; return; }
    this.queue = [];
    if (this.onRail || this.onBench) this.queue.push(this.hopDown());
    if (phase === "watch") this.queue.push({ k: "watch", dur: 30, at });
    else if (phase === "crouch") this.queue.push({ k: "crouch", dur: 30, at });
    else if (phase === "pounce") this.queue.push({ k: "pounce", tx: at.x - Math.sin(s.yaw) * 0.12, tz: at.z - Math.cos(s.yaw) * 0.12, dur: 0.55 }, { k: "watch", dur: 30, at });
    else if (phase === "roll") this.queue.push({ k: "roll", dur: 3.6 }, { k: "sit", dur: 2 }); // 화면의 뒹굴 순서(cat.ts)와 같은 길이
    else this.queue.push({ k: "leave" });
    this.cur = null;
  }
  /** 부름을 받고 와서 앉아 있는 동안 (다른 사람이 데려가지 못하게) */
  private calledUntil = 0;
  private hopDown(): Act {
    const f = BENCH_SEATS.find((b) => Math.hypot(b.x - this.s.x, b.z - this.s.z) < 0.4);
    return { k: "jump", tx: f ? f.fx : this.s.x, ty: 0, tz: f ? f.fz : this.s.z + 0.8, dur: 0.45 };
  }

  /** 다음 할 일 고르기 */
  private plan(ps: P[]) {
    const s = this.s;
    if (this.onBench) { this.queue.push({ k: Math.random() < 0.5 ? "groom" : "sit", dur: 4 + Math.random() * 6 }, { k: "sit", dur: 3 + Math.random() * 5 }, this.hopDown()); return; }
    const r = Math.random();
    const who = ps[Math.floor(Math.random() * ps.length)], dWho = who ? Math.hypot(who.x - s.x, who.z - s.z) : Infinity;
    if (who && r < 0.22 && dWho < 14 && dWho > 3) { // 누군가에게 다가와 빤히 보다가, 반쯤은 휙 떠나버림
      const k = (dWho - 2.6) / dWho;
      this.queue.push({ k: "walk", tx: s.x + (who.x - s.x) * k, tz: s.z + (who.z - s.z) * k }, { k: "look", dur: 2.5 + Math.random() * 3, who });
      if (Math.random() < 0.5) this.queue.push({ k: "leave" }); // 휙 돌아서 멀찍이 걸어감 (사라지진 않음)
      return;
    }
    if (r < 0.36) { // 비어 있는 벤치에 올라가 앉기
      const seat = BENCH_SEATS.filter((b) => Math.hypot(b.fx - s.x, b.fz - s.z) < 18 && [...ps, ...this.others].every((p) => Math.hypot(p.x - b.fx, p.z - b.fz) > 1.2))
        .sort((a, b) => Math.hypot(a.fx - s.x, a.fz - s.z) - Math.hypot(b.fx - s.x, b.fz - s.z))[0];
      if (seat) { const sp = benchSpot(seat); this.queue.push({ k: "walk", tx: seat.fx, tz: seat.fz }, { k: "jump", tx: sp.x, ty: BENCH_TOP, tz: sp.z, dur: 0.45 }); return; }
    }
    if (r < 0.48 && s.z < 6) { // 강가 난간 위를 걷기
      const x0 = clamp(s.x, RAIL.minX + 3, RAIL.maxX - 8), dir = Math.random() < 0.5 ? 1 : -1, x1 = clamp(x0 + dir * (4 + Math.random() * 5), RAIL.minX, RAIL.maxX);
      this.queue.push({ k: "walk", tx: x0, tz: RAIL_STAND_Z }, { k: "jump", tx: x0, ty: RAIL.y, tz: RAIL.z, dur: 0.45 },
        { k: "walk", tx: x1, tz: RAIL.z, speed: 0.5 }, { k: "sit", dur: 1.5 + Math.random() * 3 }, { k: "jump", tx: x1, ty: groundY(x1, RAIL_STAND_Z), tz: RAIL_STAND_Z, dur: 0.45 });
      return;
    }
    for (let i = 0; i < 20; i++) { // 근처 잔디밭으로 어슬렁
      const a = Math.random() * 6.28, d = 3 + Math.random() * 7, x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
      if (canSit(x, z) && x > BOUNDS.minX + 1 && x < BOUNDS.maxX - 1 && z > BOUNDS.minZ + 0.8 && z < BOUNDS.maxZ - 1) { this.queue.push({ k: "walk", tx: x, tz: z }); break; }
    }
    const pick = Math.random();
    if (pick < 0.3) this.queue.push({ k: "stretch", dur: 2.6 });
    else if (pick < 0.55) this.queue.push({ k: "sit", dur: 1.5 }, { k: "groom", dur: 3 + Math.random() * 3 });
    else if (pick < 0.75) this.queue.push({ k: "sit", dur: 3 + Math.random() * 5 });
    else this.queue.push({ k: "idle", dur: 1 + Math.random() * 2 });
  }

  /** ps = 공원에 있는 사람들 위치 (아무도 없어도 고양이는 공원에서 지냄) */
  update(dt: number, ps: P[]) {
    this.t += dt;
    const s = this.s;
    if (!s.active) return;
    if (!this.cur) { if (!this.queue.length) this.plan(ps); this.cur = this.queue.shift() ?? null; this.actT = 0; this.from = { x: s.x, y: s.y, z: s.z }; }
    const a = this.cur; this.actT += dt;
    if (!a) return;
    s.act = a.k;
    switch (a.k) {
      case "walk": case "leave": {
        let tx: number, tz: number;
        if (a.k === "leave") { // 가장 가까운 사람과 반대쪽으로 유유히, 충분히 멀어지면 다시 어슬렁
          const n = near(ps, s.x, s.z);
          if (!n || this.actT > 12 || ps.every((p) => Math.hypot(p.x - s.x, p.z - s.z) > 14)) { this.cur = null; break; }
          const d = Math.hypot(s.x - n.x, s.z - n.z) || 1;
          tx = s.x + (s.x - n.x) / d * 3; tz = s.z + (s.z - n.z) / d * 3;
        } else { tx = a.tx; tz = a.tz; }
        const dx = tx - s.x, dz = tz - s.z, dist = Math.hypot(dx, dz);
        if (a.k === "walk" && dist < 0.08) { this.cur = null; break; }
        const sp = (a.k === "walk" ? a.speed : undefined) ?? (a.k === "leave" ? 0.75 : 0.9);
        s.yaw = turn(s.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 6));
        const step = Math.min(dist, sp * dt), nx = s.x + Math.sin(s.yaw) * step, nz = s.z + Math.cos(s.yaw) * step;
        if (this.onRail) { s.x = nx; s.z = RAIL.z; }
        else {
          const r = move(s.x, s.z, nx, nz, CAT_R, COLLIDERS);
          this.stuck = Math.hypot(r.x - s.x, r.z - s.z) < step * 0.3 ? this.stuck + dt : 0;
          s.x = r.x; s.z = r.z; s.y = groundY(s.x, s.z);
          if (this.stuck > 1.2) { this.queue = []; this.cur = null; this.stuck = 0; } // 막히면 다른 걸 함
        }
        break;
      }
      case "jump": {
        const k = Math.min(1, this.actT / a.dur), e = k * k * (3 - 2 * k);
        s.x = this.from.x + (a.tx - this.from.x) * e; s.z = this.from.z + (a.tz - this.from.z) * e;
        s.y = this.from.y + (a.ty - this.from.y) * e + Math.sin(Math.PI * k) * 0.35;
        s.yaw = turn(s.yaw, Math.atan2(a.tx - this.from.x, a.tz - this.from.z), 1 - Math.exp(-dt * 12));
        if (k >= 1) {
          this.onRail = Math.abs(a.tz - RAIL.z) < 0.05 && a.ty > 0.5;
          this.onBench = !this.onRail && a.ty > 0.3;
          if (this.onBench) { const b = BENCH_SEATS.find((q) => Math.hypot(q.x - a.tx, q.z - a.tz) < 0.4); if (b) s.yaw = b.yaw; }
          this.cur = null;
        }
        break;
      }
      case "look": s.lx = a.who.x; s.lz = a.who.z; if (this.actT > a.dur) this.cur = null; break;
      case "flee": { // 사람 반대쪽으로 후다닥
        const d = Math.hypot(s.x - a.who.x, s.z - a.who.z) || 1, ux = (s.x - a.who.x) / d, uz = (s.z - a.who.z) / d;
        s.yaw = turn(s.yaw, Math.atan2(ux, uz), 1 - Math.exp(-dt * 10));
        const sp = a.speed ?? 2.6, r = move(s.x, s.z, s.x + Math.sin(s.yaw) * sp * dt, s.z + Math.cos(s.yaw) * sp * dt, CAT_R, COLLIDERS);
        s.x = r.x; s.z = r.z; s.y = groundY(s.x, s.z);
        if (this.actT > a.dur) this.cur = null;
        break;
      }
      case "watch": case "crouch": { // 깃털을 좇아 고개를 돌리고, 멀면 살금살금 다가감 (1m 쯤까지)
        s.lx = a.at.x; s.lz = a.at.z;
        const dx = a.at.x - s.x, dz = a.at.z - s.z, dist = Math.hypot(dx, dz);
        s.yaw = turn(s.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * (a.k === "crouch" ? 3 : 5)));
        if (dist > 1.3 && a.k === "watch") { const r = move(s.x, s.z, s.x + dx / dist * 0.9 * dt, s.z + dz / dist * 0.9 * dt, CAT_R, COLLIDERS); s.x = r.x; s.z = r.z; s.y = groundY(s.x, s.z); }
        if (this.actT > a.dur || this.playUntil < this.t) { this.cur = null; this.queue = []; }
        break;
      }
      case "roll": if (this.actT > a.dur) this.cur = null; break;
      case "pounce": { // 뒷다리로 박차고 앞발을 뻗으며 포물선으로 덮침
        const k = Math.min(1, this.actT / a.dur), e = k * k * (3 - 2 * k);
        s.x = this.from.x + (a.tx - this.from.x) * e; s.z = this.from.z + (a.tz - this.from.z) * e;
        s.y = groundY(s.x, s.z) + Math.sin(Math.PI * k) * 0.5;
        s.yaw = turn(s.yaw, Math.atan2(a.tx - this.from.x, a.tz - this.from.z), 1 - Math.exp(-dt * 14));
        if (k >= 1) { s.y = groundY(s.x, s.z); this.cur = null; }
        break;
      }
      case "content": case "eat": s.lx = a.who.x; s.lz = a.who.z; s.yaw = turn(s.yaw, Math.atan2(a.who.x - s.x, a.who.z - s.z), 1 - Math.exp(-dt * 6)); if (this.actT > a.dur) this.cur = null; break;
      case "follow": { // 1m 쯤 떨어져서 졸졸 (멀어지면 따라가고, 가까우면 서서 봄)
        const dx = a.who.x - s.x, dz = a.who.z - s.z, dist = Math.hypot(dx, dz);
        s.lx = a.who.x; s.lz = a.who.z;
        if (dist > 1.1) {
          s.yaw = turn(s.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 8));
          const step = Math.min(dist - 1, Math.min(2.2, 0.8 + dist * 0.5) * dt), r = move(s.x, s.z, s.x + Math.sin(s.yaw) * step, s.z + Math.cos(s.yaw) * step, CAT_R, COLLIDERS);
          s.x = r.x; s.z = r.z; s.y = groundY(s.x, s.z);
        }
        if (this.actT > a.dur || dist > 15) this.cur = null; // 너무 멀어지면 그만
        break;
      }
      case "come": { // 부른 사람 앞 0.7m 까지 종종걸음 (막혀도 비켜 가며), 도착하면 마주 보고 앉음
        const near = a.near ?? 0.7, d0 = Math.hypot(s.x - a.who.x, s.z - a.who.z) || 1, tx = a.who.x + (s.x - a.who.x) / d0 * near, tz = a.who.z + (s.z - a.who.z) / d0 * near;
        const dx = tx - s.x, dz = tz - s.z, dist = Math.hypot(dx, dz);
        if (dist < 0.12 || this.actT > a.dur) {
          if (a.next) { this.queue.unshift(...a.next); this.cur = null; break; }
          this.cur = { k: "look", dur: 5, who: a.who }; this.actT = 0; this.calledUntil = this.t + 5; break;
        }
        s.yaw = turn(s.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 8));
        const step = Math.min(dist, 1.5 * dt), r = move(s.x, s.z, s.x + Math.sin(s.yaw) * step, s.z + Math.cos(s.yaw) * step, CAT_R, COLLIDERS);
        s.x = r.x; s.z = r.z; s.y = groundY(s.x, s.z);
        break;
      }
      case "rub": { // 사람 발치로 와서 천천히 돌며 옆구리를 비빔 (머리는 사람 쪽)
        const tx = a.who.x + Math.sin(a.a) * 0.42, tz = a.who.z + Math.cos(a.a) * 0.42, dx = tx - s.x, dz = tz - s.z, dist = Math.hypot(dx, dz);
        if (dist > 0.12) { s.yaw = turn(s.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 8)); } // 아직 오는 중
        else { a.a += dt * 1.6; s.yaw = a.a + Math.PI / 2; } // 다리 둘레를 빙글
        const step = Math.min(dist, 1.2 * dt), r = move(s.x, s.z, s.x + (dist ? dx / dist : 0) * step, s.z + (dist ? dz / dist : 0) * step, CAT_R * 0.6, COLLIDERS);
        s.x = r.x; s.z = r.z; s.y = groundY(s.x, s.z); s.lx = a.who.x; s.lz = a.who.z;
        if (this.actT > a.dur) this.cur = null;
        break;
      }
      default: if (this.actT > a.dur) this.cur = null;
    }
  }
}

/** 공원 고양이들: 늘 공원에 있고(사라지지 않음), 서로 다른 무늬로 count마리 */
export class CatColony {
  cfg: CatConfig = { enabled: 1, count: 2 };
  brains: CatBrain[] = [];
  update(dt: number, ps: P[]) {
    const n = this.cfg.enabled ? Math.max(0, Math.min(CAT_LOOKS, Math.round(this.cfg.count))) : 0;
    while (this.brains.length > n) this.brains.pop();
    while (this.brains.length < n) { // 이미 있는 고양이와 다른 무늬로
      const used = this.brains.map((b) => b.s.look), free = Array.from({ length: CAT_LOOKS }, (_, i) => i).filter((i) => !used.includes(i));
      const b = new CatBrain(); b.spawn(free[Math.floor(Math.random() * free.length)]); this.brains.push(b);
    }
    for (const b of this.brains) { b.others = this.brains.filter((o) => o !== b).map((o) => ({ x: o.s.x, z: o.s.z })); b.update(dt, ps); }
  }
  get states(): CatState[] { return this.brains.map((b) => b.s); }
}
