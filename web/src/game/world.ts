// 봄(벚꽃) 테마로 공원 배치를 그림. 다른 계절은 같은 배치를 다른 모델로 그리는 파일을 추가하면 됨.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { OUTLINE, at, part, toon, toonGradient } from "./character";
import { BACKDROP_TREES, BOUNDS, PATHS, PAVILION, PLAZA, PROPS, PROP_S, pavilionCorner, type Prop } from "./park-map";

export type Quality = { cards: number; groundPetals: number; fallingPetals: number; shadow: number; pixelRatio: number };
export const QUALITY_HIGH: Quality = { cards: 38, groundPetals: 16000, fallingPetals: 900, shadow: 2048, pixelRatio: 2 };
export const QUALITY_LOW: Quality = { cards: 20, groundPetals: 7000, fallingPetals: 400, shadow: 1024, pixelRatio: 1.5 };

const PINKS = ["#f9c6d4", "#f4adc2", "#fbd8e1"];
const BARK = "#7d5646", WOOD = "#cf9f73", STONE = "#e8dccb";

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
const sign = (text: string, w: number, bg: string, fg?: string) =>
  new THREE.Mesh(new THREE.PlaneGeometry(w, w * 160 / 512), new THREE.MeshToonMaterial({ map: signTex(text, bg, fg), gradientMap: toonGradient() }));

// ---------- 나무 ----------
type Spot = { c: THREE.Vector3; r: number; top: number; k: number };
function cherryTree(p: Extract<Prop, { kind: "tree" }>, spots: Spot[], density: number) {
  // 거대한 왕벚나무: 굵은 줄기가 3m쯤에서 갈라져 옆으로 넓게 뻗음. 꽃 아랫면 ≈ 3m, 폭 ≈ 11m, 높이 ≈ 9m
  const g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.scale.setScalar(p.s); g.rotation.y = (p.x * 13.7 + p.z * 7.1) % 6.28;
  let n = Math.floor(Math.abs(Math.sin(p.x * 12.9898 + p.z * 78.233)) * 2147483646) + 1;
  const rnd = () => ((n = (n * 16807) % 2147483647) / 2147483647);
  const FORK = 2.9;
  g.add(at(part(new THREE.CylinderGeometry(0.34, 0.55, FORK + 0.3, 10), BARK, 0.03), 0, (FORK + 0.3) / 2, 0));
  g.add(at(part(new THREE.CylinderGeometry(0.55, 0.8, 0.5, 10), BARK, 0.03), 0, 0.25, 0)); // 뿌리 쪽 퍼짐
  const puffs: [THREE.Vector3, number][] = [];
  const up = new THREE.Vector3(0, 1, 0), base = new THREE.Vector3(0, FORK, 0);
  const limb = (dir: THREE.Vector3, len: number, r0: number) => {
    const b = part(new THREE.CylinderGeometry(r0 * 0.25, r0, len, 7, 1, true), BARK, 0.02);
    b.quaternion.setFromUnitVectors(up, dir); b.position.copy(base).addScaledVector(dir, len / 2); g.add(b);
  };
  for (let i = 0; i < 7; i++) { // 옆으로 뻗는 큰 가지
    const a = (i / 7) * Math.PI * 2 + rnd() * 0.6, tilt = 0.9 + rnd() * 0.35, len = 3.6 + rnd() * 1.2;
    const dir = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
    limb(dir, len, 0.2);
    puffs.push([base.clone().addScaledVector(dir, len * 0.5).add(new THREE.Vector3(0, 0.9, 0)), 1.5]);
    puffs.push([base.clone().addScaledVector(dir, len * 0.85).add(new THREE.Vector3(0, 0.4, 0)), 1.7]);
    puffs.push([base.clone().addScaledVector(dir, len * 1.08).add(new THREE.Vector3(0, -0.35, 0)), 1.35]); // 끝이 살짝 처짐
  }
  for (let i = 0; i < 4; i++) { // 위로 솟는 가지
    const a = (i / 4) * Math.PI * 2 + rnd(), tilt = 0.3 + rnd() * 0.3, len = 2.6 + rnd() * 0.8;
    const dir = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
    limb(dir, len, 0.15);
    puffs.push([base.clone().addScaledVector(dir, len * 1.05), 1.8]);
  }
  puffs.push([new THREE.Vector3(0, FORK + 4.2, 0), 2.1]);
  g.updateMatrixWorld(true);
  for (const [c, r] of puffs) spots.push({ c: g.localToWorld(c.clone()), r: r * p.s, top: (FORK + 3) * p.s, k: density });
  return g;
}

