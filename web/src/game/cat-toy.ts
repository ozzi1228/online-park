// 고양이 낚싯대 장난감: 손에서 뻗은 막대 끝에 줄이 대롱대롱, 줄 끝에 깃털 뭉치(분홍·노랑 깃털 + 하얀 털뭉치 + 방울)
// 줄은 구슬 여러 개를 이은 끈처럼 계산(verlet) → 막대를 움직이면 깃털이 뒤늦게 따라오며 살랑살랑 흔들림
import * as THREE from "three";

const N = 11, LEN = 1.0, SEG = LEN / (N - 1), G = 9.8;

export class CatToy {
  group = new THREE.Group();
  private stick: THREE.Mesh;
  private line: THREE.Line;
  private feather = new THREE.Group();
  private bells: THREE.Mesh[] = [];
  private p = Array.from({ length: N }, () => new THREE.Vector3());
  private q = Array.from({ length: N }, () => new THREE.Vector3()); // 이전 위치
  private fresh = true;
  /** 깃털(줄 끝) 위치 */
  get end() { return this.p[N - 1]; }

  constructor() {
    this.stick = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.017, 1, 6).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: "#ff7aa8" }));
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(this.p), new THREE.LineBasicMaterial({ color: "#f4f0ea" }));
    this.line.frustumCulled = false;
    // 깃털: 끝으로 갈수록 가늘어지는 길쭉한 잎 모양을 여러 장, 아래로 늘어지게
    const leaf = new THREE.ShapeGeometry(new THREE.Shape().moveTo(0, 0).quadraticCurveTo(0.05, 0.12, 0, 0.3).quadraticCurveTo(-0.05, 0.12, 0, 0)).rotateX(Math.PI);
    ([["#ff6f9f", 0.0, 0.25], ["#ffd04d", 0.9, 0.35], ["#ff9ec0", 2.0, 0.2], ["#ffe680", 3.2, 0.3], ["#ff6f9f", 4.4, 0.28]] as const).forEach(([c, a, tilt]) => {
      const m = new THREE.Mesh(leaf, new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }));
      m.rotation.set(tilt, a, 0); this.feather.add(m);
    });
    const fluff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 1), new THREE.MeshLambertMaterial({ color: "#fffaf5", flatShading: true }));
    fluff.scale.set(1, 1.5, 1); fluff.position.y = -0.02; this.feather.add(fluff);
    for (let i = 0; i < 2; i++) { // 줄에 매단 작은 방울 두 개
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshLambertMaterial({ color: "#f2c94c", emissive: "#5a4210" }));
      this.bells.push(b); this.group.add(b);
    }
    this.group.add(this.stick, this.line, this.feather);
    this.group.visible = false;
  }

  /** hand = 손, tip = 막대 끝. 줄은 막대 끝에 매달려 늘어지고, 바닥(floorY) 아래로는 안 내려감 */
  update(hand: THREE.Vector3, tip: THREE.Vector3, floorY: number, dt: number) {
    const dir = tip.clone().sub(hand);
    this.stick.position.copy(hand); this.stick.scale.y = dir.length();
    this.stick.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    if (this.fresh) { this.fresh = false; this.p.forEach((v, i) => { v.set(tip.x, tip.y - i * SEG, tip.z); this.q[i].copy(v); }); }
    const h = Math.min(dt, 1 / 30), steps = Math.max(1, Math.ceil(dt / h));
    for (let s = 0; s < steps; s++) {
      const sd = dt / steps;
      this.p[0].copy(tip); this.q[0].copy(tip);
      for (let i = 1; i < N; i++) { // 관성 + 중력 (조금씩 힘이 빠짐)
        const v = this.p[i], o = this.q[i], vx = (v.x - o.x) * 0.985, vy = (v.y - o.y) * 0.985, vz = (v.z - o.z) * 0.985;
        o.copy(v); v.set(v.x + vx, v.y + vy - G * sd * sd, v.z + vz);
      }
      for (let k = 0; k < 10; k++) { // 구슬 사이 길이 유지 (끈이 늘어나지 않게)
        for (let i = 0; i < N - 1; i++) {
          const a = this.p[i], b = this.p[i + 1], d = b.clone().sub(a), l = d.length() || 1e-6, diff = (l - SEG) / l;
          if (i === 0) b.addScaledVector(d, -diff); else { a.addScaledVector(d, diff * 0.5); b.addScaledVector(d, -diff * 0.5); }
        }
        for (let i = 1; i < N; i++) if (this.p[i].y < floorY + 0.03) this.p[i].y = floorY + 0.03; // 바닥에 끌림
      }
    }
    const pos = this.line.geometry.attributes.position as THREE.BufferAttribute;
    this.p.forEach((v, i) => pos.setXYZ(i, v.x, v.y, v.z)); pos.needsUpdate = true;
    this.bells[0].position.copy(this.p[3]); this.bells[1].position.copy(this.p[7]);
    const e = this.p[N - 1], prev = this.p[N - 2];
    this.feather.position.copy(e);
    this.feather.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), prev.clone().sub(e).normalize()); // 줄 방향으로 늘어짐
  }
  set visible(v: boolean) { this.group.visible = v; if (!v) this.fresh = true; }
}

/** 츄르: 납작하고 길쭉한 스틱 봉지(빨강·하양 띠), 뜯은 윗부분으로 크림색 간식이 몽글 나옴. 꾹 누를 때마다 더 나옴 */
export class ChuruStick {
  group = new THREE.Group();
  private pouch = new THREE.Group();
  private paste: THREE.Mesh;
  constructor() {
    const L = 0.2, W = 0.04, T = 0.01;
    const part = (h: number, y: number, c: string) => { const m = new THREE.Mesh(new THREE.BoxGeometry(W, h, T), new THREE.MeshLambertMaterial({ color: c })); m.position.y = y; this.pouch.add(m); };
    part(L * 0.55, L * 0.275, "#d8343b");          // 아래쪽 빨간 봉지
    part(L * 0.12, L * 0.6, "#f39a2b");            // 주황 띠
    part(L * 0.33, L * 0.835, "#fbf4ec");          // 위쪽 하얀 부분 (뜯은 끝)
    this.paste = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), new THREE.MeshLambertMaterial({ color: "#f3d9a4" }));
    this.paste.position.y = L + 0.005;
    this.pouch.add(this.paste);
    this.group.add(this.pouch); this.group.visible = false;
  }
  /** 손(hand)에서 고양이 입(tip) 쪽으로 봉지 끝을 향함. left = 남은 양 0~1, pulse = 방금 짠 정도 0~1 */
  update(hand: THREE.Vector3, tip: THREE.Vector3, left: number, pulse: number) {
    const dir = tip.clone().sub(hand), len = dir.length();
    this.pouch.position.copy(hand).addScaledVector(dir, Math.max(0, (len - 0.22) / len)); // 봉지 끝이 입 바로 앞에
    this.pouch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.pouch.scale.set(1, 1, 1 + pulse * 0.6 * (left > 0 ? 1 : 0)); // 누르면 봉지가 살짝 눌림
    const s = left > 0 ? 0.5 + pulse * 0.9 : 0.01;
    this.paste.scale.set(s, s * 1.3, s);
  }
  set visible(v: boolean) { this.group.visible = v; }
}
