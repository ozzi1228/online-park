// 고양이 두뇌: 어디로 가서 무엇을 할지 정함. 화면과 상관없는 순수 계산이라
// 실시간 서버가 이걸 돌려 모두에게 같은 고양이를 보여줌 (서버 없이 혼자 놀 땐 브라우저가 직접 돌림).
import { BENCH_SEATS, BENCH_TOP, BOUNDS, COLLIDERS, canSit, groundY, move } from "./park-map";

export const CAT_LOOKS = 6; // cat.ts의 무늬 종류 수
export type CatAct = "walk" | "leave" | "idle" | "sit" | "stretch" | "groom" | "look" | "jump";
export type CatConfig = { enabled: number; intervalMinSec: number; intervalMaxSec: number; staySec: number };
/** 화면이 그리는 데 필요한 것 (서버가 모두에게 보내는 값) */
export type CatState = { active: boolean; look: number; x: number; y: number; z: number; yaw: number; act: CatAct; lx: number; lz: number };
type P = { x: number; z: number };
type Act =
  | { k: "walk"; tx: number; tz: number; speed?: number }
  | { k: "idle" | "sit" | "stretch" | "groom"; dur: number }
  | { k: "look"; dur: number; who: P }
  | { k: "jump"; tx: number; ty: number; tz: number; dur: number }
  | { k: "leave" };

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
  cfg: CatConfig = { enabled: 1, intervalMinSec: 60, intervalMaxSec: 180, staySec: 90 };
  s: CatState = { active: false, look: 0, x: 0, y: 0, z: 0, yaw: 0, act: "idle", lx: 0, lz: 0 };
  private t = 0;
  private nextAt = 25 + Math.random() * 40;
  private leaveAt = 0;
  private queue: Act[] = []; private cur: Act | null = null; private actT = 0;
  private from = { x: 0, y: 0, z: 0 };
  private onRail = false; private onBench = false; private stuck = 0;

  private spawn(ps: P[]) {
    const p = ps[Math.floor(Math.random() * ps.length)];
    for (let i = 0; i < 30; i++) { // 누군가에게서 12~20m 떨어진 잔디밭에서 나타남
      const a = Math.random() * 6.28, r = 12 + Math.random() * 8, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (x < BOUNDS.minX + 2 || x > BOUNDS.maxX - 2 || z < BOUNDS.minZ + 1 || z > BOUNDS.maxZ - 1 || !canSit(x, z)) continue;
      Object.assign(this.s, { active: true, look: Math.floor(Math.random() * CAT_LOOKS), x, z, y: groundY(x, z), yaw: Math.random() * 6.28, act: "idle" as CatAct });
      this.queue = []; this.cur = null; this.onRail = this.onBench = false;
      this.leaveAt = this.t + this.cfg.staySec * (0.7 + Math.random() * 0.6);
      return;
    }
  }
  private despawn() {
    this.s.active = false;
    this.nextAt = this.t + this.cfg.intervalMinSec + Math.random() * Math.max(0, this.cfg.intervalMaxSec - this.cfg.intervalMinSec);
  }
  private hopDown(): Act {
    const f = BENCH_SEATS.find((b) => Math.hypot(b.x - this.s.x, b.z - this.s.z) < 0.4);
    return { k: "jump", tx: f ? f.fx : this.s.x, ty: 0, tz: f ? f.fz : this.s.z + 0.8, dur: 0.45 };
  }

  /** 다음 할 일 고르기 */
  private plan(ps: P[]) {
    const s = this.s;
    if (this.t > this.leaveAt) { this.queue.push({ k: "leave" }); return; }
    if (this.onBench) { this.queue.push({ k: Math.random() < 0.5 ? "groom" : "sit", dur: 4 + Math.random() * 6 }, { k: "sit", dur: 3 + Math.random() * 5 }, this.hopDown()); return; }
    const r = Math.random();
    const who = ps[Math.floor(Math.random() * ps.length)], dWho = Math.hypot(who.x - s.x, who.z - s.z);
    if (r < 0.22 && dWho < 14 && dWho > 3) { // 누군가에게 다가와 빤히 보다가, 반쯤은 휙 떠나버림
      const k = (dWho - 2.6) / dWho;
      this.queue.push({ k: "walk", tx: s.x + (who.x - s.x) * k, tz: s.z + (who.z - s.z) * k }, { k: "look", dur: 2.5 + Math.random() * 3, who });
      if (Math.random() < 0.5) this.queue.push({ k: "leave" });
      return;
    }
    if (r < 0.36) { // 비어 있는 벤치에 올라가 앉기
      const seat = BENCH_SEATS.filter((b) => Math.hypot(b.fx - s.x, b.fz - s.z) < 18 && ps.every((p) => Math.hypot(p.x - b.fx, p.z - b.fz) > 1.2))
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

  /** ps = 공원에 있는 사람들 위치 */
  update(dt: number, ps: P[]) {
    this.t += dt;
    const s = this.s;
    if (!s.active) { if (this.cfg.enabled && ps.length && this.t > this.nextAt) this.spawn(ps); return; }
    if (!ps.length || !this.cfg.enabled) { this.despawn(); return; }
    if (!this.cur) { if (!this.queue.length) this.plan(ps); this.cur = this.queue.shift() ?? null; this.actT = 0; this.from = { x: s.x, y: s.y, z: s.z }; }
    const a = this.cur; this.actT += dt;
    if (!a) return;
    s.act = a.k;
    switch (a.k) {
      case "walk": case "leave": {
        let tx: number, tz: number;
        if (a.k === "leave") { // 가장 가까운 사람과 반대쪽으로 유유히, 충분히 멀어지면 사라짐
          const n = near(ps, s.x, s.z)!, d = Math.hypot(s.x - n.x, s.z - n.z) || 1;
          if (ps.every((p) => Math.hypot(p.x - s.x, p.z - s.z) > 26)) { this.despawn(); return; }
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
          if (this.stuck > 1.2 && a.k === "walk") { this.queue = []; this.cur = null; this.stuck = 0; } // 막히면 다른 걸 함
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
      default: if (this.actT > a.dur) this.cur = null;
    }
  }
}
