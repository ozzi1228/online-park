// 봄(벚꽃) 테마로 공원 배치를 그림. 다른 계절은 같은 배치를 다른 모델로 그리는 파일을 추가하면 됨.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { OUTLINE, at, part, toon, toonGradient } from "./character";
import { BACKDROP_TREES, BOUNDS, PATHS, PLAZA, PROPS, type Prop } from "./park-map";

export type Quality = { cards: number; groundPetals: number; fallingPetals: number; shadow: number; pixelRatio: number };
export const QUALITY_HIGH: Quality = { cards: 85, groundPetals: 6000, fallingPetals: 600, shadow: 2048, pixelRatio: 2 };
export const QUALITY_LOW: Quality = { cards: 45, groundPetals: 2500, fallingPetals: 300, shadow: 1024, pixelRatio: 1.5 };

const PINKS = ["#f9c6d4", "#f4adc2", "#fbd8e1"];
const BARK = "#7d5646", WOOD = "#cf9f73", STONE = "#e8dccb", CREAM = "#fff3e6";

// ---------- 정적 물체 합치기: 수백 개 부품을 색 정보 담은 메시 몇 개로 (그리기 호출 수 줄이기) ----------
function bake(root: THREE.Object3D, castShadow = true) {
  root.updateMatrixWorld(true);
  const fills: THREE.BufferGeometry[] = [], lines = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const g = o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    g.applyMatrix4(o.matrixWorld);
    const m = o.material as THREE.MeshBasicMaterial;
    if (m.side === THREE.BackSide) { if (!lines.has(m)) lines.set(m, []); lines.get(m)!.push(g); return; }
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = m.color.r; c[i * 3 + 1] = m.color.g; c[i * 3 + 2] = m.color.b; }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    fills.push(g);
  });
  const group = new THREE.Group();
  if (fills.length) {
    const mesh = new THREE.Mesh(mergeGeometries(fills), new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }));
    mesh.castShadow = castShadow; mesh.receiveShadow = true; group.add(mesh);
  }
  for (const [mat, gs] of lines) group.add(new THREE.Mesh(mergeGeometries(gs), mat));
  root.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  return group;
}

// ---------- 텍스처 ----------
function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// 가운데 분홍 → 끝 흰색인 다섯 잎 꽃 여러 송이
const blossomTexture = () => canvasTex(256, 256, (x) => {
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * 92;
    const cx = 128 + Math.cos(a) * d, cy = 128 + Math.sin(a) * d, s = 16 + Math.random() * 14, rot = Math.random() * 6.28;
    const gr = x.createRadialGradient(cx, cy, 0, cx, cy, s * 1.2);
    gr.addColorStop(0, "#ff9fbb"); gr.addColorStop(0.45, "#ffe3eb"); gr.addColorStop(1, "#ffffff");
    for (let k = 0; k < 5; k++) {
      const pa = rot + k * 1.2566;
      x.save(); x.translate(cx + Math.cos(pa) * s * 0.55, cy + Math.sin(pa) * s * 0.55); x.rotate(pa);
      x.fillStyle = gr; x.beginPath(); x.ellipse(0, 0, s * 0.6, s * 0.42, 0, 0, 7); x.fill();
      x.globalCompositeOperation = "destination-out"; x.beginPath(); x.arc(s * 0.62, 0, s * 0.1, 0, 7); x.fill();
      x.restore(); x.globalCompositeOperation = "source-over";
    }
    x.fillStyle = "#e8628a"; x.beginPath(); x.arc(cx, cy, s * 0.13, 0, 7); x.fill();
  }
});
// 초록 소원나무 잎 덩어리
const leafTexture = () => canvasTex(256, 256, (x) => {
  for (let i = 0; i < 28; i++) {
    const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * 95, s = 14 + Math.random() * 12;
    x.save(); x.translate(128 + Math.cos(a) * d, 128 + Math.sin(a) * d); x.rotate(Math.random() * 6.28);
    x.fillStyle = Math.random() < 0.5 ? "#ffffff" : "#e6efe0";
    x.beginPath(); x.ellipse(0, 0, s, s * 0.55, 0, 0, 7); x.fill();
    x.strokeStyle = "rgba(90,120,80,0.35)"; x.lineWidth = 2; x.beginPath(); x.moveTo(-s * 0.8, 0); x.lineTo(s * 0.8, 0); x.stroke();
    x.restore();
  }
});
function signTex(text: string, bg: string, fg = "#6b4450") {
  return canvasTex(512, 160, (x) => {
    x.fillStyle = bg; x.beginPath(); x.roundRect(4, 4, 504, 152, 36); x.fill();
    x.strokeStyle = "#5a3a30"; x.lineWidth = 6; x.stroke();
    x.fillStyle = fg; x.font = "bold 84px 'Gowun Dodum', 'Malgun Gothic', sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(text, 256, 86);
  });
}
const sign = (text: string, w: number, bg: string) =>
  new THREE.Mesh(new THREE.PlaneGeometry(w, w * 160 / 512), new THREE.MeshToonMaterial({ map: signTex(text, bg), gradientMap: toonGradient() }));

