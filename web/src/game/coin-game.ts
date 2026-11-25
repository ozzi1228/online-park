// 분수 동전 게임: 새총처럼 당겨서 튕긴 동전이 맨 위 작은 접시에 들어가면 성공.
// 빗나간 동전은 아래 물에 떨어져 바닥에 남음 (사람들이 던지다 실패한 흔적)
import * as THREE from "three";
import { launchVec, posAt, simulate, type Landing, type Ring, type Shot, type Targets } from "./coin-sim";

export type { Landing, Ring, Shot };
/** 조준선은 처음 0.5초만 (끝까지 보여 주면 너무 쉬움 — 나머지는 감으로) */
const PREVIEW_PTS = 18, PREVIEW_DT = 0.035;

/** 당긴 정도 → 처음 속도. pull: 0~1 (세기), aim: 보는 방향 기준 좌우 각도(rad) */
export function launchVelocity(yaw: number, aim: number, pull: number) {
  const v = launchVec(yaw, aim, pull);
  return new THREE.Vector3(v.x, v.y, v.z);
}

export class CoinGame {
  group = new THREE.Group();
  private coin: THREE.Mesh;
  private ring: THREE.Mesh;
  private arc: THREE.Points;
  private target = new THREE.Group(); // 맨 위 접시 과녁: 바깥·가운데·정중앙 세 칸 (조준할 때·날아갈 때만)
  private zones: THREE.Mesh[] = [];
  private trail: THREE.Points;  // 날아가는 동전 꼬리
  private trailN = 0; private trailAt = 0;
  private p = new THREE.Vector3(); private v = new THREE.Vector3();
  private flying = false; private ringT = -1; private t = 0;
  /** 마지막으로 던진 곳·동전 위치 (카메라가 따라가게) */
  readonly from = new THREE.Vector3();
  get pos() { return this.p; }
  /** 떨어진 곳 (성공이면 "dish") */
  onLand?: (shot: Shot, at: THREE.Vector3) => void;

