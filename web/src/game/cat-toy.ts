// 고양이 낚싯대 장난감: 손에서 뻗은 막대 끝에 줄, 줄 끝에 분홍·하양 깃털 뭉치
import * as THREE from "three";

export class CatToy {
  group = new THREE.Group();
  private stick: THREE.Mesh;
  private line: THREE.Line;
  private feather = new THREE.Group();
  private t = 0;

  constructor() {
    this.stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 1, 6).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: "#c9a27a" }));
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: "#7a6a62" }));
    this.line.frustumCulled = false;
    // 깃털: 길쭉한 잎 모양 판 다섯 장을 부채꼴로
    const blade = new THREE.PlaneGeometry(0.05, 0.2).translate(0, 0.1, 0);
    ["#ff8fb3", "#ffffff", "#ffc2d4", "#ff8fb3", "#fff0a8"].forEach((c, i) => {
      const m = new THREE.Mesh(blade, new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }));
      m.rotation.z = (i - 2) * 0.35; m.rotation.y = i * 0.6;
      this.feather.add(m);
    });
    this.group.add(this.stick, this.line, this.feather);
    this.group.visible = false;
  }

  /** hand = 손 위치, tip = 깃털이 있을 곳(바닥 근처). 막대는 손에서 깃털 위쪽으로, 줄은 막대 끝에서 깃털까지 */
  set(hand: THREE.Vector3, tip: THREE.Vector3, dt: number) {
    this.t += dt;
    const end = new THREE.Vector3(tip.x, hand.y + 0.35, tip.z), dir = end.clone().sub(hand);
    this.stick.position.copy(hand); this.stick.scale.y = dir.length();
    this.stick.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const f = tip.clone().add(new THREE.Vector3(0, Math.abs(Math.sin(this.t * 7)) * 0.04, 0)); // 깃털이 살랑
    this.feather.position.copy(f); this.feather.rotation.y += dt * 2;
    const pos = this.line.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, end.x, end.y, end.z); pos.setXYZ(1, f.x, f.y + 0.18, f.z); pos.needsUpdate = true;
  }
  set visible(v: boolean) { this.group.visible = v; }
}
