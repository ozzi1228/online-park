// 다른 사람들: 실시간 서버 접속, 캐릭터 생성/삭제, 부드러운 위치 보간, 이름표
import { Client, type Room } from "@colyseus/sdk";
import * as THREE from "three";
import { animateChar, disposeChar, isGesture, makeChar, playGesture, type Character, type Gesture } from "./character";
import { makeMat, placeMat, secondSeat } from "./mat";
import { PLAYER_R, benchSeatAt, groundY, type Collider } from "./park-map";
import type { CatState } from "./cat-brain";
import { PRESETS } from "./presets";

type NetPlayer = { x: number; z: number; yaw: number; walking: boolean; anim: string; preset: string; nickname: string; uid: string };
type NetState = { players: Map<string, NetPlayer> & { forEach(cb: (p: NetPlayer, id: string) => void): void; size: number }; cat?: CatState };
type Other = { char: Character; label: THREE.Sprite; x: number; z: number; yaw: number; mat?: THREE.Mesh; uid: string; nickname: string };

export type NetStatus = { online: boolean; count: number };

/** 머리 위 이름표 */
export function nameSprite(text: string) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 64;
  const x = c.getContext("2d")!;
  x.font = "bold 30px 'Gowun Dodum', 'Malgun Gothic', sans-serif";
  const w = Math.min(248, x.measureText(text).width + 28);
  x.fillStyle = "rgba(255,248,245,0.9)"; x.beginPath(); x.roundRect(128 - w / 2, 10, w, 44, 22); x.fill();
  x.fillStyle = "#6b4450"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  s.scale.set(1.6, 0.4, 1);
  return s;
}

export class Multiplayer {
  private room: Room<unknown, NetState> | null = null;
  private others = new Map<string, Other>();
  private sendAt = 0;
  private disposed = false;
  private lastSent = { x: NaN, z: NaN, yaw: NaN, walking: false };
  status: NetStatus = { online: false, count: 1 };
  onStatus?: (s: NetStatus) => void;
  /** 누가 나에게 쪽지를 건넸을 때 */
  onNote?: (from: string) => void;
  /** 누가 소원나무 쪽지를 바꿨을 때 */
  onTreeChanged?: () => void;
  /** 누가 내 돗자리에 같이 앉고 싶어할 때 / 내가 물어본 데 대답이 왔을 때 */
  onMatAsk?: (from: string, nickname: string) => void;
  onMatAnswer?: (ok: boolean, owner: string, ownerId: string) => void;
  private t = 0;

  constructor(private scene: THREE.Scene) {}

  async connect() {
    try {
      const res = await fetch("/api/realtime/token", { cache: "no-store" });
      if (!res.ok) throw new Error(`token ${res.status}`);
      const { token, url } = await res.json();
      const room = await new Client(url).joinOrCreate<NetState>("park", { token });
      if (this.disposed) { room.leave(); return; } // 접속하는 사이 화면이 닫혔으면 바로 나감
      this.room = room;
      room.onLeave(() => { if (this.disposed) return; this.room = null; this.setStatus(false); this.clear(); });
      room.onMessage("noteReceived", (m: { from?: string }) => this.onNote?.(String(m?.from ?? "누군가")));
      room.onMessage("treeChanged", () => this.onTreeChanged?.());
      room.onMessage("matAsked", (m: { from?: string; nickname?: string }) => this.onMatAsk?.(String(m?.from), String(m?.nickname ?? "누군가")));
      room.onMessage("matAnswered", (m: { ok?: boolean; owner?: string; id?: string }) => this.onMatAnswer?.(m?.ok === true, String(m?.owner ?? "누군가"), String(m?.id)));
      room.onMessage("gesture", (m: { id?: string; kind?: unknown }) => {
        const o = this.others.get(String(m?.id));
        if (o && isGesture(m?.kind)) playGesture(o.char, m.kind, this.t);
      });
      this.setStatus(true);
    } catch (e) {
      if (this.disposed) return;
      console.warn("[multiplayer] 혼자 모드로 계속해요:", e);
      this.setStatus(false);
    }
  }

  private setStatus(online: boolean) {
    const count = online ? (this.room?.state.players?.size ?? 1) : 1;
    if (online === this.status.online && count === this.status.count) return;
    this.status = { online, count };
    this.onStatus?.(this.status);
  }

  /** 서버가 판정한 내 위치 (너무 어긋나면 화면 쪽을 맞춤) */
  mine() { return this.room ? this.room.state.players?.get(this.room.sessionId) : undefined; }
  /** 서버가 움직이는 공원 고양이 (접속 중일 때만) */
  cat(): CatState | null { return this.room?.state.cat ?? null; }
  get online() { return !!this.room; }

  /** 내 이동 판정에 쓸 다른 사람 위치 (화면에 보이는 자리 기준) */
  colliders(): Collider[] {
    return [...this.others.values()].map((o) => ({ t: "c" as const, x: o.x, z: o.z, r: PLAYER_R }));
  }

