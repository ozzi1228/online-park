"use client";

import Image from "next/image";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";
import { CATCH_HIGH, CatchPetal } from "@/game/catch-petal";
import { animateChar, makeChar, playGesture, type Mode } from "@/game/character";
import { Staff } from "@/game/staff";
import { CatView } from "@/game/cat";
import { CatColony, type CatState } from "@/game/cat-brain";
import { Input, JOY_R, type Tap } from "@/game/controls";
import { createMinimap } from "@/game/minimap";
import { Multiplayer, nameSprite, type NetStatus } from "@/game/multiplayer";
import { BENCH_SEATS, BOUNDS_N, COLLIDERS, PLAZA, LADDER_FOOT, PROPS, PROP_S, SPAWN, WISH_TREE, canSit, groundY, move, type BenchSeat } from "@/game/park-map";
import { PRESETS, type Preset } from "@/game/presets";
import { NPC_NAME } from "@/content/guide";
import { InfoPanel } from "./info-panel";
import { NoteEditor, NoteView } from "./note";
import type { Strokes } from "@/lib/notes-shared";
import { QUALITY_HIGH, QUALITY_LOW, buildWorld, makePetalGeometry } from "@/game/world";
import { makeMat, matFits, placeMat } from "@/game/mat";

type MatSeat = { x: number; z: number; yaw: number; owner: string; ownerId: string };
import { LADDER_TOP, TreeNotes, type TreeNote } from "@/game/tree-notes";
import { CoinGame, launchVelocity } from "@/game/coin-game";
import { fountainTargets } from "@/game/fountain";
import { ParkAudio } from "@/game/audio";
import { kstHour } from "@/game/sky";
import { authClient } from "@/lib/auth-client";
import { GreenCoin, ShopPanel, WalletPanel, type MeInfo } from "./wallet";

const COARSE = "(pointer: coarse)";
const isCoarse = () => matchMedia(COARSE).matches;
const subscribeCoarse = (cb: () => void) => { const m = matchMedia(COARSE); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };

const WALK = 3.0;                             // m/s (관리자 설정 걷기 빠르기가 없을 때)
const EYE = 1.5, EYE_SIT = 0.95;             // 1인칭 눈높이 (서 있을 때 / 앉았을 때, 캐릭터 키 기준)
const DRAG_YAW = 0.006, DRAG_PITCH = 0.004; // 끌어서 둘러보기 빠르기
const PITCH_UP = -0.9, PITCH_DOWN = 1.0;      // 올려다보기·내려다보기 한계 (rad)
const LOOK_YAW = 1.6;                         // 사다리 위에서 방향키로 나무를 돌아보는 빠르기 (rad/s)
const WISH_SEC = 3.2;

/** 행동 로그 (실패해도 게임은 계속) */
const logClient = (type: string, data: Record<string, unknown> = {}) =>
  fetch("/api/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, data }), keepalive: true }).catch(() => {});

/** 캐릭터 → 카메라 사이에 굵은 나무줄기·분수 등이 있으면 그 앞까지 카메라를 당김 (가려지지 않게) */
function cameraRoom(x: number, z: number, dx: number, dz: number, max: number) {
  let best = max;
  for (const c of COLLIDERS) {
    if (c.t === "b") { // 건물(안내소·매점 등): 상자 벽에 닿기 전까지만
      if (c.hw < 1 && c.hd < 1) continue;               // 벤치 같은 작은 건 무시
      const m = 0.35, lo = [c.x - c.hw - m, c.z - c.hd - m], hi = [c.x + c.hw + m, c.z + c.hd + m], o = [x, z], d = [dx, dz];
      let t0 = 0, t1 = Infinity;
      for (let i = 0; i < 2; i++) {
        if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) { t0 = Infinity; break; } continue; }
        const a = (lo[i] - o[i]) / d[i], b2 = (hi[i] - o[i]) / d[i];
        t0 = Math.max(t0, Math.min(a, b2)); t1 = Math.min(t1, Math.max(a, b2));
      }
      if (t0 <= t1 && t0 > 0.3 && t0 < best) best = t0;
      continue;
    }
    if (c.r < 0.4) continue;                           // 가는 가로등·난간은 무시
    const ox = x - c.x, oz = z - c.z, r = c.r + 0.35;
    const bq = ox * dx + oz * dz, cq = ox * ox + oz * oz - r * r, disc = bq * bq - cq;
    if (disc < 0) continue;
    const hit = -bq - Math.sqrt(disc);
    if (hit > 0.3 && hit < best) best = hit;
  }
  return Math.max(best, 1.0);
}

type MenuItem = { label: string; run?: () => void };
type Menu = { x: number; y: number; items: MenuItem[] };
type Actions = { sit: () => void; stand: () => void };
const KIOSK = PROPS.find((p) => p.kind === "kiosk") as { x: number; z: number; yaw: number };
const NPC = PROPS.find((p) => p.kind === "npc") as { x: number; z: number; yaw: number };
const FOUNTAIN = PROPS.find((p) => p.kind === "fountain") as { x: number; z: number };
const FT = fountainTargets(FOUNTAIN, PROP_S); // 분수 동전 게임 판정 (맨 위 접시 높이·반지름)
// 안내원: 옥색 저고리 한복에 갓을 쓴 젊은 남자. 안내소 안 단 위에 서서 창구로 얼굴을 내밂
const NPC_LOOK: Preset = { id: "npc-guide", name: NPC_NAME, tags: [], skin: "#f3d1b6", hair: "#3a2a22", style: "short", bangs: "side", hat: "gat",
  top: "#a8d5c2", topType: "hanbok", inner: "#2f4f6f", collar: "#ffffff", tie: "#d9607e", bottom: "#efe6d2", shoes: "#4a3a30" };
const NPC_Y = 0.35; // 안내소 바닥 위. 창턱 위로 가슴부터 보임
// 매점 직원: 노랑 저고리에 다홍 치마, 옥비녀로 쪽진 머리의 젊은 여자
const CLERK_LOOK: Preset = { id: "npc-clerk", name: "매점 직원", tags: [], skin: "#f8dfcc", hair: "#2b211d", style: "binyeo", pin: "#7fc8b4",
  top: "#fbe7a1", topType: "hanbok", inner: "#8a3b55", collar: "#ffffff", tie: "#d2486e", bottom: "#e66a8c", bottomType: "chima", shoes: "#ffffff", smile: false };
const CLERK = { x: KIOSK.x + Math.sin(KIOSK.yaw) * 0.95 * PROP_S, z: KIOSK.z + Math.cos(KIOSK.yaw) * 0.95 * PROP_S, y: 0.45 };

