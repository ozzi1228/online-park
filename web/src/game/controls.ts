// 입력 (일반 3인칭 게임 방식): 이동은 카메라 기준, 캐릭터는 가는 쪽을 바라봄.
// PC: 방향키/WASD 이동 + 마우스 드래그로 카메라 회전.
// 모바일: 한 손가락을 누르고 있으면 그쪽(화면상 캐릭터 기준 방향)으로 걸어감, 두 손가락으로 끌면 카메라 회전.
const FWD = ["ArrowUp", "KeyW"], BACK = ["ArrowDown", "KeyS"], LEFT = ["ArrowLeft", "KeyA"], RIGHT = ["ArrowRight", "KeyD"];
const ALL = new Set([...FWD, ...BACK, ...LEFT, ...RIGHT]);

export class Input {
  keys = new Set<string>();
  joy = { x: 0, y: 0 }; // -1~1, x는 오른쪽 +, y는 화면 아래 +
  /** 모바일: 한 손가락으로 누르고 있는 화면 좌표 (안 누르면 null) */
  touch: { x: number; y: number } | null = null;
  private dx = 0; private dy = 0;
  private pts = new Map<number, { x: number; y: number }>();
  private off: (() => void)[] = [];

  constructor(el: HTMLElement, steer = false) {
    const typing = (e: Event) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => { if (typing(e) || !ALL.has(e.code)) return; e.preventDefault(); this.keys.add(e.code); };
    const up = (e: KeyboardEvent) => this.keys.delete(e.code);
    const blur = () => { this.keys.clear(); this.pts.clear(); this.touch = null; };
    const sync = () => { // 한 손가락 = 이동, 두 손가락 = 카메라
      const one = steer && this.pts.size === 1 ? [...this.pts.values()][0] : null;
      this.touch = one ? { ...one } : null;
      if (!one) this.joy = { x: 0, y: 0 };
    };
    const pdown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { el.setPointerCapture(e.pointerId); } catch { /* 이미 뗀 포인터 */ }
      sync();
    };
    const pmove = (e: PointerEvent) => {
      const p = this.pts.get(e.pointerId);
      if (!p) return;
      const mx = e.clientX - p.x, my = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (!steer || this.pts.size >= 2) { const n = steer ? this.pts.size : 1; this.dx += mx / n; this.dy += my / n; }
      sync();
    };
    const pup = (e: PointerEvent) => { this.pts.delete(e.pointerId); sync(); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    el.addEventListener("pointerdown", pdown); el.addEventListener("pointermove", pmove);
    el.addEventListener("pointerup", pup); el.addEventListener("pointercancel", pup);
    this.off.push(
      () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); },
      () => { el.removeEventListener("pointerdown", pdown); el.removeEventListener("pointermove", pmove); el.removeEventListener("pointerup", pup); el.removeEventListener("pointercancel", pup); },
    );
  }

  private any(codes: string[]) { return codes.some((c) => this.keys.has(c)) ? 1 : 0; }

  /** 카메라 기준 이동량. forward: 화면 안쪽(+), right: 오른쪽(+) */
  axes() {
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    return {
      forward: clamp(this.any(FWD) - this.any(BACK) - this.joy.y),
      right: clamp(this.any(RIGHT) - this.any(LEFT) + this.joy.x),
    };
  }

  setJoy(x: number, y: number) { this.joy = { x, y }; }

  /** 지난 프레임 이후 카메라를 돌린 드래그 픽셀 */
  takeDrag() { const d = { x: this.dx, y: this.dy }; this.dx = this.dy = 0; return d; }

  dispose() { this.off.forEach((f) => f()); }
}
