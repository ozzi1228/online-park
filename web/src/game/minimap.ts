// 우하단 미니맵: 맵 전체를 한 번 그려두고 매 프레임 내 위치 화살표만 덧그림
import { BOUNDS, PATHS, PLAZA, PROPS } from "./park-map";

const PAD = 4; // 경계 바깥 여백(m) — 강 한 줄 보이게

export function createMinimap(canvas: HTMLCanvasElement) {
  const dpr = Math.min(devicePixelRatio, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const x0 = BOUNDS.minX - PAD, z0 = BOUNDS.minZ - PAD;
  const sx = w / (BOUNDS.maxX - BOUNDS.minX + PAD * 2), sz = h / (BOUNDS.maxZ - BOUNDS.minZ + PAD * 2);
  const X = (x: number) => (x - x0) * sx, Z = (z: number) => (z - z0) * sz;

  // 배경은 한 번만
  const bg = document.createElement("canvas"); bg.width = canvas.width; bg.height = canvas.height;
  const b = bg.getContext("2d")!; b.scale(dpr, dpr);
  b.fillStyle = "#c6e5a9"; b.fillRect(0, 0, w, h);
  b.fillStyle = "#a3d8ef"; b.fillRect(0, 0, w, Z(BOUNDS.minZ));
  b.strokeStyle = "#f4e7d6"; b.lineCap = "round";
  for (const p of PATHS) { b.lineWidth = Math.max(2, p.w * sz); b.beginPath(); b.moveTo(X(p.x1), Z(p.z1)); b.lineTo(X(p.x2), Z(p.z2)); b.stroke(); }
  b.fillStyle = "#efe0cc"; b.beginPath(); b.ellipse(X(PLAZA.x), Z(PLAZA.z), PLAZA.r * sx, PLAZA.r * sz, 0, 0, 7); b.fill();
  for (const p of PROPS) {
    if (p.kind === "tree") { b.fillStyle = "#f4adc2"; b.beginPath(); b.arc(X(p.x), Z(p.z), 1.6 * sx * p.s, 0, 7); b.fill(); }
    else if (p.kind === "fountain") { b.fillStyle = "#7cc3e3"; b.beginPath(); b.arc(X(p.x), Z(p.z), 3 * sx, 0, 7); b.fill(); }
    else if (p.kind === "wishTree") { b.fillStyle = "#5a9a62"; b.beginPath(); b.arc(X(p.x), Z(p.z), 2 * sx, 0, 7); b.fill(); }
    else if (p.kind === "booth" || p.kind === "kiosk" || p.kind === "pavilion") {
      b.fillStyle = p.kind === "pavilion" ? "#6f9c86" : "#e98aa0";
      const s = p.kind === "pavilion" ? 4.6 : 3.4; b.fillRect(X(p.x) - (s * sx) / 2, Z(p.z) - (s * sz) / 2, s * sx, s * sz);
    }
  }

  const ctx = canvas.getContext("2d")!;
  return (x: number, z: number, yaw: number) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 화살표: yaw 방향(sin, cos)을 화면(x→오른쪽, z→아래)으로
    ctx.translate(X(x), Z(z)); ctx.rotate(Math.atan2(Math.cos(yaw), Math.sin(yaw)));
    ctx.fillStyle = "#e8628a"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-2.5, 0); ctx.lineTo(-5, 5); ctx.closePath();
    ctx.fill(); ctx.stroke();
  };
}
