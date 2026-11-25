// 코드로 조립하는 치비 캐릭터. 2단 툰 셰이딩 + 뒷면 외곽선. (브라우저 전용)
import * as THREE from "three";
import type { Preset } from "./presets";

// ---------- 공용 재질 ----------
let gradCache: THREE.DataTexture | null = null;
export const toonGradient = () => {
  if (!gradCache) {
    gradCache = new THREE.DataTexture(new Uint8Array([160, 160, 160, 255, 255, 255, 255, 255]), 2, 1);
    gradCache.minFilter = gradCache.magFilter = THREE.NearestFilter;
    gradCache.needsUpdate = true;
  }
  return gradCache;
};
const toonCache = new Map<string, THREE.MeshToonMaterial>();
export const toon = (c: string) => {
  let m = toonCache.get(c);
  if (!m) toonCache.set(c, (m = new THREE.MeshToonMaterial({ color: c, gradientMap: toonGradient() })));
  return m;
};
const lineCache = new Map<string, THREE.MeshBasicMaterial>();
const lineMat = (c: string) => {
  let m = lineCache.get(c);
  if (!m) lineCache.set(c, (m = new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide })));
  return m;
};
export const OUTLINE = "#5a3a30";

/** 중심 정렬된 지오메트리 + 살짝 키운 뒷면으로 일정한 두께 외곽선 */
export function part(geo: THREE.BufferGeometry, color: string, t = 0.018, oc = OUTLINE) {
  const m = new THREE.Mesh(geo, toon(color));
  m.castShadow = true; m.receiveShadow = true;
  if (t) {
    geo.computeBoundingBox();
    const s = geo.boundingBox!.getSize(new THREE.Vector3());
    const o = new THREE.Mesh(geo, lineMat(oc));
    o.scale.set((s.x + 2 * t) / s.x, (s.y + 2 * t) / s.y, (s.z + 2 * t) / s.z);
    m.add(o);
  }
  return m;
}
export const at = <T extends THREE.Object3D>(m: T, x: number, y: number, z: number) => (m.position.set(x, y, z), m);
const sph = (r: number, sx = 1, sy = 1, sz = 1) => new THREE.SphereGeometry(r, 24, 16).scale(sx, sy, sz);
const cap = (r: number, l: number, sx = 1, sz = 1) => new THREE.CapsuleGeometry(r, l, 6, 14).scale(sx, 1, sz);

