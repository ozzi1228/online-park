// 공원 고양이: 간간이 한 마리가 나타나 돌아다님 (내 화면에만 보임). 무늬·눈 색은 나올 때마다 랜덤.
// 걷다가 기지개 켜기·그루밍·앉아 쉬기·나를 빤히 보다가 유유히 떠나기·벤치에 올라가 앉기·강가 난간 위를 걷기.
import * as THREE from "three";
import { part, toonGradient } from "./character";
import { BENCH_SEATS, BOUNDS, COLLIDERS, canSit, groundY, move } from "./park-map";

type Look = { name: string; base: string; stripe?: string; white: number; patch?: string; eyeL: string; eyeR: string };
const LOOKS: Look[] = [
  { name: "치즈 태비", base: "#efb872", stripe: "#c97a3f", white: 0.55, eyeL: "#3b2a24", eyeR: "#3b2a24" },
  { name: "고등어 태비", base: "#b9b8bd", stripe: "#6f6e76", white: 0.6, eyeL: "#2d3e4f", eyeR: "#2d3e4f" },
  { name: "하양 오드아이", base: "#fbf8f3", white: 0, eyeL: "#5b8fd6", eyeR: "#e2b23c" },
  { name: "크림", base: "#f4ddb6", stripe: "#dcb27f", white: 0.5, eyeL: "#3b3a52", eyeR: "#3b3a52" },
  { name: "삼색이", base: "#fbf8f3", white: 0, patch: "#e59a4f", stripe: "#3c3333", eyeL: "#5c4422", eyeR: "#5c4422" },
  { name: "턱시도", base: "#3a3336", white: 0.65, eyeL: "#c9b03a", eyeR: "#c9b03a" },
];
const PINK = "#f6a9b6", WHITE = "#fdfaf5";

