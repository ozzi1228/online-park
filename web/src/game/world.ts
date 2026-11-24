// 봄(벚꽃) 테마로 공원 배치를 그림. 다른 계절은 같은 배치를 다른 모델로 그리는 파일을 추가하면 됨.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { OUTLINE, at, part, toon, toonGradient } from "./character";
import { createSky } from "./sky";
import { createRiver } from "./water";
import { createFountain } from "./fountain";
import { createCity } from "./city";
import { BACKDROP_TREES, BOUNDS, BOUNDS_N, BRIDGE, PATHS, bridgeY, PAVILION, PAVILION_DOOR, PLAZA, PROPS, PROP_S, WISH_BRANCHES, pavilionCorner, type Prop } from "./park-map";

export type Quality = { cards: number; groundPetals: number; fallingPetals: number; shadow: number; pixelRatio: number };
export const QUALITY_HIGH: Quality = { cards: 38, groundPetals: 16000, fallingPetals: 900, shadow: 2048, pixelRatio: 2 };
export const QUALITY_LOW: Quality = { cards: 20, groundPetals: 7000, fallingPetals: 400, shadow: 1024, pixelRatio: 1.5 };

const PINKS = ["#f9c6d4", "#f4adc2", "#fbd8e1"];
const BARK = "#7d5646", WOOD = "#cf9f73", STONE = "#e8dccb";

