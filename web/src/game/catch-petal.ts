// 잡을 수 있는 꽃잎: 가끔 내 바로 앞으로 반짝이며 떨어짐. 손 높이(빛나는 동안)에 누르면 잡힘.
import * as THREE from "three";

export const CATCH_LOW = 0.45, CATCH_HIGH = 1.9; // 이 높이 사이에서만 잡힘 (= 반짝이는 동안)

function glowTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d")!, g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,240,0.95)"); g.addColorStop(0.35, "rgba(255,214,228,0.6)"); g.addColorStop(1, "rgba(255,200,220,0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export class CatchPetal {
  group = new THREE.Group();
  active = false;
  private petal: THREE.Mesh;
  private glow: THREE.Sprite;
  private v = { x: 0, y: 0, z: 0, ph: 0 };
  private nextAt = 6 + Math.random() * 6;
  private scr = new THREE.Vector3();

  constructor(petalGeo: THREE.BufferGeometry) {
    this.petal = new THREE.Mesh(petalGeo, new THREE.MeshBasicMaterial({ color: "#ffb7cb", side: THREE.DoubleSide }));
    this.petal.scale.setScalar(2.4);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.group.add(this.glow, this.petal);
    this.group.visible = false;
  }

  /** 지금 잡을 수 있는 높이인지 */
  get catchable() { return this.active && this.group.position.y > CATCH_LOW && this.group.position.y < CATCH_HIGH; }

  update(t: number, dt: number, me: { x: number; z: number; yaw: number }, paused: boolean) {
    if (!this.active) {
      if (paused || t < this.nextAt) return;
      // 캐릭터 앞 1.6m, 좌우로 조금 흔들린 자리 위에서 시작
      const side = (Math.random() - 0.5) * 0.8, fx = Math.sin(me.yaw), fz = Math.cos(me.yaw);
      this.group.position.set(me.x + fx * 1.6 + fz * side, 3.6, me.z + fz * 1.6 - fx * side);
      this.v = { x: 0, y: 0.5, z: 0, ph: Math.random() * 6 };
      this.active = true; this.group.visible = true;
      return;
    }
    const p = this.group.position;
    p.y -= this.v.y * dt;
    p.x += Math.sin(t * 2.2 + this.v.ph) * 0.35 * dt;
    p.z += Math.cos(t * 1.7 + this.v.ph) * 0.25 * dt;
    this.petal.rotation.set(Math.sin(t * 3) * 0.8, t * 1.5, Math.cos(t * 2.4) * 0.6);
    // 잡을 수 있는 동안 크게 반짝
    const on = this.catchable;
    this.glow.scale.setScalar((on ? 0.9 + Math.sin(t * 10) * 0.12 : 0.45));
    this.glow.material.opacity = on ? 1 : 0.5;
    if (p.y < 0.03) this.end(t); // 땅에 닿으면 놓친 것
  }

  /** 화면상 거리(px)가 가까우면 true */
  hit(camera: THREE.Camera, rect: DOMRect, x: number, y: number, radius = 56) {
    if (!this.active) return false;
    this.scr.copy(this.group.position).project(camera);
    const sx = rect.left + (this.scr.x + 1) / 2 * rect.width, sy = rect.top + (1 - this.scr.y) / 2 * rect.height;
    return Math.hypot(sx - x, sy - y) < radius;
  }

  end(t: number) { this.active = false; this.group.visible = false; this.nextAt = t + 8 + Math.random() * 10; }
}
