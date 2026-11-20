// 다른 사람들: 실시간 서버 접속, 캐릭터 생성/삭제, 부드러운 위치 보간, 이름표
import { Client, type Room } from "@colyseus/sdk";
import * as THREE from "three";
import { animateChar, disposeChar, makeChar, type Character } from "./character";
import { PLAYER_R, groundY, type Collider } from "./park-map";
import { PRESETS } from "./presets";

type NetPlayer = { x: number; z: number; yaw: number; walking: boolean; preset: string; nickname: string };
type NetState = { players: Map<string, NetPlayer> & { forEach(cb: (p: NetPlayer, id: string) => void): void; size: number } };
type Other = { char: Character; label: THREE.Sprite; x: number; z: number; yaw: number };

export type NetStatus = { online: boolean; count: number };

function nameSprite(text: string) {
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
  private lastSent = { x: NaN, z: NaN, yaw: NaN, walking: false };
  status: NetStatus = { online: false, count: 1 };
  onStatus?: (s: NetStatus) => void;

  constructor(private scene: THREE.Scene) {}

  async connect() {
    try {
      const res = await fetch("/api/realtime/token", { cache: "no-store" });
      if (!res.ok) throw new Error(`token ${res.status}`);
      const { token, url } = await res.json();
      this.room = await new Client(url).joinOrCreate<NetState>("park", { token });
      this.room.onLeave(() => { this.room = null; this.setStatus(false); this.clear(); });
      this.setStatus(true);
    } catch (e) {
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

  /** 내 이동 판정에 쓸 다른 사람 위치 (화면에 보이는 자리 기준) */
  colliders(): Collider[] {
    return [...this.others.values()].map((o) => ({ t: "c" as const, x: o.x, z: o.z, r: PLAYER_R }));
  }

  update(t: number, dt: number, me: { x: number; z: number; yaw: number; walking: boolean }) {
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
        o = { char, label, x: p.x, z: p.z, yaw: p.yaw };
        this.others.set(id, o);
      }
      const k = 1 - Math.exp(-dt * 10);
      const moving = Math.hypot(p.x - o.x, p.z - o.z) > 0.03;
      o.x += (p.x - o.x) * k; o.z += (p.z - o.z) * k;
      o.yaw += Math.atan2(Math.sin(p.yaw - o.yaw), Math.cos(p.yaw - o.yaw)) * k; // 가까운 쪽으로 회전
      const y = groundY(o.x, o.z);
      o.char.root.position.set(o.x, y, o.z); o.char.root.rotation.y = o.yaw;
      o.label.position.set(o.x, y + o.char.top + 0.3, o.z);
      animateChar(o.char, t, dt, p.walking || moving ? "walk" : "idle");
    });
    for (const [id, o] of this.others) if (!seen.has(id)) this.remove(id, o);
    this.setStatus(true);
  }

  private remove(id: string, o: Other) {
    this.scene.remove(o.char.root, o.label); disposeChar(o.char);
    o.label.material.map?.dispose(); o.label.material.dispose();
    this.others.delete(id);
  }
  private clear() { for (const [id, o] of this.others) this.remove(id, o); }

  dispose() { this.room?.leave(); this.room = null; this.clear(); }
}