  update(t: number, dt: number, me: { x: number; z: number; yaw: number; walking: boolean }) {
    this.t = t;
    const room = this.room;
    if (!room?.state.players) return;
    // 보내기: 초당 12번까지, 바뀐 게 있을 때만 (가만히 있으면 2초마다 생존 신호)
    const changed = Math.abs(me.x - this.lastSent.x) > 0.01 || Math.abs(me.z - this.lastSent.z) > 0.01 || Math.abs(me.yaw - this.lastSent.yaw) > 0.02 || me.walking !== this.lastSent.walking;
    if (t >= this.sendAt && (changed || t - this.sendAt > 2)) {
      room.send("move", me); this.lastSent = { ...me }; this.sendAt = t + 1 / 12;
    }
    // 받기: 서버 상태와 화면을 맞춤
    const seen = new Set<string>();
    room.state.players.forEach((p, id) => {
      if (id === room.sessionId) return;
      seen.add(id);
      let o = this.others.get(id);
      if (!o) {
        const char = makeChar(PRESETS.find((x) => x.id === p.preset) ?? PRESETS[0]);
        char.root.traverse((m) => { if (m instanceof THREE.Mesh) m.castShadow = true; });
        const label = nameSprite(p.nickname);
        this.scene.add(char.root, label);
        o = { char, label, x: p.x, z: p.z, yaw: p.yaw, uid: p.uid, nickname: p.nickname };
        this.others.set(id, o);
      }
      const k = 1 - Math.exp(-dt * 10);
      const moving = Math.hypot(p.x - o.x, p.z - o.z) > 0.03;
      o.x += (p.x - o.x) * k; o.z += (p.z - o.z) * k;
      o.yaw += Math.atan2(Math.sin(p.yaw - o.yaw), Math.cos(p.yaw - o.yaw)) * k; // 가까운 쪽으로 회전
      const y = groundY(o.x, o.z);
      const seat = p.anim === "sitbench" && !moving ? benchSeatAt(p.x, p.z, 0.6) : undefined; // 벤치에 앉은 사람은 좌판 위에
      if (seat) { o.char.root.position.set(seat.x, seat.y, seat.z); o.char.root.rotation.y = seat.yaw; }
      else { o.char.root.position.set(o.x, y, o.z); o.char.root.rotation.y = o.yaw; }
      o.label.position.set(seat?.x ?? o.x, (seat?.y ?? y) + o.char.top + 0.3, seat?.z ?? o.z);
      const sitting = p.anim === "sit" || p.anim === "sitmat" || p.anim === "sitbench";
      animateChar(o.char, t, dt, p.walking || moving ? "walk" : sitting ? "sit" : p.anim === "wish" ? "wish" : "idle");
      // 돗자리 깔고 앉은 사람은 돗자리도 보임
      if (p.anim === "sitmat" && !moving) {
        if (!o.mat) { o.mat = makeMat(); this.scene.add(o.mat); }
        o.mat.visible = true; placeMat(o.mat, p.x, p.z, p.yaw, y + 0.02);
      } else if (o.mat) o.mat.visible = false;
    });
    for (const [id, o] of this.others) if (!seen.has(id)) this.remove(id, o);
    this.setStatus(true);
  }

  private remove(id: string, o: Other) {
    this.scene.remove(o.char.root, o.label); disposeChar(o.char);
    if (o.mat) { this.scene.remove(o.mat); o.mat.geometry.dispose(); }
    o.label.material.map?.dispose(); o.label.material.dispose();
    this.others.delete(id);
  }
  private clear() { for (const [id, o] of this.others) this.remove(id, o); }

  /** 화면에서 누른 곳에 있는 다른 사람 (가까운 순) */
  pick(camera: THREE.Camera, rect: DOMRect, x: number, y: number) {
    const v = new THREE.Vector3();
    let best: { sessionId: string; uid: string; nickname: string; x: number; z: number; px: number } | null = null;
    for (const [id, o] of this.others) {
      v.set(o.x, 0.9, o.z).project(camera);
      if (v.z > 1) continue;
      const px = Math.hypot(rect.left + (v.x + 1) / 2 * rect.width - x, rect.top + (1 - v.y) / 2 * rect.height - y);
      if (px < 60 && (!best || px < best.px)) best = { sessionId: id, uid: o.uid, nickname: o.nickname, x: o.x, z: o.z, px };
    }
    return best;
  }

  /** 주변 r미터 안의 다른 사람 수 (웅성임 소리용) */
  nearCount(x: number, z: number, r: number) {
    let n = 0;
    for (const o of this.others.values()) if (Math.hypot(o.x - x, o.z - z) < r) n++;
    return n;
  }

  /** 쪽지를 건넸다고 받는 사람에게 알림 */
  notifyNote(sessionId: string) { this.room?.send("noteSent", { to: sessionId }); }
  notifyTree() { this.room?.send("treeChanged", {}); }

  /** 다른 사람이 깐 돗자리의 빈 옆자리 (같이 앉기용) */
  freeSeats() {
    const out: { x: number; z: number; yaw: number; owner: string; ownerId: string }[] = [];
    const room = this.room;
    if (!room?.state.players) return out;
    room.state.players.forEach((p, id) => {
      if (id === room.sessionId || p.anim !== "sitmat") return;
      const seat = secondSeat(p.x, p.z, p.yaw);
      let taken = false;
      room.state.players.forEach((q, qid) => { if (qid !== id && Math.hypot(q.x - seat.x, q.z - seat.z) < 0.45) taken = true; });
      if (!taken) out.push({ ...seat, yaw: p.yaw, owner: p.nickname, ownerId: id });
    });
    return out;
  }

  askMat(ownerId: string) { this.room?.send("matAsk", { to: ownerId }); }
  answerMat(to: string, ok: boolean) { this.room?.send("matAnswer", { to, ok }); }
  sendGesture(kind: Gesture) { this.room?.send("gesture", kind); }

  /** 앉기·소원 동작을 다른 사람에게 알림 */
  sendAnim(a: "idle" | "sit" | "sitmat" | "sitbench" | "wish") { this.room?.send("anim", a); }

  dispose() { this.disposed = true; this.room?.leave(); this.room = null; this.clear(); }
}