function canvas(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** 몸·머리 무늬: 구 UV(위=v0)에 줄무늬·배 흰털·삼색 얼룩 */
function coatTexture(L: Look, head: boolean) {
  return canvas(256, 128, (x) => {
    x.fillStyle = L.base; x.fillRect(0, 0, 256, 128);
    if (L.patch) for (let i = 0; i < 5; i++) { // 삼색이 얼룩
      x.fillStyle = i % 2 ? L.patch : L.stripe!;
      x.beginPath(); x.ellipse(Math.random() * 256, 15 + Math.random() * 55, 22 + Math.random() * 26, 14 + Math.random() * 14, Math.random(), 0, 7); x.fill();
    } else if (L.stripe) {
      x.strokeStyle = L.stripe; x.lineCap = "round";
      const n = head ? 6 : 10;
      for (let i = 0; i < n; i++) { // 등줄기에서 옆으로 흘러내리는 굵은 줄무늬 (위아래 양쪽으로)
        const u = (i / n) * 256 + 6;
        x.lineWidth = head ? 9 : 14;
        x.beginPath(); x.moveTo(u, 0); x.quadraticCurveTo(u + 10, head ? 22 : 34, u - 6, head ? 44 : 70); x.stroke();
      }
    }
    if (L.white > 0) { // 배·턱 흰털 (아래쪽)
      const g = x.createLinearGradient(0, 128 * (1 - L.white), 0, 128 * (1 - L.white) + 18);
      g.addColorStop(0, "rgba(253,250,245,0)"); g.addColorStop(1, WHITE);
      x.fillStyle = g; x.fillRect(0, 128 * (1 - L.white), 256, 128);
    }
  });
}
/** 얼굴: 반짝이는 큰 눈 + 분홍 코 + ω 입 */
function faceTex(L: Look, closed: boolean) {
  return canvas(256, 192, (x) => {
    x.lineCap = "round";
    for (const [s, col] of [[-1, L.eyeL], [1, L.eyeR]] as const) {
      const ex = 128 + s * 50, ey = 92;
      if (closed) { x.strokeStyle = "#3a2a26"; x.lineWidth = 6; x.beginPath(); x.arc(ex, ey - 6, 16, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke(); continue; }
      x.fillStyle = "#2b2124"; x.beginPath(); x.ellipse(ex, ey, 26, 28, 0, 0, 7); x.fill();
      x.fillStyle = col; x.beginPath(); x.ellipse(ex, ey + 2, 21, 23, 0, 0, 7); x.fill();
      x.fillStyle = "#1c1517"; x.beginPath(); x.ellipse(ex, ey + 3, 11, 16, 0, 0, 7); x.fill();
      x.fillStyle = "#fff"; x.beginPath(); x.arc(ex + 7, ey - 9, 7, 0, 7); x.fill();
      x.beginPath(); x.arc(ex - 7, ey + 9, 2.6, 0, 7); x.fill();
    }
    x.fillStyle = "#ef8f9f"; x.beginPath(); x.moveTo(120, 124); x.lineTo(136, 124); x.lineTo(128, 133); x.closePath(); x.fill();
    x.strokeStyle = "#5a3a34"; x.lineWidth = 3.5;
    x.beginPath(); x.moveTo(128, 133); x.lineTo(128, 139); x.stroke();
    x.beginPath(); x.arc(121, 139, 7, 0.1 * Math.PI, 0.9 * Math.PI); x.stroke();
    x.beginPath(); x.arc(135, 139, 7, 0.1 * Math.PI, 0.9 * Math.PI); x.stroke();
    x.strokeStyle = "rgba(90,58,52,0.55)"; x.lineWidth = 2; // 수염
    for (const s of [-1, 1]) for (const dy of [-5, 4]) { x.beginPath(); x.moveTo(128 + s * 30, 132 + dy * 0.3); x.lineTo(128 + s * 78, 126 + dy * 1.6); x.stroke(); }
  });
}

function buildCat(L: Look) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const T = 0.008;
  const tex = (m: THREE.Mesh, map: THREE.Texture) => { m.material = new THREE.MeshToonMaterial({ map, gradientMap: toonGradient() }); return m; };
  const torso = tex(part(new THREE.SphereGeometry(0.15, 24, 16).scale(1, 0.95, 1.65), L.base, T), coatTexture(L, false));
  torso.position.y = 0.25; body.add(torso);
  const head = new THREE.Group(); head.position.set(0, 0.4, 0.22); body.add(head);
  const skull = tex(part(new THREE.SphereGeometry(0.155, 24, 16).scale(1.08, 0.95, 1), L.base, T), coatTexture(L, true));
  head.add(skull);
  const muzzle = part(new THREE.SphereGeometry(0.07, 16, 12).scale(1.3, 0.8, 0.8), L.white > 0 || L.patch || L.base === WHITE ? WHITE : L.base, 0);
  muzzle.position.set(0, -0.05, 0.085); head.add(muzzle); // 얼굴 그림(코·입)이 위로 보이게 살짝 안쪽
  const open = faceTex(L, false), shut = faceTex(L, true);
  const faceMat = new THREE.MeshToonMaterial({ map: open, gradientMap: toonGradient(), transparent: true, depthWrite: false });
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.158, 32, 16, Math.PI / 2 - 0.85, 1.7, 0.36 * Math.PI, 0.36 * Math.PI).scale(1.08, 0.95, 1), faceMat);
  face.renderOrder = 2; head.add(face);
  for (const s of [-1, 1]) { // 귀
    const ear = part(new THREE.ConeGeometry(0.06, 0.11, 4), L.patch && s > 0 ? L.patch : L.base, T); ear.position.set(s * 0.085, 0.13, -0.01); ear.rotation.z = -s * 0.32; head.add(ear);
    const inner = part(new THREE.ConeGeometry(0.035, 0.07, 4), PINK, 0); inner.position.set(s * 0.083, 0.12, 0.02); inner.rotation.z = -s * 0.32; head.add(inner);
  }
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
    const g = new THREE.Group(); g.position.set(sx * 0.075, 0.16, sz * 0.15); body.add(g);
    g.add(at3(part(new THREE.CapsuleGeometry(0.04, 0.09, 4, 10), sz > 0 && L.white > 0.5 ? WHITE : L.base, T), 0, -0.08, 0));
    g.add(at3(part(new THREE.SphereGeometry(0.045, 12, 8).scale(1, 0.7, 1.25), L.white > 0 || L.base === WHITE ? WHITE : L.base, T), 0, -0.14, 0.01));
    return g;
  });
  const tail: THREE.Object3D[] = []; let parent: THREE.Object3D = body;
  const tail0 = new THREE.Group(); tail0.position.set(0, 0.3, -0.22); body.add(tail0); parent = tail0;
  for (let i = 0; i < 6; i++) { // 꼬리 마디 (끝으로 갈수록 가늘게)
    const seg = new THREE.Group(); if (i) seg.position.y = 0.06; parent.add(seg);
    seg.add(at3(part(new THREE.CapsuleGeometry(0.03 - i * 0.002, 0.04, 4, 8), L.stripe && i % 2 ? L.stripe : L.base, T), 0, 0.03, 0));
    tail.push(seg); parent = seg;
  }
  root.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
  return { root, body, head, legs, tail, faceMat, open, shut };
}
const at3 = <T extends THREE.Object3D>(m: T, x: number, y: number, z: number) => (m.position.set(x, y, z), m);