export function ParkView({ presetId, nickname }: { presetId: string; nickname: string }) {
  const box = useRef<HTMLDivElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const joyBase = useRef<HTMLDivElement>(null), knob = useRef<HTMLDivElement>(null);
  const input = useRef<Input | null>(null);
  const actions = useRef<Actions | null>(null);
  const touch = useSyncExternalStore(subscribeCoarse, isCoarse, () => false);
  const [hint, setHint] = useState(true);
  const [net, setNet] = useState<NetStatus | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const menuOpen = useRef(false);
  useEffect(() => { menuOpen.current = !!menu; }, [menu]);
  /** 잡은 운세꽃잎의 운세 문구 */
  const [fortune, setFortune] = useState<string | null>(null);
  const [sitting, setSitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [me, setMe] = useState<MeInfo | null>(null);
  const meRef = useRef<MeInfo | null>(null);
  const [panel, setPanel] = useState<"wallet" | "shop" | "info" | "inbox" | null>(null);
  const panelOpen = useRef(false);
  useEffect(() => { panelOpen.current = panel !== null; }, [panel]);
  const [writeTo, setWriteTo] = useState<{ sessionId: string; uid: string; nickname: string } | null>(null);
  /** 누가 내 돗자리에 같이 앉고 싶어함 → 허락/거절 */
  const [matAsk, setMatAsk] = useState<{ from: string; nickname: string } | null>(null);
  const matApi = useRef<{ answer: (ok: boolean) => void } | null>(null);
  const [sending, setSending] = useState(false);
  const [writeTree, setWriteTree] = useState(false);          // 소원 쪽지 쓰는 중
  const [treeMode, setTreeMode] = useState<"pick" | "ready" | null>(null); // 사다리 위에서 달 자리 고르는 중
  /** 동전 게임 조준 중 (화면을 당겼다 놓으면 튕김) */
  const [coinAim, setCoinAim] = useState(false);
  const aim = useRef({ on: false, sx: 0, sy: 0, x: 0, y: 0, shoot: false, cancel: false });
  const [treeDetail, setTreeDetail] = useState<TreeNote | null>(null);
  const treeApi = useRef<{ start: (strokes: Strokes, covered: boolean) => void; confirm: () => void; cancel: () => void; refresh: () => void } | null>(null);
  const mpRef = useRef<Multiplayer | null>(null);
  const audioRef = useRef<ParkAudio | null>(null);
  const [muted, setMuted] = useState(false);
  const [miniPref, setMiniOpen] = useState<boolean | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // 잠깐 뜨는 안내 문구 (setState·ref만 써서 항상 같은 함수)
  const sayRef = useRef((msg: string) => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 2200); });

  const refreshMe = useRef(async () => {
    const r = await fetch("/api/me", { cache: "no-store" }).catch(() => null);
    if (r?.ok) { const m = await r.json() as MeInfo; meRef.current = m; setMe(m); if (audioRef.current && m.sound) audioRef.current.levels = m.sound; }
  });
  useEffect(() => {
    refreshMe.current();
    // 결제하고 돌아온 경우 (?charged=1000)
    const charged = Number(new URLSearchParams(location.search).get("charged"));
    if (charged > 0) { sayRef.current(`${charged.toLocaleString("ko-KR")}그린이 충전됐어요`); history.replaceState(null, "", location.pathname); }
  }, []);

  useEffect(() => {
    const el = box.current!;
    const coarse = isCoarse();
    const q = coarse ? QUALITY_LOW : QUALITY_HIGH;

    const renderer = new THREE.WebGLRenderer({ antialias: !coarse });
    renderer.localClippingEnabled = true; // 강둑 너머 꽃잎 깔개 자르기용
    renderer.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.touchAction = "none";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // ?hour=19 처럼 주면 그 시각 하늘로 고정 (확인용)
    // 시간 미리보기 (관리자 화면에서 엶): ?time=HH:MM 또는 ?hour=13.5, ?date=YYYY-MM-DD
    const qs = new URLSearchParams(location.search);
    const tm = /^(\d{1,2}):(\d{2})$/.exec(qs.get("time") ?? ""), hourParam = Number(qs.get("hour"));
    const skyHour = tm ? (Number(tm[1]) + Number(tm[2]) / 60) % 24 : qs.has("hour") && Number.isFinite(hourParam) ? hourParam % 24 : undefined;
    const dateMs = /^\d{4}-\d{2}-\d{2}$/.test(qs.get("date") ?? "") ? Date.parse(`${qs.get("date")}T12:00:00+09:00`) : NaN;
    const world = buildWorld(scene, q, skyHour, Number.isFinite(dateMs) ? dateMs : undefined);
    const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
    const me = makeChar(preset);
    me.root.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
    scene.add(me.root);
    const petal = new CatchPetal(makePetalGeometry());
    scene.add(petal.group);
    const mat = makeMat(); mat.visible = false; scene.add(mat);
    const treeNotes = new TreeNotes(makePetalGeometry()); scene.add(treeNotes.group);
    // 소리: 첫 터치·키 입력 때 켜짐 (브라우저 정책)
    const audio = new ParkAudio(); audioRef.current = audio;
    Promise.resolve().then(() => setMuted(audio.muted)); // 이 기기에 저장된 켜기/끄기 표시
    if (meRef.current?.sound) audio.levels = meRef.current.sound;
    const wake = () => audio.start();
    window.addEventListener("pointerdown", wake); window.addEventListener("keydown", wake);
    const coin = new CoinGame(FT); scene.add(coin.group);
    // 동전 게임 카메라: 조준할 땐 내 뒤 위에서 맨 위 접시를 보고, 날아갈 땐 옆에서 동전을 따라감
    const coinCam = { on: false, eye: new THREE.Vector3(), look: new THREE.Vector3() };
    const refreshTree = async () => {
      const r = await fetch("/api/tree", { cache: "no-store" }).catch(() => null);
      if (r?.ok) treeNotes.set(await r.json() as TreeNote[]);
    };
    refreshTree();
    // 창구 직원들 (안내원·매점 직원)
    const npc = new Staff(NPC_LOOK, NPC.x, NPC.z, NPC_Y, NPC.yaw), npcLabel = nameSprite(NPC_NAME);
    const clerk = new Staff(CLERK_LOOK, CLERK.x, CLERK.z, CLERK.y, KIOSK.yaw);
    npcLabel.position.set(NPC.x, NPC_Y + npc.char.top + 0.5, NPC.z);
    scene.add(npc.char.root, clerk.char.root, npcLabel);
    let greeted = false;
    // 공원 고양이: 실시간 서버가 움직여 모두가 같은 고양이를 봄. 서버에 못 붙었을 땐 내 브라우저가 직접 움직임
    // 공원 고양이들 (늘 공원 어딘가에, 서로 다른 무늬). 접속 중이면 서버가, 혼자면 내 브라우저가 움직임
    const catViews: CatView[] = [], soloCats = new CatColony();
    let lastCats: CatState[] = [];
    const catOn = (s: { x: number; z: number }) => lastCats.some((c) => c.active && c.y > 0.4 && Math.hypot(c.x - s.x, c.z - s.z) < 0.4);

    const pos = { x: SPAWN.x, z: SPAWN.z };
    let yaw = SPAWN.yaw, camYaw = SPAWN.yaw, pitch = 0, footY = 0; // yaw = 캐릭터가 보는 쪽, camYaw = 카메라가 보는 쪽
    // 상태: 앉음 / 소원 비는 중 / 꽃잎 들고 있음
    const tree = { pending: null as { strokes: Strokes; covered: boolean } | null, ghost: null as THREE.Vector3 | null, busy: false };
    const st = { sitting: false, onMat: false, wishUntil: 0, holding: false, anim: "idle" as "idle" | "sit" | "sitmat" | "sitbench" | "wish" | "lie", now: 0, faceCam: false,
      /** 정자에 드러누움 (누운 몸 방향) */
      lying: false, lieYaw: 0,
      bench: null as BenchSeat | null, stoodAt: -9, waitRelease: false, camTurn: null as number | null, ladderArmed: true,
      /** 돗자리 같이 앉기를 물어보고 대답을 기다리는 중 */
      asking: null as { seat: MatSeat; until: number } | null,
      /** 동전 조준 중 / 성공해서 발 동동 하는 동안 (그 뒤에 소원) */
      aiming: false, stompUntil: 0, coinViewUntil: 0 };
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
    const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), focus = new THREE.Vector3();
    let baseFov = 60, firstPerson = false, zoomK = 1; // zoomK: 휠·두 손가락으로 당겨 보기(작을수록 확대)
    let showMe = 0; // 0 = 1인칭, 1 = 소원 빌 때 내 얼굴 쪽에서 보는 3인칭 (그 사이는 부드럽게)
    const placeCamera = () => {
      // 뒤에서 보는 시점: 내 머리 뒤 조금 위에서, 내가 보는 쪽을 봄 → 화면 가운데 아래에 내 캐릭터가 살짝 보임
      // 앉아서 풍경 볼 땐(벤치·돗자리·잔디) 1인칭으로 — 내 몸이 풍경을 가리지 않게
      // (지연·흔들림 없이 바로 따라감 = 멀미 덜함. 관리자에서 뒤 거리를 0으로 하면 완전 1인칭)
      const fx = Math.sin(camYaw), fz = Math.cos(camYaw), cp = Math.cos(pitch), rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
      const at = st.bench ?? { x: pos.x, y: footY, z: pos.z }; // 벤치에 앉으면 좌판 위에서
      const eyeY = at.y + (st.lying ? 0.32 : (st.sitting ? EYE_SIT : EYE) * (preset.kid ? 0.76 : 1));
      const back = Math.max(0, (meRef.current?.controls?.cameraBackCm ?? 420) / 100), side = (meRef.current?.controls?.cameraSideCm ?? 0) / 100;
      const room = back > 0.3 ? Math.min(back, cameraRoom(at.x, at.z, -fx, -fz, back + 0.4) - 0.3) : 0; // 나무·벽에 묻히지 않게
      const shoulder = room > 0.9 && !st.sitting; // 너무 가까워지면(벽 앞 등) 내 머리가 화면을 가리니 그때도 1인칭으로
      const dBack = shoulder ? room : -0.25, sd = shoulder ? side : 0;
      const eye = new THREE.Vector3(at.x - fx * dBack + rx * sd, eyeY + (shoulder ? 0.5 : 0), at.z - fz * dBack + rz * sd);
      if (st.lying) eye.set(at.x - Math.sin(st.lieYaw) * 0.8, eyeY, at.z - Math.cos(st.lieYaw) * 0.8); // 누우면 눈은 머리 자리 (발 반대쪽)
      const look = eye.clone().setY(eyeY).add(new THREE.Vector3(fx * cp, -Math.sin(pitch), fz * cp).multiplyScalar(6));
      if (!st.lying) look.set(at.x + rx * sd, eyeY, at.z + rz * sd).add(new THREE.Vector3(fx * cp, -Math.sin(pitch), fz * cp).multiplyScalar(6));
      firstPerson = !shoulder;
      if (showMe > 0.001) { // 소원 빌기: 캐릭터 정면에서 손 모은 모습 (앉아 있으면 앉은 자리에서)
        // 정면이 막혀 있으면(사다리·나무 앞 등) 비스듬한 쪽에서 — 너무 가까이 붙어 얼굴만 크게 나오지 않게
        const f = showMe * showMe * (3 - 2 * showMe), base = st.bench?.yaw ?? yaw, WANT = 2.8;
        let fy = base, d = 0;
        for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
          const r = Math.min(WANT, cameraRoom(at.x, at.z, Math.sin(base + off), Math.cos(base + off), WANT));
          if (r > d + 0.3) { d = r; fy = base + off; }
          if (d >= WANT - 0.05) break;
        }
        const sx = Math.sin(fy), sz = Math.cos(fy), low = st.sitting ? 0.35 : 0;
        eye.lerp(new THREE.Vector3(at.x + sx * d, at.y + 1.35 - low, at.z + sz * d), f);
        look.lerp(new THREE.Vector3(at.x, at.y + 0.95 - low, at.z), f);
      }
      if (st.aiming || coin.busy || st.now < st.coinViewUntil) {
        const dx = FT.x - pos.x, dz = FT.z - pos.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
        const ce = new THREE.Vector3(), cl = new THREE.Vector3();
        // 카메라는 늘 광장 안(둘레 벚나무에 가리지 않게)에 둠
        const R = PLAZA.r - 1.2, inPlaza = (x: number, z: number) => {
          const ox = x - FT.x, oz = z - FT.z, l = Math.hypot(ox, oz), k = l > R ? R / l : 1;
          return { x: FT.x + ox * k, z: FT.z + oz * k, cut: l - Math.min(l, R) };
        };
        if (st.aiming) { // 내 뒤 위에서 접시 안이 내려다보이게 (나무 쪽에 서 있으면 광장 안쪽으로 당기고 더 높이)
          const c = inPlaza(pos.x - ux * 4.2, pos.z - uz * 4.2);
          ce.set(c.x, FT.dish.y + 2.8 + c.cut * 0.45, c.z); cl.set(FT.x - ux * 0.8, FT.dish.y - 0.6, FT.z - uz * 0.8);
        } else { // 옆에서: 던진 곳과 접시 사이가 한 화면에. 양옆 중 트인 쪽(소원나무 반대쪽)에서
          const a = coin.from, mx = (a.x + FT.x) / 2, mz = (a.z + FT.z) / 2, side = Math.max(6, d * 0.9 + 3.5);
          const opts = [1, -1].map((sg) => inPlaza(mx - uz * side * sg, mz + ux * side * sg))
            .map((c) => ({ ...c, score: Math.hypot(c.x - WISH_TREE.x, c.z - WISH_TREE.z) - c.cut * 2 }));
          const c = opts[0].score >= opts[1].score ? opts[0] : opts[1];
          ce.set(c.x, 3.6 + c.cut * 0.5, c.z);
          cl.set(mx, 2.4, mz).lerp(coin.pos, coin.busy ? 0.35 : 0.5);
        }
        if (!coinCam.on) { coinCam.eye.copy(camPos); coinCam.look.copy(camLook); coinCam.on = true; }
        coinCam.eye.lerp(ce, 0.1); coinCam.look.lerp(cl, 0.14);
        eye.copy(coinCam.eye); look.copy(coinCam.look); firstPerson = false;
      } else coinCam.on = false;
      camPos.copy(eye); camLook.copy(look);
      // 벤치에 앉으면 살짝 줌인 → 강물과 건너편 벚꽃이 더 크게
      const wantFov = baseFov * zoomK * (st.bench && showMe < 0.5 ? 0.78 : 1);
      if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov += (wantFov - camera.fov) * 0.15; camera.updateProjectionMatrix(); }
      camera.position.copy(camPos); camera.lookAt(camLook);
    };
    placeCamera();

    const inp = new Input(renderer.domElement, coarse); input.current = inp;
    const screen = new THREE.Vector3(), tapRay = new THREE.Raycaster();
    const drawMini = createMinimap(mini.current!);
    const mp = new Multiplayer(scene);
    mp.onStatus = setNet;
    mpRef.current = mp;
    mp.onNote = (from) => { sayRef.current(`✉️ ${from}님이 쪽지를 건넸어요`); refreshMe.current(); };
    mp.onTreeChanged = refreshTree;
    // 돗자리 같이 앉기: 깐 사람은 허락/거절 창, 물어본 사람은 대답을 기다림
    mp.onMatAsk = (from, nickname) => { if (st.onMat) setMatAsk({ from, nickname }); else mp.answerMat(from, false); };
    mp.onMatAnswer = (ok, owner, ownerId) => {
      const a = st.asking; st.asking = null;
      if (!a || a.seat.ownerId !== ownerId) return;
      if (!ok) { sayRef.current("이 곳에는 앉을 수 없습니다"); return; }
      const seat = mp.freeSeats().find((s) => s.ownerId === ownerId); // 그 사이 자리가 찼거나 일어났으면 못 앉음
      if (!seat || st.sitting || Math.hypot(seat.x - pos.x, seat.z - pos.z) > 3) { sayRef.current(`${owner}님 옆자리에 앉지 못했어요`); return; }
      joinMat(seat);
    };
    matApi.current = {
      answer: (ok) => {
        setMatAsk((q) => {
          if (q) {
            mp.answerMat(q.from, ok);
            const kind = ok ? "wave" : "shake"; // 허락하면 웃으며 손 흔들흔들, 거절하면 단호하게 절레절레
            playGesture(me, kind, st.now); mp.sendGesture(kind);
            logClient(ok ? "mat.allowed" : "mat.refused", {});
          }
          return null;
        });
      },
    };
    mp.connect();
    let synced = false;

    // ---------- 행동 ----------
    const stand = () => {
      if (!st.sitting) return;
      if (st.lying) { st.lying = false; pitch = 0; }
      st.sitting = false; st.onMat = false; mat.visible = false; setSitting(false); setMatAsk(null);
      if (st.bench) { st.bench = null; st.stoodAt = st.now; }
      logClient("sit.end", { x: Math.round(pos.x), z: Math.round(pos.z) });
    };
    // 벤치에 걸어 들어가면 자동으로 앉음: 돌아서 벤치가 보는 쪽(강)을 바라봄
    const sitBench = (seat: BenchSeat) => {
      st.sitting = true; st.bench = seat; st.onMat = false; st.wishUntil = 0; st.waitRelease = true;
      setSitting(true); setMenu(null);
      pos.x = seat.fx; pos.z = seat.fz; yaw = seat.yaw; st.camTurn = seat.yaw; pitch = 0.08;
      logClient("sit.start", { x: Math.round(pos.x), z: Math.round(pos.z), bench: true });
    };
    actions.current = {
      sit: () => {
        setMenu(null);
        if (!canSit(pos.x, pos.z)) { sayRef.current("여기선 앉을 수 없어요. 잔디밭이나 정자로 가 볼까요?"); return; }
        st.sitting = true; st.wishUntil = 0; setSitting(true);
        camYaw = yaw;
        if (groundY(pos.x, pos.z) > 0) { // 정자 마루에선 대자로 드러누워 천장(서까래)을 올려다봄
          st.lying = true; st.lieYaw = yaw; st.onMat = false; pitch = -1.12;
          logClient("sit.start", { x: Math.round(pos.x), z: Math.round(pos.z), onPavilion: true, lie: true });
          return;
        }
        // 돗자리가 있으면 잔디밭에선 깔고 앉음 (정자 마루에선 그냥 앉음)
        // 돗자리는 통째로 잔디 위일 때만 (길·광장에 걸치면 그냥 앉음)
        const hasMat = !!meRef.current?.items.mat;
        st.onMat = hasMat && matFits(pos.x, pos.z, yaw);
        if (st.onMat) { placeMat(mat, pos.x, pos.z, yaw); mat.visible = true; sayRef.current("돗자리를 깔았어요 · 옆자리에 한 명 더 앉을 수 있어요"); }
        else if (hasMat && groundY(pos.x, pos.z) === 0) sayRef.current("돗자리는 길에서 떨어진 잔디밭에만 펼 수 있어요"); // 정자 마루에선 안내 없이 그냥 앉음
        logClient("sit.start", { x: Math.round(pos.x), z: Math.round(pos.z), onPavilion: groundY(pos.x, pos.z) > 0, mat: st.onMat });
      },
      stand: () => { setMenu(null); stand(); },
    };
    // 운세꽃잎 자격·간격은 서버가 정함 (하루 선착순·1인당 하루 한 번, 횟수는 잡았을 때만 셈). 1분마다 다시 확인
    const refreshWish = async () => {
      try {
        const r = await fetch("/api/petal", { cache: "no-store" });
        if (!r.ok) return;
        const w = await r.json() as { eligible: boolean; minIntervalSec: number; maxIntervalSec: number };
        petal.setSchedule(st.now, w.eligible, w.minIntervalSec, w.maxIntervalSec);
      } catch { /* 다음 확인 때 다시 */ }
    };
    refreshWish();
    const wishTimer = setInterval(refreshWish, 60_000);
    const claim = async (height: number) => {
      const r = await fetch("/api/petal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ height }) })
        .then((x) => x.json() as Promise<{ ok: boolean; reason?: string; fortune?: string }>).catch(() => null);
      if (r?.ok && r.fortune) { setFortune(r.fortune); audio.chime(); } // 꽃잎을 펼치면 오늘의 운세
      else sayRef.current(r?.reason === "soldout" ? "아쉽게도 오늘의 운세꽃잎이 모두 떨어졌어요" : r?.reason === "limit" ? "오늘의 운세는 이미 확인했어요. 내일 또 만나요" : "잠시 후 다시 해볼까요?");
      refreshWish(); // 오늘 몫을 잡았거나 다 떨어졌으면 더는 안 보이게
    };

    const nearKiosk = () => Math.hypot(pos.x - KIOSK.x, pos.z - KIOSK.z) < 9;
    const nearFountain = () => Math.hypot(pos.x - FOUNTAIN.x, pos.z - FOUNTAIN.z) < 9;
    const nearTree = () => Math.hypot(pos.x - WISH_TREE.x, pos.z - WISH_TREE.z) < 8;
    // 소원 쪽지 쓰기 → 다 쓰면 사다리에 올라 달 자리를 고름
    const openTreeEditor = () => {
      setMenu(null);
      const me = meRef.current;
      if (!me || me.isGuest) { sayRef.current("소원 쪽지는 회원만 달 수 있어요"); return; }
      if ((me.items.noteSheets ?? 0) < 1) { sayRef.current("노트가 있어야 소원 쪽지를 달 수 있어요 (매점에서 살 수 있어요)"); return; }
      setPanel(null); setWriteTree(true); logClient("tree.open_editor", {});
    };
    // 분수 동전 게임: 분수를 바라보고 조준 → 당겼다 놓으면 그린 차감 후 동전이 날아감
    //  맨 위 작은 접시에 들어가면 발 동동 기뻐하고 소원, 빗나가면 아래 물에 떨어져 흔적으로 남음
    const AIM_YAW = 0.0025, AIM_PULL = () => window.innerHeight * 0.35;
    const hand = () => new THREE.Vector3(pos.x + Math.sin(yaw) * 0.3, footY + 1.25, pos.z + Math.cos(yaw) * 0.3);
    const aimShot = () => {
      const a = aim.current, pull = Math.min(1, Math.max(0, (a.y - a.sy) / AIM_PULL()));
      return { pull, vel: launchVelocity(yaw, -(a.x - a.sx) * AIM_YAW, pull) }; // 새총처럼: 왼쪽으로 당기면 오른쪽으로
    };
    const stopAim = () => { st.aiming = false; aim.current.on = false; coin.preview(null); coin.showTarget(false); setCoinAim(false); };
    const tossCoin = () => {
      setMenu(null);
      if (meRef.current?.isGuest) { sayRef.current("동전 던지기는 회원 전용이에요"); return; }
      if (coin.busy) return;
      if (st.sitting) stand();
      yaw = camYaw = Math.atan2(FOUNTAIN.x - pos.x, FOUNTAIN.z - pos.z); pitch = -0.12; // 분수 꼭대기 접시가 보이게
      st.aiming = true; setCoinAim(true); coin.showTarget(true);
      logClient("fountain.aim", {});
    };
    const shootCoin = async () => {
      const { pull, vel } = aimShot();
      if (pull < 0.08) { coin.preview(null); return; } // 살짝 건드린 건 다시 조준
      const from = hand(); stopAim();
      const r = await fetch("/api/fountain", { method: "POST" }).then((x) => x.json() as Promise<{ ok: boolean; reason?: string }>).catch(() => null);
      if (!r?.ok) { sayRef.current(r?.reason === "insufficient" ? "그린이 모자라요" : "동전을 던지지 못했어요"); return; }
      coin.launch(from, vel); audio.jingle(); refreshMe.current();
    };
    coin.onLand = (kind, at) => {
      logClient("fountain.result", { hit: kind === "dish" });
      st.coinViewUntil = st.now + (kind === "dish" ? 0 : 1.8); // 빗나가면 떨어진 자리를 잠깐 보여 주고 돌아옴
      if (kind === "ground") { sayRef.current("앗, 분수 밖으로 날아갔어요"); return; }
      audio.plop();
      if (kind !== "dish") { if (kind === "basin") world.addCoin(at.x, at.z); sayRef.current("아깝다! 맨 위 접시를 비껴갔어요"); return; }
      // 성공: 발 동동 → 소원 (과녁·궤적 점은 바로 치움)
      coin.hideGuides();
      playGesture(me, "stomp", st.now); mp.sendGesture("stomp"); st.faceCam = true; st.wishUntil = st.now + 1.8 + WISH_SEC;
      sayRef.current("쏙! 들어갔어요 🎉");
      setTimeout(() => { audio.chime(); st.stompUntil = 0; }, 1800);
      setTimeout(() => sayRef.current("소원을 빌었어요 🌸"), (1.8 + WISH_SEC) * 1000);
      st.stompUntil = st.now + 1.8;
    };
    // 소원나무: 쪽지 쓰기 → 사다리 위에서 자리 고르기 → 달기
    treeApi.current = {
      start: (strokes, covered) => {
        tree.pending = { strokes, covered }; tree.ghost = null; treeNotes.showGhost(null);
        setWriteTree(false); setTreeMode("pick"); audio.ladder(); camYaw = Math.atan2(WISH_TREE.x - LADDER_TOP.x, WISH_TREE.z - LADDER_TOP.z);
      },
      confirm: async () => {
        if (!tree.pending || !tree.ghost || tree.busy) return;
        tree.busy = true;
        const r = await fetch("/api/tree", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...tree.pending, x: tree.ghost.x, y: tree.ghost.y, z: tree.ghost.z }) })
          .then((x) => x.json() as Promise<{ ok: boolean; reason?: string }>).catch(() => null);
        tree.busy = false;
        if (r?.ok) {
          tree.pending = null; treeNotes.showGhost(null); setTreeMode(null); audio.paper();
          await refreshTree(); mp.notifyTree(); refreshMe.current(); // 쪽지만 달고 소원 비는 동작은 없음
          sayRef.current("소원 쪽지를 나무에 달았어요 🌸");
        } else sayRef.current(r?.reason === "daily_limit" ? "오늘은 쪽지를 충분히 달았어요" : r?.reason === "no_sheet" ? "노트가 모자라요" : r?.reason === "bad_spot" ? "나뭇가지 사이를 골라 주세요" : "달지 못했어요");
      },
      cancel: () => { tree.pending = null; tree.ghost = null; treeNotes.showGhost(null); setTreeMode(null); },
      refresh: refreshTree,
    };
    const nearNpc = () => Math.hypot(pos.x - NPC.x, pos.z - NPC.z) < 6;
    const openInfo = () => { setMenu(null); setPanel("info"); logClient("info.open", {}); };
    const talkers = [
      { x: NPC.x, z: NPC.z, armed: true, t: 0, open: openInfo },
      { x: CLERK.x, z: CLERK.z, armed: true, t: 0, open: () => { setMenu(null); setPanel("shop"); logClient("shop.open", { by: "approach" }); } },
    ];
    // 다른 사람 돗자리의 빈 옆자리: 1.6m 안이면 같이 앉을 수 있음
    const nearSeat = () => mp.freeSeats().find((s) => Math.hypot(s.x - pos.x, s.z - pos.z) < 1.6);
    // 같이 앉기 = 먼저 깐 사람에게 물어봄 (대답은 mp.onMatAnswer)
    const askJoin = (seat: MatSeat) => {
      setMenu(null);
      if (st.asking && st.now < st.asking.until) { sayRef.current(`${st.asking.seat.owner}님의 대답을 기다리는 중이에요`); return; }
      st.asking = { seat, until: st.now + 20 };
      mp.askMat(seat.ownerId);
      sayRef.current(`${seat.owner}님에게 같이 앉아도 되는지 물어봤어요`);
      logClient("mat.ask", {});
    };
    const joinMat = (seat: MatSeat) => {
      setMenu(null);
      pos.x = seat.x; pos.z = seat.z; yaw = camYaw = seat.yaw; // 바로 옆이라 서버 이동 판정 안에서 따라옴
      st.sitting = true; st.onMat = false; st.wishUntil = 0; setSitting(true);
      sayRef.current(`${seat.owner}님 돗자리에 같이 앉았어요`);
      logClient("sit.start", { x: Math.round(pos.x), z: Math.round(pos.z), joinedMatOf: seat.owner });
    };
    const openMenu = (tap: Tap, onlyActionable = false) => {
      const sheets = meRef.current?.items.noteSheets ?? 0;
      const shopItem: MenuItem[] = nearKiosk() ? [{ label: "매점 둘러보기", run: () => setPanel("shop") }]
        : nearNpc() ? [{ label: "안내원과 이야기하기", run: openInfo }]
        : nearTree() ? [meRef.current?.isGuest ? { label: "소원 쪽지는 회원만 달 수 있어요" } : sheets < 1 ? { label: "노트가 있어야 소원 쪽지를 달 수 있어요" }
          : { label: `소원 쪽지 달기 (노트 ${sheets}장)`, run: openTreeEditor }]
        : nearFountain() ? [{ label: `동전 던지기 (${meRef.current?.fountainPrice ?? 10}그린)`, run: tossCoin }] : [];
      const seat = !st.sitting ? nearSeat() : undefined;
      const items: MenuItem[] = shopItem.length && !st.sitting ? shopItem : [];
      if (seat) items.push({ label: `${seat.owner}님 돗자리에 같이 앉기`, run: () => askJoin(seat) });
      items.push(...(st.sitting ? [] // 일어나기는 걷기만 하면 됨 (방향키·조이스틱)
        : canSit(pos.x, pos.z) ? [{ label: groundY(pos.x, pos.z) > 0 ? "드러눕기" : "여기 앉기", run: () => actions.current!.sit() }]
        : [{ label: "여기선 앉을 수 없어요" }]));
      if (onlyActionable && !items.some((i) => i.run)) { setMenu(null); return; }
      setMenu({ x: tap.x, y: tap.y, items: onlyActionable ? items.filter((i) => i.label !== "여기선 앉을 수 없어요") : items });
    };
    const handleTap = (tap: Tap, rect: DOMRect) => {
      if (tree.pending) { // 사다리 위: 누른 가지 사이에 쪽지 미리보기
        const p = treeNotes.canopyPoint(camera, rect, tap.x, tap.y);
        if (p) { tree.ghost = p; treeNotes.showGhost(p); setTreeMode("ready"); }
        return;
      }
      if (tap.menu) { openMenu(tap); return; }
      if (nearTree() || Math.hypot(pos.x - WISH_TREE.x, pos.z - WISH_TREE.z) < 14) { // 나무에 달린 쪽지 보기
        const n = treeNotes.pick(camera, rect, tap.x, tap.y);
        if (n) { setMenu(null); setTreeDetail(n); logClient("tree.view", { noteId: n.id }); return; }
      }
      // 분수: 누른 곳이 분수 물(수면 높이에서 반지름 안)이면 동전 메뉴
      const onWater = (() => {
        tapRay.setFromCamera(new THREE.Vector2(((tap.x - rect.left) / rect.width) * 2 - 1, -((tap.y - rect.top) / rect.height) * 2 + 1), camera);
        const hit = tapRay.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5 * PROP_S), new THREE.Vector3());
        return !!hit && Math.hypot(hit.x - FOUNTAIN.x, hit.z - FOUNTAIN.z) < 3 * PROP_S;
      })();
      screen.set(FOUNTAIN.x, 1.2 * PROP_S, FOUNTAIN.z).project(camera);
      if (nearFountain() && (onWater || (screen.z < 1 && Math.hypot(rect.left + (screen.x + 1) / 2 * rect.width - tap.x, rect.top + (1 - screen.y) / 2 * rect.height - tap.y) < 120))) {
        setMenu({ x: tap.x, y: tap.y, items: [{ label: `동전 던지기 (${meRef.current?.fountainPrice ?? 10}그린)`, run: tossCoin }] }); return;
      }
      if (petal.hit(camera, rect, tap.x, tap.y)) {
        const y = petal.group.position.y;
        if (petal.catchable) {
          petal.end(st.now); setMenu(null);
          claim(y); // 서버가 확인한 뒤에 "잡았어요" (로그도 서버에서)
        } else {
          sayRef.current(y > CATCH_HIGH ? "조금만 더 기다렸다가!" : "아쉽게 놓쳤어요");
          logClient("petal.missed", { height: Math.round(y * 100) / 100 });
        }
        return;
      }
      // 안내원을 누르면 안내 창
      screen.set(NPC.x, NPC_Y + 1.3, NPC.z).project(camera);
      if (screen.z < 1 && Math.hypot(pos.x - NPC.x, pos.z - NPC.z) < 13 && Math.hypot(rect.left + (screen.x + 1) / 2 * rect.width - tap.x, rect.top + (1 - screen.y) / 2 * rect.height - tap.y) < 90) {
        openInfo(); return;
      }
      // 매점을 누르면 (가까이 있을 때) 매점 창
      screen.set(CLERK.x, CLERK.y + 1.2, CLERK.z).project(camera); // 매점 직원 얼굴 근처를 누르면
      if (screen.z < 1 && nearKiosk() && Math.hypot(rect.left + (screen.x + 1) / 2 * rect.width - tap.x, rect.top + (1 - screen.y) / 2 * rect.height - tap.y) < 150) {
        setMenu(null); setPanel("shop"); return;
      }
      // 다른 사람을 누르면 그 사람에게 할 수 있는 것
      const other = mp.pick(camera, rect, tap.x, tap.y);
      if (other) {
        const near = Math.hypot(other.x - pos.x, other.z - pos.z) < 5;
        const sheets = meRef.current?.items.noteSheets ?? 0;
        const theirSeat = !st.sitting ? mp.freeSeats().find((s) => s.ownerId === other.sessionId && Math.hypot(s.x - pos.x, s.z - pos.z) < 3) : undefined;
        setMenu({ x: tap.x, y: tap.y, items: [
          ...(theirSeat ? [{ label: "돗자리에 같이 앉기", run: () => askJoin(theirSeat) }] : []),
          near && sheets > 0 && !meRef.current?.isGuest
            ? { label: `${other.nickname}님에게 쪽지 건네기 (노트 ${sheets}장)`, run: () => { setPanel(null); setWriteTo(other); logClient("note.open_editor", {}); } }
            : { label: meRef.current?.isGuest ? "쪽지는 회원만 쓸 수 있어요" : sheets <= 0 ? "노트가 없어요 (매점에서 살 수 있어요)" : "조금 더 가까이 가야 건넬 수 있어요" },
        ] });
        return;
      }
      // 빈 곳을 톡: 모바일은 내 메뉴(앉기 등)를 열고, 메뉴가 떠 있으면 닫음 (PC는 우클릭)
      // 모바일은 할 수 있는 게 있을 때만 메뉴 (이동하려다 톡 닿을 때마다 "앉을 수 없어요"가 뜨지 않게)
      if (coarse && st.sitting) { setMenu(null); stand(); return; } // 앉아 있을 때 빈 곳 톡 = 일어나기 (끌면 둘러보기)
      if (coarse && !menuOpen.current) { openMenu(tap, true); return; }
      setMenu(null);
    };

    const fit = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h); camera.aspect = w / h;
      baseFov = w / h < 0.8 ? 72 : 60; camera.fov = baseFov; camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(fit); ro.observe(el); fit();

    // 개발 중 확인용 (운영 빌드엔 없음)
    if (process.env.NODE_ENV === "development") Object.assign(window, { __park: { renderer, scene, camera, pos, petal, mp, audio, st, catViews, soloCats, me, playGesture, coin, launchVelocity, THREE, sit: () => actions.current?.sit(), face: (y: number) => { yaw = camYaw = y; } } });

    const clock = new THREE.Clock();
    let moved = false, turnVel = 0, gameT = 0;
    renderer.setAnimationLoop(() => {
      // 게임 시간: 실제 흐른 시간이 아니라 화면이 돌아간 만큼만 (탭을 내려 둔 동안엔 멈춤 → 돌아오자마자 운세꽃잎이 떨어지지 않게)
      const dt = Math.min(clock.getDelta(), 0.05); gameT += dt; const t = gameT;
      st.now = t;
      if (st.aiming) { // 동전 조준: 당기는 동안 날아갈 길을 보여 주고, 놓으면 튕김
        const a = aim.current;
        if (a.cancel) { a.cancel = false; stopAim(); }
        else if (a.shoot) { a.shoot = false; void shootCoin(); }
        else if (a.on) coin.preview(hand(), aimShot().vel);
        else coin.preview(null);
      }
      if (st.asking && t > st.asking.until) { sayRef.current(`${st.asking.seat.owner}님이 대답하지 않았어요`); st.asking = null; }
      const rect = renderer.domElement.getBoundingClientRect();
      for (const tap of inp.takeTaps()) handleTap(tap, rect);

      // 조이스틱: 누른 자리에 나타나고, 손을 떼면 사라짐 (손잡이는 엄지를 따라감)
      if (joyBase.current && knob.current) {
        const c = inp.joyCenter, k = inp.joyKnob;
        joyBase.current.style.opacity = c ? "1" : "0";
        if (c) { joyBase.current.style.left = `${c.x - JOY_R}px`; joyBase.current.style.top = `${c.y - JOY_R}px`; }
        knob.current.style.transform = c && k ? `translate(${k.x - c.x}px, ${k.y - c.y}px)` : "translate(0px, 0px)";
      }
      inp.seated = coarse && st.sitting;
      zoomK = THREE.MathUtils.clamp(zoomK * inp.takeZoom(), 0.45, 1.35);
      const { forward, right } = inp.axes(), drag = inp.takeDrag();
      if (Math.hypot(forward, right) < 0.05) st.waitRelease = false; // 앉은 뒤엔 키를 한 번 뗐다 눌러야 일어남
      if (st.camTurn !== null) { // 벤치에 앉으면 시야가 벤치 앞쪽으로 천천히 돎
        const d = Math.atan2(Math.sin(st.camTurn - camYaw), Math.cos(st.camTurn - camYaw));
        camYaw += d * (1 - Math.exp(-dt * 4));
        if (Math.abs(d) < 0.01 || drag.x !== 0) st.camTurn = null;
      }
      camYaw -= drag.x * DRAG_YAW;
      if (tree.pending) camYaw -= right * LOOK_YAW * dt; // 사다리 위: 좌우로 나무를 돌아보기
      else { // 좌우 키 = 몸과 시야가 같이 그쪽으로 돎 (살살 붙었다 살살 멈춤)
        const turnSpeed = ((meRef.current?.controls?.turnSpeed ?? 110) * Math.PI) / 180;
        turnVel += (-right * turnSpeed - turnVel) * (1 - Math.exp(-dt * 10));
        camYaw += turnVel * dt;
      }
      if (st.faceCam && (drag.x !== 0 || t > st.wishUntil + 1.2)) st.faceCam = false; // 소원 장면 끝 (직접 돌리거나 걸어도)
      showMe += ((st.faceCam ? 1 : 0) - showMe) * (1 - Math.exp(-dt * 5)); // 느린 PC에서도 장면이 끝나기 전에 다 돌아오게
      // 위아래 끌기: 옆으로 돌리며 끌 때 섞이는 작은 세로 움직임은 무시 (모르는 새 하늘을 보게 되지 않게)
      const dragY = Math.abs(drag.y) > Math.abs(drag.x) * 0.6 ? drag.y : 0;
      let walking = false;
      if (tree.pending) {
        // 사다리 위에선 걷지 않음
      } else if (st.sitting && (Math.hypot(forward, right) < 0.05 || st.waitRelease)) {
        // 앉아 있을 땐 끌어서 둘러보기 (조금 더 내려다볼 수 있게). 누워 있으면 천장까지 올려다봄
        pitch = THREE.MathUtils.clamp(pitch + dragY * DRAG_PITCH, st.lying ? -1.5 : PITCH_UP, st.lying ? 0.2 : PITCH_DOWN);
      } else {
        if (st.sitting) stand(); // 방향키를 누르면 바로 일어나서 걸어감
        pitch = THREE.MathUtils.clamp(pitch + dragY * DRAG_PITCH, PITCH_UP, PITCH_DOWN);
        if (!st.faceCam) yaw = camYaw; // 1인칭: 몸은 늘 내가 보는 쪽 (다른 사람 눈에도)
        // 보는 방향 기준 앞/옆으로 걸음
        const amount = Math.min(1, Math.abs(forward));
        walking = amount > 0.05;
        if (walking) {
          st.wishUntil = 0; st.faceCam = false; // 걸으면 소원 동작은 멈춤
          if (st.aiming) stopAim();
          const cf = { x: Math.sin(camYaw), z: Math.cos(camYaw) };
          const dx = cf.x * forward, dz = cf.z * forward, len = Math.hypot(dx, dz); // 앞뒤로만 걷고, 방향은 도는 걸로
          if (dragY === 0 && drag.x === 0) pitch += (0 - pitch) * (1 - Math.exp(-dt * 1.2)); // 걸으면 시선이 천천히 앞으로 돌아옴
          const step = ((meRef.current?.controls?.walkSpeedCm ?? WALK * 100) / 100) * amount * dt;
          // 다른 사람 자리도 장애물 (서버도 같은 규칙으로 다시 판정)
          const np = move(pos.x, pos.z, pos.x + (dx / len) * step, pos.z + (dz / len) * step, undefined, [...COLLIDERS, ...mp.colliders()]);
          pos.x = np.x; pos.z = np.z;
          // 벤치 쪽으로 걸어 들어가거나, 벤치를 등지고 뒷걸음질로 붙으면 앉음 (일어난 직후·남이 앉은 자리는 빼고)
          if (st.now - st.stoodAt > 1) {
            const others = mp.colliders();
            const seat = BENCH_SEATS.filter((s) => Math.hypot(s.fx - pos.x, s.fz - pos.z) < 0.55
              && (Math.sin(yaw) * Math.sin(s.yaw) + Math.cos(yaw) * Math.cos(s.yaw)) * Math.sign(forward) < -0.4
              && !others.some((o) => Math.hypot(o.x - s.fx, o.z - s.fz) < 0.45)
              && !catOn(s)) // 고양이가 앉은 자리는 비워 둠 (옆자리에 앉으면 고양이와 나란히)
              .sort((a, b) => Math.hypot(a.fx - pos.x, a.fz - pos.z) - Math.hypot(b.fx - pos.x, b.fz - pos.z))[0];
            if (seat) sitBench(seat);
          }
          // 사다리 앞에서 나무 쪽으로 걸어 들어가면 쪽지 쓰기 (한 번 뜨면 1.5m 떨어졌다 와야 다시)
          const ld = Math.hypot(pos.x - LADDER_FOOT.x, pos.z - LADDER_FOOT.z);
          if (ld > 1.5) st.ladderArmed = true;
          else if (st.ladderArmed && forward > 0 && ld < 0.55 && Math.sin(yaw) > 0.6) { st.ladderArmed = false; openTreeEditor(); }
          if (!moved) { moved = true; setHint(false); }
        }
      }
      // 서버 판정과 1m 넘게 어긋나면(처음 입장 위치 포함) 서버 쪽으로 맞춤
      const srv = mp.mine();
      if (srv && (!synced || Math.hypot(srv.x - pos.x, srv.z - pos.z) > 1)) { pos.x = srv.x; pos.z = srv.z; if (!synced) yaw = camYaw = srv.yaw; synced = true; }

      const mode: Mode = st.lying ? "lie" : st.sitting ? (t < st.wishUntil ? "sitwish" : "sit") : t < st.wishUntil && t >= st.stompUntil ? "wish" : walking ? "walk" : "idle";
      const anim = mode === "lie" ? "lie" : mode === "sit" || mode === "sitwish" ? (st.onMat ? "sitmat" : st.bench ? "sitbench" : "sit") : mode === "wish" ? "wish" : "idle";
      if (anim !== st.anim) { st.anim = anim; mp.sendAnim(anim); }
      mp.update(t, dt, { x: pos.x, z: pos.z, yaw, walking });

      footY += (groundY(pos.x, pos.z) - footY) * (1 - Math.exp(-dt * 14)); // 정자 마루에 올라서면 살짝 올라감
      if (tree.pending) { // 사다리 꼭대기에 올라가 나무를 바라봄 (서버 위치는 그대로)
        me.root.position.set(LADDER_TOP.x, LADDER_TOP.y, LADDER_TOP.z);
        me.root.rotation.y = Math.atan2(WISH_TREE.x - LADDER_TOP.x, WISH_TREE.z - LADDER_TOP.z);
        animateChar(me, t, dt, "idle");
      } else {
        if (st.bench) { me.root.position.set(st.bench.x, st.bench.y, st.bench.z); me.root.rotation.y = st.bench.yaw; }
        else { me.root.position.set(pos.x, footY, pos.z); me.root.rotation.y = yaw; }
        animateChar(me, t, dt, mode);
      }
      coin.update(dt);

      // 창구 직원: 다가오면 바라보고 웃으며 목인사. 안내원 말풍선은 처음 한 번만
      if (npc.update(t, dt, pos.x, pos.z) && !greeted) { greeted = true; sayRef.current(`${NPC_NAME}: 어서 오세요! 저를 누르면 공원 안내를 해 드려요`); }
      clerk.update(t, dt, pos.x, pos.z);
      // 직원에게 말 걸기: 누르지 않아도 바로 앞에 서서 바라보면 1초쯤 뒤에 저절로 (지나가기만 하면 안 걸리게)
      for (const w of talkers) {
        const dx = w.x - pos.x, dz = w.z - pos.z, d = Math.hypot(dx, dz);
        if (d > 3.2) { w.armed = true; w.t = 0; continue; }       // 멀어지면 다시 말 걸 수 있게
        const facing = d > 0 && (Math.sin(yaw) * dx + Math.cos(yaw) * dz) / d > 0.72;
        if (w.armed && d < 2.1 && facing && !st.sitting && !tree.pending && !panelOpen.current) {
          w.t += dt;
          if (w.t > 0.9) { w.armed = false; w.t = 0; w.open(); }
        } else w.t = 0;
      }
      let cats = mp.cats();
      if (!mp.online) { if (meRef.current?.cat) Object.assign(soloCats.cfg, meRef.current.cat); soloCats.update(dt, [{ x: pos.x, z: pos.z }]); cats = soloCats.states; }
      lastCats = cats;
      while (catViews.length < cats.length) catViews.push(new CatView(scene));
      catViews.forEach((v, i) => v.update(t, dt, cats[i] ?? null, pos));

      petal.update(t, dt, { x: pos.x, z: pos.z, yaw }, t < st.wishUntil);
      focus.set(pos.x, 0, pos.z);
      const wind = world.update(t, dt, focus, walking, yaw);
      audio.update({
        wind, riverDist: pos.z > -8 ? pos.z + 8 : pos.z < BOUNDS_N.maxZ + 0.7 ? BOUNDS_N.maxZ + 0.7 - pos.z : 0, fountainDist: Math.hypot(pos.x - FOUNTAIN.x, pos.z - FOUNTAIN.z),
        nearby: mp.nearCount(pos.x, pos.z, 15), hour: skyHour ?? kstHour(),
      });
      if (tree.pending) { // 나무 둘레를 도는 카메라
        const k = 1 - Math.exp(-dt * 6), fx = Math.sin(camYaw), fz = Math.cos(camYaw);
        camPos.lerp(new THREE.Vector3(WISH_TREE.x - fx * 8.5, 4.2 - pitch * 3, WISH_TREE.z - fz * 8.5), k);
        camLook.lerp(new THREE.Vector3(WISH_TREE.x, 4.2 * PROP_S * 0.6, WISH_TREE.z), k);
        camera.position.copy(camPos); camera.lookAt(camLook);
      } else placeCamera();
      me.root.visible = !!tree.pending || showMe > 0.02 || !firstPerson; // 완전 1인칭일 때만 내 몸을 숨김
      drawMini(pos.x, pos.z, yaw, tree.pending ? yaw : camYaw);
      renderer.render(scene, camera);
    });

    return () => {
      clearInterval(wishTimer);
      window.removeEventListener("pointerdown", wake); window.removeEventListener("keydown", wake); audio.dispose(); audioRef.current = null;
      drawMini.dispose();
      ro.disconnect(); renderer.setAnimationLoop(null); inp.dispose(); input.current = null; actions.current = null; mp.dispose();
      scene.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      renderer.dispose(); el.removeChild(renderer.domElement);
    };
  }, [presetId]);

  // 열린 창 닫기: Esc 키, 또는 창 바깥(어두운 곳)을 누르면
  const closePanels = useCallback(() => {
    setPanel((p) => { if (p === "inbox") refreshMe.current(); return null; });
    setTreeDetail(null);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      closePanels();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePanels]);
  const miniOpen = miniPref ?? !touch; // 모바일은 화면이 좁아 미니맵을 접어 둔 채 시작
  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-sky">
      <div ref={box} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 text-sm">
        <p className="rounded-full bg-cream/85 px-3 py-1">{nickname}</p>
        <button onClick={() => { const a = audioRef.current; if (!a) return; a.start(); a.setMuted(!a.muted); setMuted(a.muted); }}
          aria-label={muted ? "소리 켜기" : "소리 끄기"} aria-pressed={!muted} className="pointer-events-auto rounded-full bg-cream/85 px-2.5 py-1">
          {muted ? "🔇" : "🔊"}
        </button>
        {net && (
          <p className="hidden items-center gap-1.5 rounded-full bg-cream/85 px-3 py-1 sm:flex">
            <span className={`size-2 rounded-full ${net.online ? "bg-emerald-400" : "bg-stone-400"}`} />
            {net.online ? `${net.count}명 산책 중` : "혼자 산책 중"}
          </p>
        )}
      </div>
      {me && (
        <div className="absolute right-4 top-4 flex items-center gap-2">
          <button onClick={() => setPanel(panel === "inbox" ? null : "inbox")} aria-label={`쪽지함${me.unreadNotes ? ` (안 읽은 쪽지 ${me.unreadNotes}개)` : ""}`}
            className="rounded-full bg-cream/90 px-3 py-1 text-sm shadow-sm">
            ✉️{me.unreadNotes > 0 && <span className="ml-1 rounded-full bg-sakura px-1.5 text-xs text-white">{me.unreadNotes}</span>}
          </button>
          <button onClick={() => setPanel(panel === "wallet" ? null : "wallet")} aria-label="내 지갑"
            className="flex items-center gap-1.5 rounded-full bg-cream/90 px-3 py-1 text-sm shadow-sm tabular-nums">
            <GreenCoin /> {me.isGuest ? "그린" : me.green.toLocaleString("ko-KR")}
          </button>
          {/* 로그아웃: 회원만 (비회원은 로그아웃하면 캐릭터를 잃으니 안 둠) */}
          {!me.isGuest && (
            <button onClick={async () => { await authClient.signOut(); location.replace("/"); }} aria-label="로그아웃" title="로그아웃"
              className="grid size-7 place-items-center rounded-full bg-cream/90 shadow-sm">
              <svg viewBox="0 0 24 24" className="size-4 opacity-70" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M9 8l-4 4 4 4" /><path d="M5 12h10" />
              </svg>
            </button>
          )}
        </div>
      )}
      {hint && !sitting && (
        <p className="pointer-events-none absolute inset-x-4 top-16 mx-auto w-fit rounded-full bg-cream/85 px-4 py-1.5 text-center text-sm">
          {touch ? "화면 아래쪽을 누른 채 밀면 걷고 돌아요 · 위쪽을 끌어서 둘러보기 · 빈 곳을 톡 누르면 메뉴" : "↑↓(W·S)로 걷고 ←→(A·D)로 돌아요 · 마우스로 끌어서 둘러보기 · 우클릭하면 메뉴"}
        </p>
      )}
      {toast && <p role="status" className="pointer-events-none absolute inset-x-4 top-28 mx-auto w-fit rounded-full bg-ink/80 px-4 py-1.5 text-sm text-white">{toast}</p>}

      {menu && (
        <ul role="menu" className="absolute z-10 min-w-36 overflow-hidden rounded-2xl bg-cream text-sm shadow-lg ring-1 ring-sakura/30"
          style={{ left: Math.min(menu.x, (typeof window !== "undefined" ? innerWidth : 400) - 160), top: Math.max(menu.y - 12, 8) }}>
          {menu.items.map((it) => (
            <li key={it.label}>
              <button role="menuitem" disabled={!it.run} onClick={() => { it.run?.(); setMenu(null); }}
                className="block w-full px-4 py-2.5 text-left hover:bg-sakura/20 disabled:opacity-50">{it.label}</button>
            </li>
          ))}
        </ul>
      )}

      {fortune && (
        <section role="dialog" aria-label="오늘의 운세" className="absolute inset-x-4 top-1/2 z-30 mx-auto flex w-auto max-w-[22rem] -translate-y-1/2 flex-col items-center gap-4 rounded-3xl bg-cream/97 px-6 py-6 text-center shadow-xl ring-1 ring-sakura/20">
          <Image src="/logo-mark.png" alt="" width={72} height={72} className="size-16" />
          <p className="text-xs tracking-widest opacity-50">오늘의 운세</p>
          <p className="text-lg leading-relaxed">{fortune}</p>
          <button onClick={() => setFortune(null)} className="rounded-full bg-sakura px-6 py-2 text-white shadow-[0_3px_0_var(--color-sakura-deep)]">간직할게요</button>
        </section>
      )}


      {writeTree && me && (
        <NoteEditor title="소원 쪽지" sheets={me.items.noteSheets} busy={false} coverOption sendLabel="사다리 올라가기"
          onCancel={() => setWriteTree(false)} onSend={(strokes, covered) => treeApi.current?.start(strokes, covered)} />
      )}
      {treeMode && (
        <div className="absolute inset-x-4 bottom-24 z-20 mx-auto flex w-fit flex-col items-center gap-2 rounded-3xl bg-cream/95 px-5 py-3 shadow-lg">
          <p className="text-sm">{treeMode === "pick" ? "나뭇가지 사이를 눌러 쪽지를 달 곳을 골라요 · 끌어서 둘러보기" : "여기에 달까요? 다른 곳을 눌러 바꿀 수도 있어요"}</p>
          <div className="flex gap-2">
            <button onClick={() => treeApi.current?.cancel()} className="rounded-full bg-white px-4 py-1.5 text-sm ring-1 ring-sakura/40">내려오기</button>
            {treeMode === "ready" && <button onClick={() => treeApi.current?.confirm()} className="rounded-full bg-sakura px-5 py-1.5 text-sm text-white">여기에 달기</button>}
          </div>
        </div>
      )}
      {(panel || treeDetail) && ( // 창 바깥: 누르면 닫힘 (모바일은 바깥 터치, PC는 바깥 클릭)
        <div aria-hidden className="absolute inset-0 z-10 bg-black/10" onPointerDown={(e) => { e.preventDefault(); closePanels(); }} />
      )}
      {coinAim && (
        <div className="absolute inset-0 z-20 touch-none select-none"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); Object.assign(aim.current, { on: true, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY }); }}
          onPointerMove={(e) => { if (aim.current.on) Object.assign(aim.current, { x: e.clientX, y: e.clientY }); }}
          onPointerUp={() => { if (aim.current.on) { aim.current.on = false; aim.current.shoot = true; } }}
          onPointerCancel={() => { aim.current.on = false; }}>
          <p className="pointer-events-none absolute inset-x-4 top-16 mx-auto w-fit rounded-full bg-cream/90 px-4 py-1.5 text-center text-sm">
            아래로 당겨 세기를, 좌우로 방향을 정하고 놓으면 튕겨요 · 맨 위 작은 접시에 넣어 보세요
          </p>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={() => { aim.current.cancel = true; }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-cream/90 px-5 py-2 text-sm shadow-sm">그만하기</button>
        </div>
      )}
      {matAsk && (
        <section role="dialog" aria-label="돗자리 같이 앉기" className="absolute inset-x-4 top-20 z-30 mx-auto flex w-auto max-w-[22rem] flex-col gap-3 rounded-3xl bg-cream/97 p-5 shadow-xl ring-1 ring-sakura/20">
          <p className="text-center"><b>{matAsk.nickname}</b>님이 돗자리에<br />같이 앉고 싶어해요</p>
          <div className="flex gap-2">
            <button onClick={() => matApi.current?.answer(false)} className="flex-1 rounded-full bg-white py-2.5 ring-1 ring-sakura/40">거절하기</button>
            <button onClick={() => matApi.current?.answer(true)} className="flex-1 rounded-full bg-sakura py-2.5 text-white">허락하기</button>
          </div>
        </section>
      )}
      {treeDetail && <TreeNotePanel note={treeDetail} sheets={me?.items.noteSheets ?? 0} onClose={() => setTreeDetail(null)}
        onChanged={(msg) => { sayRef.current(msg); setTreeDetail(null); treeApi.current?.refresh(); mpRef.current?.notifyTree(); refreshMe.current(); }} />}
      {panel === "inbox" && <Inbox onClose={() => { setPanel(null); refreshMe.current(); }} />}
      {writeTo && me && (
        <NoteEditor title={`${writeTo.nickname}님에게 쪽지`} sheets={me.items.noteSheets} busy={sending} onCancel={() => setWriteTo(null)}
          onSend={async (strokes: Strokes) => {
            setSending(true);
            const r = await fetch("/api/notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: writeTo.uid, strokes }) })
              .then((x) => x.json() as Promise<{ ok: boolean; reason?: string }>).catch(() => null);
            setSending(false);
            if (r?.ok) { audioRef.current?.paper(); mpRef.current?.notifyNote(writeTo.sessionId); sayRef.current(`${writeTo.nickname}님에게 쪽지를 건넸어요 🌸`); setWriteTo(null); refreshMe.current(); }
            else sayRef.current(r?.reason === "no_sheet" ? "노트가 없어요" : "쪽지를 건네지 못했어요");
          }} />
      )}
      {panel === "info" && <InfoPanel nickname={nickname} touch={touch} onClose={() => setPanel(null)} />}
      {panel === "wallet" && me && <WalletPanel me={me} onClose={() => setPanel(null)} />}
      {panel === "shop" && me && <ShopPanel me={me} onClose={() => setPanel(null)} onBought={(msg) => { audioRef.current?.pop(); sayRef.current(msg); refreshMe.current(); }} />}

      {/* 모바일 조이스틱: 위아래로 밀면 앞뒤로 걷고, 좌우로 밀면 돎 */}
      {touch && (
        <div ref={joyBase} aria-hidden style={{ width: JOY_R * 2, height: JOY_R * 2, opacity: 0 }} className="pointer-events-none absolute grid transition-opacity duration-150 place-items-center rounded-full bg-white/25 ring-2 ring-white/60 shadow-[inset_0_0_18px_rgba(255,255,255,0.35)] backdrop-blur-[2px]">
          <div ref={knob} className="size-10 rounded-full bg-cream/90 shadow-md ring-1 ring-black/5" />
        </div>
      )}

      {/* 미니맵: 접었다 펼 수 있음 (모바일은 접힌 채 시작) */}
      <div className="absolute bottom-4 right-4 size-40 max-sm:size-32">
        <canvas ref={mini} aria-label="미니맵 (끌어서 둘러보기, 휠로 확대)" aria-hidden={!miniOpen}
          className={`size-full origin-bottom-right cursor-grab touch-none rounded-2xl shadow-md ring-2 ring-cream transition-[opacity,scale] duration-200 ease-out active:cursor-grabbing ${miniOpen ? "" : "pointer-events-none scale-50 opacity-0"}`} />
        <button onClick={() => setMiniOpen(!miniOpen)} aria-label={miniOpen ? "미니맵 접기" : "미니맵 펼치기"} aria-expanded={miniOpen}
          className={`absolute grid size-7 place-items-center rounded-full bg-cream/95 text-ink/70 shadow-md ring-1 ring-black/5 transition-[top,right,bottom] duration-200 hover:text-ink ${miniOpen ? "-top-2.5 -right-2.5" : "bottom-0 right-0"}`}>
          <svg viewBox="0 0 16 16" className={`size-3.5 transition-transform duration-200 ${miniOpen ? "" : "rotate-180"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 6.5 8 10.5 12 6.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}

type InboxNote = { id: number; from: string | null; strokes: Strokes; readAt: string | null; createdAt: string };

/** 받은 쪽지함 */
function Inbox({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<InboxNote[] | null>(null);
  const [open, setOpen] = useState<InboxNote | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/notes", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).then((x: InboxNote[]) => { if (alive) setRows(x); }).catch(() => alive && setRows([]));
    return () => { alive = false; };
  }, []);
  const view = (n: InboxNote) => {
    setOpen(n);
    if (!n.readAt) {
      fetch("/api/notes", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: n.id }) }).catch(() => {});
      setRows((r) => r?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? r);
    }
  };
  const when = (s: string) => new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <section role="dialog" aria-label="쪽지함" className="absolute inset-x-4 bottom-24 top-16 z-20 mx-auto flex w-auto max-w-[26rem] flex-col overflow-hidden rounded-3xl bg-cream/97 shadow-xl ring-1 ring-sakura/20">
      <header className="flex items-center px-5 pt-4">
        <h2 className="text-lg">{open ? `${open.from ?? "누군가"}님의 쪽지` : "받은 쪽지"}</h2>
        {open && <button onClick={() => setOpen(null)} className="ml-3 text-sm underline opacity-70">목록</button>}
        <button onClick={onClose} aria-label="닫기" className="ml-auto px-2 text-xl opacity-60">×</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {open ? (
          <div className="flex flex-col items-center gap-2">
            <NoteView strokes={open.strokes} className="w-full max-w-[min(26rem,60dvh)]" />
            <p className="text-xs opacity-60">{when(open.createdAt)}</p>
          </div>
        ) : !rows ? <p className="text-sm opacity-60">불러오는 중…</p> : rows.length === 0 ? <p className="text-sm opacity-60">아직 받은 쪽지가 없어요</p> : (
          <ul className="grid grid-cols-3 gap-3">
            {rows.map((n) => (
              <li key={n.id}>
                <button onClick={() => view(n)} className="relative flex w-full flex-col items-center gap-1 rounded-2xl bg-white p-2">
                  {!n.readAt && <span className="absolute right-2 top-2 size-2 rounded-full bg-sakura" aria-label="안 읽음" />}
                  <NoteView strokes={n.strokes} className="w-full" />
                  <span className="line-clamp-1 text-xs">{n.from ?? "누군가"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** 소원나무 쪽지 보기 (내 쪽지면 가리기·겹친 장 떼기·떼어 내기) */
function TreeNotePanel({ note, sheets, onClose, onChanged }: { note: TreeNote; sheets: number; onClose: () => void; onChanged: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (action: "peel" | "cover" | "remove") => {
    if (action === "peel" && !confirm("겹친 장을 떼면 덮개 한 장이 찢어지고, 쪽지는 모두가 볼 수 있게 돼요. 뗄까요?")) return;
    if (action === "remove" && !confirm("이 쪽지를 나무에서 떼어 낼까요? 떼어 낸 쪽지와 쓴 노트는 돌아오지 않아요.")) return;
    setBusy(true);
    const r = await fetch("/api/tree", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: note.id, action }) })
      .then((x) => x.json() as Promise<{ ok: boolean; reason?: string }>).catch(() => null);
    setBusy(false);
    if (r?.ok) onChanged(action === "peel" ? "겹친 장을 뗐어요" : action === "remove" ? "쪽지를 나무에서 떼어 냈어요" : "노트 한 장을 덮어 가렸어요");
    else alert(r?.reason === "no_sheet" ? "노트가 없어요" : "처리하지 못했어요");
  };
  return (
    <section role="dialog" aria-label="소원 쪽지" className="absolute inset-x-4 top-1/2 z-30 mx-auto flex w-auto max-w-[22rem] -translate-y-1/2 flex-col items-center gap-3 rounded-3xl bg-cream/97 p-5 shadow-xl ring-1 ring-sakura/20">
      <div className="flex w-full items-center">
        <h2 className="text-lg">{note.mine ? "내 소원 쪽지" : `${note.from ?? "누군가"}님의 소원`}</h2>
        <button onClick={onClose} aria-label="닫기" className="ml-auto px-2 text-xl opacity-60">×</button>
      </div>
      {note.strokes && !note.covered ? <NoteView strokes={note.strokes as Strokes} className="w-full max-w-[min(22rem,55dvh)]" /> : (
        <div className="flex aspect-square w-full max-w-[16rem] items-center justify-center rounded-full bg-[#f29bb5]/40 text-center text-sm">두 장을 겹쳐 붙여<br />가려진 쪽지예요</div>
      )}
      {note.mine && note.covered && <p className="text-center text-xs opacity-60">겹친 장을 떼야 내용을 볼 수 있어요. 떼면 모두가 볼 수 있게 돼요</p>}
      {note.mine && (
        note.covered
          ? <button disabled={busy} onClick={() => act("peel")} className="rounded-full bg-white px-5 py-2 text-sm ring-1 ring-sakura/40">겹친 장 떼서 보기</button>
          : <button disabled={busy || sheets < 1} onClick={() => act("cover")} className="rounded-full bg-sakura px-5 py-2 text-sm text-white disabled:opacity-50">한 장 덮어 가리기 (노트 1장)</button>
      )}
      {note.mine && <button disabled={busy} onClick={() => act("remove")} className="text-sm underline opacity-60">나무에서 떼어 내기</button>}
    </section>
  );
}
