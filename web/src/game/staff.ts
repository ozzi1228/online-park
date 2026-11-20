// 창구 직원 (안내원·매점 직원): 창구 안 단 위에 서서, 다가오면 바라보고 활짝 웃으며 목인사
import * as THREE from "three";
import { animateChar, faceTexture, makeChar } from "./character";
import type { Preset } from "./presets";

const smooth = (x: number) => x * x * (3 - 2 * x);

export class Staff {
  char: ReturnType<typeof makeChar>;
  private grin: THREE.CanvasTexture;
  private plain: THREE.CanvasTexture;
  private bowAt = -1;

  /** y = 창턱 위로 가슴부터 보이게 올린 높이, yaw = 창구가 바라보는 쪽 */
  constructor(look: Preset, public x: number, public z: number, public y: number, public yaw: number) {
    this.char = makeChar(look);
    this.char.root.position.set(x, y, z); this.char.root.rotation.y = yaw;
    this.grin = faceTexture({ ...look, smile: true }, false, true);
    this.plain = this.char.texOpen;
  }

  /** 반환값: 이번에 새로 인사했으면 true */
  update(t: number, dt: number, px: number, pz: number) {
    const c = this.char, d = Math.hypot(px - this.x, pz - this.z);
    // 창구 안이라 몸은 조금만 돌림
    const rel = Math.atan2(Math.sin(Math.atan2(px - this.x, pz - this.z) - this.yaw), Math.cos(Math.atan2(px - this.x, pz - this.z) - this.yaw));
    const want = this.yaw + (d < 8 ? THREE.MathUtils.clamp(rel, -0.7, 0.7) : 0);
    c.root.rotation.y += Math.atan2(Math.sin(want - c.root.rotation.y), Math.cos(want - c.root.rotation.y)) * (1 - Math.exp(-dt * 4));
    animateChar(c, t, dt, "idle");
    let greeted = false;
    if (d < 5.5 && this.bowAt < 0) { this.bowAt = t; c.texOpen = this.grin; greeted = true; }
    else if (d > 9) this.bowAt = -1; // 멀어졌다 다시 오면 또 인사
    const bt = this.bowAt < 0 ? 99 : t - this.bowAt - 0.25; // 고개를 돌릴 틈을 조금 두고 숙임
    const bow = bt < 0 ? 0 : bt < 0.4 ? smooth(bt / 0.4) : bt < 0.9 ? 1 : bt < 1.6 ? 1 - smooth((bt - 0.9) / 0.7) : 0;
    if (bow > 0) { c.head.rotation.x = 0.42 * bow; c.body.rotation.x = 0.1 * bow; c.faceMat.map = c.texOpen; }
    else if (c.body.rotation.x) c.body.rotation.x = 0;
    if (bt > 3.2 && c.texOpen === this.grin) c.texOpen = this.plain; // 인사 뒤엔 잔잔한 미소로
    return greeted;
  }
}