  constructor(private T: Targets) {
    // 멀리서도 보이게 크고 밝게
    this.coin = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 20), new THREE.MeshBasicMaterial({ color: "#ffd84a" }));
    // 물보라에 가려지지 않게 맨 위에 그림. 바깥(연노랑) · 가운데(주황) · 정중앙(빨강)
    const zone = (color: string) => { const m = new THREE.Mesh(new THREE.RingGeometry(0, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, depthTest: false })); m.renderOrder = 4; m.rotation.x = -Math.PI / 2; this.target.add(m); return m; };
    this.zones = [zone("#fff1a8"), zone("#ffb347"), zone("#ff5a5f")];
    this.setRings(0.25, 0.6);
    this.target.position.set(T.x, T.dish.y + 0.06, T.z);
    const tg = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 40 }, () => new THREE.Vector3()));
    this.trail = new THREE.Points(tg, new THREE.PointsMaterial({ color: "#ffe680", size: 0.1, transparent: true, opacity: 0.85, depthWrite: false }));
    this.trail.frustumCulled = false; this.target.visible = this.trail.visible = false;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.16, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true }));
    // 조준 중 날아갈 길 미리보기 (동글동글 점)
    const geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: PREVIEW_PTS }, () => new THREE.Vector3()));
    this.arc = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#fff6c8", size: 0.13, transparent: true, opacity: 0.95, depthTest: false }));
    this.arc.frustumCulled = false; this.arc.renderOrder = 5;
    this.coin.visible = this.ring.visible = this.arc.visible = false;
    this.group.add(this.coin, this.ring, this.arc, this.target, this.trail);
  }

  /** 축하 불꽃: 접시에서 금빛·분홍 반짝이가 솟았다 흩어짐. big 이면 (정중앙) 더 많이·높이 */
  private sparks = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(90 * 3), 3))
    .setAttribute("color", new THREE.BufferAttribute(new Float32Array(90 * 3), 3)),
    new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false, depthTest: false }));
  private sparkV = new Float32Array(90 * 3); private sparkT = -1; private sparkN = 0;
  burst(at: { x: number; y: number; z: number }, big: boolean) {
    if (!this.sparks.parent) { this.sparks.frustumCulled = false; this.sparks.renderOrder = 6; this.group.add(this.sparks); }
    const n = this.sparkN = big ? 90 : 30, pos = this.sparks.geometry.attributes.position as THREE.BufferAttribute, col = this.sparks.geometry.attributes.color as THREE.BufferAttribute;
    const gold = new THREE.Color("#ffd84a"), pink = new THREE.Color("#ff9ec0"), white = new THREE.Color("#fffbe8");
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, out = (big ? 1.6 : 0.9) * (0.4 + Math.random()), up = (big ? 6.5 : 3.6) * (0.6 + Math.random() * 0.6);
      pos.setXYZ(i, at.x, at.y + 0.05, at.z);
      this.sparkV.set([Math.cos(a) * out, i < n ? up : -99, Math.sin(a) * out], i * 3);
      const c = i % 3 === 0 ? white : i % 3 === 1 ? gold : big ? gold : pink; col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = col.needsUpdate = true;
    (this.sparks.material as THREE.PointsMaterial).size = big ? 0.2 : 0.14;
    this.sparks.visible = true; this.sparkT = 0;
  }

  /** 과녁 칸 크기 (접시 반지름에 대한 비율, 관리자 설정) */
  rings = { bull: 0.25, mid: 0.6 };
  setRings(bull: number, mid: number) {
    this.rings = { bull, mid };
    const r = this.T.dish.r, set = (m: THREE.Mesh, a: number, b: number) => { m.geometry.dispose(); m.geometry = new THREE.RingGeometry(a * r, b * r, 48); };
    set(this.zones[0], mid, 1.04); set(this.zones[1], bull, mid); set(this.zones[2], 0, bull);
  }

  /** 과녁·궤적 점 바로 숨기기 (성공 장면을 가리지 않게) */
  hideGuides() { this.trail.visible = false; this.target.visible = false; this.arc.visible = false; }

  /** 조준하는 동안 과녁 보이기 */
  showTarget(on: boolean) { this.target.visible = on; }

  get busy() { return this.flying; }

  /** 조준선 그리기 (null이면 숨김) */
  preview(from: THREE.Vector3 | null, vel?: THREE.Vector3) {
    this.arc.visible = !!from && !!vel;
    if (!from || !vel) return;
    const pos = this.arc.geometry.attributes.position as THREE.BufferAttribute;
    const end = simulate(this.T, from, vel, this.rings).t;
    for (let i = 0; i < pos.count; i++) { const p = posAt(from, vel, Math.min(i * PREVIEW_DT, end)); pos.setXYZ(i, p.x, p.y, p.z); }
    pos.needsUpdate = true;
  }

  /** 던지기: 서버가 계산해 준 결과(shot)대로 날아가 떨어짐 (화면 계산과 같은 식이라 궤적도 같음) */
  private shot: Shot | null = null; private ft = 0;
  launch(from: THREE.Vector3, vel: THREE.Vector3, shot: Shot) {
    this.p.copy(from); this.from.copy(from); this.v.copy(vel); this.shot = shot; this.ft = 0;
    this.flying = true; this.coin.visible = true; this.arc.visible = false;
    this.trailN = 0; this.trail.visible = true; this.target.visible = true;
  }

  update(dt: number) {
    this.t += dt;
    const blink = 0.55 + Math.sin(this.t * 5) * 0.25; // 깜빡깜빡
    if (this.target.visible) for (const z of this.zones) (z.material as THREE.MeshBasicMaterial).opacity = blink;
    if (this.flying && this.shot) {
      this.ft += dt;
      const s = this.shot;
      if (this.ft >= s.t) {
        this.flying = false; this.coin.visible = false; this.p.set(s.at.x, s.at.y, s.at.z);
        setTimeout(() => { if (!this.flying) { this.trail.visible = false; this.target.visible = false; } }, 1800);
        if (s.kind !== "ground") { this.ring.position.set(s.at.x, s.at.y + 0.02, s.at.z); this.ring.visible = true; this.ringT = 0; }
        this.onLand?.(s, this.p.clone());
      } else { const q = posAt(this.from, this.v, this.ft); this.p.set(q.x, q.y, q.z); }
      this.coin.position.copy(this.p); this.coin.rotation.x += dt * 18;
      // 꼬리: 지나온 자리를 점으로 남김 (어디로 날아갔는지 보이게, 떨어진 뒤에도 잠깐 남음)
      const tp = this.trail.geometry.attributes.position as THREE.BufferAttribute;
      if (this.t - this.trailAt >= 0.035) { // 점 간격 (프레임과 상관없이 고르게)
        this.trailAt = this.t;
        if (this.trailN < tp.count) { for (let i = this.trailN; i < tp.count; i++) tp.setXYZ(i, this.p.x, this.p.y, this.p.z); this.trailN++; }
        else { for (let i = 0; i < tp.count - 1; i++) tp.setXYZ(i, tp.getX(i + 1), tp.getY(i + 1), tp.getZ(i + 1)); tp.setXYZ(tp.count - 1, this.p.x, this.p.y, this.p.z); }
        tp.needsUpdate = true;
      }
    }
    if (this.sparkT >= 0) {
      this.sparkT += dt;
      const pos = this.sparks.geometry.attributes.position as THREE.BufferAttribute, life = this.sparkN > 30 ? 2.2 : 1.4;
      for (let i = 0; i < this.sparkN; i++) {
        this.sparkV[i * 3 + 1] -= 6 * dt; // 천천히 내려앉게 (중력보다 약하게)
        pos.setXYZ(i, pos.getX(i) + this.sparkV[i * 3] * dt, pos.getY(i) + this.sparkV[i * 3 + 1] * dt, pos.getZ(i) + this.sparkV[i * 3 + 2] * dt);
      }
      pos.needsUpdate = true;
      (this.sparks.material as THREE.PointsMaterial).opacity = Math.min(1, (life - this.sparkT) * 2);
      if (this.sparkT > life) { this.sparks.visible = false; this.sparkT = -1; }
    }
    if (this.ringT >= 0) {
      this.ringT += dt; const k = this.ringT / 0.7;
      this.ring.scale.setScalar(1 + k * 5); (this.ring.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      if (k >= 1) { this.ring.visible = false; this.ringT = -1; }
    }
  }
}
