// 입력 (1인칭).
// PC: ↑↓(W·S) 앞뒤로 걷기, ←→(A·D) 몸·시야 돌리기, 마우스로 끌어서 둘러보기, 클릭 = 탭, 우클릭 = 메뉴.
// 모바일: 화면 아래쪽 어디든 누르면 그 자리에 조이스틱이 생김 — 위아래 = 앞뒤로 걷기, 좌우 = 돌기.
//        위쪽에서 한 손가락으로 끌면 둘러보기, 짧게 톡 = 탭 (아래쪽에서 톡 해도 탭).
//        앉아 있을 땐 조이스틱 없이 어디서든 끌면 둘러보기, 짧게 톡 = 일어나기.
const FWD = ["ArrowUp", "KeyW"], BACK = ["ArrowDown", "KeyS"], LEFT = ["ArrowLeft", "KeyA"], RIGHT = ["ArrowRight", "KeyD"];
const ALL = new Set([...FWD, ...BACK, ...LEFT, ...RIGHT]);
const TAP_MS = 300, TAP_PX = 10;

export type Tap = { x: number; y: number; menu: boolean };
/** 조이스틱 반지름(px)과 생기는 영역: 화면 높이의 이 비율보다 아래를 누르면 조이스틱 */
export const JOY_R = 44, JOY_AREA = 0.5;

export class Input {
  keys = new Set<string>();
  joy = { x: 0, y: 0 }; // -1~1, x는 오른쪽 +, y는 화면 아래 +
  /** 조이스틱을 잡고 있는 동안 손가락 위치 (그리기용, 안 잡으면 null) */
  joyKnob: { x: number; y: number } | null = null;
  /** 조이스틱 가운데 (누른 자리, 잡고 있을 때만) */
  joyCenter: { x: number; y: number } | null = null;
  private joyStart = { t: 0, moved: false };
  /** 마지막으로 화면을 만진 시각 (조이스틱을 잠시 숨겼다 보이게 할 때) */
  lastTouch = performance.now();
  get joyHeld() { return this.joyId !== null; }
  /** 앉아 있는 동안: 조이스틱 대신 어디서든 끌면 둘러보기, 짧게 톡 = 탭(일어나기) */
  seated = false;
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
      const c = this.joyCenter; if (!c) return;
      let vx = (x - c.x) / JOY_R, vy = (y - c.y) / JOY_R; const l = Math.hypot(vx, vy);
      if (l > 1) { vx /= l; vy /= l; }
      if (l * JOY_R > TAP_PX) this.joyStart.moved = true;
      // 살짝 건드린 건 무시하고, 반지름의 55%만 밀어도 제 속도 (엄지를 조금만 움직여도 시원하게 걷게)
      const m = Math.min(1, Math.max(0, (Math.min(l, 1) - 0.12) / 0.43)), k = l > 0 ? m / Math.min(l, 1) : 0;
      this.joy = { x: vx * k, y: vy * k };
      this.joyKnob = { x: c.x + vx * JOY_R, y: c.y + vy * JOY_R };
    };
    const pdown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (e.pointerType !== "mouse") this.lastTouch = performance.now();
      try { el.setPointerCapture(e.pointerId); } catch { /* 이미 뗀 포인터 */ }
      if (this.touchDevice && e.pointerType !== "mouse" && !this.seated && this.joyId === null && e.clientY > window.innerHeight * JOY_AREA) {
        // 화면 아래쪽을 누르면 그 자리가 조이스틱 가운데
        this.joyId = e.pointerId; this.joyCenter = { x: e.clientX, y: e.clientY }; this.joyStart = { t: performance.now(), moved: false };
        joyMove(e.clientX, e.clientY); return;
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
      if (e.pointerId === this.joyId) {
        // 밀지 않고 짧게 톡 = 탭 (아래쪽에 있는 벤치·사람 등도 누를 수 있게)
        if (!this.joyStart.moved && performance.now() - this.joyStart.t < TAP_MS) this.taps.push({ x: e.clientX, y: e.clientY, menu: false });
        this.releaseJoy(); return;
      }
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

  private releaseJoy() { this.joyId = null; this.joy = { x: 0, y: 0 }; this.joyKnob = null; this.joyCenter = null; }
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
