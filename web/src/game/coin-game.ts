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
  private p = new THREE.Vector3(); private v = new THREE.Vector3(); private n = new THREE.Vector3();
  private flying = false; private ringT = -1;
  /** 떨어진 곳 (성공이면 "dish") */
  onLand?: (kind: Landing, at: THREE.Vector3) => void;

  constructor(private T: Targets) {
    this.coin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 18), new THREE.MeshBasicMaterial({ color: "#f2c94c" }));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.16, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true }));
    // 조준 중 날아갈 길 미리보기 (동글동글 점)
    const geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: PREVIEW_PTS }, () => new THREE.Vector3()));
    this.arc = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#fff6c8", size: 0.13, transparent: true, opacity: 0.95, depthTest: false }));
    this.arc.frustumCulled = false; this.arc.renderOrder = 5;
    this.coin.visible = this.ring.visible = this.arc.visible = false;
    this.group.add(this.coin, this.ring, this.arc);
  }

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
    this.p.copy(from); this.v.copy(vel); this.flying = true; this.coin.visible = true; this.arc.visible = false;
  }

  update(dt: number) {
    if (this.flying) {
      for (let s = 0; s < 3 && this.flying; s++) { // 빠른 동전이 접시를 뚫고 지나가지 않게 잘게 나눠서
        const h = dt / 3;
        this.n.copy(this.p).addScaledVector(this.v, h); this.v.y -= G * h;
        const hit = landing(this.T, this.p, this.n);
        this.p.copy(this.n);
        if (hit) {
          this.flying = false; this.coin.visible = false;
          const y = hit === "dish" ? this.T.dish.y : hit === "lower" ? this.T.lower.y : hit === "basin" ? this.T.basin.y : 0;
          this.p.y = y;
          if (hit !== "ground") { this.ring.position.set(this.p.x, y + 0.02, this.p.z); this.ring.visible = true; this.ringT = 0; }
          this.onLand?.(hit, this.p.clone());
        }
      }
      this.coin.position.copy(this.p); this.coin.rotation.x += dt * 18;
    }
    if (this.ringT >= 0) {
      this.ringT += dt; const k = this.ringT / 0.7;
      this.ring.scale.setScalar(1 + k * 5); (this.ring.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      if (k >= 1) { this.ring.visible = false; this.ringT = -1; }
    }
  }
}
