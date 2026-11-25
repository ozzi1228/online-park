// 메뉴·매점에 띄울 물건 그림 (캔버스로 그려 data URL). 한 번 그리면 재사용
const cache = new Map<string, string>();
const draw = (key: string, w: number, h: number, paint: (x: CanvasRenderingContext2D) => void) => {
  let u = cache.get(key);
  if (!u && typeof document !== "undefined") {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    paint(c.getContext("2d")!); u = c.toDataURL("image/png"); cache.set(key, u);
  }
  return u ?? "";
};

/** 벚꽃잎 노트: 분홍 표지에 벚꽃 한 송이, 스프링 */
export const notebookIcon = () => draw("notebook", 132, 84, (x) => {
  x.fillStyle = "#f7b6c8"; x.strokeStyle = "#d9869e"; x.lineWidth = 2;
  x.beginPath(); x.roundRect(38, 8, 60, 70, 6); x.fill(); x.stroke();
  x.fillStyle = "#fff6f8"; x.fillRect(46, 14, 46, 58);
  for (let i = 0; i < 6; i++) { x.strokeStyle = "#8a7a80"; x.lineWidth = 2; x.beginPath(); x.arc(40, 16 + i * 11, 4, 0.5 * Math.PI, 1.5 * Math.PI); x.stroke(); }
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 - Math.PI / 2; x.fillStyle = "#f39ab4"; x.beginPath(); x.ellipse(69 + Math.cos(a) * 8, 43 + Math.sin(a) * 8, 7, 5, a, 0, 7); x.fill(); }
  x.fillStyle = "#f6c94a"; x.beginPath(); x.arc(69, 43, 3, 0, 7); x.fill();
});

/** 낚싯대: 대각선 막대 + 늘어진 줄 + 분홍 깃털 */
export const rodIcon = () => draw("rod", 132, 84, (x) => {
  x.lineCap = "round";
  x.strokeStyle = "#c9a27a"; x.lineWidth = 5; x.beginPath(); x.moveTo(18, 76); x.lineTo(92, 12); x.stroke();
  x.strokeStyle = "#7a6a62"; x.lineWidth = 1.5; x.beginPath(); x.moveTo(92, 12); x.quadraticCurveTo(112, 30, 106, 52); x.stroke();
  ["#ff8fb3", "#ffffff", "#ffc2d4", "#fff0a8"].forEach((c, i) => {
    x.save(); x.translate(106, 54); x.rotate(-0.6 + i * 0.4); x.fillStyle = c; x.strokeStyle = "#e7a3b8"; x.lineWidth = 1;
    x.beginPath(); x.ellipse(0, 12, 4.5, 13, 0, 0, Math.PI * 2); x.fill(); x.stroke(); x.restore();
  });
});

/** 츄르: 비스듬히 놓인 길쭉한 봉지 두 개 (분홍·노랑 띠, 뜯는 톱니 끝) */
export const churuIcon = () => draw("churu", 132, 84, (x) => {
  const stick = (cx: number, cy: number, rot: number, band: string) => {
    x.save(); x.translate(cx, cy); x.rotate(rot);
    x.fillStyle = "#fffaf2"; x.strokeStyle = "#d9b9a3"; x.lineWidth = 2;
    x.beginPath(); x.roundRect(-46, -10, 92, 20, 6); x.fill(); x.stroke();
    x.fillStyle = band; x.fillRect(-20, -10, 30, 20);
    x.fillStyle = "#ffffff"; for (const [dx, dy, r] of [[-5, 2, 3.2], [-10, -3, 1.6], [-5, -5, 1.6], [0, -3, 1.6]]) { x.beginPath(); x.arc(dx, dy, r, 0, 7); x.fill(); } // 고양이 발바닥
    x.fillStyle = "#e9d6c6"; for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(40, -10 + i * 4); x.lineTo(46, -8 + i * 4); x.lineTo(40, -6 + i * 4); x.fill(); } // 뜯는 톱니
    x.restore();
  };
  stick(66, 34, -0.18, "#f39ab4"); stick(66, 54, 0.12, "#f6c94a");
});
