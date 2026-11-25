// 우하단 미니맵: 내 주변 정사각형, 보는 방향이 항상 위. 끌어서 둘러보고, 휠·두 손가락으로 확대/축소.
// 손을 떼고 잠시 지나면 내 위치로 부드럽게 돌아옴. 맵 전체는 한 번만 그려두고 잘라서 씀.
import { BOUNDS, BOUNDS_N, BRIDGE, PATHS, PLAZA, PROPS } from "./park-map";

/** 미니맵에 담는 범위: 강 건너 공원부터 공원 남쪽 끝까지 */
const MAP = { minX: BOUNDS.minX, maxX: BOUNDS.maxX, minZ: BOUNDS_N.minZ, maxZ: BOUNDS.maxZ };

const PAD = 6;                 // 경계 바깥 여백(m)
const RES = 8;                 // 미리 그려둘 해상도 (px/m)
const R_MIN = 8, R_MAX = 70, R_DEFAULT = 22; // 보이는 반경(m)
const RECENTER_AFTER = 2.5;    // 손 뗀 뒤 돌아오기까지(초)
const C = { grass: "#cfe8b4", water: "#a7d9ee", shore: "#e9e1cf", path: "#f6ead9", plaza: "#efe0cc", tree: "#f5b4c8", treeEdge: "#ec9db5", roof: "#5f6b78", wish: "#6aa874", me: "#e8628a" };

function drawWorld(b: CanvasRenderingContext2D) {
  const W = MAP.maxX - MAP.minX + PAD * 2;
  b.fillStyle = C.water; b.fillRect(MAP.minX - PAD, BOUNDS_N.maxZ, W, BOUNDS.minZ - BOUNDS_N.maxZ); // 강
  b.fillStyle = C.shore; b.fillRect(MAP.minX - PAD, BOUNDS.minZ - 0.6, W, 0.6); b.fillRect(MAP.minX - PAD, BOUNDS_N.maxZ, W, 0.6);
  b.fillStyle = "#d9a77c"; b.fillRect(BRIDGE.x - BRIDGE.w / 2, BRIDGE.z1, BRIDGE.w, BRIDGE.z0 - BRIDGE.z1); // 다리
  b.strokeStyle = C.path; b.lineCap = "round";
  for (const p of PATHS) { b.lineWidth = p.w; b.beginPath(); b.moveTo(p.x1, p.z1); b.lineTo(p.x2, p.z2); b.stroke(); }
  b.fillStyle = C.plaza; b.beginPath(); b.arc(PLAZA.x, PLAZA.z, PLAZA.r, 0, 7); b.fill();
  for (const p of PROPS) {
    if (p.kind === "tree") {
      b.fillStyle = C.tree; b.strokeStyle = C.treeEdge; b.lineWidth = 0.25;
      b.beginPath(); b.arc(p.x, p.z, 2.4 * p.s, 0, 7); b.fill(); b.stroke();
    } else if (p.kind === "fountain") {
      b.fillStyle = "#ffffff"; b.beginPath(); b.arc(p.x, p.z, 4.6, 0, 7); b.fill();
      b.fillStyle = C.water; b.beginPath(); b.arc(p.x, p.z, 4, 0, 7); b.fill();
    } else if (p.kind === "wishTree") {
      b.fillStyle = C.wish; b.beginPath(); b.arc(p.x, p.z, 3.4, 0, 7); b.fill();
    } else if (p.kind === "pavilion") { // 팔각 지붕
      b.fillStyle = C.roof; b.beginPath();
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; b.lineTo(p.x + Math.cos(a) * 5.4, p.z + Math.sin(a) * 5.4); }
      b.fill();
    } else if (p.kind === "booth" || p.kind === "kiosk" || p.kind === "gate") { // 기와지붕 (용마루 한 줄)
      const [w, d] = p.kind === "kiosk" ? [8.4, 6.6] : p.kind === "booth" ? [6.9, 5.7] : [2.6, 9.9];
      b.save(); b.translate(p.x, p.z); b.rotate(-p.yaw);
      b.fillStyle = C.roof; b.beginPath(); b.roundRect(-w / 2, -d / 2, w, d, 0.8); b.fill();
      b.strokeStyle = "#8a96a3"; b.lineWidth = 0.35; b.beginPath();
      if (w > d) { b.moveTo(-w / 2 + 1, 0); b.lineTo(w / 2 - 1, 0); } else { b.moveTo(0, -d / 2 + 1); b.lineTo(0, d / 2 - 1); }
      b.stroke(); b.restore();
    }
  }
}

