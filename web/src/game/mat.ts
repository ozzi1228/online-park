// 돗자리: 2인용 천 (색은 살 때 고름). 깐 사람은 왼쪽 자리, 오른쪽 자리에 한 명 더 앉을 수 있음.
// 위치는 깐 사람의 자리·방향으로 계산 → 서버에 따로 저장할 필요 없음
import * as THREE from "three";
import { toonGradient } from "./character";
import { groundY, onPath } from "./park-map";
import { MAT_COLORS, type MatColor } from "@/lib/mat-colors";

export const MAT_W = 2.7, MAT_D = 1.7, SEAT_GAP = 1.0; // 두 자리 사이 거리

/** 캐릭터 기준 오른쪽 방향 */
const right = (yaw: number) => ({ x: -Math.cos(yaw), z: Math.sin(yaw) });
/** 깐 사람 자리(x,z)·방향으로 돗자리 가운데 */
export const matCenter = (x: number, z: number, yaw: number) => { const r = right(yaw); return { x: x + r.x * SEAT_GAP / 2, z: z + r.z * SEAT_GAP / 2 }; };
/** 같이 앉는 사람 자리 */
export const secondSeat = (x: number, z: number, yaw: number) => { const r = right(yaw); return { x: x + r.x * SEAT_GAP, z: z + r.z * SEAT_GAP }; };

/** 돗자리를 통째로 잔디 위에 펼 수 있는지: 천 전체(가장자리 포함)가 길·광장·정자에서 떨어져 있어야 (산책하는 사람 길 막지 않게) */
export function matFits(x: number, z: number, yaw: number) {
  const c = matCenter(x, z, yaw), r = right(yaw), f = { x: Math.sin(yaw), z: Math.cos(yaw) };
  for (let a = -1; a <= 1; a += 0.5) for (let b = -1; b <= 1; b += 0.5) {
    const px = c.x + r.x * a * MAT_W / 2 + f.x * b * MAT_D / 2, pz = c.z + r.z * a * MAT_W / 2 + f.z * b * MAT_D / 2;
    if (groundY(px, pz) !== 0 || onPath(px, pz, 0.3)) return false;
  }
  return true;
}

// 색마다 무늬가 다름: 분홍 깅엄 · 노랑 깅엄+흰 테 · 파랑 줄무늬 · 초록 타탄 · 흰 바탕 벚꽃 무늬. 천 한 장을 통째로 그림(가장자리 단 포함)
const W = 512, H = 326;
const tex = new Map<MatColor, THREE.CanvasTexture>();
function gingham(x: CanvasRenderingContext2D, base: string, band: string, step: number) {
  x.fillStyle = base; x.fillRect(0, 0, W, H);
  x.fillStyle = band;
  for (let i = 0; i * step < W; i += 2) x.fillRect(i * step, 0, step, H);
  for (let i = 0; i * step < H; i += 2) x.fillRect(0, i * step, W, step);
}
function hem(x: CanvasRenderingContext2D, color: string, w = 10, stitch = "rgba(255,255,255,0.8)") {
  x.strokeStyle = color; x.lineWidth = w * 2; x.strokeRect(0, 0, W, H);
  x.strokeStyle = stitch; x.lineWidth = 2; x.setLineDash([7, 6]); x.strokeRect(w + 4, w + 4, W - 2 * (w + 4), H - 2 * (w + 4)); x.setLineDash([]);
}
function blossom(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string) {
  x.fillStyle = fill;
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 - Math.PI / 2; x.beginPath(); x.ellipse(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.5, r * 0.36, a, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = "#f6c94a"; x.beginPath(); x.arc(cx, cy, r * 0.18, 0, Math.PI * 2); x.fill();
}
const PAINT: Record<MatColor, (x: CanvasRenderingContext2D) => void> = {
  pink: (x) => { gingham(x, "#fff6f2", "rgba(240,140,170,0.55)", 26); hem(x, "#ee9bb5"); },
  yellow: (x) => { gingham(x, "#fffaf0", "rgba(246,200,80,0.6)", 22); hem(x, "#fffaf0", 12, "rgba(230,170,40,0.9)"); },
  blue: (x) => {
    x.fillStyle = "#eaf4fb"; x.fillRect(0, 0, W, H);
    for (let i = 0; i < W; i += 64) { x.fillStyle = "#6fa6dc"; x.fillRect(i, 0, 30, H); x.fillStyle = "#2f5f9e"; x.fillRect(i + 36, 0, 6, H); }
    hem(x, "#2f5f9e");
  },
  green: (x) => {
    x.fillStyle = "#7fbf87"; x.fillRect(0, 0, W, H);
    x.fillStyle = "rgba(40,100,60,0.45)";
    for (let i = 0; i < W; i += 80) x.fillRect(i + 20, 0, 34, H);
    for (let i = 0; i < H; i += 80) x.fillRect(0, i + 20, W, 34);
    x.fillStyle = "rgba(255,230,120,0.85)";
    for (let i = 0; i < W; i += 80) x.fillRect(i + 64, 0, 3, H);
    for (let i = 0; i < H; i += 80) x.fillRect(0, i + 64, W, 3);
    hem(x, "#3f7f4c");
  },
  white: (x) => {
    x.fillStyle = "#fffdf8"; x.fillRect(0, 0, W, H);
    for (let r = 0, y = 40; y < H - 20; y += 56, r++) for (let cx = r % 2 ? 70 : 42; cx < W - 20; cx += 64) blossom(x, cx, y, 13, "rgba(244,160,186,0.85)");
    hem(x, "#f4c3d2", 10, "#ffffff");
  },
};
function matTexture(color: MatColor) {
  let t = tex.get(color);
  if (t) return t;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  PAINT[color](c.getContext("2d")!);
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  tex.set(color, t);
  return t;
}

/** 메뉴에 띄울 돗자리 미리보기 그림 (3D에 깔리는 것과 같은 무늬) */
const previews = new Map<MatColor, string>();
export function matPreview(color: MatColor) {
  let u = previews.get(color);
  if (!u) { u = (matTexture(color).image as HTMLCanvasElement).toDataURL("image/png"); previews.set(color, u); }
  return u;
}

export function makeMat(color: MatColor = "pink") {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(MAT_W, MAT_D), new THREE.MeshToonMaterial({ map: matTexture(color), gradientMap: toonGradient() }));
  m.geometry.rotateX(-Math.PI / 2);
  m.receiveShadow = true;
  return m;
}

/** 돗자리 색 바꾸기 */
export function paintMat(m: THREE.Mesh, color: MatColor) {
  const mat = m.material as THREE.MeshToonMaterial, t = matTexture(color);
  if (mat.map !== t) { mat.map = t; mat.needsUpdate = true; }
}

/** 실시간 서버에 보내는 앉은 동작: "sitmat:파랑" 처럼 색을 붙여 보냄 */
export const matAnim = (color: MatColor) => `sitmat:${color}` as const;
export const matColorOf = (anim: string): MatColor | null => {
  if (!anim.startsWith("sitmat")) return null;
  const c = anim.split(":")[1] as MatColor;
  return MAT_COLORS.includes(c) ? c : "pink";
};

/** 깐 사람 기준으로 돗자리 놓기 */
export function placeMat(m: THREE.Object3D, ownerX: number, ownerZ: number, yaw: number, y = 0.02) {
  const c = matCenter(ownerX, ownerZ, yaw);
  m.position.set(c.x, y, c.z); m.rotation.y = yaw;
}
