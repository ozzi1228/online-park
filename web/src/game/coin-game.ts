// 분수 동전 게임: 새총처럼 당겨서 튕긴 동전이 맨 위 작은 접시에 들어가면 성공.
// 빗나간 동전은 아래 물에 떨어져 바닥에 남음 (사람들이 던지다 실패한 흔적)
import * as THREE from "three";
import type { fountainTargets } from "./fountain";

type Targets = ReturnType<typeof fountainTargets>;
export type Landing = "dish" | "lower" | "basin" | "ground";
const G = 9.8;
/** 조준선은 처음 0.5초만 (끝까지 보여 주면 너무 쉬움 — 나머지는 감으로) */
const PREVIEW_PTS = 18;

/** 당긴 정도 → 처음 속도. pull: 0~1 (세기), aim: 보는 방향 기준 좌우 각도(rad) */
export function launchVelocity(yaw: number, aim: number, pull: number) {
  const speed = 4 + pull * 8, up = 0.95; // 약 54° 위로
  const a = yaw + aim, h = speed * Math.cos(up);
  return new THREE.Vector3(Math.sin(a) * h, speed * Math.sin(up), Math.cos(a) * h);
}

/** 다음 위치까지 가는 사이 어디에 떨어졌는지 (내려가면서 물 높이를 지날 때만) */
function landing(T: Targets, p: THREE.Vector3, n: THREE.Vector3): Landing | null {
  if (n.y >= p.y) return null;
  const at = (y: number, r: number) => {
    if (!(p.y >= y && n.y < y)) return false;
    const k = (p.y - y) / (p.y - n.y), x = p.x + (n.x - p.x) * k, z = p.z + (n.z - p.z) * k;
    return Math.hypot(x - T.x, z - T.z) < r;
  };
  if (at(T.dish.y, T.dish.r)) return "dish";
  if (at(T.lower.y, T.lower.r)) return "lower";
  if (at(T.basin.y, T.basin.r)) return "basin";
  if (n.y < 0) return "ground";
  return null;
}

export class CoinGame {
  group = new THREE.Group();
  private coin: THREE.Mesh;
  private ring: THREE.Mesh;
  private arc: THREE.Points;
  private target: THREE.Mesh;   // 맨 위 접시 테두리에 빛나는 과녁 (조준할 때만)
  private trail: THREE.Points;  // 날아가는 동전 꼬리
  private trailN = 0; private trailAt = 0;
  private p = new THREE.Vector3(); private v = new THREE.Vector3(); private n = new THREE.Vector3();
  private flying = false; private ringT = -1; private t = 0;
  /** 마지막으로 던진 곳·동전 위치 (카메라가 따라가게) */
  readonly from = new THREE.Vector3();
  get pos() { return this.p; }
  /** 떨어진 곳 (성공이면 "dish") */
  onLand?: (kind: Landing, at: THREE.Vector3) => void;

  constructor(private T: Targets) {
    // 멀리서도 보이게 크고 밝게
    this.coin = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 20), new THREE.MeshBasicMaterial({ color: "#ffd84a" }));
    this.target = new THREE.Mesh(new THREE.RingGeometry(T.dish.r - 0.2, T.dish.r + 0.08, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#ffd21f", transparent: true, opacity: 0.9, depthWrite: false, depthTest: false })); // 물보라에 가려지지 않게
    this.target.position.set(T.x, T.dish.y + 0.06, T.z); this.target.renderOrder = 4;
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

  /** 조준하는 동안 과녁 보이기 */
  showTarget(on: boolean) { this.target.visible = on; }

  get busy() { return this.flying; }

  /** 조준선 그리기 (null이면 숨김) */
  preview(from: THREE.Vector3 | null, vel?: THREE.Vector3) {
    this.arc.visible = !!from && !!vel;
    if (!from || !vel) return;
    const pos = this.arc.geometry.attributes.position as THREE.BufferAttribute;
    const p = from.clone(), v = vel.clone(), n = new THREE.Vector3();
    let i = 0;
    for (; i < pos.count; i++) {
      pos.setXYZ(i, p.x, p.y, p.z);
      n.copy(p).addScaledVector(v, 0.035); v.y -= G * 0.035;
      if (landing(this.T, p, n)) { i++; pos.setXYZ(Math.min(i, pos.count - 1), n.x, n.y, n.z); break; }
      p.copy(n);
    }
    for (let j = i + 1; j < pos.count; j++) pos.setXYZ(j, p.x, p.y, p.z);
    pos.needsUpdate = true;
  }

  launch(from: THREE.Vector3, vel: THREE.Vector3) {
    this.p.copy(from); this.from.copy(from); this.v.copy(vel); this.flying = true; this.coin.visible = true; this.arc.visible = false;
    this.trailN = 0; this.trail.visible = true; this.target.visible = true;
  }

  update(dt: number) {
    this.t += dt;
    if (this.target.visible) (this.target.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(this.t * 5) * 0.3; // 깜빡깜빡
    if (this.flying) {
      for (let s = 0; s < 3 && this.flying; s++) { // 빠른 동전이 접시를 뚫고 지나가지 않게 잘게 나눠서
        const h = dt / 3;
        this.n.copy(this.p).addScaledVector(this.v, h); this.v.y -= G * h;
        const hit = landing(this.T, this.p, this.n);
        this.p.copy(this.n);
        if (hit) {
          this.flying = false; this.coin.visible = false;
          setTimeout(() => { if (!this.flying) { this.trail.visible = false; this.target.visible = false; } }, 1800);
          const y = hit === "dish" ? this.T.dish.y : hit === "lower" ? this.T.lower.y : hit === "basin" ? this.T.basin.y : 0;
          this.p.y = y;
          if (hit !== "ground") { this.ring.position.set(this.p.x, y + 0.02, this.p.z); this.ring.visible = true; this.ringT = 0; }
          this.onLand?.(hit, this.p.clone());
        }
      }
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
    if (this.ringT >= 0) {
      this.ringT += dt; const k = this.ringT / 0.7;
      this.ring.scale.setScalar(1 + k * 5); (this.ring.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      if (k >= 1) { this.ring.visible = false; this.ringT = -1; }
    }
  }
}