const x0 = MAP.minX - PAD, z0 = MAP.minZ - PAD;
const ww = MAP.maxX - MAP.minX + PAD * 2, wh = MAP.maxZ - MAP.minZ + PAD * 2;
let world: HTMLCanvasElement | null = null;
/** 맵 전체 그림 (한 번만 그려 미니맵·큰 지도가 같이 씀) */
function worldCanvas() {
  if (!world) {
    world = document.createElement("canvas"); world.width = ww * RES; world.height = wh * RES;
    const b = world.getContext("2d")!; b.scale(RES, RES); b.translate(-x0, -z0); drawWorld(b);
  }
  return world;
}
export type MapPerson = { x: number; z: number; nickname: string };
const OTHER = "#3d8f86";

export function createMinimap(canvas: HTMLCanvasElement) {
  const dpr = Math.min(devicePixelRatio, 2);
  const bg = worldCanvas();

  const ctx = canvas.getContext("2d")!;
  let size = 0;
  const fit = () => { size = canvas.clientWidth; canvas.width = canvas.height = Math.round(size * dpr); };
  fit();
  const ro = new ResizeObserver(fit); ro.observe(canvas);

  // 보기 상태: 반경, 내 위치에서 벗어난 만큼(m)
  let r = R_DEFAULT, ox = 0, oz = 0, idle = RECENTER_AFTER, last = performance.now(), rot = NaN; // rot = 지도 회전(rad)
  const ptrs = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  const mPerPx = () => (r * 2) / size;
  const zoom = (k: number) => { r = Math.min(R_MAX, Math.max(R_MIN, r * k)); idle = 0; };
  const down = (e: PointerEvent) => {
    e.stopPropagation(); canvas.setPointerCapture?.(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); idle = 0;
  };
  const moveP = (e: PointerEvent) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (ptrs.size === 1) { // 화면에서 끈 만큼을 지도 회전을 되돌려 월드 좌표로
      const dx = (e.clientX - p.x) * mPerPx(), dy = (e.clientY - p.y) * mPerPx(), c = Math.cos(rot || 0), s = Math.sin(rot || 0);
      ox -= dx * c + dy * s; oz -= -dx * s + dy * c;
    }
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2) {
      const [a, c] = [...ptrs.values()], d = Math.hypot(a.x - c.x, a.y - c.y);
      if (pinch) zoom(pinch / d);
      pinch = d;
    }
    idle = 0;
  };
  const up = (e: PointerEvent) => { ptrs.delete(e.pointerId); pinch = 0; };
  const wheel = (e: WheelEvent) => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0015)); };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", moveP);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", wheel, { passive: false });

  /** yaw = 캐릭터가 보는 쪽(화살표), view = 카메라가 보는 쪽(지도 위쪽) */
  const draw = (x: number, z: number, yaw: number, view: number, others: MapPerson[] = []) => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    // 보는 방향이 위로 오게 천천히 돌림 (월드 +x→오른쪽, +z→아래 기준 각도)
    const want = -Math.PI / 2 - Math.atan2(Math.cos(view), Math.sin(view));
    rot = Number.isNaN(rot) ? want : rot + Math.atan2(Math.sin(want - rot), Math.cos(want - rot)) * (1 - Math.exp(-dt * 6));
    if (!size || !canvas.offsetParent) return; // 접혀 있으면 안 그림
    if (ptrs.size === 0 && (idle += dt) > RECENTER_AFTER) { const k = Math.exp(-dt * 3); ox *= k; oz *= k; }
    // 맵 밖으로 너무 멀리 끌려가지 않게
    const cx = Math.min(MAP.maxX, Math.max(MAP.minX, x + ox)), cz = Math.min(MAP.maxZ, Math.max(MAP.minZ, z + oz));
    ox = cx - x; oz = cz - z;
    const s = size / (r * 2); // px/m

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.grass; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(size / 2, size / 2); ctx.rotate(rot); ctx.scale(s, s); ctx.translate(-cx, -cz);
    ctx.fillStyle = C.water; ctx.fillRect(x0 - 300, z0 - 300, ww + 600, 300 + PAD); // 강은 화면 끝까지
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bg, x0, z0, ww, wh);
    // 다른 사람: 청록 점
    ctx.fillStyle = OTHER; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.4 / s;
    for (const o of others) { ctx.beginPath(); ctx.arc(o.x, o.z, 4 / s, 0, 7); ctx.fill(); ctx.stroke(); }

    // 나: 화면 밖으로 끌려가 있으면 가장자리에 반투명하게
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cr = Math.cos(rot), sr = Math.sin(rot);
    let px = size / 2 + ((x - cx) * cr - (z - cz) * sr) * s, pz = size / 2 + ((x - cx) * sr + (z - cz) * cr) * s;
    const m = 9, off = px < m || pz < m || px > size - m || pz > size - m;
    px = Math.min(size - m, Math.max(m, px)); pz = Math.min(size - m, Math.max(m, pz));
    ctx.globalAlpha = off ? 0.55 : 1;
    ctx.translate(px, pz); ctx.rotate(Math.atan2(Math.cos(yaw), Math.sin(yaw)) + rot);
    ctx.fillStyle = "rgba(232,98,138,0.18)"; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill();
    ctx.fillStyle = C.me; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(6.5, 0); ctx.lineTo(-4.5, -4.8); ctx.lineTo(-2.2, 0); ctx.lineTo(-4.5, 4.8); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
    // 북쪽(강 쪽) 표시: 가장자리에 작은 N
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const nx = size / 2 + sr * (size / 2 - 11), ny = size / 2 - cr * (size / 2 - 11);
    ctx.fillStyle = "rgba(255,250,243,0.92)"; ctx.beginPath(); ctx.arc(nx, ny, 7.5, 0, 7); ctx.fill();
    ctx.fillStyle = "#6b4450"; ctx.font = "600 9px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("N", nx, ny + 0.5);
  };
  draw.dispose = () => {
    ro.disconnect();
    canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", moveP);
    canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up);
    canvas.removeEventListener("wheel", wheel);
  };
  return draw;
}

