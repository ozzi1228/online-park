// 소원나무에 달린 쪽지들(분홍 꽃잎 모양) + 달 자리 고르기 + 분수 동전 연출
import * as THREE from "three";
import { PROP_S, WISH_CANOPY, WISH_TREE } from "./park-map";

export type TreeNote = { id: number; x: number; y: number; z: number; covered: boolean; mine: boolean; from: string | null; strokes: number[][] | null };

/** 가장 가까운 잎 덩어리 중심 → 바깥쪽 방향 */
const outward = (p: THREE.Vector3) => {
  let best = WISH_CANOPY[0], bd = Infinity;
  for (const c of WISH_CANOPY) { const d = Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) - c.r; if (d < bd) { bd = d; best = c; } }
  return new THREE.Vector3(p.x - best.x, p.y - best.y, p.z - best.z).normalize();
};

export class TreeNotes {
  group = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private notes: TreeNote[] = [];
  private ghost: THREE.Mesh;
  private d = new THREE.Object3D();
  private v = new THREE.Vector3();

  constructor(petalGeo: THREE.BufferGeometry, capacity = 3000) {
    const geo = petalGeo.clone().scale(2.6, 2.6, 1);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), capacity);
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.ghost = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    this.ghost.visible = false;
    this.group.add(this.mesh, this.ghost);
  }

  private orient(o: THREE.Object3D, p: THREE.Vector3, id: number) {
    const n = outward(p);
    o.position.copy(p).addScaledVector(n, 0.04);
    o.lookAt(o.position.clone().add(n));
    o.rotateZ(((id * 2.399) % 6.28) - 3.14); // 쪽지마다 살짝 다른 각도
  }

  set(list: TreeNote[]) {
    this.notes = list.slice(0, this.mesh.instanceMatrix.count);
    const col = new THREE.Color();
    this.notes.forEach((n, i) => {
      this.orient(this.d, this.v.set(n.x, n.y, n.z), n.id);
      this.d.updateMatrix(); this.mesh.setMatrixAt(i, this.d.matrix);
      // 공개 쪽지는 연분홍, 가린 쪽지는 두 장 겹친 진분홍
      this.mesh.setColorAt(i, col.set(n.covered ? "#f29bb5" : n.mine ? "#ffb3c8" : "#ffc9d8"));
    });
    this.mesh.count = this.notes.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** 화면에서 누른 곳의 쪽지 */
  pick(camera: THREE.Camera, rect: DOMRect, x: number, y: number) {
    let best: TreeNote | null = null, bd = 30;
    for (const n of this.notes) {
      this.v.set(n.x, n.y, n.z).project(camera);
      if (this.v.z > 1) continue;
      const d = Math.hypot(rect.left + (this.v.x + 1) / 2 * rect.width - x, rect.top + (1 - this.v.y) / 2 * rect.height - y);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  /** 누른 곳에서 나뭇가지(잎 덩어리) 겉면의 점 */
  canopyPoint(camera: THREE.Camera, rect: DOMRect, x: number, y: number) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1), camera);
    let best: THREE.Vector3 | null = null, bt = Infinity;
    for (const c of WISH_CANOPY) {
      const hit = ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(c.x, c.y, c.z), c.r), new THREE.Vector3());
      if (hit) { const t = hit.distanceTo(ray.ray.origin); if (t < bt) { bt = t; best = hit; } }
    }
    return best;
  }

  showGhost(p: THREE.Vector3 | null) {
    this.ghost.visible = !!p;
    if (p) this.orient(this.ghost, p, 0);
  }
}

/** 사다리 꼭대기 근처 (캐릭터가 올라가 서 있는 자리) */
export const LADDER_TOP = { x: WISH_TREE.x, y: 1.9 * PROP_S, z: WISH_TREE.z - 1.35 * PROP_S };

/** 분수 동전: 손에서 물로 포물선 → 물보라 */
export class CoinToss {
  group = new THREE.Group();
  private coin: THREE.Mesh;
  private ring: THREE.Mesh;
  private from = new THREE.Vector3(); private to = new THREE.Vector3();
  private t = -1;
  onSplash?: (at: THREE.Vector3) => void;

  constructor() {
    this.coin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 18), new THREE.MeshBasicMaterial({ color: "#f2c94c" }));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.16, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true }));
    this.coin.visible = this.ring.visible = false;
    this.group.add(this.coin, this.ring);
  }

  throw(from: THREE.Vector3, fountain: { x: number; z: number }) {
    const a = Math.random() * 6.28, r = Math.random() * 2.2 * PROP_S;
    this.from.copy(from); this.to.set(fountain.x + Math.cos(a) * r, 0.5 * PROP_S, fountain.z + Math.sin(a) * r);
    this.t = 0; this.coin.visible = true; this.ring.visible = false;
  }

  update(dt: number) {
    if (this.t < 0) return;
    this.t += dt;
    const FLY = 0.9, SPLASH = 0.7;
    if (this.t < FLY) {
      const k = this.t / FLY;
      this.coin.position.lerpVectors(this.from, this.to, k);
      this.coin.position.y += Math.sin(Math.PI * k) * 1.8; // 포물선
      this.coin.rotation.x += dt * 18;
    } else if (this.t < FLY + SPLASH) {
      if (this.coin.visible) { this.coin.visible = false; this.ring.visible = true; this.ring.position.copy(this.to).add(new THREE.Vector3(0, 0.02, 0)); this.onSplash?.(this.to); }
      const k = (this.t - FLY) / SPLASH;
      this.ring.scale.setScalar(1 + k * 5);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    } else { this.ring.visible = false; this.t = -1; }
  }
}