// ---------- 정적 물체 합치기: 수백 개 부품을 색 정보 담은 메시 몇 개로 (그리기 호출 수 줄이기) ----------
function bake(root: THREE.Object3D, castShadow = true) {
  root.updateMatrixWorld(true);
  const fills: THREE.BufferGeometry[] = [], barks: THREE.BufferGeometry[] = [], lines = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const g = o.geometry.clone();
    if (o.userData.bark) { // 나무껍질: 무늬 텍스처를 한 장으로 같이 씀 (그리기 1번)
      for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
      barks.push(g.applyMatrix4(o.matrixWorld)); return;
    }
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
  if (barks.length) {
    const mesh = new THREE.Mesh(mergeGeometries(barks), new THREE.MeshToonMaterial({ map: barkTexture(), gradientMap: toonGradient() }));
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
// 꽃송이 카드: 수채화처럼 부드러운 송이 덩어리 몇 개. 송이마다 위쪽은 밝고 아래쪽은 살짝 진한 분홍,
// 꽃은 테두리·잎맥 없이 겹친 다섯 잎. 가운데만 아주 작게 진분홍 (멀리서 점처럼 보이지 않게)
const blossomTexture = () => canvasTex(512, 512, (x) => {
  const PAL = ["#fde2ea", "#fbd3df", "#f9c3d3", "#f6b4c8", "#fce6ed"];
  // 빈 곳에도 아주 옅게 분홍을 깔아 둠: 멀리서 흐려질 때 가장자리가 검거나 하얗게 테두리 지지 않게
  x.fillStyle = "rgba(246,182,201,0.03)"; x.fillRect(0, 0, 512, 512);
  const flower = (cx: number, cy: number, s: number, rot: number, col: string, light: number) => {
    x.fillStyle = col;
    for (let k = 0; k < 5; k++) {
      const pa = rot + k * 1.2566 + (Math.random() - 0.5) * 0.25;
      x.save(); x.translate(cx + Math.cos(pa) * s * 0.42, cy + Math.sin(pa) * s * 0.42); x.rotate(pa);
      x.beginPath(); x.ellipse(0, 0, s * 0.5, s * 0.38, 0, 0, 7); x.fill();
      x.restore();
    }
    // 빛 받는 쪽 살짝 밝게
    const hg = x.createRadialGradient(cx - s * 0.3, cy - s * 0.35, 0, cx, cy, s);
    hg.addColorStop(0, `rgba(255,255,255,${0.35 * light})`); hg.addColorStop(1, "rgba(255,255,255,0)");
    x.globalCompositeOperation = "source-atop"; // 이미 그린 꽃잎 위에만 (빈 곳에 흰 테두리가 생기지 않게)
    x.fillStyle = hg; x.beginPath(); x.arc(cx, cy, s * 0.9, 0, 7); x.fill();
    x.globalCompositeOperation = "source-over";
    const cg = x.createRadialGradient(cx, cy, 0, cx, cy, s * 0.22);
    cg.addColorStop(0, "rgba(232,120,155,0.75)"); cg.addColorStop(1, "rgba(246,177,198,0)");
    x.fillStyle = cg; x.beginPath(); x.arc(cx, cy, s * 0.22, 0, 7); x.fill();
  };
  for (let c = 0; c < 6; c++) { // 송이 덩어리
    const a = (c / 6) * 6.28 + Math.random() * 0.8, d = c === 0 ? 0 : 100 + Math.random() * 70;
    const gx = 256 + Math.cos(a) * d, gy = 256 + Math.sin(a) * d, R = 70 + Math.random() * 25;
    // 송이 속은 꽉 차게: 밑에 부드러운 분홍 덩어리를 깔아 멀리서 봐도 구멍 숭숭(자글자글) 안 보이게
    const ug = x.createRadialGradient(gx, gy + R * 0.1, R * 0.2, gx, gy, R * 0.95);
    ug.addColorStop(0, "#f4b6c8"); ug.addColorStop(0.7, "rgba(246,186,203,0.95)"); ug.addColorStop(1, "rgba(248,196,211,0)");
    x.fillStyle = ug; x.beginPath(); x.ellipse(gx, gy, R, R * 0.88, 0, 0, 7); x.fill();
    for (let i = 0; i < 34; i++) { // 아래(그늘)에서 위(빛)로 쌓음
      const t = i / 33, ang = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * R;
      const fy = gy + Math.sin(ang) * rr * 0.85 + (1 - t) * R * 0.35 - R * 0.15;
      const shade = Math.min(4, Math.floor((1 - t) * 4 + Math.random() * 1.2));
      flower(gx + Math.cos(ang) * rr, fy, 17 + Math.random() * 10, Math.random() * 6.28, PAL[3 - Math.min(3, shade)] ?? PAL[0], t);
    }
  }
  for (let i = 0; i < 10; i++) { // 송이 사이 떠도는 작은 꽃·봉오리
    const a = Math.random() * 6.28, d = 150 + Math.random() * 80;
    flower(256 + Math.cos(a) * d, 256 + Math.sin(a) * d, 9 + Math.random() * 6, Math.random() * 6.28, PAL[Math.floor(Math.random() * 5)], 0.5);
  }
});
// 나무껍질: 갈색 바탕에 세로 결 + 벚나무 특유의 가로 숨구멍 줄무늬 + 옹이 (위아래·좌우로 이어짐)
const barkTexture = () => {
  const t = canvasTex(256, 512, (x) => {
    x.fillStyle = "#7d5646"; x.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 70; i++) { // 세로 결
      const px = Math.random() * 256, py = Math.random() * 512, w = 2 + Math.random() * 6, h = 40 + Math.random() * 140;
      x.fillStyle = Math.random() < 0.5 ? "rgba(60,36,28,0.22)" : "rgba(160,120,100,0.16)";
      for (const ox of [0, 256, -256]) for (const oy of [0, 512, -512]) { x.beginPath(); x.ellipse(px + ox, py + oy, w, h, 0, 0, 7); x.fill(); }
    }
    for (let i = 0; i < 90; i++) { // 가로 숨구멍
      const px = Math.random() * 256, py = 4 + Math.random() * 504, w = 6 + Math.random() * 12;
      for (const ox of [0, 256, -256]) {
        x.fillStyle = "rgba(55,30,24,0.55)"; x.beginPath(); x.ellipse(px + ox, py, w, 1.6, 0, 0, 7); x.fill();
        x.fillStyle = "rgba(190,150,128,0.35)"; x.beginPath(); x.ellipse(px + ox, py + 2.2, w * 0.8, 0.9, 0, 0, 7); x.fill();
      }
    }
    for (let i = 0; i < 3; i++) { // 옹이
      const px = 30 + Math.random() * 196, py = 40 + Math.random() * 432;
      x.strokeStyle = "rgba(55,30,24,0.5)"; x.lineWidth = 2.5;
      x.beginPath(); x.ellipse(px, py, 9, 14, 0, 0, 7); x.stroke();
      x.fillStyle = "rgba(50,28,22,0.6)"; x.beginPath(); x.ellipse(px, py, 4, 7, 0, 0, 7); x.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};
/** 나무 기둥: 울퉁불퉁 + 밑동은 뿌리처럼 갈라져 퍼짐 + 살짝 휨. uv는 실제 크기(1m ≈ 텍스처 반 장)에 맞춤 */
function trunkGeo(r0: number, r1: number, h: number, seed: number) {
  const g = new THREE.CylinderGeometry(r0, r1, h, 18, 10);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), t = y / h + 0.5, a = Math.atan2(z, x);
    const lump = 1 + 0.07 * Math.sin(a * 3 + seed + t * 4) + 0.05 * Math.sin(a * 7 - seed * 2 + t * 9);
    const root = t < 0.22 ? 1 + ((0.22 - t) / 0.22) ** 1.6 * (0.35 + 0.55 * Math.max(0, Math.cos(a * 5 + seed))) : 1; // 뿌리 갈래
    const k = lump * root;
    pos.setXYZ(i, x * k + Math.sin(t * 2.4 + seed) * 0.08 * t, y, z * k + Math.cos(t * 2.1 + seed) * 0.06 * t);
    uv.setXY(i, uv.getX(i) * Math.max(1, Math.round((r0 + r1) * Math.PI)), uv.getY(i) * h * 0.5);
  }
  g.computeVertexNormals();
  return g;
}
const barkPart = (geo: THREE.BufferGeometry, t = 0.03) => { const m = part(geo, BARK, t); m.userData.bark = true; return m; };
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
  g.add(at(barkPart(trunkGeo(0.34, 0.6, FORK + 0.3, n % 7)), 0, (FORK + 0.3) / 2, 0)); // 울퉁불퉁한 기둥 + 뿌리
  const puffs: [THREE.Vector3, number][] = [];
  const up = new THREE.Vector3(0, 1, 0), base = new THREE.Vector3(0, FORK, 0);
  const limb = (dir: THREE.Vector3, len: number, r0: number) => {
    const geo = new THREE.CylinderGeometry(r0 * 0.25, r0, len, 9, 3, true), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * len * 0.5);
    const b = barkPart(geo, 0.02);
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
type Light = { sunDir: { value: THREE.Vector3 }; sunColor: { value: THREE.Color }; haze: { value: THREE.Color } };
function cards(spots: Spot[], tex: THREE.Texture, dark: string, light: string, sunDir: THREE.Vector3, castShadow: boolean, lit: Light) {
  const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uSunDir: lit.sunDir, uSunColor: lit.sunColor, uHaze: lit.haze });
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vCamDist;\nvarying vec3 vWorld, vCardN;")
      .replace("#include <project_vertex>", `#include <project_vertex>
vCamDist = -mvPosition.z;
#ifdef USE_INSTANCING
mat4 cardM = modelMatrix * instanceMatrix;
#else
mat4 cardM = modelMatrix;
#endif
vWorld = (cardM * vec4(transformed, 1.0)).xyz;
vCardN = normalize(mat3(cardM) * vec3(0.0, 0.0, 1.0));`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vCamDist;\nvarying vec3 vWorld, vCardN;\nuniform vec3 uSunDir, uSunColor, uHaze;")
      // 카메라 2m 안의 꽃은 안 그림 → 꽃 속을 지나갈 때 화면이 분홍으로 덮이지 않음.
      // 거의 옆으로 누운 카드는 가는 실선처럼 보여 지저분하니 안 그림
      .replace("void main() {", "void main() {\n  if (vCamDist < 2.0 || abs(dot(normalize(vCardN), normalize(cameraPosition - vWorld))) < 0.24) discard;")
      // 멀수록 텍스처를 흐리게(밉맵을 한 단계 위로) → 작은 꽃 무늬가 자글자글 대신 부드러운 송이로
      .replace("#include <map_fragment>", "diffuseColor *= texture2D(map, vMapUv, clamp((vCamDist - 18.0) / 16.0, 0.0, 2.2));")
      .replace("#include <opaque_fragment>", `{
  vec3 V = normalize(cameraPosition - vWorld);
  // 해를 등지고 보면 햇살이 꽃잎을 통과해 따뜻하게 빛남 (역광), 해를 마주한 쪽은 화사하게
  float back = pow(max(dot(-V, uSunDir), 0.0), 3.0);
  float front = max(dot(V, uSunDir), 0.0);
  outgoingLight += uSunColor * (back * 0.32 + front * 0.06) * smoothstep(0.0, 0.25, uSunDir.y);
  // 멀리 있는 나무일수록 옅고 뽀얗게 (공기 원근)
  outgoingLight = mix(outgoingLight, uHaze, smoothstep(22.0, 95.0, vCamDist) * 0.42);
}
#include <opaque_fragment>`);
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
      // 꽃 크기는 일정하게, 대신 장수로 채움. 멀리 있는(카드 수를 줄인) 나무는 큼직하게 → 덩어리가 꽉 차 보임
      d.scale.setScalar(Math.min(s.r * 0.6, 1.05) * (0.8 + Math.random() * 0.45) * (s.c.z < -38 ? 1.7 : 1)); // 강 건너편
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

function buildProp(p: Prop, root: THREE.Group) {
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
      // 벽: 뒤쪽은 통짜, 앞은 창구 구멍을 낸 얇은 판 (안내원이 안에서 창문으로 얼굴을 내밂)
      box(3.0, 2.0, 1.4, WALL, 0, 1.22, -0.4);
      for (const sx of [-1.45, 1.45]) box(0.1, 2.0, 0.8, WALL, sx, 1.22, 0.7);
      // 창구는 1인칭 눈높이에서 안내원 얼굴이 마주 보이게 낮게
      box(3.0, 0.53, 0.06, WALL, 0, 0.485, 1.07); box(3.0, 0.34, 0.06, WALL, 0, 2.05, 1.07);
      for (const sx of [-1.2, 1.2]) box(0.6, 1.13, 0.06, WALL, sx, 1.315, 1.07);
      box(2.9, 0.02, 0.8, "#b8a58c", 0, 0.23, 0.7); // 안쪽 바닥
      for (const sx of [-1.5, 1.5]) for (const sz of [-1.1, 1.1]) box(0.18, 2.1, 0.18, PILLAR, sx, 1.27, sz);
      box(3.2, 0.22, 2.4, DAN_GREEN, 0, 2.33, 0); box(3.16, 0.1, 2.36, DAN_RED, 0, 2.17, 0);
      add(hanokRoof(4, 4.6, 3.8, 1.25), GIWA, 0, 2.42, 0, 0.02);
      for (const sx of [-0.92, 0.92]) box(0.06, 1.19, 0.08, PILLAR, sx, 1.315, 1.1); // 창틀
      box(1.9, 0.06, 0.08, PILLAR, 0, 1.9, 1.1);
      for (const sx of [-1.2, 1.2]) lattice(0.5, 0.7, sx, 1.45, 1.11);          // 양옆 창살
      box(2.2, 0.08, 0.42, WOOD, 0, 0.73, 1.32);
      board("안내소", 1.3, 0, 2.0, 1.23);
      break;
    case "kiosk": // 매점: 앞이 트인 가게
      box(4.4, 0.22, 3.4, "#d9cdbd", 0, 0.11, 0);
      box(3.8, 2.1, 1.9, WALL, 0, 1.27, -0.45);               // 뒤쪽 창고 (앞쪽은 직원이 서는 자리)
      for (const sx of [-1.85, 1.85]) box(0.1, 2.1, 0.8, WALL, sx, 1.27, 0.9); // 옆벽
      box(3.6, 0.1, 0.7, "#c9b79e", 0, 0.27, 0.9);           // 직원 디딤 마루
      for (const sx of [-1.9, 1.9]) for (const sz of [-1.4, 1.3]) box(0.2, 2.2, 0.2, PILLAR, sx, 1.32, sz);
      box(4.0, 0.24, 2.9, DAN_GREEN, 0, 2.44, -0.05); box(3.96, 0.1, 2.86, DAN_RED, 0, 2.27, -0.05);
      add(hanokRoof(4, 5.6, 4.4, 1.35), GIWA, 0, 2.54, -0.05, 0.02);
      box(3.6, 1.0, 0.04, "#efe2c8", 0, 1.55, 0.52);         // 안쪽 벽
      for (const [sx, c] of [[-1.15, "#f4adc2"], [1.15, "#a9d3ef"]] as const) { // 안쪽 선반: 노트·돗자리
        box(0.9, 0.05, 0.22, WOOD, sx, 1.7, 0.62);
        for (let i = 0; i < 3; i++) box(0.2, 0.22, 0.14, i === 1 ? "#f8da7a" : c, sx - 0.28 + i * 0.28, 1.84, 0.62, 0.006);
      }
      box(3.6, 0.6, 0.5, WOOD, 0, 0.52, 1.5);                // 판매대 (1인칭 눈높이보다 낮게)
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
        if (k === PAVILION_DOOR) continue;                                   // 입구 쪽은 난간 없음
        box(0.07, 0.06, len, WOOD, mx, fy + 0.45, mz).rotation.y = yaw;      // 난간
        box(0.05, 0.05, len, WOOD, mx, fy + 0.12, mz).rotation.y = yaw;
        for (let i = 1; i < 5; i++) box(0.04, 0.33, 0.04, WOOD, x0 + ((x1 - x0) * i) / 5, fy + 0.28, z0 + ((z1 - z0) * i) / 5, 0.008);
      }
      add(hanokRoof(8, 7.6, 7.6, 1.6), GIWA, 0, top, 0, 0.022);
      cyl(0.06, 0.12, 0.35, "#3f434a", 0, top + 1.6, 0, 8); add(new THREE.SphereGeometry(0.12, 10, 8), "#3f434a", 0, top + 1.85, 0);
      box(1.3, floorH * 0.5, 0.5, STONE, 0, floorH * 0.25, -(postR * Math.cos(Math.PI / 8) + 0.3)); // 디딤돌 (입구 앞, 북쪽)
      break;
    }
    case "fountain": break; // fountain.ts에서 따로 만듦 (물·동전·물보라가 움직여서)
    case "wishTree": {
      // 소원나무: 잎 없이 가지만. 사람들이 매단 쪽지가 잎이 되어 달수록 풍성해짐.
      // 굵은 가지는 쪽지 다는 자리(WISH_CANOPY 잎 덩어리 영역)마다 뻗고, 끝은 잔가지로 갈라짐
      g.add(at(barkPart(trunkGeo(0.3, 0.55, 2.5, 3), T), 0, 1.25, 0));
      const up = new THREE.Vector3(0, 1, 0);
      for (const b of WISH_BRANCHES) { // 가지 배치는 park-map.ts (쪽지도 이 가지 위에 달림)
        const from = new THREE.Vector3(...b.a), to = new THREE.Vector3(...b.b);
        const d = to.clone().sub(from), len = d.length();
        const geo = new THREE.CylinderGeometry(b.r1, b.r0, len, b.r0 > 0.06 ? 9 : 5, 2, true), uv = geo.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * len * 0.5);
        const m = barkPart(geo, b.t);
        m.quaternion.setFromUnitVectors(up, d.normalize()); m.position.copy(from).add(to).multiplyScalar(0.5); g.add(m);
        g.add(at(new THREE.Mesh(new THREE.SphereGeometry(b.r0 * 0.98, 8, 6), toon(BARK)), from.x, from.y, from.z)); // 이음매
      }
      // 사다리: 광장으로 들어오는 서쪽에 기대어 둠 → 다가오면 바로 보임
      const ladRoot = new THREE.Group(); ladRoot.rotation.y = -Math.PI / 2; g.add(ladRoot);
      const lad = new THREE.Group(); lad.position.set(0, 0, 1.0); lad.rotation.x = -0.25;
      for (const s of [-1, 1]) lad.add(at(part(new THREE.BoxGeometry(0.06, 3.2, 0.06), WOOD, T), s * 0.25, 1.55, 0));
      for (let i = 0; i < 8; i++) lad.add(at(part(new THREE.BoxGeometry(0.5, 0.05, 0.05), WOOD, T), 0, 0.3 + i * 0.38, 0));
      ladRoot.add(lad);
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
      this.p.set([x, 0.016, Math.max(z, -7.7), Math.random() * 6.28], i * 4); // 강둑 너머로는 안 깔림
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
      const floor = p[o + 2] < -8.2 ? -0.74 : 0.016; // 강 위로 날아가면 물 위에 내려앉음
      if (p[o + 1] <= floor) { p[o + 1] = floor; this.moving[i] = 0; this.write(i, 0); }
      else this.write(i, Math.sin(p[o + 3] * 2) * 1.2);
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------- 전체 ----------
/** hour: 하늘 시각을 고정해서 보고 싶을 때 (예: ?hour=19) */
export function buildWorld(scene: THREE.Scene, q: Quality, hour?: number, dateMs?: number) {
  const fog = new THREE.Fog(0xf7e3ea, 30, 110);
  scene.fog = fog;
  const hemi = new THREE.HemisphereLight(0xfff4ea, 0xc3b0e0, 1.3);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.2);
  sun.castShadow = true; sun.shadow.mapSize.set(q.shadow, q.shadow);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const sky = createSky(scene, sun, hemi, fog, hour, dateMs);
  const sunDir = new THREE.Vector3(16, 34, 20).normalize(); // 꽃 덩어리 밝은 쪽 (낮 기준 고정)

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
  const river = createRiver(scene, sky.uniforms, { y: -0.75, z: -24.2, width: 32, bankZ: -8.2 });
  flat(new THREE.PlaneGeometry(520, 150), "#bfdea2", 0, -0.3, -115); // 강 건너 땅 (도시 아래까지)
  // 강 건너 공원: 잔디(공원과 같은 높이) + 둑
  flat(new THREE.PlaneGeometry(400, 38), "#c6e5a9", 0, 0.002, BOUNDS_N.maxZ + 0.7 - 19);
  flat(new THREE.PlaneGeometry(400, 0.6), "#e9dccb", 0, 0.012, BOUNDS_N.maxZ + 0.4);
  { const b = new THREE.Mesh(new THREE.PlaneGeometry(400, 0.8), toon("#d8c8b4")); b.position.set(0, -0.4, BOUNDS_N.maxZ + 0.7); scene.add(b); }
  // 강 건너는 나무 다리: 가운데가 살짝 솟은 아치, 단청 빛 난간, 돌 교각
  {
    const g = new THREE.Group(), { x: bx, w, z0, z1 } = BRIDGE, hw = w / 2;
    for (let z = z0 - 0.05; z > z1; z -= 0.42) { // 마루 판자
      const y0 = bridgeY(z), y1 = bridgeY(z - 0.42), m = part(new THREE.BoxGeometry(w + 0.2, 0.1, 0.4), (Math.round(z * 2.4) & 1) ? WOOD : "#c4946a", 0.01);
      m.position.set(bx, (y0 + y1) / 2 - 0.05, z - 0.21); m.rotation.x = Math.atan2(y0 - y1, 0.42); g.add(m);
    }
    const posts: number[] = [];
    for (let z = z0; z >= z1 - 0.01; z -= (z0 - z1) / 12) posts.push(z);
    for (const s of [-1, 1]) {
      const px = bx + s * (hw + 0.06);
      posts.forEach((z, i) => {
        g.add(at(part(new THREE.BoxGeometry(0.14, 1.0, 0.14), DAN_RED, 0.012), px, bridgeY(z) + 0.45, z));
        g.add(at(part(new THREE.SphereGeometry(0.1, 10, 8), DAN_GREEN, 0.01), px, bridgeY(z) + 1.0, z)); // 난간 머리
        const zn = posts[i + 1]; if (zn === undefined) return;
        for (const [h, th] of [[0.9, 0.08], [0.45, 0.05]] as const) { // 위·가운데 난간대
          const ya = bridgeY(z) + h, yb = bridgeY(zn) + h, len = Math.hypot(z - zn, ya - yb);
          const r = part(new THREE.BoxGeometry(th, th, len), DAN_RED, 0.01); r.position.set(px, (ya + yb) / 2, (z + zn) / 2); r.rotation.x = Math.atan2(ya - yb, z - zn); g.add(r);
        }
      });
      // 옆판 (물 위에서 다리 두께가 보이게)
      for (let i = 0; i < posts.length - 1; i++) {
        const z = posts[i], zn = posts[i + 1], ya = bridgeY(z) - 0.2, yb = bridgeY(zn) - 0.2, len = Math.hypot(z - zn, ya - yb);
        const b = part(new THREE.BoxGeometry(0.12, 0.34, len), "#9c6b4a", 0.01); b.position.set(bx + s * (hw + 0.08), (ya + yb) / 2, (z + zn) / 2); b.rotation.x = Math.atan2(ya - yb, z - zn); g.add(b);
      }
    }
    for (let i = 1; i < 4; i++) { // 돌 교각
      const z = z0 + ((z1 - z0) * i) / 4, top = bridgeY(z) - 0.3;
      g.add(at(part(new THREE.BoxGeometry(w + 0.6, top + 1.4, 0.9), STONE, 0.014), bx, (top - 1.4) / 2, z));
    }
    scene.add(bake(g));
  }
  const city = createCity(scene, sky.uniforms, fog); // 강 건너 도시·산·다리 (city.ts)

  // 난간 (강 쪽 경계)
  {
    const r = new THREE.Group();
    // 양쪽 강가 난간 (다리 들어가는 자리는 비움)
    const gap0 = BRIDGE.x - BRIDGE.w / 2 - 0.1, gap1 = BRIDGE.x + BRIDGE.w / 2 + 0.1;
    for (const rz of [BOUNDS.minZ - 0.25, BOUNDS_N.maxZ + 0.25]) {
      for (let x = -64; x <= 64; x += 2.5) if (x < gap0 - 0.2 || x > gap1 + 0.2) r.add(at(part(new THREE.BoxGeometry(0.08, 0.9, 0.08), "#9c8070", 0.012), x, 0.45, rz));
      for (const [a, b] of [[-64, gap0], [gap1, 64]]) r.add(at(part(new THREE.BoxGeometry(b - a, 0.07, 0.07), "#9c8070", 0.012), (a + b) / 2, 0.9, rz));
    }
    scene.add(bake(r));
  }

  // 나무·소품
  const spots: Spot[] = [];
  const statics = new THREE.Group(), extras = new THREE.Group();
  let fountain: ReturnType<typeof createFountain> | null = null;
  for (const p of [...PROPS, ...BACKDROP_TREES]) {
    if (p.kind === "tree") statics.add(cherryTree(p, spots, p.inside ? q.cards : p.z < -70 ? q.cards * 0.3 : q.cards * 0.45)); // 강 건너는 멀어서 잎 카드를 줄여도 풍성해 보임
    else if (p.kind === "fountain") { fountain = createFountain(p, PROP_S, sky.uniforms); scene.add(fountain.group); }
    else buildProp(p, statics);
  }
  // 간판·물 같은 텍스처 붙은 물체는 합치지 않고 따로
  const keep: THREE.Object3D[] = [];
  statics.traverse((o) => { if (o instanceof THREE.Mesh && (o.material as THREE.MeshToonMaterial).map) keep.push(o); });
  for (const o of keep) { o.updateWorldMatrix(true, false); const w = o.matrixWorld.clone(); o.removeFromParent(); w.decompose(o.position, o.quaternion, o.scale); extras.add(o); }
  scene.add(bake(statics), extras);

  // 가로등 청사초롱: 해 지면 따뜻하게 켜짐 (불빛 + 초롱 빛남 + 둘레 은은한 빛무리)
  const glowTex = canvasTex(64, 64, (x) => {
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,226,170,1)"); g.addColorStop(0.35, "rgba(255,200,130,0.45)"); g.addColorStop(1, "rgba(255,190,120,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  });
  const lanterns = PROPS.filter((p) => p.kind === "lamp").map((p) => {
    const yaw = (p as { yaw: number }).yaw, S = PROP_S;
    const pos = new THREE.Vector3(p.x + Math.cos(yaw) * 0.42 * S, 2.25 * S, p.z - Math.sin(yaw) * 0.42 * S);
    const light = new THREE.PointLight("#ffc68a", 0, 9, 1.6); light.position.copy(pos);
    const shine = new THREE.Mesh(new THREE.BoxGeometry(0.31 * S, 0.33 * S, 0.31 * S), new THREE.MeshBasicMaterial({ color: "#ffdca8", transparent: true, opacity: 0, depthWrite: false }));
    shine.position.copy(pos);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.position.copy(pos); halo.scale.setScalar(2.4);
    scene.add(light, shine, halo);
    return { light, shine, halo, ph: p.x };
  });
  const btex = blossomTexture();
  const lit = { sunDir: sky.uniforms.sunDir, sunColor: sky.uniforms.sunColor, haze: { value: fog.color } };
  scene.add(cards(spots.filter((s) => s.k === q.cards), btex, "#efb3c4", "#fdeef2", sunDir, true, lit));
  scene.add(cards(spots.filter((s) => s.k !== q.cards), btex, "#efb3c4", "#fdeef2", sunDir, false, lit)); // 맵 밖 나무는 그림자 없이

  // 꽃잎이 소복이 쌓인 느낌: 나무 밑에 옅은 분홍 깔개 (값싼 반투명 원)
  const inside = PROPS.filter((p): p is Extract<Prop, { kind: "tree" }> => p.kind === "tree");
  {
    const carpet = canvasTex(128, 128, (x) => {
      const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, "rgba(244,160,186,0.75)"); gr.addColorStop(0.55, "rgba(247,182,201,0.5)"); gr.addColorStop(1, "rgba(250,205,218,0)");
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    });
    const mat = new THREE.MeshToonMaterial({ map: carpet, gradientMap: toonGradient(), transparent: true, depthWrite: false,
      clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, 0, 1), 7.95)] }); // 강둑 너머(물 위)로는 안 그림
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


  return {
    /** focus = 내 캐릭터 위치(그림자·꽃잎이 따라옴), walking = 걷는 중이면 발밑 꽃잎을 흩뜨림 */
    /** 분수에 던진 동전이 바닥에 남음 */
    addCoin: (x: number, z: number) => fountain?.addCoin(x, z),
    update(t: number, dt: number, focus: THREE.Vector3, walking = false, yaw = 0) {
      fountain?.update(t, dt, fog);
      city.update(t);
      const on = THREE.MathUtils.smoothstep(sky.uniforms.night.value, 0.15, 0.6); // 해 질 녘부터 서서히
      for (const l of lanterns) {
        const flick = 1 + Math.sin(t * 7.3 + l.ph) * 0.03 + Math.sin(t * 13.1 + l.ph * 2) * 0.02; // 초롱불 살짝 일렁임
        l.light.intensity = on * 6 * flick;
        (l.shine.material as THREE.MeshBasicMaterial).opacity = on * 0.9;
        l.halo.material.opacity = on * 0.75 * flick; l.halo.visible = on > 0.01;
      }
      sky.update(t, focus);
      sun.position.copy(focus).addScaledVector(sky.lightDir, 45); sun.target.position.copy(focus);
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
      river.update(t, fog);
      return wind;
    },
  };
}

export { OUTLINE };