/** 큰 지도에 이름을 붙일 시설 (글자는 관리자 안내 멘트에서) */
export type MapLabelKey = "gate" | "booth" | "kiosk" | "pavilion" | "fountain" | "wishTree" | "bridge" | "river";
const SPOTS: { key: MapLabelKey; x: number; z: number }[] = [
  ...PROPS.filter((p) => p.kind === "gate" || p.kind === "booth" || p.kind === "kiosk" || p.kind === "pavilion" || p.kind === "fountain" || p.kind === "wishTree")
    .map((p) => ({ key: p.kind as MapLabelKey, x: p.x, z: p.z })),
  { key: "bridge", x: BRIDGE.x, z: (BRIDGE.z0 + BRIDGE.z1) / 2 },
  { key: "river", x: (BOUNDS.minX + BOUNDS.maxX) / 2 + 25, z: (BOUNDS.minZ + BOUNDS_N.maxZ) / 2 },
];

/** 펼친 큰 지도: 공원 전체(북쪽=강이 위), 시설 이름, 나(화살표)와 다른 사람(점+이름) */
export function drawFullMap(canvas: HTMLCanvasElement, me: { x: number; z: number; yaw: number }, others: MapPerson[], labels: Record<MapLabelKey, string> & { me: string }) {
  const dpr = Math.min(devicePixelRatio, 2), cw = canvas.clientWidth, ch = canvas.clientHeight;
  if (!cw || !ch) return;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) { canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); }
  const ctx = canvas.getContext("2d")!, k = Math.min(cw / ww, ch / wh), ox = (cw - ww * k) / 2, oz = (ch - wh * k) / 2;
  const sx = (x: number) => ox + (x - x0) * k, sz = (z: number) => oz + (z - z0) * k;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.grass; ctx.fillRect(0, 0, cw, ch);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(worldCanvas(), ox, oz, ww * k, wh * k);
  const pill = (text: string, x: number, y: number, bg: string, fg: string, size = 12) => {
    ctx.font = `600 ${size}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x - w / 2, y - size * 0.8, w, size * 1.6, size * 0.8); ctx.fill();
    ctx.fillStyle = fg; ctx.fillText(text, x, y + 0.5);
  };
  for (const p of SPOTS) pill(labels[p.key], sx(p.x), sz(p.z), "rgba(255,250,243,0.92)", "#6b4450");
  for (const o of others) {
    const x = sx(o.x), y = sz(o.z);
    ctx.fillStyle = OTHER; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 7); ctx.fill(); ctx.stroke();
    pill(o.nickname, x, y - 15, "rgba(61,143,134,0.9)", "#fff", 11);
  }
  const x = sx(me.x), y = sz(me.z);
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(Math.cos(me.yaw), Math.sin(me.yaw)));
  ctx.fillStyle = "rgba(232,98,138,0.22)"; ctx.beginPath(); ctx.arc(0, 0, 13, 0, 7); ctx.fill();
  ctx.fillStyle = C.me; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -6.5); ctx.lineTo(-3, 0); ctx.lineTo(-6, 6.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  pill(labels.me, x, y - 18, C.me, "#fff", 11);
}