type Act =
  | { k: "walk"; tx: number; tz: number; then?: Act[]; speed?: number }
  | { k: "idle" | "sit" | "stretch" | "groom" | "look"; dur: number }
  | { k: "jump"; tx: number; ty: number; tz: number; dur: number }
  | { k: "leave" };

export type CatConfig = { enabled: number; intervalMinSec: number; intervalMaxSec: number; staySec: number };
const RAIL = { z: BOUNDS.minZ - 0.25, y: 0.94, minX: -60, maxX: 60 };
const RAIL_STAND_Z = BOUNDS.minZ + 0.35;
const lerpA = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

export class ParkCat {
  private scene: THREE.Scene;
  private cat: ReturnType<typeof buildCat> | null = null;
  private cfg: CatConfig = { enabled: 1, intervalMinSec: 60, intervalMaxSec: 180, staySec: 90 };
  private nextAt = 25 + Math.random() * 40; // 처음엔 조금 기다렸다 (게임 시간 기준)
  private leaveAt = 0;
  private x = 0; private z = 0; private y = 0; private yaw = 0; private headYaw = 0;
  private queue: Act[] = []; private cur: Act | null = null; private actT = 0;
  private jumpFrom = new THREE.Vector3();
  private onRail = false; private onBench = false;
  private stuck = 0; private blinkAt = 1;
  private pose = { stretch: 0, sit: 0, groom: 0, gait: 0 };

  constructor(scene: THREE.Scene) { this.scene = scene; }
  setConfig(c: Partial<CatConfig>) { Object.assign(this.cfg, c); }