// 꽃송이 카드. 24m 구역별로 나눠야 화면 밖 구역을 통째로 건너뜀 (하나로 묶으면 항상 전부 그림)
function cards(spots: Spot[], tex: THREE.Texture, dark: string, light: string, sunDir: THREE.Vector3, castShadow: boolean) {
  const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide });
  // 카메라 2m 안의 꽃은 안 그림 → 꽃 속을 지나갈 때 화면이 분홍으로 덮이지 않음
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vCamDist;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvCamDist = -mvPosition.z;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vCamDist;")
      .replace("void main() {", "void main() {\n  if (vCamDist < 2.0) discard;");
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
      d.scale.setScalar(Math.min(s.r * 0.6, 1.05) * (0.8 + Math.random() * 0.45)); // 꽃 크기는 일정하게, 대신 장수로 채움
      d.updateMatrix(); mesh.setMatrixAt(i, d.matrix);
      const l = THREE.MathUtils.clamp((u.dot(sunDir) * 0.5 + 0.5) * (0.4 + dep * 0.7) + (d.position.y - s.top) * 0.12, 0, 1);
      mesh.setColorAt(i, col.copy(cd).lerp(cl, Math.pow(l, 0.8) * (0.85 + Math.random() * 0.15)));
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}

// ---------- 소품: 퓨전 한옥 ----------
const PILLAR = "#8a4535", DAN_RED = "#a8473a", DAN_GREEN = "#4f8a7c", WALL = "#fbf5ea", GIWA = "#5b616b", PAPER = "#fff4dc", FLOOR = "#c99a6a";

/** 기와지붕: 네모/팔각 뿔을 오목하게 휘고 처마 모서리를 살짝 들어 올림. 바닥(처마)이 y=0 */
function hanokRoof(sides: 4 | 8, w: number, d: number, h: number) {
  const g = new THREE.ConeGeometry(1, 1, sides * 6, 8);
  const pos = g.attributes.position, seg = (Math.PI * 2) / sides, c0 = Math.PI / sides; // 모서리 각도 (팔각정 기둥과 같은 방향)
  const half = sides === 4 ? Math.SQRT1_2 : 1;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = y + 0.5, r = Math.hypot(x, z), th = Math.atan2(x, z);
    const u = ((((th - c0) % seg) + seg) % seg) / seg;              // 0=모서리, 0.5=면 가운데
    const rho = Math.cos(Math.PI / sides) / Math.cos((u - 0.5) * seg); // 원 → 다각형
    const corner = 1 - Math.min(u, 1 - u) * 2;                      // 모서리일수록 1
    pos.setXYZ(i,
      (Math.sin(th) * r * rho * w) / 2 / half,
      (t - 0.16 * Math.sin(Math.PI * t) + 0.3 * corner ** 2 * (1 - t) ** 4) * h, // 오목하게 + 처마 끝 들림
      (Math.cos(th) * r * rho * d) / 2 / half);
  }
  g.computeVertexNormals();
  return g;
}

