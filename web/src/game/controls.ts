// 입력 (일반 3인칭 게임 방식): 이동은 카메라 기준, 캐릭터는 가는 쪽을 바라봄.
// PC: 방향키/WASD 이동 + 마우스 드래그로 카메라 회전, 클릭 = 탭, 우클릭 = 메뉴.
// 모바일: 한 손가락을 누르고 있으면 그쪽(화면상 캐릭터 기준 방향)으로 걸어감, 두 손가락으로 끌면 카메라 회전,
//        짧게 톡 = 탭. 앉아 있을 때(steer=false)는 한 손가락으로 끌면 둘러보기.
const FWD = ["ArrowUp", "KeyW"], BACK = ["ArrowDown", "KeyS"], LEFT = ["ArrowLeft", "KeyA"], RIGHT = ["ArrowRight", "KeyD"];
const ALL = new Set([...FWD, ...BACK, ...LEFT, ...RIGHT]);
const TAP_MS = 300, TAP_PX = 10;

export type Tap = { x: number; y: number; menu: boolean };

export class Input {
  keys = new Set<string>();
  joy = { x: 0, y: 0 }; // -1~1, x는 오른쪽 +, y는 화면 아래 +
  /** 모바일: 한 손가락으로 누르고 있는 화면 좌표 (안 누르면 null) */
  touch: { x: number; y: number } | null = null;
  /** 모바일에서 한 손가락 = 걷기(true) / 둘러보기(false, 앉아 있을 때) */
  steer: boolean;
  private dx = 0; private dy = 0;
  private pts = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private taps: Tap[] = [];
  private off: (() => void)[] = [];

  constructor(el: HTMLElement, private touchDevice = false) {
    this.steer = touchDevice;
    const typing = (e: Event) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => { if (typing(e) || !ALL.has(e.code)) return; e.preventDefault(); this.keys.add(e.code); };
    const up = (e: KeyboardEvent) => this.keys.delete(e.code);
    const blur = () => { this.keys.clear(); this.pts.clear(); this.touch = null; };
    const sync = () => { // 한 손가락 = 이동, 두 손가락 = 카메라
      const one = this.steer && this.pts.size === 1 ? [...this.pts.values()][0] : null;
      // 짧은 탭 중엔 걷지 않게: 누른 지 TAP_MS가 지나거나 꽤 움직였을 때부터 조종
      const holding = one && (performance.now() - one.t > TAP_MS || Math.hypot(one.x - one.sx, one.y - one.sy) > TAP_PX);
      this.touch = holding ? { x: one.x, y: one.y } : null;
      if (!holding) this.joy = { x: 0, y: 0 };
    };
    this.syncTouch = sync;
    const pdown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
      try { el.setPointerCapture(e.pointerId); } catch { /* 이미 뗀 포인터 */ }
      sync();
    };
    const pmove = (e: PointerEvent) => {
      const p = this.pts.get(e.pointerId);
      if (!p) return;
      const mx = e.clientX - p.x, my = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      const dragging = Math.hypot(p.x - p.sx, p.y - p.sy) > TAP_PX;
      if (dragging && (!this.steer || this.pts.size >= 2)) { const n = this.steer ? this.pts.size : 1; this.dx += mx / n; this.dy += my / n; }
      sync();
    };
    const pup = (e: PointerEvent) => {
      const p = this.pts.get(e.pointerId);
      this.pts.delete(e.pointerId);
      if (p && performance.now() - p.t < TAP_MS && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < TAP_PX && this.pts.size === 0)
        this.taps.push({ x: e.clientX, y: e.clientY, menu: false });
      sync();
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

  private syncTouch: () => void;
  private any(codes: string[]) { return codes.some((c) => this.keys.has(c)) ? 1 : 0; }

  /** 걷기 ↔ 둘러보기 전환 (앉으면 false) */
  setSteer(on: boolean) { this.steer = this.touchDevice && on; this.syncTouch(); }

  /** 카메라 기준 이동량. forward: 화면 안쪽(+), right: 오른쪽(+) */
  axes() {
    this.syncTouch(); // 길게 누르는 중인지 매 프레임 갱신
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    return {
      forward: clamp(this.any(FWD) - this.any(BACK) - this.joy.y),
      right: clamp(this.any(RIGHT) - this.any(LEFT) + this.joy.x),
    };
  }

  setJoy(x: number, y: number) { this.joy = { x, y }; }

  /** 지난 프레임 이후 카메라를 돌린 드래그 픽셀 */
  takeDrag() { const d = { x: this.dx, y: this.dy }; this.dx = this.dy = 0; return d; }

  /** 지난 프레임 이후의 탭·우클릭 */
  takeTaps() { const t = this.taps; this.taps = []; return t; }

  dispose() { this.off.forEach((f) => f()); }
}