// ---------- 얼굴 ----------
/** grin = 입을 벌리고 활짝 웃는 입, stern = 단호한 얼굴 (눈썹 내리고 입 꾹) */
export function faceTexture(p: Preset, closed: boolean, grin = false, stern = false) {
  // 256x192 = 머리 앞면 장식 구간 비율
  const c = document.createElement("canvas"); c.width = 256; c.height = 192;
  const x = c.getContext("2d")!; x.lineCap = "round";
  const ec = p.eye || "#3b2a24";
  x.fillStyle = "rgba(247,140,165,0.5)";
  for (const s of [-1, 1]) { x.beginPath(); x.ellipse(128 + s * 74, 102, 19, 10, 0, 0, 7); x.fill(); }
  for (const s of [-1, 1]) {
    const ex = 128 + s * 48, ey = 76;
    x.strokeStyle = ec; x.fillStyle = ec; x.lineWidth = 6;
    if (closed) { x.beginPath(); x.arc(ex, ey - 6, 12, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke(); }
    else if (p.smile) { x.beginPath(); x.arc(ex, ey + 6, 12, 1.15 * Math.PI, 1.85 * Math.PI); x.stroke(); }
    else {
      x.beginPath(); x.ellipse(ex, ey, 10, 14, 0, 0, 7); x.fill();
      x.fillStyle = "#fff"; x.beginPath(); x.arc(ex + 3, ey - 5, 3.5, 0, 7); x.fill();
    }
    x.strokeStyle = p.brow || "#5a3a30"; x.lineWidth = 5;
    if (stern) { x.beginPath(); x.moveTo(ex - s * 13, 36); x.lineTo(ex + s * 11, 48); x.stroke(); } // 안쪽이 내려간 눈썹
    else { x.beginPath(); x.moveTo(ex - 11, 42); x.quadraticCurveTo(ex, 36, ex + 11, 42); x.stroke(); }
    if (p.glasses) { x.strokeStyle = "#6b4a3a"; x.lineWidth = 4; x.beginPath(); x.arc(ex, ey, 23, 0, 7); x.stroke(); }
  }
  if (p.glasses) { x.beginPath(); x.moveTo(105, 74); x.lineTo(151, 74); x.stroke(); }
  x.strokeStyle = "#8a4a42"; x.lineWidth = 5;
  if (grin) { // 반달 모양으로 벌린 입 + 혀
    x.lineJoin = "round"; x.fillStyle = "#b44a5c";
    x.beginPath(); x.moveTo(114, 111); x.quadraticCurveTo(128, 114, 142, 111); x.quadraticCurveTo(140, 130, 128, 131); x.quadraticCurveTo(116, 130, 114, 111); x.closePath();
    x.fill(); x.lineWidth = 4; x.stroke();
    x.fillStyle = "#f08a9a"; x.beginPath(); x.ellipse(128, 126, 6, 3.5, 0, 0, 7); x.fill();
  } else if (stern) { x.beginPath(); x.moveTo(117, 120); x.lineTo(139, 120); x.stroke(); } // 꾹 다문 입
  else { x.beginPath(); x.arc(128, 116, 9, 0.2 * Math.PI, 0.8 * Math.PI); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export type Character = ReturnType<typeof makeChar>;
export type Mode = "idle" | "walk" | "wish" | "sit" | "sitwish" | "lie";
/** wave = 웃으며 손 흔들기, shake = 단호하게 고개 절레절레, stomp = 신나서 발 동동, cheer = 만세하며 펄쩍펄쩍 (분수 정중앙) */
export type Gesture = "wave" | "shake" | "stomp" | "cheer";
const GESTURE_SEC: Record<Gesture, number> = { wave: 2.4, shake: 1.6, stomp: 1.8, cheer: 2.6 };
export const isGesture = (k: unknown): k is Gesture => k === "wave" || k === "shake" || k === "stomp" || k === "cheer";
/** 몸짓 시작 (t = animateChar에 넘기는 시각과 같은 시계) */
export function playGesture(c: Character, kind: Gesture, t: number) { c.gesture = { kind, t0: t }; }

// ---------- 조립 ----------
export function makeChar(p: Preset) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const H = 0.98; // 목 높이
  const bt = p.bottomType || "pants", tt = p.topType || "tee";
  const add = (geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, parent: THREE.Object3D = body) => {
    const m = at(part(geo, color), x, y, z); parent.add(m); return m;
  };
  // 하체
  const bareLegs = bt === "skirt" || bt === "longskirt" || bt === "shorts" || bt === "chima";
  const legs = [-1, 1].map((s) => {
    const g = new THREE.Group(); g.position.set(s * 0.1, 0.46, 0);
    add(bt === "wide" ? cap(0.11, 0.18) : cap(0.085, 0.2), bareLegs ? p.skin : p.bottom, 0, -0.18, 0, g);
    if (bt === "shorts") add(cap(0.097, 0.05), p.bottom, 0, -0.03, 0, g);
    add(sph(0.1, 1, 0.62, 1.4), p.shoes, 0, -0.4, 0.04, g);
    body.add(g); return g;
  });
  add(cap(0.2, 0.18, 1, 0.9), p.top, 0, 0.72, 0);
  if (bt === "skirt") add(new THREE.CylinderGeometry(0.19, 0.3, 0.26, 18), p.bottom, 0, 0.5, 0);
  else if (bt === "longskirt") add(new THREE.CylinderGeometry(0.2, 0.34, 0.44, 18), p.bottom, 0, 0.36, 0);
  else if (bt === "chima") { // 가슴께부터 발끝까지 풍성하게 퍼지는 치마 + 허리 말기
    add(new THREE.CylinderGeometry(0.215, 0.37, 0.8, 22), p.bottom, 0, 0.47, 0);
    add(new THREE.CylinderGeometry(0.218, 0.222, 0.05, 22), "#ffffff", 0, 0.86, 0, body);
  }
  else add(sph(0.2, 1, 0.55, 0.9), p.bottom, 0, 0.5, 0);
  // 상의 디테일
  if (tt === "hoodie") { add(sph(0.2, 1.25, 0.7, 0.9), p.top, 0, 1.0, -0.2); add(new THREE.BoxGeometry(0.2, 0.08, 0.03), p.top, 0, 0.6, 0.175); }
  if (tt === "jacket") {
    add(new THREE.BoxGeometry(0.1, 0.42, 0.04), p.inner || "#ffffff", 0, 0.72, 0.17);
    if (p.tie) add(new THREE.BoxGeometry(0.035, 0.2, 0.03), p.tie, 0, 0.76, 0.193);
  }
  if (tt === "hanbok") { // 저고리: 오른쪽 위로 여민 깃 + 옷고름 (흰 동정은 collar로)
    const git = p.inner || "#2f4f6f";
    add(new THREE.BoxGeometry(0.055, 0.34, 0.03), git, 0.035, 0.82, 0.168).rotation.set(-0.25, 0, 0.62);
    add(new THREE.BoxGeometry(0.05, 0.16, 0.03), git, -0.07, 0.9, 0.162).rotation.set(-0.3, 0, -0.5);
    if (p.tie && bt === "chima") { // 치마 위로 길게 늘어지는 옷고름
      add(sph(0.03), p.tie, 0.09, 0.9, 0.2);
      add(new THREE.BoxGeometry(0.035, 0.34, 0.02), p.tie, 0.075, 0.72, 0.255).rotation.set(-0.19, 0, -0.08);
      add(new THREE.BoxGeometry(0.03, 0.26, 0.02), p.tie, 0.115, 0.76, 0.25).rotation.set(-0.19, 0, 0.14);
    } else if (p.tie) {
      add(sph(0.03), p.tie, 0.1, 0.72, 0.185);
      add(new THREE.BoxGeometry(0.035, 0.26, 0.02), p.tie, 0.085, 0.6, 0.19).rotation.z = -0.12;
      add(new THREE.BoxGeometry(0.03, 0.2, 0.02), p.tie, 0.125, 0.63, 0.188).rotation.z = 0.18;
    }
  }
  if (tt === "durumagi") { // 두루마기: 가슴께부터 무릎 아래까지 내려오는 겉옷 + 흰 깃(오른쪽 위로 여밈) + 허리 세조대(끈)와 술
    add(new THREE.CylinderGeometry(0.215, 0.315, 0.6, 22), p.top, 0, 0.5, 0);
    const git = p.inner || "#ffffff";
    add(new THREE.BoxGeometry(0.055, 0.34, 0.03), git, 0.035, 0.82, 0.168).rotation.set(-0.25, 0, 0.62);
    add(new THREE.BoxGeometry(0.05, 0.16, 0.03), git, -0.07, 0.9, 0.162).rotation.set(-0.3, 0, -0.5);
    add(new THREE.BoxGeometry(0.02, 0.5, 0.02), p.top, 0.02, 0.45, 0.25).rotation.x = -0.18; // 앞자락 여밈선 (살짝 그늘)
    const cord = p.tie || "#9aa0aa";
    add(new THREE.TorusGeometry(0.222, 0.012, 6, 28), cord, 0, 0.66, 0).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.009, 0.009, 0.36, 6), cord, 0.12, 0.49, 0.2).rotation.z = 0.08;   // 늘어진 끈
    add(new THREE.ConeGeometry(0.028, 0.1, 10), cord, 0.135, 0.29, 0.21).rotation.z = Math.PI;         // 술
  }
  if (tt === "overalls") {
    add(new THREE.BoxGeometry(0.22, 0.2, 0.04), p.bottom, 0, 0.66, 0.175);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.26, 0.03), p.bottom, s * 0.08, 0.86, 0.165);
  }
  if (p.collar) add(new THREE.TorusGeometry(0.15, 0.035, 8, 20), p.collar, 0, 0.98, 0.01).rotation.x = Math.PI / 2;
  if (p.scarf) add(new THREE.TorusGeometry(0.16, 0.065, 8, 20), p.scarf, 0, 0.97, 0).rotation.x = Math.PI / 2;
  if (p.bag) {
    add(new THREE.BoxGeometry(0.15, 0.13, 0.06), p.bag, 0.21, 0.52, 0.1);
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 6), p.bag, 0.02, 0.78, 0.185).rotation.z = 0.75;
  }
  const arms = [-1, 1].map((s) => {
    const g = new THREE.Group(); g.position.set(s * 0.25, 0.92, 0);
    add(cap(tt === "hanbok" || tt === "durumagi" ? 0.085 : 0.065, 0.2), p.top, 0, -0.16, 0, g); // 한복은 소매가 넉넉
    add(sph(0.07), p.skin, 0, -0.33, 0, g);
    body.add(g); return g;
  });
  // 머리
  const head = new THREE.Group(); head.position.y = H; body.add(head);
  const hy = (y: number) => y - H;
  head.add(at(part(sph(0.34), p.skin), 0, hy(1.3), 0));
  for (const s of [-1, 1]) head.add(at(part(sph(0.07, 0.6, 1, 1), p.skin), s * 0.335, hy(1.27), 0));
  const texOpen = faceTexture(p, false), texClosed = faceTexture(p, true);
  const faceMat = new THREE.MeshToonMaterial({ map: texOpen, gradientMap: toonGradient(), transparent: true, depthWrite: false });
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.343, 32, 16, Math.PI / 2 - 0.8, 1.6, 0.4 * Math.PI, 0.38 * Math.PI), faceMat);
  face.position.y = hy(1.3); face.renderOrder = 2; head.add(face);
  const hc = p.hair;
  const hairAt = (geo: THREE.BufferGeometry, x: number, y: number, z: number, c = hc) => { const m = at(part(geo, c), x, hy(y), z); head.add(m); return m; };
  if (p.style === "bald") {
    hairAt(sph(0.355), 0, 1.27, -0.08);
  } else {
    hairAt(sph(0.36), 0, 1.34, -0.03);
    const noBangs = p.bangs === "none" || p.style === "slick" || p.style === "manbun" || p.style === "binyeo";
    const bangs = p.bangs === "side" ? [[-0.15, 0.6], [0.06, 1], [0.2, 0.7]] : [[-0.15, 1], [0, 1], [0.15, 1]];
    if (!noBangs) for (const [bx, k] of bangs) {
      const b = part(sph(0.13, 1, 0.62 * k + 0.2, 0.55), hc);
      b.position.set(bx, hy(1.47), 0.27 - Math.abs(bx) * 0.25); b.rotation.y = bx * 1.6; b.rotation.x = -0.35;
      head.add(b);
    }
  }
  if (p.style === "long" || p.style === "wavy") {
    hairAt(cap(0.2, 0.32, 1.55, 0.55), 0, 1.13, -0.2);
    for (const s of [-1, 1]) hairAt(cap(0.075, 0.3), s * 0.3, 1.13, 0.06);
  }
  if (p.style === "wavy") for (const [x, y, z] of [[-0.2, 0.95, -0.2], [0, 0.93, -0.24], [0.2, 0.95, -0.2], [-0.31, 0.95, 0.06], [0.31, 0.95, 0.06]]) hairAt(sph(0.1), x, y, z);
  if (p.style === "bob") {
    for (const s of [-1, 1]) hairAt(sph(0.15, 1, 1.6, 1.35), s * 0.27, 1.2, -0.02);
    hairAt(sph(0.3, 1, 0.75, 0.6), 0, 1.18, -0.2);
  }
  if (p.style === "buns") for (const s of [-1, 1]) hairAt(sph(0.12), s * 0.21, 1.62, -0.06);
  if (p.style === "pony") { hairAt(sph(0.1), 0, 1.45, -0.36); hairAt(cap(0.085, 0.22), 0, 1.24, -0.42); }
  if (p.style === "twotail") for (const s of [-1, 1]) { hairAt(sph(0.08), s * 0.3, 1.36, -0.16); hairAt(cap(0.075, 0.22), s * 0.34, 1.13, -0.14); }
  if (p.style === "manbun") hairAt(sph(0.12), 0, 1.66, -0.14);
  if (p.style === "binyeo") { // 가르마 + 뒤로 낮게 쪽진 머리 + 가로로 꽂은 비녀
    hairAt(new THREE.BoxGeometry(0.012, 0.01, 0.2), 0, 1.695, 0.12, p.skin).rotation.x = 0.5;
    hairAt(sph(0.155, 1.25, 0.85, 0.95), 0, 1.13, -0.37);
    const pin = p.pin || "#f2c94c";
    hairAt(new THREE.CylinderGeometry(0.016, 0.016, 0.56, 10), -0.03, 1.15, -0.4, pin).rotation.z = Math.PI / 2;
    hairAt(sph(0.035, 1.2, 1, 1), -0.32, 1.15, -0.4, pin); // 비녀 머리 장식
    hairAt(sph(0.018), 0.25, 1.15, -0.4, pin);
  }
  if (p.style === "braid") for (let i = 0; i < 4; i++) hairAt(sph(0.075 - i * 0.008), 0.29, 1.17 - i * 0.11, 0.1);
  if (p.style === "curly") for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    hairAt(sph(0.11), Math.cos(a) * 0.24, 1.55 + Math.sin(i * 2.3) * 0.05, Math.sin(a) * 0.24 - 0.04);
  }
  // 모자·장식
  const hcol = p.hatColor || "#ffffff";
  if (p.hat === "beanie") { hairAt(sph(0.38, 1, 0.72, 1), 0, 1.5, -0.02, hcol); hairAt(new THREE.CylinderGeometry(0.375, 0.375, 0.08, 28), 0, 1.42, -0.02, hcol); hairAt(sph(0.07), 0, 1.79, -0.02, hcol); }
  if (p.hat === "cap") { hairAt(sph(0.375, 1, 0.66, 1), 0, 1.5, -0.02, hcol); hairAt(sph(0.2, 1.1, 0.1, 1), 0, 1.44, 0.36, hcol); }
  if (p.hat === "bucket") { hairAt(sph(0.365, 1, 0.66, 1), 0, 1.52, -0.02, hcol); hairAt(new THREE.CylinderGeometry(0.46, 0.5, 0.035, 28), 0, 1.42, -0.02, hcol); }
  if (p.hat === "gat") { // 갓: 넓은 챙 + 원통 모자
    const black = p.hatColor || "#26262c";
    hairAt(new THREE.CylinderGeometry(0.6, 0.6, 0.018, 40), 0, 1.6, -0.02, black);
    hairAt(new THREE.CylinderGeometry(0.17, 0.19, 0.27, 28), 0, 1.74, -0.02, black);
    hairAt(new THREE.CylinderGeometry(0.2, 0.2, 0.035, 28), 0, 1.625, -0.02, "#3c3c46"); // 모자 띠
    for (const s of [-1, 1]) { // 갓끈: 챙에서 턱 아래로 내려와 매고, 앞으로 길게 늘어짐
      hairAt(new THREE.CylinderGeometry(0.008, 0.008, 0.42, 6), s * 0.27, 1.38, 0.02, black).rotation.z = s * 0.25;
      hairAt(new THREE.BoxGeometry(0.03, 0.2, 0.012), s * 0.025, 0.86, 0.22, black).rotation.z = s * 0.15; // 턱 아래 매듭에서 가슴으로
    }
    for (let i = 0; i < 7; i++) hairAt(sph(0.016), 0.05, 0.97 - i * 0.042, 0.215 + i * 0.006, "#b6643c"); // 구슬 갓끈 (호박빛): 턱 아래에서 가슴으로
  }
  if (p.hat === "beret") hairAt(sph(0.37, 1.05, 0.38, 1.05), 0.03, 1.62, -0.02, hcol).rotation.z = -0.22;
  if (p.ribbon) for (const s of [-1, 1]) hairAt(sph(0.06, 1, 0.8, 0.7), 0.24 + s * 0.07, 1.6, 0.06, p.ribbon);
  if (p.kid) { root.scale.setScalar(0.76); head.scale.setScalar(1.12); }

  return {
    root, body, head, arms, legs, faceMat, texOpen, texClosed, preset: p,
    /** 잠깐 하는 몸짓 (손 흔들기·고개 젓기·발 동동) */
    gesture: null as { kind: Gesture; t0: number } | null,
    faces: {} as Partial<Record<"grin" | "stern", THREE.CanvasTexture>>,
    ph: Math.random() * 6, blinkAt: 1 + Math.random() * 3,
    /** 이름표 높이 */
    top: (p.kid ? 1.55 : 1.85) + (p.hat ? 0.12 : 0),
  };
}

