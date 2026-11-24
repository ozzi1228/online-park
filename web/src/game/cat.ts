// 공원 고양이 그리기: 간간이 한 마리, 모두에게 같은 고양이 (움직임은 cat-brain.ts를 실시간 서버가 돌림). 무늬·눈 색은 나올 때마다 랜덤.
// 걷다가 기지개 켜기·그루밍·앉아 쉬기·나를 빤히 보다가 유유히 떠나기·벤치에 올라가 앉기·강가 난간 위를 걷기.
import * as THREE from "three";
import { part, toonGradient } from "./character";
import type { CatState } from "./cat-brain";

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
    if (L.white > 0 && !head) { // 배 흰털 (몸 아래쪽만. 머리엔 칠하지 않아 얼굴에 얼룩이 지지 않게)
      const g = x.createLinearGradient(0, 128 * (1 - L.white), 0, 128 * (1 - L.white) + 18);
      g.addColorStop(0, "rgba(253,250,245,0)"); g.addColorStop(1, WHITE);
      x.fillStyle = g; x.fillRect(0, 128 * (1 - L.white), 256, 128);
    }
  });
}
/** 얼굴: 간단하고 귀엽게 — 동글동글한 까만 눈(반짝 점) + 은은한 볼터치 + 작은 코 + ω 입 */
function faceTex(L: Look, closed: boolean) {
  const c = new THREE.Color(L.base), dark = c.r * 0.3 + c.g * 0.59 + c.b * 0.11 < 0.35; // 털이 어두운지
  return canvas(256, 192, (x) => {
    x.lineCap = "round";
    for (const s of [-1, 1]) { // 볼터치: 가장자리가 번지는 동그라미
      const g = x.createRadialGradient(128 + s * 70, 122, 0, 128 + s * 70, 122, 20);
      g.addColorStop(0, "rgba(246,150,170,0.55)"); g.addColorStop(1, "rgba(246,150,170,0)");
      x.fillStyle = g; x.beginPath(); x.arc(128 + s * 70, 122, 20, 0, 7); x.fill();
    }
    for (const [s, col] of [[-1, L.eyeL], [1, L.eyeR]] as const) {
      const ex = 128 + s * 52, ey = 98;
      if (closed) { x.strokeStyle = dark ? "#f3e6d8" : "#3a2a26"; x.lineWidth = 6; x.beginPath(); x.arc(ex, ey - 4, 13, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke(); continue; }
      if (dark) { // 털이 까만 고양이: 눈 색이 보이게 동그란 눈동자 + 작은 까만 동공
        x.fillStyle = col; x.beginPath(); x.ellipse(ex, ey, 18, 20, 0, 0, 7); x.fill();
        x.fillStyle = "#1a1416"; x.beginPath(); x.ellipse(ex, ey + 2, 9, 13, 0, 0, 7); x.fill();
      } else {
        x.fillStyle = "#2a2023"; x.beginPath(); x.ellipse(ex, ey, 18, 20, 0, 0, 7); x.fill();          // 까만 눈
        x.fillStyle = col; x.globalAlpha = 0.55; x.beginPath(); x.ellipse(ex, ey + 8, 10, 6, 0, 0, Math.PI); x.fill(); x.globalAlpha = 1; // 아래쪽에 눈 색 살짝
      }
      x.fillStyle = "#fff"; x.beginPath(); x.arc(ex + 6, ey - 7, 6.5, 0, 7); x.fill();               // 반짝
      x.beginPath(); x.arc(ex - 5, ey + 6, 2.2, 0, 7); x.fill();
    }
    if (L.white > 0 || L.base === WHITE) { // 입가 흰털 (그림으로 부드럽게)
      const m = x.createRadialGradient(128, 130, 0, 128, 130, 30); m.addColorStop(0, "rgba(253,250,245,0.95)"); m.addColorStop(0.7, "rgba(253,250,245,0.8)"); m.addColorStop(1, "rgba(253,250,245,0)");
      x.fillStyle = m; x.beginPath(); x.ellipse(128, 130, 34, 24, 0, 0, 7); x.fill();
    }
    x.fillStyle = "#ef8f9f"; x.beginPath(); x.ellipse(128, 124, 6, 4.2, 0, 0, 7); x.fill();           // 작은 코
    x.strokeStyle = "#5a3a34"; x.lineWidth = 3;
    x.beginPath(); x.arc(122, 129, 6, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke();                    // ω 입
    x.beginPath(); x.arc(134, 129, 6, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke();
    x.strokeStyle = "rgba(90,58,52,0.35)"; x.lineWidth = 2; // 수염 (옅게)
    for (const s of [-1, 1]) for (const dy of [-4, 4]) { x.beginPath(); x.moveTo(128 + s * 34, 126 + dy * 0.3); x.lineTo(128 + s * 70, 122 + dy * 1.4); x.stroke(); }
  });
}

/** 방울 목걸이 색 (나올 때마다 하나) */
const COLLARS = ["#e8697f", "#6aa0e0", "#f2a541", "#8bc77a", "#b48ce0"];

function buildCat(L: Look) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const T = 0.008;
  const tex = (m: THREE.Mesh, map: THREE.Texture) => { m.material = new THREE.MeshToonMaterial({ map, gradientMap: toonGradient() }); return m; };
  const light = L.white > 0 || L.patch || L.base === WHITE ? WHITE : L.base; // 주둥이·발·가슴 털빛
  // 몸: 짧고 통통하게
  const torso = tex(part(new THREE.SphereGeometry(0.15, 24, 16).scale(1.05, 0.98, 1.38), L.base, T), coatTexture(L, false));
  torso.position.y = 0.23; body.add(torso);
  const bib = part(new THREE.SphereGeometry(0.1, 16, 12).scale(1, 1.1, 0.7), light, 0); bib.position.set(0, 0.25, 0.13); body.add(bib); // 가슴 털
  // 머리: 크고 동그랗게 (아기 고양이 비율)
  const HR = 0.19;
  const head = new THREE.Group(); head.position.set(0, 0.41, 0.19); body.add(head);
  const skull = tex(part(new THREE.SphereGeometry(HR, 28, 18).scale(1.12, 0.95, 1), L.base, T), coatTexture(L, true));
  head.add(skull);
  const open = faceTex(L, false), shut = faceTex(L, true);
  const faceMat = new THREE.MeshToonMaterial({ map: open, gradientMap: toonGradient(), transparent: true, depthWrite: false });
  const face = new THREE.Mesh(new THREE.SphereGeometry(HR + 0.004, 32, 16, Math.PI / 2 - 0.85, 1.7, 0.36 * Math.PI, 0.36 * Math.PI).scale(1.12, 0.95, 1), faceMat);
  face.renderOrder = 2; head.add(face);
  for (const s of [-1, 1]) { // 귀: 둥글둥글한 삼각 + 분홍 속귀 + 귀끝 털
    const ear = part(new THREE.ConeGeometry(0.068, 0.12, 10), L.patch && s > 0 ? L.patch : L.base, T); ear.position.set(s * 0.11, 0.2, -0.02); ear.rotation.z = -s * 0.36; head.add(ear);
    const inner = part(new THREE.ConeGeometry(0.04, 0.075, 10), PINK, 0); inner.position.set(s * 0.108, 0.19, 0.016); inner.rotation.z = -s * 0.36; head.add(inner);
  }
  // 방울 목걸이
  const col = COLLARS[Math.floor(Math.random() * COLLARS.length)];
  const collar = part(new THREE.TorusGeometry(0.105, 0.016, 8, 24).rotateX(Math.PI / 2).rotateX(-0.5), col, 0); collar.position.set(0, 0.33, 0.13); body.add(collar);
  const bell = part(new THREE.SphereGeometry(0.026, 12, 10), "#f3c94e", 0.004); bell.position.set(0, 0.29, 0.22); body.add(bell);
  // 짧고 통통한 다리 + 동그란 발
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
    const g = new THREE.Group(); g.position.set(sx * 0.08, 0.15, sz * 0.13); body.add(g);
    g.add(at3(part(new THREE.CapsuleGeometry(0.045, 0.06, 4, 10), sz > 0 && L.white > 0.5 ? WHITE : L.base, T), 0, -0.07, 0));
    g.add(at3(part(new THREE.SphereGeometry(0.05, 12, 8).scale(1, 0.72, 1.2), light, T), 0, -0.125, 0.012));
    return g;
  });
  // 꼬리: 굵고 복슬하게, 끝은 동그랗게
  const tail: THREE.Object3D[] = []; let parent: THREE.Object3D = body;
  const tail0 = new THREE.Group(); tail0.position.set(0, 0.28, -0.19); body.add(tail0); parent = tail0;
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Group(); if (i) seg.position.y = 0.055; parent.add(seg);
    seg.add(at3(part(new THREE.CapsuleGeometry(0.038 - i * 0.002, 0.035, 4, 8), L.stripe && i % 2 ? L.stripe : L.base, T), 0, 0.028, 0));
    tail.push(seg); parent = seg;
  }
  parent.add(at3(part(new THREE.SphereGeometry(0.036, 10, 8), L.white > 0.5 ? WHITE : L.base, T), 0, 0.07, 0));
  root.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
  return { root, body, head, legs, tail, faceMat, open, shut };
}
const at3 = <T extends THREE.Object3D>(m: T, x: number, y: number, z: number) => (m.position.set(x, y, z), m);