function buildProp(p: Prop, root: THREE.Group, extras: THREE.Group, leafSpots: Spot[]) {
  const S = PROP_S;
  const g = new THREE.Group(); g.position.set(p.x, 0, p.z); if (p.kind !== "tree") g.rotation.y = p.yaw;
  g.scale.setScalar(S); // 나무에 맞춘 현실 크기
  const T = 0.014;      // 키운 만큼 외곽선이 굵어지지 않게
  const add = (geo: THREE.BufferGeometry, c: string, x: number, y: number, z: number, t = T) => { const m = at(part(geo, c, t), x, y, z); g.add(m); return m; };
  const box = (w: number, h: number, d: number, c: string, x: number, y: number, z: number, t = T) => add(new THREE.BoxGeometry(w, h, d), c, x, y, z, t);
  const cyl = (rt: number, rb: number, h: number, c: string, x: number, y: number, z: number, seg = 12, t = T) => add(new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y, z, t);
  const board = (text: string, w: number, x: number, y: number, z: number, yaw = 0) => { // 나무 현판
    const s = sign(text, w, "#6b4a35", "#fff3e0"); s.position.set(x, y, z); s.rotation.y = yaw; g.add(s);
  };
  // 문살 창: 연한 창호지 + 나무 살
  const lattice = (w: number, h: number, x: number, y: number, z: number) => {
    box(w, h, 0.05, "#f3ecd8", x, y, z, 0.01);
    for (let i = 1; i < 4; i++) box(0.035, h, 0.03, PILLAR, x - w / 2 + (w * i) / 4, y, z + 0.03, 0);
    for (let i = 1; i < 3; i++) box(w, 0.035, 0.03, PILLAR, x, y - h / 2 + (h * i) / 3, z + 0.03, 0);
  };
  switch (p.kind) {
    case "bench":
      box(1.5, 0.08, 0.42, WOOD, 0, 0.44, 0); box(1.5, 0.3, 0.06, WOOD, 0, 0.72, -0.2);
      for (const sx of [-0.65, 0.65]) for (const sz of [-0.15, 0.15]) box(0.07, 0.44, 0.07, BARK, sx, 0.22, sz);
      break;
    case "lamp": // 청사초롱 느낌 가로등
      box(0.09, 2.6, 0.09, "#5a3f36", 0, 1.3, 0);
      box(0.5, 0.06, 0.06, "#5a3f36", 0.22, 2.55, 0);
      box(0.3, 0.4, 0.3, PAPER, 0.42, 2.25, 0);
      box(0.32, 0.06, 0.32, DAN_RED, 0.42, 2.05, 0); box(0.32, 0.06, 0.32, DAN_RED, 0.42, 2.45, 0);
      add(hanokRoof(4, 0.5, 0.5, 0.18), GIWA, 0.42, 2.48, 0);
      break;
    case "gate": // 일주문 느낌: 둥근 기둥 두 개 + 기와지붕 + 현판
      for (const s of [-1, 1]) { cyl(0.26, 0.3, 0.3, STONE, 0, 0.15, s * 2.3, 12); cyl(0.2, 0.22, 3.1, PILLAR, 0, 1.85, s * 2.3, 14); }
      box(0.34, 0.3, 5.6, DAN_GREEN, 0, 3.2, 0); box(0.3, 0.16, 5.4, DAN_RED, 0, 2.98, 0);
      add(hanokRoof(4, 1.7, 6.6, 1.0), GIWA, 0, 3.35, 0, 0.02);
      box(0.12, 0.12, 4.6, "#474c55", 0, 4.33, 0, 0); // 용마루
      board("벚꽃 공원", 2.4, -0.2, 2.55, 0, -Math.PI / 2);
      break;
    case "booth": // 안내소
      box(3.6, 0.22, 2.8, "#d9cdbd", 0, 0.11, 0);
      box(3.0, 2.0, 2.2, WALL, 0, 1.22, 0);
      for (const sx of [-1.5, 1.5]) for (const sz of [-1.1, 1.1]) box(0.18, 2.1, 0.18, PILLAR, sx, 1.27, sz);
      box(3.2, 0.22, 2.4, DAN_GREEN, 0, 2.33, 0); box(3.16, 0.1, 2.36, DAN_RED, 0, 2.17, 0);
      add(hanokRoof(4, 4.6, 3.8, 1.25), GIWA, 0, 2.42, 0, 0.02);
      lattice(1.8, 0.85, 0, 1.45, 1.12);
      box(2.2, 0.08, 0.42, WOOD, 0, 0.98, 1.32);
      board("안내소", 1.3, 0, 2.0, 1.23);
      break;
    case "kiosk": // 매점: 앞이 트인 가게
      box(4.4, 0.22, 3.4, "#d9cdbd", 0, 0.11, 0);
      box(3.8, 2.1, 2.6, WALL, 0, 1.27, -0.1);
      for (const sx of [-1.9, 1.9]) for (const sz of [-1.4, 1.3]) box(0.2, 2.2, 0.2, PILLAR, sx, 1.32, sz);
      box(4.0, 0.24, 2.9, DAN_GREEN, 0, 2.44, -0.05); box(3.96, 0.1, 2.86, DAN_RED, 0, 2.27, -0.05);
      add(hanokRoof(4, 5.6, 4.4, 1.35), GIWA, 0, 2.54, -0.05, 0.02);
      box(3.2, 1.0, 0.1, "#efe2c8", 0, 1.55, 1.2);           // 판매대 안쪽
      box(3.6, 0.9, 0.5, WOOD, 0, 0.67, 1.5);                // 판매대
      for (let i = 0; i < 6; i++) box(0.32, 0.22, 0.26, ["#f4adc2", "#f8da7a", "#a9d3ef", "#9fd1b5"][i % 4], -1.3 + i * 0.52, 1.24, 1.5, 0.008); // 과자·노트·돗자리
      board("매점", 1.2, 0, 2.05, 1.32);
      break;
    case "pavilion": { // 팔각정: 디딤돌 위에 살짝 뜬 마루
      const { postR, floorR, floorH } = PAVILION;
      for (let k = 0; k < 8; k++) { const [x, z] = pavilionCorner(k, postR); cyl(0.2, 0.26, floorH, STONE, x, floorH / 2, z, 10); }
      add(new THREE.CylinderGeometry(postR * 0.98, postR * 0.98, floorH * 0.8, 8).rotateY(Math.PI / 8), "#6d4a3a", 0, floorH * 0.4, 0); // 마루 밑
      add(new THREE.CylinderGeometry(floorR, floorR, 0.12, 8).rotateY(Math.PI / 8), FLOOR, 0, floorH + 0.06, 0);
      const top = 2.9, fy = floorH + 0.12;
      for (let k = 0; k < 8; k++) {
        const [x0, z0] = pavilionCorner(k, postR), [x1, z1] = pavilionCorner(k + 1, postR);
        cyl(0.1, 0.11, top - fy, PILLAR, x0, (top + fy) / 2, z0, 10);
        const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        box(0.16, 0.2, len, DAN_GREEN, mx, top - 0.1, mz).rotation.y = yaw;    // 위 도리
        box(0.12, 0.1, len, DAN_RED, mx, top - 0.26, mz).rotation.y = yaw;
        if (k === 7) continue;                                               // 남쪽 입구는 난간 없음
        box(0.07, 0.06, len, WOOD, mx, fy + 0.45, mz).rotation.y = yaw;      // 난간
        box(0.05, 0.05, len, WOOD, mx, fy + 0.12, mz).rotation.y = yaw;
        for (let i = 1; i < 5; i++) box(0.04, 0.33, 0.04, WOOD, x0 + ((x1 - x0) * i) / 5, fy + 0.28, z0 + ((z1 - z0) * i) / 5, 0.008);
      }
      add(hanokRoof(8, 7.6, 7.6, 1.6), GIWA, 0, top, 0, 0.022);
      cyl(0.06, 0.12, 0.35, "#3f434a", 0, top + 1.6, 0, 8); add(new THREE.SphereGeometry(0.12, 10, 8), "#3f434a", 0, top + 1.85, 0);
      box(1.3, floorH * 0.5, 0.5, STONE, 0, floorH * 0.25, postR * Math.cos(Math.PI / 8) + 0.3); // 디딤돌
      break;
    }
    case "fountain": {
      cyl(3, 3.1, 0.5, STONE, 0, 0.25, 0, 40);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(2.75 * S, 2.75 * S, 0.06, 40), new THREE.MeshToonMaterial({ color: "#9fd6ee", gradientMap: toonGradient() }));
      extras.add(at(water, p.x, 0.48 * S, p.z));
      cyl(0.35, 0.5, 1.4, STONE, 0, 0.9, 0, 20);
      cyl(1.1, 0.4, 0.3, STONE, 0, 1.65, 0, 28);
      // 물줄기: 위로 솟았다 떨어지는 반투명 기둥 (update에서 출렁임)
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * S, 0.22 * S, 1.2 * S, 12, 1, true), new THREE.MeshBasicMaterial({ color: "#eaf7ff", transparent: true, opacity: 0.7 }));
      jet.position.set(p.x, 2.3 * S, p.z); jet.name = "jet"; extras.add(jet);
      break;
    }
    case "wishTree": {
      add(new THREE.CylinderGeometry(0.35, 0.55, 2.4, 10), BARK, 0, 1.2, 0, 0.02);
      const origin = new THREE.Vector3(p.x, 0, p.z);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * 6.28 + 0.4, dir = new THREE.Vector3(Math.cos(a) * 0.7, 0.75, Math.sin(a) * 0.7).normalize();
        const b = part(new THREE.CylinderGeometry(0.05, 0.16, 2, 7, 1, true), BARK, T);
        b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); b.position.set(0, 2.2, 0).addScaledVector(dir, 1); g.add(b);
        leafSpots.push({ c: origin.clone().add(new THREE.Vector3(0, 2.2, 0).addScaledVector(dir, 1.9).multiplyScalar(S)), r: 1.15 * S, top: 3.6 * S, k: 40 });
      }
      leafSpots.push({ c: new THREE.Vector3(p.x, 4.1 * S, p.z), r: 1.4 * S, top: 3.6 * S, k: 40 });
      // 사다리 (분수 쪽에 기대어 둠)
      const lad = new THREE.Group(); lad.position.set(0, 0, -1.0); lad.rotation.x = 0.25;
      for (const s of [-1, 1]) lad.add(at(part(new THREE.BoxGeometry(0.06, 3.2, 0.06), WOOD, T), s * 0.25, 1.55, 0));
      for (let i = 0; i < 8; i++) lad.add(at(part(new THREE.BoxGeometry(0.5, 0.05, 0.05), WOOD, T), 0, 0.3 + i * 0.38, 0));
      g.add(lad);
      break;
    }
  }
  root.add(g);
}