/** 그 캐릭터가 쓰던 GPU 자원 해제 (공용 재질은 남김) */
export function disposeChar(c: Character) {
  c.root.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  c.faceMat.dispose(); c.texOpen.dispose(); c.texClosed.dispose(); c.faces.grin?.dispose(); c.faces.stern?.dispose();
}

// ---------- 동작 ----------
const ease = (obj: { [k: string]: number } | THREE.Euler | THREE.Vector3, key: "x" | "y" | "z", target: number, k: number) => {
  (obj as THREE.Vector3)[key] += (target - (obj as THREE.Vector3)[key]) * k;
};
export function animateChar(c: Character, t: number, dt: number, mode: Mode) {
  const k = 1 - Math.exp(-dt * 14);
  const s = Math.sin(t * 7 + c.ph);
  let legX = 0, armX = 0, armZ = 0.1, bodyY = Math.sin(t * 2 + c.ph) * 0.012, headX = 0, closed = false;
  if (mode === "walk") { legX = 0.55 * s; armX = -0.5 * s; armZ = 0.12; bodyY = Math.abs(s) * 0.045; }
  if (mode === "wish") { armX = -1.25; armZ = -0.62; headX = 0.2; closed = true; }
  if (mode === "sit") { legX = -1.45; armX = -0.35; armZ = 0.15; bodyY = -0.3; }
  if (mode === "sitwish") { legX = -1.45; bodyY = -0.3; armX = -1.25; armZ = -0.62; headX = 0.2; closed = true; } // 앉은 채로 손 모으기
  const seated = mode === "sit" || mode === "sitwish";
  // 드러눕기: 등을 대고 대자로 (머리는 보던 쪽 반대, 발끝이 보던 쪽)
  const lie = mode === "lie";
  ease(c.body.rotation, "x", lie ? -Math.PI / 2 : 0, k * 0.6);
  ease(c.body.position, "z", lie ? 0.75 : 0, k * 0.6);
  for (const [i, s] of [[0, -1], [1, 1]] as const) ease(c.legs[i].rotation, "z", lie ? s * 0.32 : 0, k);
  if (lie) { legX = 0; armX = 0; armZ = 1.35; bodyY = 0.2; headX = 0; }
  let arm0X = mode === "walk" ? -armX : armX, arm0Z = -armZ, arm1Z = armZ, leg1X = seated ? legX : -legX, headY = 0;
  let face: "grin" | "stern" | null = null;
  const g = c.gesture, gt = g ? t - g.t0 : 0;
  if (g && (gt < 0 || gt > GESTURE_SEC[g.kind])) c.gesture = null;
  else if (g && mode !== "walk") {
    const fade = Math.min(1, gt * 6, (GESTURE_SEC[g.kind] - gt) * 4); // 시작·끝은 부드럽게
    if (g.kind === "wave") { // 한 손을 번쩍 들어 흔들흔들 + 활짝 웃기 (앉아서도)
      arm0X = -0.2; arm0Z = -(2.55 + Math.sin(gt * 11) * 0.4) * fade; headX = -0.08; face = "grin";
    } else if (g.kind === "shake") { // 고개 절레절레 + 단호한 얼굴
      headY = Math.sin(gt * 15) * 0.5 * fade; face = "stern";
    } else if (g.kind === "cheer" && !seated) { // 만세! 두 팔을 번쩍 들고 흔들며 세 번 펄쩍
      const hop = Math.max(0, Math.sin(gt * 7.3)), wig = Math.sin(gt * 16) * 0.25;
      bodyY = hop * 0.38 * fade; legX = -0.55 * hop * fade; leg1X = legX; // 뛰어오르면 무릎을 접음
      arm0X = -0.15 * fade; armX = arm0X; arm0Z = -(2.85 + wig) * fade - armZ * (1 - fade); arm1Z = (2.85 - wig) * fade + armZ * (1 - fade);
      headX = -0.18 * fade; face = "grin";
    } else if (g.kind === "stomp" && !seated) { // 발 동동: 제자리에서 빠르게 콩콩 + 두 팔 들고 웃기
      const st = Math.sin(gt * 18);
      legX = 0.5 * st * fade; leg1X = -legX; bodyY = Math.abs(st) * 0.07 * fade;
      arm0X = arm0X * (1 - fade) - 0.3 * fade; armX = arm0X; arm0Z = -1.2 * fade - armZ * (1 - fade); arm1Z = -arm0Z; face = "grin";
    }
  }
  ease(c.legs[0].rotation, "x", legX, k);
  ease(c.legs[1].rotation, "x", leg1X, k);
  ease(c.arms[0].rotation, "x", arm0X, k);
  ease(c.arms[1].rotation, "x", armX, k);
  ease(c.arms[0].rotation, "z", arm0Z, k);
  ease(c.arms[1].rotation, "z", arm1Z, k);
  ease(c.body.position, "y", bodyY, k);
  ease(c.head.rotation, "x", headX, k);
  ease(c.head.rotation, "y", headY, Math.min(1, k * 2));
  if (!face && t > c.blinkAt) { if (t > c.blinkAt + 0.13) c.blinkAt = t + 2 + Math.random() * 3; else closed = true; }
  if (face && !c.faces[face]) c.faces[face] = faceTexture(c.preset, false, face === "grin", face === "stern");
  const tex = face ? c.faces[face]! : closed ? c.texClosed : c.texOpen;
  if (c.faceMat.map !== tex) c.faceMat.map = tex;
}