  private spawn(px: number, pz: number) {
    const L = LOOKS[Math.floor(Math.random() * LOOKS.length)];
    for (let i = 0; i < 30; i++) { // 나와 12~20m 떨어진 잔디밭에서 나타남
      const a = Math.random() * 6.28, r = 12 + Math.random() * 8, x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
      if (x < BOUNDS.minX + 2 || x > BOUNDS.maxX - 2 || z < BOUNDS.minZ + 1 || z > BOUNDS.maxZ - 1 || !canSit(x, z)) continue;
      this.cat = buildCat(L); this.scene.add(this.cat.root);
      this.x = x; this.z = z; this.y = groundY(x, z); this.yaw = Math.random() * 6.28;
      this.queue = []; this.cur = null; this.onRail = this.onBench = false;
      return;
    }
  }
  private despawn(t: number) {
    if (this.cat) { this.scene.remove(this.cat.root); this.cat.root.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); } }); }
    this.cat = null;
    this.nextAt = t + this.cfg.intervalMinSec + Math.random() * Math.max(0, this.cfg.intervalMaxSec - this.cfg.intervalMinSec);
  }

  /** 다음 할 일 고르기 */
  private plan(px: number, pz: number, t: number) {
    const dPlayer = Math.hypot(px - this.x, pz - this.z);
    const lawn = () => { for (let i = 0; i < 20; i++) { const a = Math.random() * 6.28, r = 3 + Math.random() * 7, x = this.x + Math.cos(a) * r, z = this.z + Math.sin(a) * r; if (canSit(x, z) && x > BOUNDS.minX + 1 && x < BOUNDS.maxX - 1 && z > BOUNDS.minZ + 0.8 && z < BOUNDS.maxZ - 1) return { x, z }; } return null; };
    if (t > this.leaveAt) { this.queue.push({ k: "leave" }); return; }
    if (this.onBench) { this.queue.push({ k: Math.random() < 0.5 ? "groom" : "sit", dur: 4 + Math.random() * 6 }, { k: "sit", dur: 3 + Math.random() * 5 }, this.hopDown()); return; }
    const r = Math.random();
    if (r < 0.22 && dPlayer < 14 && dPlayer > 3) { // 다가와서 빤히 보다가, 반쯤은 휙 떠나버림
      const k = (dPlayer - 2.6) / dPlayer;
      this.queue.push({ k: "walk", tx: this.x + (px - this.x) * k, tz: this.z + (pz - this.z) * k }, { k: "look", dur: 2.5 + Math.random() * 3 });
      if (Math.random() < 0.5) this.queue.push({ k: "leave" });
      return;
    }
    if (r < 0.36) { // 벤치에 올라가 앉기
      const seat = BENCH_SEATS.filter((s) => Math.hypot(s.fx - this.x, s.fz - this.z) < 18 && Math.hypot(px - s.fx, pz - s.fz) > 1.2)
        .sort((a, b) => Math.hypot(a.fx - this.x, a.fz - this.z) - Math.hypot(b.fx - this.x, b.fz - this.z))[0];
      if (seat) { this.queue.push({ k: "walk", tx: seat.fx, tz: seat.fz }, { k: "jump", tx: seat.x, ty: seat.y + 0.1, tz: seat.z, dur: 0.45 }); return; }
    }
    if (r < 0.48 && this.z < 6) { // 강가 난간 위를 걷기
      const x0 = THREE.MathUtils.clamp(this.x, RAIL.minX + 3, RAIL.maxX - 8), dir = Math.random() < 0.5 ? 1 : -1, x1 = THREE.MathUtils.clamp(x0 + dir * (4 + Math.random() * 5), RAIL.minX, RAIL.maxX);
      this.queue.push({ k: "walk", tx: x0, tz: RAIL_STAND_Z }, { k: "jump", tx: x0, ty: RAIL.y, tz: RAIL.z, dur: 0.45 },
        { k: "walk", tx: x1, tz: RAIL.z, speed: 0.5 }, { k: "sit", dur: 1.5 + Math.random() * 3 }, { k: "jump", tx: x1, ty: groundY(x1, RAIL_STAND_Z), tz: RAIL_STAND_Z, dur: 0.45 });
      return;
    }
    const p = lawn();
    if (p) this.queue.push({ k: "walk", tx: p.x, tz: p.z });
    const pick = Math.random();
    if (pick < 0.3) this.queue.push({ k: "stretch", dur: 2.6 });
    else if (pick < 0.55) this.queue.push({ k: "sit", dur: 1.5 }, { k: "groom", dur: 3 + Math.random() * 3 });
    else if (pick < 0.75) this.queue.push({ k: "sit", dur: 3 + Math.random() * 5 });
    else this.queue.push({ k: "idle", dur: 1 + Math.random() * 2 });
  }
  private hopDown(): Act {
    const f = BENCH_SEATS.find((s) => Math.hypot(s.x - this.x, s.z - this.z) < 0.3);
    return { k: "jump", tx: f ? f.fx : this.x, ty: 0, tz: f ? f.fz : this.z + 0.8, dur: 0.45 };
  }

  update(t: number, dt: number, px: number, pz: number) {
    if (!this.cat) {
      if (this.cfg.enabled && t > this.nextAt) { this.spawn(px, pz); this.leaveAt = t + this.cfg.staySec * (0.7 + Math.random() * 0.6); }
      return;
    }
    const c = this.cat;
    if (!this.cur) { if (!this.queue.length) this.plan(px, pz, t); this.cur = this.queue.shift() ?? null; this.actT = 0; if (this.cur?.k === "jump") this.jumpFrom.set(this.x, this.y, this.z); }
    const a = this.cur; this.actT += dt;
    let walking = false, target = { stretch: 0, sit: 0, groom: 0 }, lookAt: number | null = null;
    if (a) switch (a.k) {
      case "walk": case "leave": {
        let tx: number, tz: number;
        if (a.k === "leave") { // 나와 반대쪽으로 유유히
          const d = Math.hypot(this.x - px, this.z - pz) || 1; tx = this.x + (this.x - px) / d * 3; tz = this.z + (this.z - pz) / d * 3;
          if (d > 26) { this.despawn(t); return; }
        } else { tx = a.tx; tz = a.tz; }
        const dx = tx - this.x, dz = tz - this.z, dist = Math.hypot(dx, dz);
        if (a.k === "walk" && dist < 0.08) { this.cur = null; break; }
        const sp = (a.k === "walk" ? a.speed : undefined) ?? (a.k === "leave" ? 0.75 : 0.9);
        this.yaw = lerpA(this.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 6));
        const step = Math.min(dist, sp * dt), nx = this.x + Math.sin(this.yaw) * step, nz = this.z + Math.cos(this.yaw) * step;
        if (this.onRail) { this.x = nx; this.z = RAIL.z; }
        else {
          const r = move(this.x, this.z, nx, nz, 0.16, COLLIDERS);
          const moved = Math.hypot(r.x - this.x, r.z - this.z);
          this.stuck = moved < step * 0.3 ? this.stuck + dt : 0;
          this.x = r.x; this.z = r.z; this.y = groundY(this.x, this.z);
          if (this.stuck > 1.2 && a.k === "walk") { this.queue = []; this.cur = null; this.stuck = 0; } // 막히면 다른 걸 함
        }
        walking = true; break;
      }
      case "jump": {
        const k = Math.min(1, this.actT / a.dur), e = k * k * (3 - 2 * k);
        this.x = THREE.MathUtils.lerp(this.jumpFrom.x, a.tx, e); this.z = THREE.MathUtils.lerp(this.jumpFrom.z, a.tz, e);
        this.y = THREE.MathUtils.lerp(this.jumpFrom.y, a.ty, e) + Math.sin(Math.PI * k) * 0.35;
        this.yaw = lerpA(this.yaw, Math.atan2(a.tx - this.jumpFrom.x, a.tz - this.jumpFrom.z), 1 - Math.exp(-dt * 12));
        target = { stretch: 0.35, sit: 0, groom: 0 };
        if (k >= 1) {
          this.onRail = Math.abs(a.tz - RAIL.z) < 0.05 && a.ty > 0.5;
          this.onBench = !this.onRail && a.ty > 0.3;
          if (this.onBench) { const s = BENCH_SEATS.find((b) => Math.hypot(b.x - a.tx, b.z - a.tz) < 0.3); if (s) this.yaw = s.yaw; }
          this.cur = null;
        }
        break;
      }
      case "stretch": target = { stretch: this.actT < a.dur - 0.5 ? 1 : 0, sit: 0, groom: 0 }; if (this.actT > a.dur) this.cur = null; break;
      case "groom": target = { stretch: 0, sit: 1, groom: 1 }; if (this.actT > a.dur) this.cur = null; break;
      case "sit": target = { stretch: 0, sit: 1, groom: 0 }; if (this.actT > a.dur) this.cur = null; break;
      case "look": target = { stretch: 0, sit: 1, groom: 0 }; lookAt = Math.atan2(px - this.x, pz - this.z); if (this.actT > a.dur) this.cur = null; break;
      case "idle": if (this.actT > a.dur) this.cur = null; break;
    }
    // 가까이 오면 고개를 돌려 봄
    const dP = Math.hypot(px - this.x, pz - this.z);
    if (lookAt === null && dP < 4 && !walking) lookAt = Math.atan2(px - this.x, pz - this.z);
    const rel = lookAt === null ? 0 : THREE.MathUtils.clamp(Math.atan2(Math.sin(lookAt - this.yaw), Math.cos(lookAt - this.yaw)), -1.1, 1.1);
    if (lookAt !== null && Math.abs(Math.atan2(Math.sin(lookAt - this.yaw), Math.cos(lookAt - this.yaw))) > 1.1 && !walking) this.yaw = lerpA(this.yaw, lookAt, 1 - Math.exp(-dt * 1.5));

    // 자세
    const k = 1 - Math.exp(-dt * 6), P = this.pose;
    P.stretch += (target.stretch - P.stretch) * k; P.sit += (target.sit - P.sit) * k; P.groom += (target.groom - P.groom) * k;
    P.gait += walking ? dt * 9 : 0;
    this.headYaw += (rel - this.headYaw) * k;
    c.root.position.set(this.x, this.y, this.z); c.root.rotation.y = this.yaw;
    const sw = walking ? Math.sin(P.gait) : 0;
    // 앉으면 엉덩이를 내리고 몸을 세움, 기지개는 앞발을 뻗고 가슴을 낮춤
    c.body.rotation.x = -0.55 * P.sit + 0.32 * P.stretch;
    c.body.position.y = -0.06 * P.sit + (walking ? Math.abs(sw) * 0.012 : 0);
    c.body.position.z = -0.06 * P.sit;
    c.legs.forEach((g, i) => {
      const front = i < 2, side = i % 2 ? 1 : -1, diag = (i === 0 || i === 3) ? 1 : -1;
      let rx = sw * 0.55 * diag;
      if (front) { rx += 0.55 * P.sit - 1.15 * P.stretch; if (side > 0) rx -= 1.5 * P.groom; } // 그루밍: 오른 앞발을 얼굴로
      else rx += -1.0 * P.sit + 0.25 * P.stretch;
      g.rotation.x = rx;
    });
    c.head.rotation.set(0.25 * P.sit + 0.35 * P.groom * (0.6 + 0.4 * Math.sin(t * 9)) - 0.25 * P.stretch, this.headYaw, 0.2 * P.groom);
    c.tail.forEach((s, i) => { // 걸을 땐 꼬리를 세우고 살랑, 앉으면 옆으로 감음
      const up = i === 0 ? (walking ? -0.35 : -1.2 + 0.6 * P.sit) : 0;
      s.rotation.x = up + (i ? (walking ? -0.12 : 0.18 * P.sit) : 0);
      s.rotation.z = Math.sin(t * (walking ? 3 : 1.4) - i * 0.6) * (walking ? 0.16 : 0.1) + (i ? P.sit * 0.28 : 0);
    });
    // 눈 깜빡임 (그루밍 중엔 지그시)
    if (t > this.blinkAt + 0.14) this.blinkAt = t + 2 + Math.random() * 4;
    const shut = P.groom > 0.5 || (t > this.blinkAt && t < this.blinkAt + 0.14);
    const want = shut ? c.shut : c.open; if (c.faceMat.map !== want) c.faceMat.map = want;
  }
}