// ---------- 나무 ----------
type Spot = { c: THREE.Vector3; r: number; top: number; k: number };
function cherryTree(p: Extract<Prop, { kind: "tree" }>, spots: Spot[], density: number) {
  // 사람이 밑으로 걸어 다니는 벚꽃 터널: 꽃 아랫면이 약 2.6m
  const g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.scale.setScalar(p.s); g.rotation.y = (p.x * 13.7 + p.z * 7.1) % 6.28;
  const FORK = 2.4;
  g.add(at(part(new THREE.CylinderGeometry(0.16, 0.24, FORK + 0.2, 8), BARK, 0.02), 0, (FORK + 0.2) / 2, 0));
  const puffs: [THREE.Vector3, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.sin(i * 7 + p.x) * 0.5, tilt = 0.75 + ((i * 37 + p.z) % 4) / 10, len = 1.7 + ((i * 13) % 5) / 10;
    const b = part(new THREE.CylinderGeometry(0.02, 0.1, len, 6, 1, true), BARK, 0.016);
    const dir = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    b.position.set(0, FORK, 0).addScaledVector(dir, len / 2); g.add(b);
    puffs.push([new THREE.Vector3(0, FORK + 0.25, 0).addScaledVector(dir, len * 0.95), 0.85 + (i % 3) * 0.1]);
    puffs.push([new THREE.Vector3(0, FORK + 0.55, 0).addScaledVector(dir, len * 0.5), 0.7]);
  }
  puffs.push([new THREE.Vector3(0, FORK + 1.6, 0), 1.0]);
  g.updateMatrixWorld(true);
  for (const [c, r] of puffs) spots.push({ c: g.localToWorld(c.clone()), r: r * p.s, top: (FORK + 1.3) * p.s, k: density });
  return g;
}

