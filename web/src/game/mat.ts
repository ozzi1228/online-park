// 돗자리: 분홍 체크무늬 2인용 천. 깐 사람은 왼쪽 자리, 오른쪽 자리에 한 명 더 앉을 수 있음.
// 위치는 깐 사람의 자리·방향으로 계산 → 서버에 따로 저장할 필요 없음
import * as THREE from "three";
import { toonGradient } from "./character";
import { groundY, onPath } from "./park-map";

export const MAT_W = 2.2, MAT_D = 1.4, SEAT_GAP = 0.85; // 두 자리 사이 거리

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

let tex: THREE.CanvasTexture | null = null;
function matTexture() {
  if (tex) return tex;
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d")!;
  x.fillStyle = "#fff6f2"; x.fillRect(0, 0, 128, 128);
  x.fillStyle = "rgba(240,140,170,0.55)";
  for (let i = 0; i < 8; i += 2) { x.fillRect(i * 16, 0, 16, 128); x.fillRect(0, i * 16, 128, 16); }
  tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2.5, 1.6);
  return tex;
}

export function makeMat() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(MAT_W, MAT_D), new THREE.MeshToonMaterial({ map: matTexture(), gradientMap: toonGradient() }));
  m.geometry.rotateX(-Math.PI / 2);
  m.receiveShadow = true;
  return m;
}

/** 깐 사람 기준으로 돗자리 놓기 */
export function placeMat(m: THREE.Object3D, ownerX: number, ownerZ: number, yaw: number, y = 0.02) {
  const c = matCenter(ownerX, ownerZ, yaw);
  m.position.set(c.x, y, c.z); m.rotation.y = yaw;
}