/** 꽃잎 한 장 (끝이 살짝 갈라진 벚꽃잎 모양, 길이 약 12cm) */
export function makePetalGeometry() {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0); sh.bezierCurveTo(-0.06, 0.03, -0.07, 0.09, -0.03, 0.12);
  sh.lineTo(0, 0.104); sh.lineTo(0.03, 0.12); sh.bezierCurveTo(0.07, 0.09, 0.06, 0.03, 0, 0);
  return new THREE.ShapeGeometry(sh).translate(0, -0.06, 0);
}

// ---------- 바닥 꽃잎 ----------
// ponytail: 매 프레임 전체 꽃잎을 훑음(O(n), n≈16k, 약 0.2ms). 더 늘리면 격자로 발밑만 검사
class PetalField {
  mesh: THREE.InstancedMesh;
  private n: number;
  private p: Float32Array;   // x, y, z, 회전
  private v: Float32Array;   // vx, vy, vz, 회전 속도
  private moving: Uint8Array;
  private d = new THREE.Object3D();

  constructor(n: number, geo: THREE.BufferGeometry, mat: THREE.Material, trees: { x: number; z: number; s: number }[]) {
    this.n = n; this.p = new Float32Array(n * 4); this.v = new Float32Array(n * 4); this.moving = new Uint8Array(n);
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false; // 꽃잎이 날아다녀서 경계 상자가 계속 바뀜
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      let x: number, z: number;
      if (i % 5) { // 80%는 나무 밑에 소복이
        const t = trees[i % trees.length], r = Math.abs(Math.random() + Math.random() + Math.random() - 1.5) * 4.2 * t.s, a = Math.random() * 6.28;
        x = t.x + Math.cos(a) * r; z = t.z + Math.sin(a) * r;
      } else { x = BOUNDS.minX + Math.random() * (BOUNDS.maxX - BOUNDS.minX); z = BOUNDS.minZ + Math.random() * (BOUNDS.maxZ - BOUNDS.minZ); }
      this.p.set([x, 0.016, z, Math.random() * 6.28], i * 4);
      this.write(i, 0);
      this.mesh.setColorAt(i, col.set(PINKS[i % 3]));
    }
  }

  private write(i: number, tilt: number) {
    const p = this.p, o = i * 4, d = this.d;
    d.position.set(p[o], p[o + 1], p[o + 2]);
    d.rotation.set(-Math.PI / 2 + tilt, 0, p[o + 3]);
    d.updateMatrix(); this.mesh.setMatrixAt(i, d.matrix);
  }

  private kick(i: number, vx: number, vy: number, vz: number) {
    const v = this.v, o = i * 4;
    v[o] = vx; v[o + 1] = vy; v[o + 2] = vz; v[o + 3] = (Math.random() - 0.5) * 10;
    this.moving[i] = 1;
  }

  update(dt: number, focus: THREE.Vector3, walking: boolean, yaw: number, wind: number) {
    const { p, v, n } = this;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    // 센 바람이 불면 주변에 쌓인 꽃잎이 군데군데 날아오름
    const lifts = wind > 1.1 ? Math.floor((wind - 1.1) * 3600 * dt) : 0;
    for (let k = 0; k < lifts; k++) {
      const i = Math.floor(Math.random() * n), o = i * 4;
      if (this.moving[i] || Math.abs(p[o] - focus.x) > 24 || Math.abs(p[o + 2] - focus.z) > 24) continue;
      this.kick(i, wind * (1.2 + Math.random()), 1.5 + Math.random() * 2.2, (Math.random() - 0.5) * 1.5);
    }
    let dirty = false;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      if (walking && !this.moving[i]) { // 발밑 0.55m 안은 앞·옆으로 살짝 튀며 흩어짐
        const dx = p[o] - focus.x, dz = p[o + 2] - focus.z, d2 = dx * dx + dz * dz;
        if (d2 < 0.3) {
          const d = Math.sqrt(d2) || 0.01, s = 0.8 + Math.random() * 0.9;
          this.kick(i, (dx / d) * s + fx * 1.2, 0.6 + Math.random() * 0.9, (dz / d) * s + fz * 1.2);
        }
      }
      if (!this.moving[i]) continue;
      dirty = true;
      v[o + 1] -= 4.5 * dt;                       // 천천히 떨어짐 (꽃잎은 가벼움)
      const drag = Math.exp(-dt * 1.8);
      v[o] = v[o] * drag + (wind - 0.4) * 0.6 * dt; v[o + 2] *= drag;
      p[o] += v[o] * dt; p[o + 1] += v[o + 1] * dt; p[o + 2] += v[o + 2] * dt; p[o + 3] += v[o + 3] * dt;
      if (p[o + 1] <= 0.016) { p[o + 1] = 0.016; this.moving[i] = 0; this.write(i, 0); }
      else this.write(i, Math.sin(p[o + 3] * 2) * 1.2);
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
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
  const SUN_OFFSET = new THREE.Vector3(16, 34, 20);
  sun.castShadow = true; sun.shadow.mapSize.set(q.shadow, q.shadow);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 });
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
    if (p.kind === "tree") statics.add(cherryTree(p, spots, p.inside ? q.cards : q.cards * 0.45));
    else buildProp(p, statics, extras, leafSpots);
  }
  // 간판·물 같은 텍스처 붙은 물체는 합치지 않고 따로
  const keep: THREE.Object3D[] = [];
  statics.traverse((o) => { if (o instanceof THREE.Mesh && (o.material as THREE.MeshToonMaterial).map) keep.push(o); });
  for (const o of keep) { o.updateWorldMatrix(true, false); const w = o.matrixWorld.clone(); o.removeFromParent(); w.decompose(o.position, o.quaternion, o.scale); extras.add(o); }
  scene.add(bake(statics), extras);
  const btex = blossomTexture();
  scene.add(cards(spots.filter((s) => s.k === q.cards), btex, "#e597ae", "#fff6f8", sunDir, true));
  scene.add(cards(spots.filter((s) => s.k !== q.cards), btex, "#e597ae", "#fff6f8", sunDir, false)); // 맵 밖 나무는 그림자 없이
  scene.add(cards(leafSpots, leafTexture(), "#3f7a4f", "#bfe3a0", sunDir, true));

  // 꽃잎이 소복이 쌓인 느낌: 나무 밑에 옅은 분홍 깔개 (값싼 반투명 원)
  const inside = PROPS.filter((p): p is Extract<Prop, { kind: "tree" }> => p.kind === "tree");
  {
    const carpet = canvasTex(128, 128, (x) => {
      const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, "rgba(244,160,186,0.75)"); gr.addColorStop(0.55, "rgba(247,182,201,0.5)"); gr.addColorStop(1, "rgba(250,205,218,0)");
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    });
    const mat = new THREE.MeshToonMaterial({ map: carpet, gradientMap: toonGradient(), transparent: true, depthWrite: false });
    const geo = new THREE.PlaneGeometry(1, 1);
    for (const t of inside) {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.set(-Math.PI / 2, 0, t.x); m.position.set(t.x, 0.011, t.z); m.scale.setScalar(13 * t.s); m.receiveShadow = true; m.renderOrder = 1;
      scene.add(m);
    }
  }

  // 바닥 꽃잎: 쌓여 있다가 발길에 흐트러지고, 센 바람에 날아올랐다 다시 내려앉음
  const petalGeo = makePetalGeometry();
  const petalMat = new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: toonGradient(), side: THREE.DoubleSide });
  const d = new THREE.Object3D(), col = new THREE.Color();
  const field = new PetalField(q.groundPetals, petalGeo.clone().scale(1.5, 1.5, 1), petalMat, inside); // 바닥 꽃잎은 멀리서도 보이게 조금 크게
  scene.add(field.mesh);

  // 떨어지는 꽃잎: 내 주변에서만 (멀리 있는 건 안 보이니까)
  const falling = new THREE.InstancedMesh(petalGeo, petalMat, q.fallingPetals);
  falling.frustumCulled = false;
  const fp = Array.from({ length: q.fallingPetals }, (_, i) => {
    falling.setColorAt(i, col.set(PINKS[i % 3]));
    return { x: (Math.random() - 0.5) * 36, y: Math.random() * 9, z: (Math.random() - 0.5) * 36, v: 0.35 + Math.random() * 0.35, ph: Math.random() * 6.28, sp: 1 + Math.random() * 2 };
  });
  scene.add(falling);

  const jet = extras.getObjectByName("jet");

  return {
    /** focus = 내 캐릭터 위치(그림자·꽃잎이 따라옴), walking = 걷는 중이면 발밑 꽃잎을 흩뜨림 */
    update(t: number, dt: number, focus: THREE.Vector3, walking = false, yaw = 0) {
      sun.position.copy(focus).add(SUN_OFFSET); sun.target.position.copy(focus);
      const wind = 0.4 + Math.max(0, Math.sin(t * 0.25)) ** 4 * 1.6; // 가끔 바람이 셈
      for (let i = 0; i < fp.length; i++) {
        const p = fp[i];
        p.y -= p.v * dt;
        p.x += (Math.sin(t * p.sp + p.ph) * 0.35 + wind) * dt;
        p.z += Math.cos(t * p.sp * 0.7 + p.ph) * 0.2 * dt;
        // 내 주변 30m 상자 안에서 돌고 돌게
        if (p.y < 0.02) { p.y = 4 + Math.random() * 5; p.x = (Math.random() - 0.5) * 36; p.z = (Math.random() - 0.5) * 36; }
        if (p.x > 18) p.x -= 36;
        d.position.set(focus.x + p.x, p.y, focus.z + p.z);
        d.rotation.set(t * p.sp + p.ph, t * 0.7 + p.ph, Math.sin(t * p.sp) * 0.8);
        d.scale.setScalar(1); d.updateMatrix(); falling.setMatrixAt(i, d.matrix);
      }
      falling.instanceMatrix.needsUpdate = true;
      field.update(dt, focus, walking, yaw, wind);
      (water.material as THREE.MeshToonMaterial).color.setHSL(0.55, 0.62, 0.79 + Math.sin(t * 1.3) * 0.01);
      if (jet) jet.scale.y = 1 + Math.sin(t * 6) * 0.08;
      return wind;
    },
  };
}

export { OUTLINE };
