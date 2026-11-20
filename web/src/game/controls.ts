// 입력: PC는 방향키/WASD + 마우스 드래그, 모바일은 조이스틱(화면 컴포넌트가 joy에 씀) + 드래그
const FWD = ["ArrowUp", "KeyW"], BACK = ["ArrowDown", "KeyS"], LEFT = ["ArrowLeft", "KeyA"], RIGHT = ["ArrowRight", "KeyD"];
const ALL = new Set([...FWD, ...BACK, ...LEFT, ...RIGHT]);

export class Input {
  keys = new Set<string>();
  joy = { x: 0, y: 0 }; // -1~1, y는 아래가 +
  private dx = 0; private dy = 0;
  private drag: { id: number; x: number; y: number } | null = null;
  private off: (() => void)[] = [];

  constructor(el: HTMLElement) {
    const typing = (e: Event) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => { if (typing(e) || !ALL.has(e.code)) return; e.preventDefault(); this.keys.add(e.code); };
    const up = (e: KeyboardEvent) => this.keys.delete(e.code);
    const blur = () => this.keys.clear(); // 창 전환 시 키가 눌린 채로 남지 않게
    const pdown = (e: PointerEvent) => {
      if (this.drag || (e.pointerType === "mouse" && e.button !== 0)) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    };
    const pmove = (e: PointerEvent) => {
      if (this.drag?.id !== e.pointerId) return;
      this.dx += e.clientX - this.drag.x; this.dy += e.clientY - this.drag.y;
      this.drag.x = e.clientX; this.drag.y = e.clientY;
    };
    const pup = (e: PointerEvent) => { if (this.drag?.id === e.pointerId) this.drag = null; };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    el.addEventListener("pointerdown", pdown); el.addEventListener("pointermove", pmove);
    el.addEventListener("pointerup", pup); el.addEventListener("pointercancel", pup);
    this.off.push(
      () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); },
      () => { el.removeEventListener("pointerdown", pdown); el.removeEventListener("pointermove", pmove); el.removeEventListener("pointerup", pup); el.removeEventListener("pointercancel", pup); },
    );
  }

  private any(codes: string[]) { return codes.some((c) => this.keys.has(c)) ? 1 : 0; }

  /** forward: 앞(+)/뒤(-), turn: 왼쪽(+)/오른쪽(-) */
  axes() {
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    return {
      forward: clamp(this.any(FWD) - this.any(BACK) - this.joy.y),
      turn: clamp(this.any(LEFT) - this.any(RIGHT) - this.joy.x),
    };
  }

  setJoy(x: number, y: number) { this.joy = { x, y }; }

  /** 지난 프레임 이후 드래그한 픽셀 */
  takeDrag() { const d = { x: this.dx, y: this.dy }; this.dx = this.dy = 0; return d; }

  dispose() { this.off.forEach((f) => f()); }
}
