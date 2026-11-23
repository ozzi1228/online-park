// 입력 (1인칭).
// PC: ↑↓(W·S) 앞뒤로 걷기, ←→(A·D) 몸·시야 돌리기, 마우스로 끌어서 둘러보기, 클릭 = 탭, 우클릭 = 메뉴.
// 모바일: 왼쪽 아래 조이스틱을 밀면 위아래 = 앞뒤로 걷기, 좌우 = 돌기. 그 밖에서 한 손가락으로 끌면 둘러보기, 짧게 톡 = 탭.
const FWD = ["ArrowUp", "KeyW"], BACK = ["ArrowDown", "KeyS"], LEFT = ["ArrowLeft", "KeyA"], RIGHT = ["ArrowRight", "KeyD"];
const ALL = new Set([...FWD, ...BACK, ...LEFT, ...RIGHT]);
const TAP_MS = 300, TAP_PX = 10;

export type Tap = { x: number; y: number; menu: boolean };
/** 조이스틱 자리 (화면 좌표): 가운데와 반지름 */
export type JoyZone = { x: number; y: number; r: number };

export class Input {
  keys = new Set<string>();
  joy = { x: 0, y: 0 }; // -1~1, x는 오른쪽 +, y는 화면 아래 +
  /** 조이스틱을 잡고 있는 동안 손가락 위치 (그리기용, 안 잡으면 null) */
  joyKnob: { x: number; y: number } | null = null;
  /** 화면이 알려주는 조이스틱 자리 (모바일에서만) */
  joyZone: (() => JoyZone | null) | null = null;
  private joyId: number | null = null;
  private dx = 0; private dy = 0;
  private pts = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private taps: Tap[] = [];
  private off: (() => void)[] = [];

  constructor(el: HTMLElement, private touchDevice = false) {
    const typing = (e: Event) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => { if (typing(e) || !ALL.has(e.code)) return; e.preventDefault(); this.keys.add(e.code); };
    const up = (e: KeyboardEvent) => this.keys.delete(e.code);
    const blur = () => { this.keys.clear(); this.pts.clear(); this.releaseJoy(); };
    const joyMove = (x: number, y: number) => {
      const z = this.joyZone?.(); if (!z) return;
      let vx = (x - z.x) / z.r, vy = (y - z.y) / z.r; const l = Math.hypot(vx, vy);
      if (l > 1) { vx /= l; vy /= l; }
      const dead = (v: number) => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88); // 살짝 건드린 건 무시
      this.joy = { x: dead(vx), y: dead(vy) };
      this.joyKnob = { x: z.x + vx * z.r, y: z.y + vy * z.r };
    };
    const pdown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      try { el.setPointerCapture(e.pointerId); } catch { /* 이미 뗀 포인터 */ }
      const z = this.touchDevice && e.pointerType !== "mouse" ? this.joyZone?.() : null;
      if (z && this.joyId === null && Math.hypot(e.clientX - z.x, e.clientY - z.y) < z.r * 1.5) { // 조이스틱 (조금 넉넉하게 잡힘)
        this.joyId = e.pointerId; joyMove(e.clientX, e.clientY); return;
      }
      this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    };
    const pmove = (e: PointerEvent) => {
      if (e.pointerId === this.joyId) { joyMove(e.clientX, e.clientY); return; }
      const p = this.pts.get(e.pointerId);
      if (!p) return;
      const mx = e.clientX - p.x, my = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (Math.hypot(p.x - p.sx, p.y - p.sy) > TAP_PX) { const n = this.pts.size; this.dx += mx / n; this.dy += my / n; } // 끌기 = 둘러보기
    };
    const pup = (e: PointerEvent) => {
      if (e.pointerId === this.joyId) { this.releaseJoy(); return; }
      const p = this.pts.get(e.pointerId);
      this.pts.delete(e.pointerId);
      if (p && performance.now() - p.t < TAP_MS && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < TAP_PX && this.pts.size === 0)
        this.taps.push({ x: e.clientX, y: e.clientY, menu: false });
    };
    const context = (e: MouseEvent) => { e.preventDefault(); this.taps.push({ x: e.clientX, y: e.clientY, menu: true }); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    el.addEventListener("pointerdown", pdown); el.addEventListener("pointermove", pmove);
    el.addEventListener("pointerup", pup); el.addEventListener("pointercancel", pup); el.addEventListener("contextmenu", context);
    this.off.push(
      () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); },
      () => { el.removeEventListener("pointerdown", pdown); el.removeEventListener("pointermove", pmove); el.removeEventListener("pointerup", pup); el.removeEventListener("pointercancel", pup); el.removeEventListener("contextmenu", context); },
    );
  }

  private releaseJoy() { this.joyId = null; this.joy = { x: 0, y: 0 }; this.joyKnob = null; }
  private any(codes: string[]) { return codes.some((c) => this.keys.has(c)) ? 1 : 0; }

  /** forward: 앞(+)/뒤(-), right: 오른쪽으로 돌기(+) */
  axes() {
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    return {
      forward: clamp(this.any(FWD) - this.any(BACK) - this.joy.y),
      right: clamp(this.any(RIGHT) - this.any(LEFT) + this.joy.x),
    };
  }

  /** 지난 프레임 이후 끌어서 둘러본 픽셀 */
  takeDrag() { const d = { x: this.dx, y: this.dy }; this.dx = this.dy = 0; return d; }

  /** 지난 프레임 이후의 탭·우클릭 */
  takeTaps() { const t = this.taps; this.taps = []; return t; }

  dispose() { this.off.forEach((f) => f()); }
}