// 꽃송이 카드. 24m 구역별로 나눠야 화면 밖 구역을 통째로 건너뜀 (하나로 묶으면 항상 전부 그림)
function cards(spots: Spot[], tex: THREE.Texture, dark: string, light: string, sunDir: THREE.Vector3, castShadow: boolean) {
  const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide });
  // 카메라 1.6m 안의 꽃은 안 그림 → 꽃 속을 지나갈 때 화면이 분홍으로 덮이지 않음
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vCamDist;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvCamDist = -mvPosition.z;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vCamDist;")
      .replace("void main() {", "void main() {\n  if (vCamDist < 1.6) discard;");
  };
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.4 });
  const plane = new THREE.PlaneGeometry(1, 1);
  const buckets = new Map<string, Spot[]>();
  for (const s of spots) {
    const key = `${Math.floor(s.c.x / 24)},${Math.floor(s.c.z / 24)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    const b = buckets.get(key)!;
    for (let i = Math.round(s.r * s.r * s.k); i > 0; i--) b.push(s);
  }
  const group = new THREE.Group();
  const d = new THREE.Object3D(), u = new THREE.Vector3(), cd = new THREE.Color(dark), cl = new THREE.Color(light), col = new THREE.Color();
  for (const list of buckets.values()) {
    const mesh = new THREE.InstancedMesh(plane, mat, list.length);
    mesh.castShadow = castShadow; mesh.customDepthMaterial = depth;
    list.forEach((s, i) => {
      u.randomDirection(); if (u.y < -0.5) u.y *= 0.4; u.normalize();
      const dep = 0.3 + Math.sqrt(Math.random()) * 0.75;
      d.position.copy(s.c).addScaledVector(u, s.r * dep);
      d.lookAt(d.position.clone().add(u)); d.rotateZ(Math.random() * 6.28); d.rotateX((Math.random() - 0.5) * 1.2);
      d.scale.setScalar(s.r * (0.6 + Math.random() * 0.45));
      d.updateMatrix(); mesh.setMatrixAt(i, d.matrix);
      const l = THREE.MathUtils.clamp((u.dot(sunDir) * 0.5 + 0.5) * (0.4 + dep * 0.7) + (d.position.y - s.top) * 0.12, 0, 1);
      mesh.setColorAt(i, col.copy(cd).lerp(cl, Math.pow(l, 0.8) * (0.85 + Math.random() * 0.15)));
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}

// ---------- 소품 ----------
function buildProp(p: Prop, root: THREE.Group, extras: THREE.Group, leafSpots: Spot[]) {
  const g = new THREE.Group(); g.position.set(p.x, 0, p.z); if (p.kind !== "tree") g.rotation.y = p.yaw;
  const box = (w: number, h: number, d: number, c: string, x: number, y: number, z: number, t = 0.02) => g.add(at(part(new THREE.BoxGeometry(w, h, d), c, t), x, y, z));
  const cyl = (rt: number, rb: number, h: number, c: string, x: number, y: number, z: number, seg = 12, t = 0.02) => g.add(at(part(new THREE.CylinderGeometry(rt, rb, h, seg), c, t), x, y, z));
  const addSign = (text: string, w: number, bg: string, x: number, y: number, z: number, yaw = 0) => {
    const s = sign(text, w, bg); s.position.set(x, y, z); s.rotation.y = yaw; g.add(s);
  };
  switch (p.kind) {
    case "bench":
      box(1.5, 0.08, 0.42, WOOD, 0, 0.44, 0); box(1.5, 0.3, 0.06, WOOD, 0, 0.72, -0.2);
      for (const sx of [-0.65, 0.65]) for (const sz of [-0.15, 0.15]) box(0.07, 0.44, 0.07, BARK, sx, 0.22, sz);
      break;
    case "lamp":
      cyl(0.05, 0.08, 3, "#5a4a52", 0, 1.5, 0, 8); g.add(at(part(new THREE.SphereGeometry(0.2, 16, 12), "#fff6dc"), 0, 3.1, 0));
      break;
    case "gate":
      for (const s of [-1, 1]) box(0.7, 3.2, 0.7, STONE, 0, 1.6, s * 2.2);
      box(0.5, 0.45, 5.4, "#f4adc2", 0, 3.3, 0);
      addSign("벚꽃 공원", 2.6, CREAM, -0.27, 2.6, 0, -Math.PI / 2);
      break;
    case "booth":
      box(3.2, 2.4, 2.4, CREAM, 0, 1.2, 0);
      g.add(at(part(new THREE.ConeGeometry(2.6, 1.1, 4).rotateY(Math.PI / 4), "#e98aa0", 0.025), 0, 2.95, 0));
      box(1.9, 0.9, 0.08, "#bfe0f2", 0, 1.45, 1.2);   // 창구
      box(2.2, 0.1, 0.4, WOOD, 0, 0.95, 1.35);        // 받침대
      addSign("안내소", 1.8, "#fbd8e1", 0, 2.2, 1.22);
      break;
    case "kiosk":
      box(4, 2.6, 3, "#fff6d6", 0, 1.3, 0);
      box(4.4, 0.12, 3.4, "#f4adc2", 0, 2.66, 0);
      g.add(at(part(new THREE.BoxGeometry(4.2, 0.1, 1.1), "#f4adc2"), 0, 2.2, 1.9)).children.at(-1)!.rotation.x = 0.35; // 차양
      box(2.6, 1, 0.08, "#bfe0f2", 0, 1.4, 1.5);
      box(3, 0.1, 0.45, WOOD, 0, 0.95, 1.7);
      addSign("매점", 1.6, "#fff6d6", 0, 3.05, 1.52);
      break;
    case "pavilion":
      for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) cyl(0.13, 0.15, 2.6, "#8a4b3a", dx, 1.3, dz, 10);
      box(4.8, 0.12, 4.8, WOOD, 0, 0.06, 0, 0.015);
      box(4.6, 0.25, 4.6, "#8a4b3a", 0, 2.7, 0);
      g.add(at(part(new THREE.ConeGeometry(4.3, 1.5, 4).rotateY(Math.PI / 4), "#6f9c86", 0.03), 0, 3.55, 0));
      g.add(at(part(new THREE.SphereGeometry(0.18, 12, 8), "#e9c46a"), 0, 4.35, 0));
      break;
    case "fountain": {
      cyl(3, 3.1, 0.5, STONE, 0, 0.25, 0, 40, 0.025);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 2.75, 0.06, 40), new THREE.MeshToonMaterial({ color: "#9fd6ee", gradientMap: toonGradient() }));
      water.position.y = 0.48; extras.add(at(water, p.x, 0.48, p.z));
      cyl(0.35, 0.5, 1.4, STONE, 0, 0.9, 0, 20);
      cyl(1.1, 0.4, 0.3, STONE, 0, 1.65, 0, 28);
      // 물줄기: 위로 솟았다 떨어지는 반투명 기둥 (update에서 출렁임)
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.22, 1.2, 12, 1, true), new THREE.MeshBasicMaterial({ color: "#eaf7ff", transparent: true, opacity: 0.7 }));
      jet.position.set(p.x, 2.3, p.z); jet.name = "jet"; extras.add(jet);
      break;
    }
    case "wishTree": {
      g.add(at(part(new THREE.CylinderGeometry(0.35, 0.55, 2.4, 10), BARK, 0.025), 0, 1.2, 0));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * 6.28 + 0.4, dir = new THREE.Vector3(Math.cos(a) * 0.7, 0.75, Math.sin(a) * 0.7).normalize();
        const b = part(new THREE.CylinderGeometry(0.05, 0.16, 2, 7, 1, true), BARK, 0.02);
        b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); b.position.set(0, 2.2, 0).addScaledVector(dir, 1); g.add(b);
        leafSpots.push({ c: new THREE.Vector3(p.x, 0, p.z).add(new THREE.Vector3(0, 2.2, 0).addScaledVector(dir, 1.9)), r: 1.15, top: 3.6, k: 80 });
      }
      leafSpots.push({ c: new THREE.Vector3(p.x, 4.1, p.z), r: 1.4, top: 3.6, k: 80 });
      // 사다리 (앞쪽에 기대어 둠)
      const lad = new THREE.Group(); lad.position.set(0, 0, -1.0); lad.rotation.x = 0.25;
      for (const s of [-1, 1]) lad.add(at(part(new THREE.BoxGeometry(0.06, 3.2, 0.06), WOOD), s * 0.25, 1.55, 0));
      for (let i = 0; i < 8; i++) lad.add(at(part(new THREE.BoxGeometry(0.5, 0.05, 0.05), WOOD), 0, 0.3 + i * 0.38, 0));
      g.add(lad);
      break;
    }
  }
  root.add(g);
}

// ---------- 전체 ----------
export function buildWorld(scene: THREE.Scene, q: Quality) {
  scene.background = canvasTex(2, 256, (x) => {
    const gr = x.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, "#9fd2f2"); gr.addColorStop(0.55, "#d9ecf6"); gr.addColorStop(1, "#fbe3ea");
    x.fillStyle = gr; x.fillRect(0, 0, 2, 256);
  });
  scene.fog = new THREE.Fog(0xf7e3ea, 30, 110);

  scene.add(new THREE.HemisphereLight(0xfff4ea, 0xc3b0e0, 1.3));
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.2);
  const SUN_OFFSET = new THREE.Vector3(12, 22, 14);
  sun.castShadow = true; sun.shadow.mapSize.set(q.shadow, q.shadow);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 70 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const sunDir = SUN_OFFSET.clone().normalize();

  // 땅·길·광장
  const flat = (geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, rotY = 0) => {
    const m = new THREE.Mesh(geo, toon(color)); m.rotation.set(-Math.PI / 2, 0, rotY); m.position.set(x, y, z); m.receiveShadow = true; scene.add(m); return m;
  };
  flat(new THREE.PlaneGeometry(400, 138), "#c6e5a9", 0, 0, 61); // 강둑(z=-8)부터 남쪽으로
  for (const p of PATHS) {
    const len = Math.hypot(p.x2 - p.x1, p.z2 - p.z1);
    flat(new THREE.PlaneGeometry(len, p.w), "#f4e7d6", (p.x1 + p.x2) / 2, 0.006, (p.z1 + p.z2) / 2, -Math.atan2(p.z2 - p.z1, p.x2 - p.x1));
  }
  flat(new THREE.CircleGeometry(PLAZA.r, 48), "#efe0cc", PLAZA.x, 0.008, PLAZA.z);
  flat(new THREE.RingGeometry(PLAZA.r - 0.25, PLAZA.r, 48), "#e2cfb6", PLAZA.x, 0.01, PLAZA.z);

  // 강: 둑 → 물 → 건너편 → 도시 실루엣
  flat(new THREE.PlaneGeometry(400, 0.6), "#e9dccb", 0, 0.012, -7.9);
  const bank = new THREE.Mesh(new THREE.PlaneGeometry(400, 0.8), toon("#d8c8b4")); bank.position.set(0, -0.4, -8.2); scene.add(bank);
  const water = flat(new THREE.PlaneGeometry(400, 32), "#a3d8ef", 0, -0.75, -24.2);
  flat(new THREE.PlaneGeometry(400, 30), "#bfdea2", 0, -0.3, -55);
  {
    const city = new THREE.Group();
    for (let x = -150; x <= 150; x += 6 + Math.random() * 5) {
      const h = 8 + Math.random() * 26, w = 5 + Math.random() * 5;
      city.add(at(part(new THREE.BoxGeometry(w, h, 5), ["#cfc6e2", "#d9cfe8", "#c4cbe3"][Math.floor(Math.random() * 3)], 0), x, h / 2 - 0.3, -66 - Math.random() * 10));
    }
    scene.add(bake(city, false));
  }

  // 난간 (강 쪽 경계)
  {
    const r = new THREE.Group();
    for (let x = -64; x <= 64; x += 2.5) r.add(at(part(new THREE.BoxGeometry(0.08, 0.9, 0.08), "#9c8070", 0.012), x, 0.45, BOUNDS.minZ - 0.25));
    r.add(at(part(new THREE.BoxGeometry(128, 0.07, 0.07), "#9c8070", 0.012), 0, 0.9, BOUNDS.minZ - 0.25));
    scene.add(bake(r));
  }

  // 나무·소품
  const spots: Spot[] = [], leafSpots: Spot[] = [];
  const statics = new THREE.Group(), extras = new THREE.Group();
  for (const p of [...PROPS, ...BACKDROP_TREES]) {
    if (p.kind === "tree") statics.add(cherryTree(p, spots, p.inside ? q.cards : q.cards * 0.35));
    else buildProp(p, statics, extras, leafSpots);
  }
  // 간판·물 같은 텍스처 붙은 물체는 합치지 않고 따로
  const keep: THREE.Object3D[] = [];
  statics.traverse((o) => { if (o instanceof THREE.Mesh && (o.material as THREE.MeshToonMaterial).map) keep.push(o); });
  for (const o of keep) { o.updateWorldMatrix(true, false); const w = o.matrixWorld.clone(); o.removeFromParent(); w.decompose(o.position, o.quaternion, o.scale); extras.add(o); }
  scene.add(bake(statics), extras);
  const btex = blossomTexture();
  scene.add(cards(spots.filter((s) => s.k === q.cards), btex, "#d9819d", "#fff6f8", sunDir, true));
  scene.add(cards(spots.filter((s) => s.k !== q.cards), btex, "#d9819d", "#fff6f8", sunDir, false)); // 맵 밖 나무는 그림자 없이
  scene.add(cards(leafSpots, leafTexture(), "#3f7a4f", "#bfe3a0", sunDir, true));

  // 바닥에 쌓인 꽃잎 (나무 밑일수록 많이)
  const petalShape = new THREE.Shape();
  petalShape.moveTo(0, 0); petalShape.bezierCurveTo(-0.06, 0.03, -0.07, 0.09, -0.03, 0.12);
  petalShape.lineTo(0, 0.104); petalShape.lineTo(0.03, 0.12); petalShape.bezierCurveTo(0.07, 0.09, 0.06, 0.03, 0, 0);
  const petalGeo = new THREE.ShapeGeometry(petalShape).translate(0, -0.06, 0);
  const petalMat = new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: toonGradient(), side: THREE.DoubleSide });
  const inside = PROPS.filter((p) => p.kind === "tree");
  const d = new THREE.Object3D(), col = new THREE.Color();
  const ground = new THREE.InstancedMesh(petalGeo, petalMat, q.groundPetals);
  ground.receiveShadow = true;
  for (let i = 0; i < q.groundPetals; i++) {
    const t = inside[Math.floor(Math.random() * inside.length)];
    const r = Math.abs(Math.random() + Math.random() + Math.random() - 1.5) * 3.6, a = Math.random() * 6.28;
    d.position.set(t.x + Math.cos(a) * r, 0.016, t.z + Math.sin(a) * r);
    d.rotation.set(-Math.PI / 2, 0, Math.random() * 6.28); d.scale.setScalar(0.8 + Math.random() * 0.6);
    d.updateMatrix(); ground.setMatrixAt(i, d.matrix); ground.setColorAt(i, col.set(PINKS[i % 3]));
  }
  scene.add(ground);

  // 떨어지는 꽃잎: 내 주변에서만 (멀리 있는 건 안 보이니까)
  const falling = new THREE.InstancedMesh(petalGeo, petalMat, q.fallingPetals);
  falling.frustumCulled = false;
  const fp = Array.from({ length: q.fallingPetals }, (_, i) => {
    falling.setColorAt(i, col.set(PINKS[i % 3]));
    return { x: (Math.random() - 0.5) * 30, y: Math.random() * 5, z: (Math.random() - 0.5) * 30, v: 0.35 + Math.random() * 0.35, ph: Math.random() * 6.28, sp: 1 + Math.random() * 2 };
  });
  scene.add(falling);

  const jet = extras.getObjectByName("jet");

  return {
    /** focus = 내 캐릭터 위치. 그림자·꽃잎이 주변을 따라옴 */
    update(t: number, dt: number, focus: THREE.Vector3) {
      sun.position.copy(focus).add(SUN_OFFSET); sun.target.position.copy(focus);
      const wind = 0.4 + Math.max(0, Math.sin(t * 0.25)) ** 4 * 1.6; // 가끔 바람이 셈
      for (let i = 0; i < fp.length; i++) {
        const p = fp[i];
        p.y -= p.v * dt;
        p.x += (Math.sin(t * p.sp + p.ph) * 0.35 + wind) * dt;
        p.z += Math.cos(t * p.sp * 0.7 + p.ph) * 0.2 * dt;
        // 내 주변 30m 상자 안에서 돌고 돌게
        if (p.y < 0.02) { p.y = 3.5 + Math.random() * 2; p.x = (Math.random() - 0.5) * 30; p.z = (Math.random() - 0.5) * 30; }
        if (p.x > 15) p.x -= 30;
        d.position.set(focus.x + p.x, p.y, focus.z + p.z);
        d.rotation.set(t * p.sp + p.ph, t * 0.7 + p.ph, Math.sin(t * p.sp) * 0.8);
        d.scale.setScalar(1); d.updateMatrix(); falling.setMatrixAt(i, d.matrix);
      }
      falling.instanceMatrix.needsUpdate = true;
      (water.material as THREE.MeshToonMaterial).color.setHSL(0.55, 0.62, 0.79 + Math.sin(t * 1.3) * 0.01);
      if (jet) jet.scale.y = 1 + Math.sin(t * 6) * 0.08;
      return wind;
    },
  };
}

export { OUTLINE };