const turn = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

/** 고양이 그리기: 두뇌(서버 또는 내 브라우저)가 정한 위치·행동을 부드럽게 따라가며 자세를 만듦 */
export class CatView {
  private cat: ReturnType<typeof buildCat> | null = null;
  private look = -1;
  private x = 0; private y = 0; private z = 0; private yaw = 0; private headYaw = 0; private blinkAt = 1;
  private pose = { stretch: 0, sit: 0, groom: 0, gait: 0 };
  constructor(private scene: THREE.Scene) {}

  private clear() {
    if (!this.cat) return;
    this.scene.remove(this.cat.root);
    this.cat.root.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    this.cat = null; this.look = -1;
  }

  update(t: number, dt: number, s: CatState | null, me: { x: number; z: number }) {
    if (!s || !s.active) { this.clear(); return; }
    if (!this.cat || this.look !== s.look) {
      this.clear(); this.cat = buildCat(LOOKS[s.look % LOOKS.length]); this.look = s.look; this.scene.add(this.cat.root);
      this.x = s.x; this.y = s.y; this.z = s.z; this.yaw = s.yaw;
    }
    const c = this.cat;
    if (Math.hypot(s.x - this.x, s.z - this.z) > 3) { this.x = s.x; this.z = s.z; this.y = s.y; } // 순간이동이면 바로
    const k = 1 - Math.exp(-dt * 10), px = this.x, pz = this.z;
    this.x += (s.x - this.x) * k; this.z += (s.z - this.z) * k; this.y += (s.y - this.y) * k;
    this.yaw = turn(this.yaw, s.yaw, k);
    const walking = (s.act === "walk" || s.act === "leave") && Math.hypot(this.x - px, this.z - pz) > dt * 0.15;
    const target = s.act === "stretch" ? { stretch: 1, sit: 0, groom: 0 } : s.act === "groom" ? { stretch: 0, sit: 1, groom: 1 }
      : s.act === "sit" || s.act === "look" ? { stretch: 0, sit: 1, groom: 0 } : s.act === "jump" ? { stretch: 0.35, sit: 0, groom: 0 } : { stretch: 0, sit: 0, groom: 0 };
    // 바라보기: 누군가를 빤히 볼 땐 그 사람, 아니면 내가 가까이 오면 나를 (각자 화면에서 자기를 보는 듯)
    let lookAt: number | null = s.act === "look" ? Math.atan2(s.lx - this.x, s.lz - this.z) : null;
    if (lookAt === null && !walking && Math.hypot(me.x - this.x, me.z - this.z) < 4) lookAt = Math.atan2(me.x - this.x, me.z - this.z);
    const rel = lookAt === null ? 0 : THREE.MathUtils.clamp(Math.atan2(Math.sin(lookAt - this.yaw), Math.cos(lookAt - this.yaw)), -1.1, 1.1);

    // 자세
    const pk = 1 - Math.exp(-dt * 6), P = this.pose;
    P.stretch += (target.stretch - P.stretch) * pk; P.sit += (target.sit - P.sit) * pk; P.groom += (target.groom - P.groom) * pk;
    P.gait += walking ? dt * 9 : 0;
    this.headYaw += (rel - this.headYaw) * pk;
    c.root.position.set(this.x, this.y, this.z); c.root.rotation.y = this.yaw;
    const sw = walking ? Math.sin(P.gait) : 0;
    // 앉으면 엉덩이를 내리고 몸을 세움, 기지개는 앞발을 뻗고 가슴을 낮춤
    c.body.rotation.x = -0.55 * P.sit + 0.32 * P.stretch;
    c.body.position.y = 0.03 * P.sit + (walking ? Math.abs(sw) * 0.012 : 0); // 앉아도 엉덩이가 바닥(벤치 판)을 뚫지 않게
    c.body.position.z = -0.06 * P.sit;
    c.legs.forEach((g, i) => {
      const front = i < 2, side = i % 2 ? 1 : -1, diag = (i === 0 || i === 3) ? 1 : -1;
      let rx = sw * 0.55 * diag;
      if (front) { rx += 0.55 * P.sit - 1.15 * P.stretch; if (side > 0) rx -= 1.5 * P.groom; } // 그루밍: 오른 앞발을 얼굴로
      else rx += -1.0 * P.sit + 0.25 * P.stretch;
      g.rotation.x = rx;
    });
    c.head.rotation.set(0.25 * P.sit + 0.35 * P.groom * (0.6 + 0.4 * Math.sin(t * 9)) - 0.25 * P.stretch, this.headYaw, 0.2 * P.groom);
    c.tail.forEach((sg, i) => { // 걸을 땐 꼬리를 세우고 살랑, 앉으면 옆으로 감음
      const up = i === 0 ? (walking ? -0.35 : -1.2 + 0.6 * P.sit) : 0;
      sg.rotation.x = up + (i ? (walking ? -0.12 : 0.18 * P.sit) : 0);
      sg.rotation.z = Math.sin(t * (walking ? 3 : 1.4) - i * 0.6) * (walking ? 0.16 : 0.1) + (i ? P.sit * 0.28 : 0);
    });
    // 눈 깜빡임 (그루밍 중엔 지그시)
    if (t > this.blinkAt + 0.14) this.blinkAt = t + 2 + Math.random() * 4;
    const shut = P.groom > 0.5 || (t > this.blinkAt && t < this.blinkAt + 0.14);
    const want = shut ? c.shut : c.open; if (c.faceMat.map !== want) c.faceMat.map = want;
  }
  dispose() { this.clear(); }
}
